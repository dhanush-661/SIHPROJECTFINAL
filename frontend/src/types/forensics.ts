// Phase 5 + 6 TypeScript types

export interface HueCluster {
  cluster_id: number;
  hue_deg: number;
  relative_weight_pct: number;
  rgb_hex: string;
  description: string;
}

export interface ThermalTelemetry {
  brightness_temp_k: number;
  ambient_sea_temp_k: number;
  thermal_contrast_k: number;
  sensor_band: string;
  thermal_signature: string;
}

export interface OpticalConfirmationResult {
  spill_id: string;
  analyzed_at: string;
  optical_confirmed: boolean | null;
  reason: string;
  satellite_platform?: string;
  sensor_name?: string;
  scene_id?: string | null;
  resolution_meters?: number | null;
  sentinel2_scene_id: string | null;
  scene_cloud_cover_pct: number | null;
  time_difference_hours: number | null;
  bonn_code: number | null;
  bonn_label: string | null;
  estimated_thickness_range_um: string | null;
  min_thickness_um: number | null;
  max_thickness_um: number | null;
  mean_reflectance: {
    B2_blue: number;
    B3_green: number;
    B4_red: number;
    B8_nir?: number;
    B5_nir?: number;
  } | null;
  hue_clusters: HueCluster[] | null;
  slick_coverage_pct: number | null;
  thermal_telemetry?: ThermalTelemetry | null;
  provenance: string;
  disclaimer: string;
}

export interface GLCMTextureFeatures {
  contrast: number;
  homogeneity: number;
  energy: number;
  entropy: number;
  correlation: number;
  dissimilarity: number;
}

export interface OpticalCrossCheck {
  bonn_code_optical: number;
  bonn_label_optical: string;
  sar_class: string;
  compatible: boolean;
  agreement_note: string;
}

export type SARThicknessClass = 'thin_sheen' | 'intermediate' | 'thick_emulsion';

export interface ThicknessEstimateResult {
  spill_id: string;
  analyzed_at: string;
  classification: SARThicknessClass;
  classification_label: string;
  classification_description: string;
  confidence: number;
  sigma0_inside_mean_db: number;
  sigma0_buffer_mean_db: number;
  backscatter_contrast_db: number;
  texture_features: GLCMTextureFeatures;
  fragmentation_index: number;
  cross_validated_with_optical: boolean | null;
  optical_cross_check: OpticalCrossCheck | null;
  provenance: string;
  source_granule: string | null;
}
