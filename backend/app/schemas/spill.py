from typing import Any, Dict, List, Optional, Tuple, Union
from pydantic import BaseModel, Field


class DateRange(BaseModel):
    start_date: str = Field(..., description="ISO 8601 start date (e.g. 2026-09-01)")
    end_date: str = Field(..., description="ISO 8601 end date (e.g. 2026-09-07)")


class GeoJSONGeometry(BaseModel):
    type: str = Field(..., description="Geometry type e.g. Polygon, MultiPolygon")
    coordinates: List[Any] = Field(..., description="Coordinate arrays in [lng, lat] format")


class DetectionRequest(BaseModel):
    aoi: Union[GeoJSONGeometry, Dict[str, Any], List[float]] = Field(
        ...,
        description="Area of Interest: GeoJSON geometry, Feature, or bounding box [minLon, minLat, maxLon, maxLat]"
    )
    date_range: DateRange = Field(..., description="Date range for Sentinel-1 acquisition query")
    sensitivity: Optional[float] = Field(0.75, ge=0.1, le=1.0, description="SAR dark spot threshold sensitivity")
    wind_threshold_min_ms: Optional[float] = Field(2.0, description="Minimum ERA5 wind speed filter in m/s")
    wind_threshold_max_ms: Optional[float] = Field(14.0, description="Maximum ERA5 wind speed filter in m/s")


class SpillRecord(BaseModel):
    spill_id: str = Field(..., description="Unique spill event identifier")
    detected_at: str = Field(..., description="ISO 8601 timestamp of detection / acquisition")
    geometry: GeoJSONGeometry = Field(..., description="GeoJSON polygon/multipolygon in WGS84")
    area_km2: float = Field(..., description="Calculated area in square kilometers in local UTM")
    perimeter_km: float = Field(..., description="Calculated perimeter in kilometers in local UTM")
    centroid: List[float] = Field(..., description="Centroid coordinates [longitude, latitude]")
    length_km: float = Field(..., description="Major axis length in km (minimum rotated rectangle)")
    width_km: float = Field(..., description="Minor axis width in km (minimum rotated rectangle)")
    bbox: List[float] = Field(..., description="Bounding box [minLon, minLat, maxLon, maxLat]")
    orientation_deg: float = Field(..., description="Orientation angle in degrees (0-180 relative to North)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score from 0.0 to 1.0")
    estimated_age_hours: List[float] = Field(..., description="Estimated age range [min_hours, max_hours]")
    source_image: str = Field(..., description="Sentinel-1 GRD granule identifier or product ID")
    provenance: str = Field("DETECTED", description="Provenance marker: DETECTED, SIMULATED, or VERIFIED")
    
    # Supplementary metadata
    wind_speed_ms: Optional[float] = Field(None, description="ERA5 wind speed at detection location in m/s")
    wind_direction_deg: Optional[float] = Field(None, description="ERA5 wind direction in degrees")
    aspect_ratio: Optional[float] = Field(None, description="Length-to-width ratio")
    radar_band: Optional[str] = Field("VV", description="SAR polarization band used")


class DetectionResponse(BaseModel):
    success: bool = True
    spills_detected_count: int
    spills: List[SpillRecord]
    aoi_bbox: List[float]
    processing_metadata: Dict[str, Any]


class PresetAOI(BaseModel):
    id: str
    name: str
    description: str
    region: str
    bbox: List[float]
    center: List[float]
    zoom: int
    default_date_range: DateRange


class AssembledSpillResponse(BaseModel):
    spill_id: str
    assembled_at: str
    provenance: str = Field("ASSEMBLED", description="Container provenance")
    provenance_registry: Dict[str, str] = Field(
        default_factory=lambda: {
            "detection": "DETECTED",
            "environmental_currents_wind": "MEASURED",
            "drift_hindcast_forecast": "MODEL-PREDICTED",
            "vessel_anomaly_attribution": "ANOMALY-FLAGGED",
            "optical_fusion": "MEASURED",
            "sar_thickness": "MODEL-PREDICTED"
        },
        description="Global 6-provenance classification mapping"
    )
    spill: SpillRecord
    drift: Optional[Any] = None # DriftSimulationResponse
    vessels: Optional[Any] = None # VesselCorrelationResponse
    optical: Optional[Any] = None # OpticalConfirmationResponse
    sar_thickness: Optional[Any] = None # ThicknessEstimateResponse
    stats: Dict[str, Any] = Field(default_factory=dict)

