import datetime
import json
import logging
import math
import uuid
from typing import Any, Dict, List, Optional, Tuple, Union
from shapely.geometry import shape, Point, Polygon
from app.schemas.validation import (
    ExternalIncident,
    ValidationComparisonRecord,
    ValidationRunRequest,
    ValidationRunResponse
)
from app.schemas.spill import SpillRecord
from app.services.db_service import db_service

logger = logging.getLogger(__name__)


def haversine_distance_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """
    Computes great-circle distance between two lon/lat coordinates in kilometers.
    """
    R = 6371.0 # Earth radius in km
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 2)


class ValidationService:
    """
    Spatial and temporal comparator engine matching AquaSentinel pipeline detections
    against verified external ground-truth reference datasets.
    """

    @classmethod
    def _parse_bbox(cls, aoi: Union[Dict[str, Any], List[float]]) -> List[float]:
        """
        Extracts [minLon, minLat, maxLon, maxLat] from list or GeoJSON geometry.
        """
        if isinstance(aoi, list) and len(aoi) == 4:
            return [float(x) for x in aoi]
        elif isinstance(aoi, dict):
            geom = shape(aoi)
            return [round(b, 6) for b in geom.bounds]
        raise ValueError("Invalid AOI specification; expected [minLon, minLat, maxLon, maxLat] or GeoJSON polygon.")

    @classmethod
    def run_validation(cls, request: ValidationRunRequest) -> ValidationRunResponse:
        """
        Executes a rigorous validation pass comparing operational Sentinel-1 detections
        against external reference incidents within specified AOI and tolerances.
        """
        bbox = cls._parse_bbox(request.aoi)
        executed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        run_id = f"val-{uuid.uuid4().hex[:12]}"

        # 1. Fetch external reference records for AOI
        # Broaden date query slightly for time window tolerance
        date_start_dt = datetime.datetime.fromisoformat(request.date_start.replace("Z", "+00:00")) if "T" in request.date_start else datetime.datetime.strptime(request.date_start, "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc)
        date_end_dt = datetime.datetime.fromisoformat(request.date_end.replace("Z", "+00:00")) if "T" in request.date_end else datetime.datetime.strptime(request.date_end, "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc) + datetime.timedelta(days=1)

        external_incidents = db_service.get_external_incidents(
            bbox=bbox,
            start_date=date_start_dt.isoformat(),
            end_date=date_end_dt.isoformat(),
            limit=200
        )

        # 2. Fetch AquaSentinel operational detections
        all_spills = db_service.get_spills(bbox=bbox, limit=200)

        # Filter spills within expanded date window
        window_delta = datetime.timedelta(hours=request.time_window_hours)
        min_dt = date_start_dt - window_delta
        max_dt = date_end_dt + window_delta

        valid_spills: List[SpillRecord] = []
        for spill in all_spills:
            try:
                spill_dt = datetime.datetime.fromisoformat(spill.detected_at.replace("Z", "+00:00"))
                if min_dt <= spill_dt <= max_dt:
                    valid_spills.append(spill)
            except Exception:
                valid_spills.append(spill)

        comparisons: List[ValidationComparisonRecord] = []
        matched_spill_ids = set()

        # 3. Match External Reference Incidents against AquaSentinel Detections
        for ext in external_incidents:
            ext_geom = shape(ext.geometry)
            ext_lon, ext_lat = ext.centroid
            try:
                ext_dt = datetime.datetime.fromisoformat(ext.reported_at.replace("Z", "+00:00"))
            except Exception:
                ext_dt = date_start_dt

            best_match_spill: Optional[SpillRecord] = None
            best_distance_km: float = 999999.0
            best_time_delta_h: float = 999999.0
            best_overlap_type: str = "NONE"

            for spill in valid_spills:
                try:
                    sp_dt = datetime.datetime.fromisoformat(spill.detected_at.replace("Z", "+00:00"))
                    time_diff_h = abs((ext_dt - sp_dt).total_seconds()) / 3600.0
                except Exception:
                    time_diff_h = 0.0

                if time_diff_h > request.time_window_hours:
                    continue

                sp_lon, sp_lat = spill.centroid
                dist_km = haversine_distance_km(ext_lon, ext_lat, sp_lon, sp_lat)

                # Check geometry polygon intersection
                sp_geom_data = spill.geometry.model_dump() if hasattr(spill.geometry, "model_dump") else spill.geometry
                sp_geom = shape(sp_geom_data)
                has_geom_overlap = ext_geom.intersects(sp_geom)

                if has_geom_overlap or dist_km <= request.max_distance_km:
                    if dist_km < best_distance_km:
                        best_distance_km = dist_km
                        best_time_delta_h = round(time_diff_h, 1)
                        best_match_spill = spill
                        best_overlap_type = "POLYGON_INTERSECTION" if has_geom_overlap else "CENTROID_PROXIMITY"

            if best_match_spill:
                matched_spill_ids.add(best_match_spill.spill_id)
                comparisons.append(ValidationComparisonRecord(
                    comparison_id=f"comp-{uuid.uuid4().hex[:10]}",
                    status="MATCHED",
                    external_incident=ext,
                    matched_spill_id=best_match_spill.spill_id,
                    matched_detection_summary={
                        "spill_id": best_match_spill.spill_id,
                        "detected_at": best_match_spill.detected_at,
                        "area_km2": best_match_spill.area_km2,
                        "confidence": best_match_spill.confidence,
                        "source_image": best_match_spill.source_image
                    },
                    spatial_distance_km=best_distance_km,
                    temporal_delta_hours=best_time_delta_h,
                    overlap_type=best_overlap_type,
                    notes=f"AquaSentinel detected slick ({best_match_spill.area_km2} km², {best_match_spill.spill_id}) matching external reference '{ext.source_name}' ({ext.incident_id}) with {best_distance_km} km offset and {best_time_delta_h}h time delta."
                ))
            else:
                comparisons.append(ValidationComparisonRecord(
                    comparison_id=f"comp-{uuid.uuid4().hex[:10]}",
                    status="MISSED",
                    external_incident=ext,
                    matched_spill_id=None,
                    matched_detection_summary=None,
                    spatial_distance_km=None,
                    temporal_delta_hours=None,
                    overlap_type="NONE",
                    notes=f"External reference incident '{ext.source_name}' ({ext.incident_id}) reported at {ext.reported_at} was not detected by AquaSentinel in this acquisition window."
                ))

        # 4. Check for Unvalidated AquaSentinel Detections (Candidate detections with no external report)
        for spill in valid_spills:
            if spill.spill_id not in matched_spill_ids:
                comparisons.append(ValidationComparisonRecord(
                    comparison_id=f"comp-{uuid.uuid4().hex[:10]}",
                    status="UNVALIDATED_DETECTION",
                    external_incident=None,
                    matched_spill_id=spill.spill_id,
                    matched_detection_summary={
                        "spill_id": spill.spill_id,
                        "detected_at": spill.detected_at,
                        "area_km2": spill.area_km2,
                        "confidence": spill.confidence,
                        "source_image": spill.source_image,
                        "centroid": spill.centroid
                    },
                    spatial_distance_km=None,
                    temporal_delta_hours=None,
                    overlap_type="NONE",
                    notes=f"AquaSentinel pipeline detected slick {spill.spill_id} ({spill.area_km2} km²) with no corresponding public ground-truth reference report."
                ))

        # 5. Compute Plain Transparent Counts
        total_external = len(external_incidents)
        matched_count = sum(1 for c in comparisons if c.status == "MATCHED")
        missed_count = sum(1 for c in comparisons if c.status == "MISSED")
        unvalidated_count = sum(1 for c in comparisons if c.status == "UNVALIDATED_DETECTION")

        # 6. Generate Plain-Language Summary Headline (No deceptive 99.9% claims)
        if total_external > 0:
            summary_headline = (
                f"{matched_count} of {total_external} known reference incident(s) in monitored AOI "
                f"were successfully matched by AquaSentinel's detection pipeline "
                f"({missed_count} missed, {unvalidated_count} unvalidated detection(s))."
            )
        else:
            summary_headline = (
                f"0 external reference incidents found in selected AOI/timeframe. "
                f"AquaSentinel flagged {unvalidated_count} operational candidate detection(s)."
            )

        response = ValidationRunResponse(
            run_id=run_id,
            executed_at=executed_at,
            aoi_bbox=bbox,
            date_range={"start": request.date_start, "end": request.date_end},
            time_window_hours=request.time_window_hours,
            max_distance_km=request.max_distance_km,
            total_external_incidents=total_external,
            matched_count=matched_count,
            missed_count=missed_count,
            unvalidated_detections_count=unvalidated_count,
            summary_headline=summary_headline,
            comparisons=comparisons,
            framing_disclaimer=(
                "This module validates AquaSentinel's Sentinel-1 detection pipeline against publicly reported real-world incidents. "
                "It is an independent testing and credibility feature — AquaSentinel's core capability is automated continuous monitoring of newly available Sentinel-1 acquisitions over user-defined AOIs."
            )
        )

        # Archive run to database
        try:
            db_service.save_validation_run(response)
        except Exception as err:
            logger.warning("Failed to archive validation run: %s", err)

        return response
