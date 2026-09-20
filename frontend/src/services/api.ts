import type {
  DetectionRequest,
  DetectionResponse,
  PresetAOI,
  SpillRecord,
  SystemHealth
} from '../types/spill';
import type {
  ExternalIncident,
  ExternalIncidentCreate,
  ValidationRunRequest,
  ValidationRunResponse
} from '../types/validation';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';

export async function checkHealth(): Promise<SystemHealth> {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.statusText}`);
  }
  return res.json();
}

export async function getPresets(): Promise<PresetAOI[]> {
  const res = await fetch(`${API_BASE_URL}/presets`);
  if (!res.ok) {
    throw new Error(`Failed to load presets: ${res.statusText}`);
  }
  return res.json();
}

export async function detectSpills(request: DetectionRequest): Promise<DetectionResponse> {
  const res = await fetch(`${API_BASE_URL}/detect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Detection failed: ${res.statusText}`);
  }
  return res.json();
}

export async function getSpills(limit: number = 50): Promise<SpillRecord[]> {
  const res = await fetch(`${API_BASE_URL}/spills?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch spills: ${res.statusText}`);
  }
  return res.json();
}

export async function getSpillById(spillId: string): Promise<SpillRecord> {
  const res = await fetch(`${API_BASE_URL}/spills/${spillId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch spill ${spillId}: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteSpill(spillId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/spills/${spillId}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`Failed to delete spill ${spillId}: ${res.statusText}`);
  }
  return res.json();
}

export async function clearAllSpills(): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/spills`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`Failed to clear spills: ${res.statusText}`);
  }
  return res.json();
}

export async function getAnalyticsStats(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/stats`);
  if (!res.ok) {
    throw new Error(`Failed to fetch analytics: ${res.statusText}`);
  }
  return res.json();
}

export async function runDriftSimulation(
  spillId: string,
  request?: import('../types/drift').DriftSimulationRequest
): Promise<import('../types/drift').DriftSimulationResponse> {
  const res = await fetch(`${API_BASE_URL}/drift/${spillId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request || {}),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Drift simulation failed: ${res.statusText}`);
  }
  return res.json();
}

export async function getDriftSimulation(
  spillId: string
): Promise<import('../types/drift').DriftSimulationResponse> {
  const res = await fetch(`${API_BASE_URL}/drift/${spillId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch drift simulation: ${res.statusText}`);
  }
  return res.json();
}

export async function correlateVessels(
  spillId: string,
  request?: import('../types/vessel').VesselCorrelationRequest
): Promise<import('../types/vessel').VesselCorrelationResponse> {
  const res = await fetch(`${API_BASE_URL}/vessels/${spillId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request || {}),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Vessel correlation failed: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchGFWVessels(
  spillId: string
): Promise<import('../types/vessel').VesselCorrelationResponse> {
  const res = await fetch(`${API_BASE_URL}/vessels/gfw-fetch/${spillId}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `GFW Cloud fetch failed: ${res.statusText}`);
  }
  return res.json();
}

export async function getGFWStatus(): Promise<{
  provider: string;
  api_endpoint: string;
  token_configured: boolean;
  application_name: string;
  features: string[];
  status: string;
}> {
  const res = await fetch(`${API_BASE_URL}/ais/gfw-status`);
  if (!res.ok) {
    throw new Error(`Failed to retrieve GFW status: ${res.statusText}`);
  }
  return res.json();
}

export async function getVesselCorrelation(
  spillId: string
): Promise<import('../types/vessel').VesselCorrelationResponse> {
  const res = await fetch(`${API_BASE_URL}/vessels/${spillId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch vessel correlation: ${res.statusText}`);
  }
  return res.json();
}

export async function getAssembledSpill(
  spillId: string
): Promise<import('../types/spill').AssembledSpillData> {
  const res = await fetch(`${API_BASE_URL}/spill/${spillId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch assembled spill data: ${res.statusText}`);
  }
  return res.json();
}

// ── Phase 5: Optical Fusion ──────────────────────────────────────────────────

export async function runOpticalFusion(
  spillId: string,
  options?: { max_cloud_cover_pct?: number; time_window_hours?: number; buffer_meters?: number }
): Promise<import('../types/forensics').OpticalConfirmationResult> {
  const res = await fetch(`${API_BASE_URL}/fusion/${spillId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Optical fusion failed: ${res.statusText}`);
  }
  return res.json();
}

export async function getOpticalFusion(
  spillId: string
): Promise<import('../types/forensics').OpticalConfirmationResult> {
  const res = await fetch(`${API_BASE_URL}/fusion/${spillId}`);
  if (!res.ok) throw new Error(`Failed to fetch optical fusion: ${res.statusText}`);
  return res.json();
}

// ── Phase 6: SAR Thickness Classification ────────────────────────────────────

export async function runThicknessClassification(
  spillId: string,
  options?: { buffer_ring_meters?: number; glcm_levels?: number }
): Promise<import('../types/forensics').ThicknessEstimateResult> {
  const res = await fetch(`${API_BASE_URL}/thickness/${spillId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Thickness classification failed: ${res.statusText}`);
  }
  return res.json();
}

export async function getThicknessClassification(
  spillId: string
): Promise<import('../types/forensics').ThicknessEstimateResult> {
  const res = await fetch(`${API_BASE_URL}/thickness/${spillId}`);
  if (!res.ok) throw new Error(`Failed to fetch thickness estimate: ${res.statusText}`);
  return res.json();
}


export interface LiveProviderStatus {
  timestamp: string;
  providers: {
    maptiler: {
      name: string;
      key_configured: boolean;
      services: string[];
      status: string;
    };
    aisstream: {
      provider: string;
      connected: boolean;
      total_messages: number;
      tracked_live_vessels_count: number;
      last_message_timestamp: number | null;
      status: string;
    };
    global_fishing_watch: {
      provider: string;
      api_endpoint: string;
      token_configured: boolean;
      application_name: string;
      features: string[];
      status: string;
    };
    copernicus_cds: {
      provider: string;
      endpoint: string;
      authenticated: boolean;
      key_configured: boolean;
      key_prefix: string;
      products_available: string[];
      status: string;
      verified: boolean;
    };
  };
}

export interface LiveAISVessel {
  mmsi: number;
  name: string;
  ship_type: string;
  lat: number;
  lon: number;
  sog: number;
  cog: number;
  heading: number;
  nav_status: number;
  timestamp: string;
  source: string;
  track?: [number, number][];
}

export async function getLiveFeedStatus(): Promise<LiveProviderStatus> {
  const res = await fetch(`${API_BASE_URL}/live/status`);
  if (!res.ok) {
    throw new Error(`Failed to fetch live feed status: ${res.statusText}`);
  }
  return res.json();
}

export async function getLiveAISVessels(bbox?: [number, number, number, number], limit: number = 150): Promise<LiveAISVessel[]> {
  let url = `${API_BASE_URL}/live/ais?limit=${limit}`;
  if (bbox && bbox.length === 4) {
    url += `&min_lon=${bbox[0]}&min_lat=${bbox[1]}&max_lon=${bbox[2]}&max_lat=${bbox[3]}`;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch live AIS vessels: ${res.statusText}`);
  }
  const data = await res.json();
  return data.vessels || [];
}

export async function getLiveCopernicusMarine(lon: number, lat: number): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/live/copernicus?lon=${lon}&lat=${lat}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch live Copernicus data: ${res.statusText}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7 Evidence Ledger API Calls
// ─────────────────────────────────────────────────────────────────────────────

export async function verifyEvidenceChain(
  spillId: string
): Promise<import('../types/evidence').ChainVerificationResponse> {
  const res = await fetch(`${API_BASE_URL}/evidence/verify/${spillId}`);
  if (!res.ok) {
    throw new Error(`Failed to verify evidence chain for ${spillId}: ${res.statusText}`);
  }
  return res.json();
}

export async function getEvidenceLedger(
  spillId: string
): Promise<import('../types/evidence').LedgerEntry[]> {
  const res = await fetch(`${API_BASE_URL}/evidence/ledger/${spillId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch evidence ledger for ${spillId}: ${res.statusText}`);
  }
  return res.json();
}

export async function triggerBlockchainAnchor(
  spillId: string,
  network: string = 'polygon_amoy'
): Promise<import('../types/evidence').PublicAnchorStatus> {
  const res = await fetch(`${API_BASE_URL}/evidence/anchor/${spillId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ network })
  });
  if (!res.ok) {
    throw new Error(`Failed to trigger blockchain anchor for ${spillId}: ${res.statusText}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8 Forensic Report API Calls
// ─────────────────────────────────────────────────────────────────────────────

export async function generateForensicReport(
  spillId: string
): Promise<import('../types/report').ReportGenerationResponse> {
  const res = await fetch(`${API_BASE_URL}/report/${spillId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to generate forensic report for ${spillId}: ${res.statusText}`);
  }
  return res.json();
}

export function getReportDownloadUrl(spillId: string): string {
  return `${API_BASE_URL}/report/${spillId}/download`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dedicated Testing & Historical Validation Dataset Endpoints
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationDatasetMetadata {
  fixture_id: string;
  title: string;
  region: string;
  incident_date: string;
  description: string;
  tags: string[];
  stats: Record<string, any>;
}

export async function getTestingDatasets(): Promise<ValidationDatasetMetadata[]> {
  const res = await fetch(`${API_BASE_URL}/testing/datasets`);
  if (!res.ok) {
    throw new Error(`Failed to load validation datasets: ${res.statusText}`);
  }
  return res.json();
}

export async function getTestingSpillBundle(
  fixtureId: string
): Promise<import('../types/spill').AssembledSpillData> {
  const res = await fetch(`${API_BASE_URL}/testing/spill/${fixtureId}`);
  if (!res.ok) {
    throw new Error(`Failed to load validation fixture "${fixtureId}": ${res.statusText}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Sentinel-1 AOI Monitoring & Real-Time Alerts
// ─────────────────────────────────────────────────────────────────────────────

export interface AOIMonitor {
  id: string;
  name: string;
  geometry_json?: string | null;
  bbox_json?: string | null;
  poll_interval_hours: number;
  is_active: boolean;
  created_at: string;
  last_checked_at?: string | null;
  last_processed_scene_id?: string | null;
  last_processed_at?: string | null;
  spills_detected_count: number;
  last_detection_summary?: {
    scene_id?: string;
    acquisition_date?: string;
    spills_found?: number;
    max_confidence?: number;
    total_area_km2?: number;
    timestamp?: string;
  } | null;
}

export interface AOIMonitorCreate {
  name: string;
  geometry_json?: string;
  bbox_json?: string;
  poll_interval_hours?: number;
  is_active?: boolean;
}

export interface AOIMonitorUpdate {
  name?: string;
  geometry_json?: string;
  bbox_json?: string;
  poll_interval_hours?: number;
  is_active?: boolean;
}

export interface LiveAlert {
  type: string;
  alert_id: string;
  monitor_id: string;
  monitor_name: string;
  scene_id: string;
  detected_at: string;
  spills_count: number;
  spills: SpillRecord[];
  bbox: number[];
  summary: any;
}

export async function getMonitors(activeOnly: boolean = false): Promise<AOIMonitor[]> {
  const res = await fetch(`${API_BASE_URL}/aoi-monitors?active_only=${activeOnly}`);
  if (!res.ok) {
    throw new Error(`Failed to load AOI monitors: ${res.statusText}`);
  }
  return res.json();
}

export async function createMonitor(data: AOIMonitorCreate): Promise<AOIMonitor> {
  const res = await fetch(`${API_BASE_URL}/aoi-monitors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to create monitor: ${res.statusText}`);
  }
  return res.json();
}

export async function updateMonitor(id: string, updates: AOIMonitorUpdate): Promise<AOIMonitor> {
  const res = await fetch(`${API_BASE_URL}/aoi-monitors/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to update monitor: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteMonitor(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/aoi-monitors/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete monitor: ${res.statusText}`);
  }
  return res.json();
}

export async function pollMonitorNow(id: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/aoi-monitors/${id}/poll-now`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to poll monitor: ${res.statusText}`);
  }
  return res.json();
}

export async function getLiveAlerts(): Promise<LiveAlert[]> {
  const res = await fetch(`${API_BASE_URL}/alerts`);
  if (!res.ok) {
    throw new Error(`Failed to load live alerts: ${res.statusText}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Dedicated Validation & External Incident Database API Client
// ─────────────────────────────────────────────────────────────────────────────

export async function getExternalIncidents(params?: {
  min_lon?: number;
  min_lat?: number;
  max_lon?: number;
  max_lat?: number;
  start_date?: string;
  end_date?: string;
  limit?: number;
}): Promise<ExternalIncident[]> {
  const query = new URLSearchParams();
  if (params?.min_lon !== undefined) query.set('min_lon', params.min_lon.toString());
  if (params?.min_lat !== undefined) query.set('min_lat', params.min_lat.toString());
  if (params?.max_lon !== undefined) query.set('max_lon', params.max_lon.toString());
  if (params?.max_lat !== undefined) query.set('max_lat', params.max_lat.toString());
  if (params?.start_date) query.set('start_date', params.start_date);
  if (params?.end_date) query.set('end_date', params.end_date);
  if (params?.limit) query.set('limit', params.limit.toString());

  const url = `${API_BASE_URL}/external-incidents${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load external reference incidents: ${res.statusText}`);
  }
  return res.json();
}

export async function getExternalIncidentById(incidentId: string): Promise<ExternalIncident> {
  const res = await fetch(`${API_BASE_URL}/external-incidents/${incidentId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch external incident ${incidentId}: ${res.statusText}`);
  }
  return res.json();
}

export async function seedExternalIncidents(): Promise<{ success: boolean; seeded_count: number; message: string }> {
  const res = await fetch(`${API_BASE_URL}/external-incidents/seed`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to seed reference incidents: ${res.statusText}`);
  }
  return res.json();
}

export async function importExternalIncidents(request: {
  source_name: string;
  incidents: ExternalIncidentCreate[];
}): Promise<{ success: boolean; imported_count: number; message: string }> {
  const res = await fetch(`${API_BASE_URL}/external-incidents/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to import external incidents: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteExternalIncident(incidentId: string): Promise<{ success: boolean; incident_id: string }> {
  const res = await fetch(`${API_BASE_URL}/external-incidents/${incidentId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete external incident ${incidentId}: ${res.statusText}`);
  }
  return res.json();
}

export async function runValidation(request: ValidationRunRequest): Promise<ValidationRunResponse> {
  const res = await fetch(`${API_BASE_URL}/validation/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Validation execution failed: ${res.statusText}`);
  }
  return res.json();
}

export async function getValidationResults(limit: number = 20): Promise<any[]> {
  const res = await fetch(`${API_BASE_URL}/validation/results?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Failed to load historical validation runs: ${res.statusText}`);
  }
  return res.json();
}

// ── Historical AIS Persistence & Telemetry Ingestion ────────────────────────

export async function importAisCsv(
  fileOrText: File | string,
  sourceLabel: string = 'CSV_IMPORT'
): Promise<import('../types/vessel').AisImportResponse> {
  if (typeof fileOrText === 'string') {
    const res = await fetch(`${API_BASE_URL}/ais/import-csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv_text: fileOrText, source_label: sourceLabel }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to import AIS CSV: ${res.statusText}`);
    }
    return res.json();
  } else {
    const formData = new FormData();
    formData.append('file', fileOrText);
    formData.append('source_label', sourceLabel);
    const res = await fetch(`${API_BASE_URL}/ais/import-csv`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to import AIS CSV: ${res.statusText}`);
    }
    return res.json();
  }
}

export async function importAisGeoJson(
  fileOrObj: File | object,
  sourceLabel: string = 'GEOJSON_IMPORT'
): Promise<import('../types/vessel').AisImportResponse> {
  if (fileOrObj instanceof File) {
    const formData = new FormData();
    formData.append('file', fileOrObj);
    formData.append('source_label', sourceLabel);
    const res = await fetch(`${API_BASE_URL}/ais/import-geojson`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to import AIS GeoJSON: ${res.statusText}`);
    }
    return res.json();
  } else {
    const res = await fetch(`${API_BASE_URL}/ais/import-geojson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fileOrObj),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to import AIS GeoJSON: ${res.statusText}`);
    }
    return res.json();
  }
}

export async function getAisStats(): Promise<import('../types/vessel').AisTableStats> {
  const res = await fetch(`${API_BASE_URL}/ais/stats`);
  if (!res.ok) {
    throw new Error(`Failed to fetch historical AIS stats: ${res.statusText}`);
  }
  return res.json();
}

export async function clearAisDatabase(): Promise<{ success: boolean; cleared_records: number; message: string }> {
  const res = await fetch(`${API_BASE_URL}/ais/clear`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to clear AIS database: ${res.statusText}`);
  }
  return res.json();
}

