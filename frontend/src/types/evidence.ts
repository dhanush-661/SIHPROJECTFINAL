/**
 * frontend/src/types/evidence.ts
 * ==============================
 * Phase 7 — Tamper-Evident Evidence Ledger TypeScript Types
 */

export interface LedgerEntry {
  id?: number;
  spill_id: string;
  stage: 'detection' | 'drift' | 'vessel_scoring' | 'fusion' | 'thickness' | 'report';
  record_hash: string;
  previous_hash: string;
  stage_timestamp: string;
  payload?: Record<string, any>;
  tx_hash?: string | null;
  explorer_url?: string | null;
  is_valid?: boolean;
}

export interface PublicAnchorStatus {
  enabled: boolean;
  status: 'ANCHORED' | 'SKIPPED_GRACEFUL' | 'FAILED' | 'NOT_CONFIGURED';
  network?: string;
  chain_id?: number;
  merkle_root?: string;
  tx_hash?: string | null;
  explorer_url?: string | null;
  anchored_at?: string | null;
  details?: string | null;
}

export interface ChainVerificationResponse {
  success: boolean;
  chain_verified: boolean;
  spill_id: string;
  chain_length: number;
  merkle_root: string;
  provenance: 'VERIFIED' | 'TAMPERED' | 'UNVERIFIED';
  verified_at: string;
  stages_covered: string[];
  entries: LedgerEntry[];
  public_anchor: PublicAnchorStatus;
  disclaimer: string;
}
