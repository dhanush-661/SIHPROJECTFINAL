export interface ExternalIncident {
  incident_id: string;
  source_name: string;
  reported_at: string;
  geometry: {
    type: string;
    coordinates: any;
  };
  centroid: [number, number]; // [lon, lat]
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  estimated_area_km2?: number | null;
  confidence_or_score?: number | null;
  source_url?: string | null;
  notes_or_vessel?: string | null;
  provenance: 'EXTERNAL-REFERENCE';
}

export interface ExternalIncidentCreate {
  incident_id?: string;
  source_name: string;
  reported_at: string;
  geometry: {
    type: string;
    coordinates: any;
  };
  estimated_area_km2?: number;
  confidence_or_score?: number;
  source_url?: string;
  notes_or_vessel?: string;
}

export interface ValidationRunRequest {
  aoi: [number, number, number, number] | { type: string; coordinates: any };
  date_start: string;
  date_end: string;
  time_window_hours?: number;
  max_distance_km?: number;
}

export interface ValidationComparisonRecord {
  comparison_id: string;
  status: 'MATCHED' | 'MISSED' | 'UNVALIDATED_DETECTION';
  external_incident?: ExternalIncident | null;
  matched_spill_id?: string | null;
  matched_detection_summary?: {
    spill_id: string;
    detected_at: string;
    area_km2: number;
    confidence: number;
    source_image: string;
    centroid?: [number, number];
  } | null;
  spatial_distance_km?: number | null;
  temporal_delta_hours?: number | null;
  overlap_type?: 'POLYGON_INTERSECTION' | 'CENTROID_PROXIMITY' | 'NONE' | null;
  notes: string;
}

export interface ValidationRunResponse {
  run_id: string;
  executed_at: string;
  aoi_bbox: [number, number, number, number];
  date_range: {
    start: string;
    end: string;
  };
  time_window_hours: number;
  max_distance_km: number;
  total_external_incidents: number;
  matched_count: number;
  missed_count: number;
  unvalidated_detections_count: number;
  summary_headline: string;
  comparisons: ValidationComparisonRecord[];
  framing_disclaimer: string;
}
