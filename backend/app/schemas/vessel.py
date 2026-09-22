from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class VesselPoint(BaseModel):
    lon: float
    lat: float
    sog_knots: float = Field(..., description="Speed Over Ground in knots")
    cog_deg: float = Field(..., description="Course Over Ground in degrees (0-360)")
    heading_deg: Optional[float] = Field(None, description="Vessel true heading")
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    is_gap_interpolated: bool = Field(False, description="True if point falls in an AIS transponder disabling gap")


class VesselFeatures(BaseModel):
    min_distance_to_origin_km: float = Field(..., description="Closest Point of Approach (CPA) to estimated origin centroid in km")
    time_near_origin_hours: float = Field(..., description="Total time spent within 15 km of origin during the release window")
    speed_change_variance: float = Field(..., description="Variance of speed over ground across track")
    course_change_frequency: float = Field(..., description="Frequency of significant course alterations (> 25 deg)")
    loitering_score: float = Field(..., ge=0.0, le=1.0, description="Ratio of total path length to net displacement")
    route_deviation_score: float = Field(..., ge=0.0, le=1.0, description="Deviation from standard shipping fairway trajectory")
    ais_gap_duration_hours: float = Field(..., description="Duration of deliberate or suspicious AIS signal loss")
    bearing_alignment_with_drift: float = Field(..., ge=0.0, le=1.0, description="Cosine alignment between vessel heading and slick principal orientation")


class ComponentScores(BaseModel):
    proximity_score: float = Field(..., ge=0.0, le=1.0, description="Proximity to origin core (w=0.35)")
    temporal_score: float = Field(..., ge=0.0, le=1.0, description="Temporal alignment with estimated release window (w=0.25)")
    trajectory_score: float = Field(..., ge=0.0, le=1.0, description="Loitering, route deviation, and AIS gap behavior (w=0.20)")
    ml_anomaly_score: float = Field(..., ge=0.0, le=1.0, description="IsolationForest ML kinematic anomaly score (w=0.20)")


class CandidateVessel(BaseModel):
    mmsi: str = Field(..., description="Maritime Mobile Service Identity (9-digit identifier)")
    imo: Optional[str] = Field(None, description="International Maritime Organization number")
    vessel_name: str = Field(..., description="Registered vessel name")
    vessel_type: str = Field(..., description="Vessel category: Crude Oil Tanker, Chemical Tanker, Bulk Carrier, Container, Bunker Barge, Tug, Fishing")
    flag: str = Field(..., description="Country flag / registry")
    length_m: float = Field(..., description="Overall length in meters")
    deadweight_tonnage: Optional[float] = Field(None, description="DWT in metric tons")
    
    suspect_score: float = Field(..., ge=0.0, le=1.0, description="Composite weighted suspect probability score (0.0 to 1.0)")
    anomaly_score: float = Field(..., ge=0.0, le=1.0, description="Raw IsolationForest anomaly score")
    component_scores: ComponentScores
    features: VesselFeatures
    track: List[VesselPoint] = Field(..., description="Time-ordered AIS track positions")
    closest_approach_time: str = Field(..., description="Timestamp of closest approach to origin")
    is_ais_dark_suspect: bool = Field(False, description="True if vessel exhibited suspicious AIS transponder disabling")
    is_authentic_real: bool = Field(False, description="True if vessel track comes from measured live/historical AIS data")
    data_source: Optional[str] = Field("CORRIDOR_BENCHMARK", description="Source: LIVE_STREAM, HISTORICAL_ARCHIVE, CSV_IMPORT, CORRIDOR_BENCHMARK, IMPORTED_REAL_AIS")
    provenance_label: str = Field("REAL AIS", description="Provenance badge label: REAL AIS, REAL AIS — IMPORTED, REAL AIS — LIVE, MODELLED, PREDICTED, NO AIS EVIDENCE")
    distance_from_spill_km: Optional[float] = Field(None, description="Distance from spill centroid at closest approach in km")
    time_diff_hours_from_spill: Optional[float] = Field(None, description="Time difference in hours from estimated spill release")
    observation_count: Optional[int] = Field(None, description="Number of discrete verified AIS position reports")
    ais_source: Optional[str] = Field(None, description="Underlying AIS source provider (e.g. GFW, NOAA, Regional Receiver, Ingested CSV)")


class VesselCorrelationRequest(BaseModel):
    origin_buffer_km: Optional[float] = Field(None, description="Spatial search buffer radius around origin in km (legacy)")
    investigation_radius_km: Optional[float] = Field(15.0, description="Investigation radius around detected spill center in km")
    time_window_padding_hours: Optional[float] = Field(None, description="Temporal window padding around estimated origin time in hours (legacy)")
    time_window_hours: Optional[float] = Field(48.0, description="Temporal investigation window around spill detection in ±hours")
    weight_proximity: Optional[float] = Field(0.35, description="Weight for proximity score component")
    weight_temporal: Optional[float] = Field(0.25, description="Weight for temporal correlation component")
    weight_trajectory: Optional[float] = Field(0.20, description="Weight for trajectory deviation/loitering component")
    weight_anomaly: Optional[float] = Field(0.20, description="Weight for IsolationForest ML anomaly component")
    strict_real_ais_only: Optional[bool] = Field(True, description="If True, disables synthetic corridor models and evaluates ONLY authentic real vessels present in historical database/stream")
    fetch_online_gfw: Optional[bool] = Field(None, description="Query Global Fishing Watch v3 cloud gateway for authentic vessels in bounding box")


class SearchCriteria(BaseModel):
    origin_bbox: List[float]
    time_window_start: str
    time_window_end: str
    padding_hours: float
    investigation_radius_km: Optional[float] = 15.0
    time_window_hours: Optional[float] = 48.0


class VesselCorrelationResponse(BaseModel):
    spill_id: str
    analyzed_at: str
    provenance: str = Field("REAL AIS", description="Provenance marker")
    evidence_status: str = Field("VERIFIED_AIS_EVIDENCE", description="VERIFIED_AIS_EVIDENCE, NO_AIS_EVIDENCE, MODELLED_ANALYSIS")
    data_source: str = Field("REAL_AIS", description="REAL_AIS, IMPORTED_REAL_AIS, LIVE_STREAM, MODELLED")
    records_found: int = Field(0, description="Total verified AIS observation records found within investigation window")
    investigation_center: Optional[List[float]] = Field(None, description="[lon, lat] center of investigation window")
    investigation_radius_km: float = Field(15.0, description="Investigation radius in km")
    time_window_hours: float = Field(48.0, description="Time window in ±hours")
    is_synthetic_incident: bool = Field(False, description="True if spill is a synthetic demonstration incident")
    evidence_reason: Optional[str] = Field(None, description="Forensic reasoning regarding presence or absence of evidence")
    disclaimer: str = Field(
        "This analysis provides forensic spatiotemporal correlation based on verified AIS observations for maritime enforcement. Absence of AIS evidence does not prove absence of vessels.",
        description="Statutory disclaimer"
    )
    search_criteria: SearchCriteria
    total_vessels_in_corridor: int
    candidate_vessels_count: int
    authentic_vessels_count: int = 0
    is_strict_mode: bool = True
    gfw_cloud_synced: Optional[bool] = False
    gfw_vessels_fetched: Optional[int] = 0
    candidate_vessels: List[CandidateVessel]
    scoring_weights: Dict[str, float]

