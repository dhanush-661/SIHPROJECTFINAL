from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field


class ExternalIncident(BaseModel):
    """
    Normalized schema for known real-world oil-spill incidents ingested from external
    public satellite-surveillance feeds and ground-truth reference datasets (e.g. SkyTruth Cerulean,
    NOAA MPSR, EMSA CleanSeaNet).
    
    CRITICAL: Provenance is always 'EXTERNAL-REFERENCE' to distinguish from AquaSentinel's own detections.
    """
    incident_id: str = Field(..., description="Unique identifier for the external incident record")
    source_name: str = Field(..., description="Name of external reporting organization/platform (e.g. 'SkyTruth Cerulean', 'NOAA MPSR')")
    reported_at: str = Field(..., description="ISO 8601 timestamp when the incident was reported or observed")
    geometry: Dict[str, Any] = Field(..., description="GeoJSON Point or Polygon geometry")
    centroid: List[float] = Field(..., description="[longitude, latitude] center of the reported incident")
    bbox: List[float] = Field(..., description="[minLon, minLat, maxLon, maxLat] bounding box")
    estimated_area_km2: Optional[float] = Field(None, description="Reported slick area in square kilometers if provided by source")
    confidence_or_score: Optional[float] = Field(None, description="External model confidence or severity score (0.0 to 1.0) if provided")
    source_url: Optional[str] = Field(None, description="Traceability link back to original public report or dataset")
    notes_or_vessel: Optional[str] = Field(None, description="Contextual metadata (e.g. vessel name, incident type, cause)")
    provenance: Literal["EXTERNAL-REFERENCE"] = Field("EXTERNAL-REFERENCE", description="Strict provenance classification: EXTERNAL-REFERENCE")


class ExternalIncidentCreate(BaseModel):
    incident_id: Optional[str] = Field(None, description="Optional custom ID; auto-generated if omitted")
    source_name: str = Field("SkyTruth Cerulean", description="External source name")
    reported_at: str = Field(..., description="ISO 8601 timestamp")
    geometry: Dict[str, Any] = Field(..., description="GeoJSON Point or Polygon geometry")
    estimated_area_km2: Optional[float] = Field(None, description="Estimated area in km2")
    confidence_or_score: Optional[float] = Field(None, description="Confidence or score")
    source_url: Optional[str] = Field(None, description="URL to original report")
    notes_or_vessel: Optional[str] = Field(None, description="Notes, vessel name, or incident details")


class ExternalIncidentImportRequest(BaseModel):
    source_name: str = Field("Manual Import / SkyTruth Export", description="Source provider name")
    incidents: List[ExternalIncidentCreate] = Field(..., description="List of incidents to import")


class ValidationRunRequest(BaseModel):
    """
    Parameters for running a validation pass comparing AquaSentinel detections against external reference incidents.
    """
    aoi: Union[Dict[str, Any], List[float]] = Field(..., description="Bounding box [minLon, minLat, maxLon, maxLat] or GeoJSON polygon")
    date_start: str = Field(..., description="Start date (YYYY-MM-DD)")
    date_end: str = Field(..., description="End date (YYYY-MM-DD)")
    time_window_hours: float = Field(48.0, ge=1.0, le=168.0, description="Temporal matching window (+/- hours)")
    max_distance_km: float = Field(15.0, ge=0.5, le=100.0, description="Maximum centroid proximity distance in km for spatial matching")


class ValidationComparisonRecord(BaseModel):
    """
    Individual validation comparison entry matching an external reference against AquaSentinel's detections.
    """
    comparison_id: str = Field(..., description="Unique comparison identifier")
    status: Literal["MATCHED", "MISSED", "UNVALIDATED_DETECTION"] = Field(
        ...,
        description="MATCHED: detected by AquaSentinel & confirmed by reference; MISSED: reported by reference but not detected by AquaSentinel; UNVALIDATED_DETECTION: detected by AquaSentinel with no reference report."
    )
    external_incident: Optional[ExternalIncident] = Field(None, description="External reference incident if present")
    matched_spill_id: Optional[str] = Field(None, description="AquaSentinel Spill ID if matched")
    matched_detection_summary: Optional[Dict[str, Any]] = Field(None, description="Summary metrics of AquaSentinel detection")
    spatial_distance_km: Optional[float] = Field(None, description="Centroid distance between detection and reference in km")
    temporal_delta_hours: Optional[float] = Field(None, description="Time difference in hours between detection and reference")
    overlap_type: Optional[str] = Field(None, description="Spatial overlap classification: POLYGON_INTERSECTION | CENTROID_PROXIMITY | NONE")
    notes: str = Field(..., description="Human-readable explanation of comparison verdict")


class ValidationRunResponse(BaseModel):
    """
    Complete output of a validation pass.
    
    NOTE: Transparent count summary is provided without misleading percentage precision.
    """
    run_id: str = Field(..., description="Unique validation run ID")
    executed_at: str = Field(..., description="ISO 8601 timestamp of validation execution")
    aoi_bbox: List[float] = Field(..., description="[minLon, minLat, maxLon, maxLat] evaluated AOI")
    date_range: Dict[str, str] = Field(..., description="Evaluated date range")
    time_window_hours: float = Field(..., description="Time matching tolerance window in hours")
    max_distance_km: float = Field(..., description="Spatial matching distance tolerance in km")
    
    # Counts
    total_external_incidents: int = Field(..., description="Total known external reference incidents in the AOI/timeframe")
    matched_count: int = Field(..., description="Number of known reference incidents successfully detected by AquaSentinel")
    missed_count: int = Field(..., description="Number of known reference incidents not detected by AquaSentinel (potential false negatives)")
    unvalidated_detections_count: int = Field(..., description="AquaSentinel detections with no corresponding external report")
    
    # Summary statement
    summary_headline: str = Field(..., description="Clear, plain-language summary of validation findings")
    comparisons: List[ValidationComparisonRecord] = Field(..., description="Detailed comparison records")
    
    # Framing Disclaimer
    framing_disclaimer: str = Field(
        "This module validates AquaSentinel's Sentinel-1 detection pipeline against publicly reported real-world incidents. It is an independent testing and credibility feature — AquaSentinel's core capability is automated continuous monitoring of newly available Sentinel-1 acquisitions over user-defined AOIs.",
        description="Official forensic framing standard"
    )
