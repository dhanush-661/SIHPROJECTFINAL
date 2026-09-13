import type {
  DetectionRequest,
  DetectionResponse,
  PresetAOI,
  SpillRecord,
  SystemHealth
} from '../types/spill';

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




