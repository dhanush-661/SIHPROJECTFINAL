export interface GeoJSONGeometry {
  type: string;
  coordinates: any[];
}

export interface DateRange {
  start_date: string;
  end_date: string;
}

export interface DetectionRequest {
  aoi: GeoJSONGeometry | { [key: string]: any } | number[];
  date_range: DateRange;
  sensitivity?: number;
  wind_threshold_min_ms?: number;
  wind_threshold_max_ms?: number;
}

export interface SpillRecord {
  spill_id: string;
  detected_at: string;
  geometry: GeoJSONGeometry;
  area_km2: number;
  perimeter_km: number;
  centroid: [number, number]; // [lon, lat]
  length_km: number;
  width_km: number;
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  orientation_deg: number;
  confidence: number;
  estimated_age_hours: [number, number]; // [min_h, max_h]
  source_image: string;
  provenance: "DETECTED" | "SIMULATED" | "VERIFIED" | string;
  
  // Optional environmental and radar metadata
  wind_speed_ms?: number;
  wind_direction_deg?: number;
  aspect_ratio?: number;
  radar_band?: string;
}

export interface DetectionResponse {
  success: boolean;
  spills_detected_count: number;
  spills: SpillRecord[];
  aoi_bbox: [number, number, number, number];
  processing_metadata: {
    engine_mode: string;
    aoi_bbox: number[];
    date_range: DateRange;
    polarization: string;
    sensor: string;
    sar_processing_steps: string[];
    candidates_analyzed?: number;
    false_positives_filtered?: number;
    detected_spills_count?: number;
  };
}

export interface PresetAOI {
  id: string;
  name: string;
  description: string;
  region: string;
  bbox: [number, number, number, number];
  center: [number, number];
  zoom: number;
  default_date_range: DateRange;
}

export interface SystemHealth {
  status: string;
  service: string;
  gee_connected: boolean;
  mode: string;
  database: string;
  supported_sensors: string[];
}

export type ProvenanceType = "DETECTED" | "MEASURED" | "MODEL-PREDICTED" | "ANOMALY-FLAGGED";

export interface AssembledSpillData {
  spill_id: string;
  assembled_at: string;
  provenance: string;
  provenance_registry: Record<string, ProvenanceType>;
  spill: SpillRecord;
  drift?: import('./drift').DriftSimulationResponse | null;
  vessels?: import('./vessel').VesselCorrelationResponse | null;
  optical?: import('./forensics').OpticalConfirmationResult | null;
  sar_thickness?: import('./forensics').ThicknessEstimateResult | null;
  stats?: {
    area_km2: number;
    confidence: number;
    has_drift_simulated: boolean;
    has_vessels_correlated: boolean;
    has_optical_confirmed: boolean;
    optical_status: 'CONFIRMED' | 'UNCONFIRMED' | 'NO_CLEAN_SCENE' | 'NOT_EVALUATED';
    sar_thickness_classification: string | null;
    sar_thickness_cross_validated: boolean | null;
    total_candidates: number;
  };
}


