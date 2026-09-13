from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.schemas.spill import GeoJSONGeometry


class DriftSimulationRequest(BaseModel):
    backward_hours: Optional[float] = Field(48.0, ge=6.0, le=120.0, description="Hours to simulate backward in time (hindcast)")
    forward_hours: Optional[float] = Field(24.0, ge=6.0, le=72.0, description="Hours to simulate forward in time (forecast)")
    particle_count: Optional[int] = Field(1000, ge=100, le=3000, description="Number of Lagrangian particles to seed")
    wind_factor: Optional[float] = Field(0.03, ge=0.01, le=0.06, description="Wind drift coefficient (default 3%)")
    diffusion_coef_m2s: Optional[float] = Field(5.0, ge=0.5, le=50.0, description="Horizontal turbulent diffusion coefficient in m2/s")


class OriginTimeWindow(BaseModel):
    start: str = Field(..., description="Estimated earliest origin timestamp (ISO 8601)")
    end: str = Field(..., description="Estimated latest origin timestamp (ISO 8601)")
    most_likely: str = Field(..., description="Most probable release timestamp (ISO 8601)")


class ProbabilityPolygons(BaseModel):
    p50: Optional[GeoJSONGeometry] = Field(None, description="50% Highest Probability Density Region (core)")
    p75: Optional[GeoJSONGeometry] = Field(None, description="75% Probability Region")
    p95: Optional[GeoJSONGeometry] = Field(None, description="95% Probability Boundary Region")


class ParticleTrack(BaseModel):
    particle_id: int
    track: List[List[float]] = Field(..., description="Array of [lon, lat, timestamp_offset_hrs] points")


class VectorArrow(BaseModel):
    lon: float
    lat: float
    u: float
    v: float
    speed_ms: float
    direction_deg: float


class VectorField(BaseModel):
    current_vectors: List[VectorArrow] = Field(default_factory=list, description="Copernicus Marine surface current grid")
    wind_vectors: List[VectorArrow] = Field(default_factory=list, description="ERA5 10m wind velocity grid")


class BackwardHindcastResult(BaseModel):
    origin_probability_polygons: ProbabilityPolygons
    estimated_origin_time_window: OriginTimeWindow
    sampled_particle_trajectories: List[ParticleTrack]
    origin_centroid: List[float] = Field(..., description="Centroid of backward particle cluster [lon, lat]")
    origin_spread_radius_km: float


class ForwardForecastResult(BaseModel):
    future_spread_polygons: ProbabilityPolygons
    spread_time_horizon: str = Field(..., description="Forecast target timestamp (ISO 8601)")
    sampled_particle_trajectories: List[ParticleTrack]
    predicted_centroid: List[float] = Field(..., description="Predicted future centroid [lon, lat]")
    predicted_spread_radius_km: float


class DriftSimulationResponse(BaseModel):
    spill_id: str
    simulated_at: str = Field(..., description="Timestamp when simulation was executed")
    provenance: str = Field("MODEL-PREDICTED", description="Provenance identifier")
    parameters: Dict[str, Any]
    backward: BackwardHindcastResult
    forward: ForwardForecastResult
    vector_field: VectorField
    summary: Dict[str, Any]
