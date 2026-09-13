import type { GeoJSONGeometry } from './spill';

export interface DriftSimulationRequest {
  backward_hours?: number;
  forward_hours?: number;
  particle_count?: number;
  wind_factor?: number;
  diffusion_coef_m2s?: number;
}

export interface OriginTimeWindow {
  start: string;
  end: string;
  most_likely: string;
}

export interface ProbabilityPolygons {
  p50?: GeoJSONGeometry | null;
  p75?: GeoJSONGeometry | null;
  p95?: GeoJSONGeometry | null;
}

export interface ParticleTrack {
  particle_id: number;
  track: [number, number, number][]; // [lon, lat, offset_hours]
}

export interface VectorArrow {
  lon: float_num;
  lat: float_num;
  u: number;
  v: number;
  speed_ms: number;
  direction_deg: number;
}

type float_num = number;

export interface VectorField {
  current_vectors: VectorArrow[];
  wind_vectors: VectorArrow[];
}

export interface BackwardHindcastResult {
  origin_probability_polygons: ProbabilityPolygons;
  estimated_origin_time_window: OriginTimeWindow;
  sampled_particle_trajectories: ParticleTrack[];
  origin_centroid: [number, number];
  origin_spread_radius_km: number;
}

export interface ForwardForecastResult {
  future_spread_polygons: ProbabilityPolygons;
  spread_time_horizon: string;
  sampled_particle_trajectories: ParticleTrack[];
  predicted_centroid: [number, number];
  predicted_spread_radius_km: number;
}

export interface DriftSimulationResponse {
  spill_id: string;
  simulated_at: string;
  provenance: "MODEL-PREDICTED" | string;
  parameters: Record<string, any>;
  backward: BackwardHindcastResult;
  forward: ForwardForecastResult;
  vector_field: VectorField;
  summary: Record<string, any>;
}
