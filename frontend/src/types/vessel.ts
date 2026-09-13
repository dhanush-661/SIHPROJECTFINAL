export interface VesselPoint {
  lon: number;
  lat: number;
  sog_knots: number;
  cog_deg: number;
  heading_deg?: number | null;
  timestamp: string;
  is_gap_interpolated: boolean;
}

export interface VesselFeatures {
  min_distance_to_origin_km: number;
  time_near_origin_hours: number;
  speed_change_variance: number;
  course_change_frequency: number;
  loitering_score: number;
  route_deviation_score: number;
  ais_gap_duration_hours: number;
  bearing_alignment_with_drift: number;
}

export interface ComponentScores {
  proximity_score: number;
  temporal_score: number;
  trajectory_score: number;
  ml_anomaly_score: number;
}

export interface CandidateVessel {
  mmsi: string;
  imo?: string | null;
  vessel_name: string;
  vessel_type: string;
  flag: string;
  length_m: number;
  deadweight_tonnage?: number | null;
  suspect_score: number;
  anomaly_score: number;
  component_scores: ComponentScores;
  features: VesselFeatures;
  track: VesselPoint[];
  closest_approach_time: string;
  is_ais_dark_suspect: boolean;
}

export interface SearchCriteria {
  origin_bbox: [number, number, number, number];
  time_window_start: string;
  time_window_end: string;
  padding_hours: number;
}

export interface VesselCorrelationRequest {
  origin_buffer_km?: number;
  time_window_padding_hours?: number;
  weight_proximity?: number;
  weight_temporal?: number;
  weight_trajectory?: number;
  weight_anomaly?: number;
}

export interface VesselCorrelationResponse {
  spill_id: string;
  analyzed_at: string;
  provenance: string;
  disclaimer: string;
  search_criteria: SearchCriteria;
  total_vessels_in_corridor: number;
  candidate_vessels_count: number;
  candidate_vessels: CandidateVessel[];
  scoring_weights: {
    proximity: number;
    temporal: number;
    trajectory: number;
    ml_anomaly: number;
  };
}
