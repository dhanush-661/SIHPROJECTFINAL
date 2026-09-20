import csv
import io
import json
import logging
import datetime
from typing import Any, Dict, List, Optional, Tuple
from app.services.db_service import db_service

logger = logging.getLogger(__name__)


class AISDatasetImporter:
    """
    Parses and ingests authentic historical AIS datasets from NOAA Marine Cadastre,
    Global Fishing Watch (GFW), Danish Maritime Authority, and custom GeoJSON/CSV exports.
    """

    @staticmethod
    def parse_csv_content(csv_text: str, source_label: str = "CSV_IMPORT") -> Tuple[int, int, Dict[str, Any]]:
        """
        Parses raw CSV string with flexible column detection and inserts pings in batches.
        Returns (pings_inserted, unique_vessels, metadata).
        """
        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        if not reader.fieldnames:
            raise ValueError("CSV header missing or empty file.")

        # Normalize header keys to lowercase
        field_map = {name.lower().strip(): name for name in reader.fieldnames}

        # Helper to find matching column
        def get_col(candidates: List[str]) -> str:
            for c in candidates:
                if c.lower() in field_map:
                    return field_map[c.lower()]
            return ""

        col_mmsi = get_col(["mmsi", "ssvid", "vessel_id", "id"])
        col_time = get_col(["basedatetime", "timestamp", "datetime", "time", "date_time", "ping_time", "msg_time"])
        col_lat = get_col(["lat", "latitude", "y"])
        col_lon = get_col(["lon", "longitude", "x", "long"])
        col_sog = get_col(["sog", "speed", "speed_knots", "velocity"])
        col_cog = get_col(["cog", "course", "course_deg", "heading_deg"])
        col_head = get_col(["heading", "true_heading"])
        col_name = get_col(["vesselname", "vessel_name", "name", "ship_name", "shipname"])
        col_type = get_col(["vesseltype", "vessel_type", "ship_type", "type", "vessel_class", "shiptype"])
        col_flag = get_col(["flag", "country", "nation", "registry"])
        col_imo = get_col(["imo", "imo_number", "imonumber"])
        col_len = get_col(["length", "length_m", "vessel_length", "loa"])
        col_dwt = get_col(["deadweight_tonnage", "dwt", "tonnage"])

        if not col_mmsi or not col_time or not col_lat or not col_lon:
            raise ValueError(
                f"Missing required AIS columns. Found: {reader.fieldnames}. "
                f"Required: MMSI (found '{col_mmsi}'), Timestamp (found '{col_time}'), "
                f"Lat (found '{col_lat}'), Lon (found '{col_lon}')"
            )

        pings_batch: List[Dict[str, Any]] = []
        unique_mmsis = set()
        row_count = 0
        total_pings_imported = 0

        for row in reader:
            row_count += 1
            raw_mmsi = row.get(col_mmsi, "").strip()
            raw_time = row.get(col_time, "").strip()
            raw_lat = row.get(col_lat, "").strip()
            raw_lon = row.get(col_lon, "").strip()

            if not raw_mmsi or not raw_time or not raw_lat or not raw_lon:
                continue

            try:
                lat = float(raw_lat)
                lon = float(raw_lon)
                # Filter invalid coordinates
                if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
                    continue
            except ValueError:
                continue

            # Parse timestamp to standard ISO 8601
            iso_time = AISDatasetImporter._normalize_timestamp(raw_time)
            if not iso_time:
                continue

            sog = 0.0
            if col_sog and row.get(col_sog):
                try:
                    sog = float(row[col_sog])
                except ValueError:
                    pass

            cog = 0.0
            if col_cog and row.get(col_cog):
                try:
                    cog = float(row[col_cog])
                except ValueError:
                    pass

            heading = None
            if col_head and row.get(col_head):
                try:
                    h_val = float(row[col_head])
                    if 0 <= h_val <= 360:
                        heading = h_val
                except ValueError:
                    pass

            v_name = row.get(col_name, "").strip() if col_name else ""
            v_type = row.get(col_type, "").strip() if col_type else ""
            flag = row.get(col_flag, "").strip() if col_flag else "International"
            imo = row.get(col_imo, "").strip() if col_imo else None
            
            length_m = 0.0
            if col_len and row.get(col_len):
                try:
                    length_m = float(row[col_len])
                except ValueError:
                    pass

            dwt = None
            if col_dwt and row.get(col_dwt):
                try:
                    dwt = float(row[col_dwt])
                except ValueError:
                    pass

            pings_batch.append({
                "mmsi": raw_mmsi,
                "vessel_name": v_name or f"VESSEL-{raw_mmsi}",
                "ship_type": v_type or "Commercial Vessel",
                "flag": flag or "International",
                "imo": imo,
                "length_m": length_m or 150.0,
                "deadweight_tonnage": dwt,
                "lon": lon,
                "lat": lat,
                "sog": sog,
                "cog": cog,
                "heading": heading,
                "timestamp": iso_time,
                "source": source_label
            })
            unique_mmsis.add(raw_mmsi)

            # Insert in chunks of 1000
            if len(pings_batch) >= 1000:
                total_pings_imported += len(pings_batch)
                db_service.insert_ais_pings_batch(pings_batch)
                pings_batch.clear()

        # Insert remaining
        if pings_batch:
            total_pings_imported += len(pings_batch)
            db_service.insert_ais_pings_batch(pings_batch)

        meta = {
            "total_rows_parsed": row_count,
            "total_pings_imported": total_pings_imported,
            "unique_vessels_imported": len(unique_mmsis),
            "columns_mapped": {
                "mmsi": col_mmsi,
                "timestamp": col_time,
                "lat": col_lat,
                "lon": col_lon,
                "sog": col_sog,
                "cog": col_cog,
                "vessel_name": col_name
            }
        }
        return total_pings_imported, len(unique_mmsis), meta

    @staticmethod
    def parse_geojson_content(geojson_dict: Dict[str, Any], source_label: str = "GEOJSON_IMPORT") -> Tuple[int, int, Dict[str, Any]]:
        """
        Parses GeoJSON FeatureCollection of Point or LineString vessel tracks.
        """
        features = geojson_dict.get("features", [])
        pings_batch: List[Dict[str, Any]] = []
        unique_mmsis = set()
        total_pings_imported = 0

        for feat in features:
            props = feat.get("properties", {})
            geom = feat.get("geometry", {})
            geom_type = geom.get("type", "")
            coords = geom.get("coordinates", [])

            mmsi = str(props.get("mmsi") or props.get("ssvid") or props.get("id") or "").strip()
            if not mmsi:
                continue

            v_name = props.get("vessel_name") or props.get("name") or f"VESSEL-{mmsi}"
            v_type = props.get("ship_type") or props.get("vessel_type") or props.get("type") or "Vessel"
            flag = props.get("flag", "International")
            imo = str(props.get("imo")) if props.get("imo") else None
            length_m = float(props.get("length_m") or props.get("length") or 150.0)
            dwt = float(props.get("deadweight_tonnage") or props.get("dwt") or 35000.0) if props.get("deadweight_tonnage") or props.get("dwt") else None

            if geom_type == "Point" and len(coords) >= 2:
                lon, lat = float(coords[0]), float(coords[1])
                ts_raw = props.get("timestamp") or props.get("time") or datetime.datetime.now(datetime.timezone.utc).isoformat()
                iso_ts = AISDatasetImporter._normalize_timestamp(ts_raw)
                if iso_ts:
                    pings_batch.append({
                        "mmsi": mmsi,
                        "vessel_name": v_name,
                        "ship_type": v_type,
                        "flag": flag,
                        "imo": imo,
                        "length_m": length_m,
                        "deadweight_tonnage": dwt,
                        "lon": lon,
                        "lat": lat,
                        "sog": float(props.get("sog") or props.get("speed") or 0.0),
                        "cog": float(props.get("cog") or props.get("course") or 0.0),
                        "heading": float(props.get("heading")) if props.get("heading") is not None else None,
                        "timestamp": iso_ts,
                        "source": source_label
                    })
                    unique_mmsis.add(mmsi)

            elif geom_type == "LineString" and len(coords) >= 2:
                timestamps = props.get("timestamps", [])
                speeds = props.get("speeds", [])
                cogs = props.get("courses", [])

                for idx, pt in enumerate(coords):
                    lon, lat = float(pt[0]), float(pt[1])
                    if idx < len(timestamps):
                        iso_ts = AISDatasetImporter._normalize_timestamp(timestamps[idx])
                    else:
                        iso_ts = datetime.datetime.now(datetime.timezone.utc).isoformat()

                    sog = float(speeds[idx]) if idx < len(speeds) else 10.0
                    cog = float(cogs[idx]) if idx < len(cogs) else 0.0

                    if iso_ts:
                        pings_batch.append({
                            "mmsi": mmsi,
                            "vessel_name": v_name,
                            "ship_type": v_type,
                            "flag": flag,
                            "imo": imo,
                            "length_m": length_m,
                            "deadweight_tonnage": dwt,
                            "lon": lon,
                            "lat": lat,
                            "sog": sog,
                            "cog": cog,
                            "heading": cog,
                            "timestamp": iso_ts,
                            "source": source_label
                        })
                        unique_mmsis.add(mmsi)

            if len(pings_batch) >= 1000:
                total_pings_imported += len(pings_batch)
                db_service.insert_ais_pings_batch(pings_batch)
                pings_batch.clear()

        if pings_batch:
            total_pings_imported += len(pings_batch)
            db_service.insert_ais_pings_batch(pings_batch)

        meta = {
            "total_features_parsed": len(features),
            "total_pings_imported": total_pings_imported,
            "unique_vessels_imported": len(unique_mmsis)
        }
        return total_pings_imported, len(unique_mmsis), meta

    @staticmethod
    def _normalize_timestamp(raw_time: str) -> Optional[str]:
        """
        Parses diverse date formats into clean ISO 8601 strings (YYYY-MM-DDTHH:MM:SSZ).
        """
        raw = raw_time.strip().replace("\"", "").replace("'", "")
        formats = [
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%S.%f%z",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M:%S.%f",
            "%Y/%m/%d %H:%M:%S",
            "%m/%d/%Y %H:%M:%S",
            "%m/%d/%Y %H:%M",
            "%d-%m-%Y %H:%M:%S",
            "%Y-%m-%d"
        ]
        for fmt in formats:
            try:
                dt = datetime.datetime.strptime(raw, fmt)
                if not dt.tzinfo:
                    dt = dt.replace(tzinfo=datetime.timezone.utc)
                return dt.isoformat()
            except ValueError:
                continue

        try:
            dt = datetime.datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return dt.isoformat()
        except Exception:
            return None


ais_importer = AISDatasetImporter()
