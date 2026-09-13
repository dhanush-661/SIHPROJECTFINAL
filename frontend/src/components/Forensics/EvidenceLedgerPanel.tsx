/**
 * frontend/src/components/Forensics/EvidenceLedgerPanel.tsx
 * =========================================================
 * Phase 7 — Tamper-Evident Evidence Ledger & Merkle Chain Inspector
 */
import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Link2,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  Clock,
  FileCode,
  Globe,
  Lock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { SpillRecord } from '../../types/spill';
import type { ChainVerificationResponse, LedgerEntry, PublicAnchorStatus } from '../../types/evidence';
import { verifyEvidenceChain, triggerBlockchainAnchor } from '../../services/api';

interface EvidenceLedgerPanelProps {
  spill: SpillRecord | null;
  initialVerification?: ChainVerificationResponse | null;
  onVerificationChange?: (result: ChainVerificationResponse) => void;
}

const STAGE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  detection: {
    label: 'P1: SAR Detection',
    color: '#38bdf8',
    desc: 'Sentinel-1 VV radiometric calibration & dark-spot segmentation'
  },
  drift: {
    label: 'P2: Drift Simulation',
    color: '#818cf8',
    desc: 'Lagrangian RK4 advection & ERA5/Copernicus drift contours'
  },
  vessel_scoring: {
    label: 'P3: Vessel Attribution',
    color: '#c084fc',
    desc: 'AIS spatiotemporal corridor & IsolationForest anomaly attribution'
  },
  fusion: {
    label: 'P5: Optical Fusion',
    color: '#34d399',
    desc: 'Sentinel-2 MSI Bonn Agreement (BAOAC 1-5) cross-validation'
  },
  thickness: {
    label: 'P6: SAR Thickness',
    color: '#fb923c',
    desc: 'Sigma-0 contrast (dB), Polsby-Popper fragmentation & GLCM texture'
  }
};

export const EvidenceLedgerPanel: React.FC<EvidenceLedgerPanelProps> = ({
  spill,
  initialVerification,
  onVerificationChange
}) => {
  const [verification, setVerification] = useState<ChainVerificationResponse | null>(
    initialVerification || null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [anchorStatus, setAnchorStatus] = useState<PublicAnchorStatus | null>(
    initialVerification?.public_anchor || null
  );
  const [expandedPayloads, setExpandedPayloads] = useState<Record<number, boolean>>({});
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const fetchVerification = async () => {
    if (!spill) return;
    setIsLoading(true);
    try {
      const res = await verifyEvidenceChain(spill.spill_id);
      setVerification(res);
      setAnchorStatus(res.public_anchor);
      if (onVerificationChange) {
        onVerificationChange(res);
      }
    } catch (err) {
      console.error('Evidence verification failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (spill && !initialVerification) {
      fetchVerification();
    } else if (initialVerification) {
      setVerification(initialVerification);
      setAnchorStatus(initialVerification.public_anchor);
    }
  }, [spill, initialVerification]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleAnchor = async (network: string = 'polygon_amoy') => {
    if (!spill) return;
    setIsAnchoring(true);
    try {
      const res = await triggerBlockchainAnchor(spill.spill_id, network);
      setAnchorStatus(res);
    } catch (err) {
      console.error('Blockchain anchoring error:', err);
    } finally {
      setIsAnchoring(false);
    }
  };

  const togglePayload = (idx: number) => {
    setExpandedPayloads((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (!spill) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        No spill record selected.
      </div>
    );
  }

  const isVerified = verification?.chain_verified === true;
  const chainLength = verification?.chain_length || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* ── Top Overview Banner ────────────────────────────────────────────── */}
      <div
        style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: isVerified
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 78, 59, 0.25))'
            : 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(127, 29, 29, 0.25))',
          border: `1px solid ${isVerified ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: isVerified ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${isVerified ? '#10b981' : '#ef4444'}`
            }}
          >
            {isVerified ? <ShieldCheck size={20} color="#10b981" /> : <ShieldAlert size={20} color="#ef4444" />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fff' }}>
                {isVerified ? 'MERKLE CHAIN VERIFIED' : 'CHAIN INTEGRITY ALERT'}
              </span>
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: isVerified ? '#10b98133' : '#ef444433',
                  color: isVerified ? '#34d399' : '#f87171',
                  border: `1px solid ${isVerified ? '#10b98166' : '#ef444466'}`
                }}
              >
                {verification?.provenance || 'EVALUATING'}
              </span>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {chainLength} chained stage records • Append-only SQLite/PostGIS ledger • Zero UPDATE/DELETE permission
            </div>
          </div>
        </div>

        <button
          onClick={fetchVerification}
          disabled={isLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '6px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#fff',
            fontSize: '0.72rem',
            fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <RefreshCw size={12} className={isLoading ? 'spin' : ''} />
          <span>{isLoading ? 'Re-Verifying...' : 'Verify Chain'}</span>
        </button>
      </div>

      {/* ── Merkle Root Card ──────────────────────────────────────────────── */}
      {verification && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(148, 163, 184, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lock size={13} color="#38bdf8" />
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Merkle Tree Root Hash
              </span>
            </div>
            <button
              onClick={() => handleCopy(verification.merkle_root, 'merkle_root')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'transparent',
                border: 'none',
                color: '#38bdf8',
                fontSize: '0.68rem',
                cursor: 'pointer'
              }}
            >
              {copiedHash === 'merkle_root' ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
              <span>{copiedHash === 'merkle_root' ? 'Copied' : 'Copy Root'}</span>
            </button>
          </div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '0.72rem',
              color: '#38bdf8',
              wordBreak: 'break-all',
              background: 'rgba(0,0,0,0.3)',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(56, 189, 248, 0.2)'
            }}
          >
            {verification.merkle_root}
          </div>
        </div>
      )}

      {/* ── Merkle Chain Timeline ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '2px' }}>
          <Link2 size={13} color="#818cf8" />
          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#fff', textTransform: 'uppercase' }}>
            Cryptographic Stage Sequence
          </span>
        </div>

        {verification?.entries && verification.entries.length > 0 ? (
          verification.entries.map((entry: LedgerEntry, idx: number) => {
            const stageConfig = STAGE_LABELS[entry.stage] || {
              label: entry.stage,
              color: '#94a3b8',
              desc: 'Pipeline stage output'
            };
            const isPayloadOpen = !!expandedPayloads[idx];

            return (
              <div
                key={idx}
                style={{
                  position: 'relative',
                  borderRadius: '6px',
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: `1px solid ${entry.is_valid ? 'rgba(148, 163, 184, 0.18)' : 'rgba(239, 68, 68, 0.5)'}`,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                {/* Stage Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: `${stageConfig.color}22`,
                        border: `1px solid ${stageConfig.color}`,
                        color: stageConfig.color,
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {idx + 1}
                    </span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: stageConfig.color }}>
                      {stageConfig.label}
                    </span>
                    <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                      • {stageConfig.desc}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={11} color="var(--text-muted)" />
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {entry.stage_timestamp.slice(11, 19)} UTC
                    </span>
                  </div>
                </div>

                {/* Hashes Row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    fontSize: '0.66rem',
                    fontFamily: 'monospace'
                  }}
                >
                  {/* Previous Hash */}
                  <div
                    style={{
                      background: 'rgba(0,0,0,0.25)',
                      padding: '5px 8px',
                      borderRadius: '4px',
                      border: '1px solid rgba(255,255,255,0.06)'
                    }}
                  >
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.58rem', marginBottom: '2px' }}>
                      PREVIOUS HASH (N-1)
                    </div>
                    <div
                      style={{
                        color: entry.previous_hash.startsWith('0000') ? '#94a3b8' : '#818cf8',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={entry.previous_hash}
                    >
                      {entry.previous_hash.slice(0, 16)}...{entry.previous_hash.slice(-8)}
                    </div>
                  </div>

                  {/* Record Hash */}
                  <div
                    style={{
                      background: 'rgba(0,0,0,0.25)',
                      padding: '5px 8px',
                      borderRadius: '4px',
                      border: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.58rem', marginBottom: '2px' }}>
                        STAGE RECORD HASH (N)
                      </div>
                      <div
                        style={{
                          color: '#34d399',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={entry.record_hash}
                      >
                        {entry.record_hash.slice(0, 16)}...{entry.record_hash.slice(-8)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopy(entry.record_hash, `hash_${idx}`)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '2px'
                      }}
                      title="Copy full SHA-256 hash"
                    >
                      {copiedHash === `hash_${idx}` ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>

                {/* Payload Inspector Toggle */}
                {entry.payload && (
                  <div>
                    <button
                      onClick={() => togglePayload(idx)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        fontSize: '0.62rem',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      <FileCode size={11} />
                      <span>{isPayloadOpen ? 'Hide Canonical Payload' : 'Inspect Canonical Payload'}</span>
                      {isPayloadOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>

                    {isPayloadOpen && (
                      <pre
                        style={{
                          marginTop: '6px',
                          padding: '8px',
                          borderRadius: '4px',
                          background: 'rgba(0,0,0,0.45)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          fontSize: '0.6rem',
                          color: '#cbd5e1',
                          overflowX: 'auto',
                          maxHeight: '140px'
                        }}
                      >
                        {JSON.stringify(entry.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
            No ledger entries recorded yet. Run detection or subsequent pipeline stages.
          </div>
        )}
      </div>

      {/* ── Public Blockchain Testnet Anchor Card ─────────────────────────── */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: '8px',
          background: 'rgba(15, 23, 42, 0.7)',
          border: '1px solid rgba(129, 140, 248, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Globe size={14} color="#818cf8" />
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#fff' }}>
              Public Testnet Blockchain Anchor
            </span>
          </div>

          <span
            style={{
              fontSize: '0.6rem',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
              background: anchorStatus?.status === 'ANCHORED' ? '#10b98122' : '#94a3b822',
              color: anchorStatus?.status === 'ANCHORED' ? '#34d399' : '#94a3b8',
              border: `1px solid ${anchorStatus?.status === 'ANCHORED' ? '#10b98155' : '#94a3b844'}`
            }}
          >
            {anchorStatus?.status === 'ANCHORED'
              ? 'ON-CHAIN ANCHORED'
              : anchorStatus?.status === 'NOT_CONFIGURED'
              ? 'LOCAL LEDGER ONLY'
              : 'DEGRADED GRACEFULLY'}
          </span>
        </div>

        <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>
          {anchorStatus?.details ||
            'Merkle root hash anchoring to public testnet (Polygon Amoy / Ethereum Sepolia) for decentralized proof of existence without exposing spill payload.'}
        </div>

        {anchorStatus?.tx_hash && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(0,0,0,0.3)',
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid rgba(129, 140, 248, 0.2)'
            }}
          >
            <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#818cf8' }}>
              TX: {anchorStatus.tx_hash.slice(0, 18)}...{anchorStatus.tx_hash.slice(-8)}
            </div>
            {anchorStatus.explorer_url && (
              <a
                href={anchorStatus.explorer_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#38bdf8',
                  fontSize: '0.64rem',
                  textDecoration: 'none'
                }}
              >
                <span>Polygonscan</span>
                <ExternalLink size={10} />
              </a>
            )}
          </div>
        )}

        {anchorStatus?.status !== 'ANCHORED' && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
            <button
              onClick={() => handleAnchor('polygon_amoy')}
              disabled={isAnchoring}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: '5px',
                background: 'rgba(129, 140, 248, 0.12)',
                border: '1px solid rgba(129, 140, 248, 0.3)',
                color: '#818cf8',
                fontSize: '0.68rem',
                fontWeight: 600,
                cursor: isAnchoring ? 'not-allowed' : 'pointer'
              }}
            >
              {isAnchoring ? 'Anchoring...' : 'Anchor to Polygon Amoy'}
            </button>
          </div>
        )}
      </div>

      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
