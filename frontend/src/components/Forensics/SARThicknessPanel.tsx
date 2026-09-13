import React, { useState } from 'react';
import {
  Layers,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BarChart3,
  Zap,
} from 'lucide-react';
import type { SpillRecord } from '../../types/spill';
import type { ThicknessEstimateResult } from '../../types/forensics';
import { runThicknessClassification } from '../../services/api';

interface SARThicknessPanelProps {
  spill: SpillRecord | null;
  thicknessResult: ThicknessEstimateResult | null;
  isLoading: boolean;
  onResultChange: (result: ThicknessEstimateResult) => void;
}

// ── Classification visual config ──────────────────────────────────────────────
const CLASS_CONFIG: Record<string, { color: string; glow: string; icon: React.ReactNode; gradient: string }> = {
  thin_sheen: {
    color: '#a8c4d4',
    glow: 'rgba(168,196,212,0.25)',
    gradient: 'linear-gradient(135deg, rgba(168,196,212,0.2), rgba(7,13,24,0.7))',
    icon: <span style={{ fontSize: '1.1rem' }}>〰</span>,
  },
  intermediate: {
    color: '#d4a85c',
    glow: 'rgba(212,168,92,0.25)',
    gradient: 'linear-gradient(135deg, rgba(212,168,92,0.2), rgba(7,13,24,0.7))',
    icon: <span style={{ fontSize: '1.1rem' }}>≈</span>,
  },
  thick_emulsion: {
    color: '#e05252',
    glow: 'rgba(224,82,82,0.25)',
    gradient: 'linear-gradient(135deg, rgba(224,82,82,0.2), rgba(7,13,24,0.7))',
    icon: <span style={{ fontSize: '1.1rem' }}>▓</span>,
  },
};

function GlcmBar({
  label, value, maxVal = 10, unit = '', invert = false,
}: { label: string; value: number; maxVal?: number; unit?: string; invert?: boolean }) {
  const pct = Math.min((value / maxVal) * 100, 100);
  const effectivePct = invert ? 100 - pct : pct;
  // Color green = high, red = low (or inverted)
  const hue = 120 * (effectivePct / 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.7rem' }}>
      <span style={{ width: '80px', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: '3px',
          background: `hsl(${hue}, 70%, 55%)`,
          transition: 'width 0.5s ease',
        }} />
      </div>
      <span className="mono-text" style={{ color: '#fff', width: '44px', textAlign: 'right' }}>
        {value.toFixed(4)}{unit}
      </span>
    </div>
  );
}

function CrossValidationBadge({ result }: { result: ThicknessEstimateResult }) {
  const cv = result.cross_validated_with_optical;
  if (cv === null) {
    return (
      <div style={{
        padding: '6px 10px', borderRadius: '6px', fontSize: '0.7rem',
        background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.2)',
        color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        <AlertTriangle size={12} />
        <span>No optical confirmation available for cross-validation.</span>
      </div>
    );
  }

  if (cv === true) {
    const xcheck = result.optical_cross_check;
    return (
      <div style={{
        padding: '8px 10px', borderRadius: '6px', fontSize: '0.7rem',
        background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)',
        color: '#34d399',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '4px' }}>
          <CheckCircle2 size={13} />
          OPTICALLY CROSS-VALIDATED — Bonn Code {xcheck?.bonn_code_optical} ({xcheck?.bonn_label_optical})
        </div>
        <div style={{ color: '#86efac', lineHeight: 1.4 }}>{xcheck?.agreement_note}</div>
      </div>
    );
  }

  const xcheck = result.optical_cross_check;
  return (
    <div style={{
      padding: '8px 10px', borderRadius: '6px', fontSize: '0.7rem',
      background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)',
      color: '#fbbf24',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '4px' }}>
        <XCircle size={13} />
        OPTICAL CONTRADICTION — Bonn Code {xcheck?.bonn_code_optical} ({xcheck?.bonn_label_optical})
      </div>
      <div style={{ color: '#fde68a', lineHeight: 1.4 }}>{xcheck?.agreement_note}</div>
    </div>
  );
}

export const SARThicknessPanel: React.FC<SARThicknessPanelProps> = ({
  spill, thicknessResult, isLoading, onResultChange,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!spill) return;
    setIsRunning(true);
    setError(null);
    try {
      const result = await runThicknessClassification(spill.spill_id, {
        buffer_ring_meters: 500,
        glcm_levels: 64,
      });
      onResultChange(result);
    } catch (err: any) {
      setError(err.message || 'Thickness classification failed');
    } finally {
      setIsRunning(false);
    }
  };

  const cfg = thicknessResult
    ? CLASS_CONFIG[thicknessResult.classification] || CLASS_CONFIG.intermediate
    : null;

  const confPct = thicknessResult ? Math.round(thicknessResult.confidence * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: '8px', borderBottom: '1px solid var(--panel-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={15} color="#fb923c" />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>
            SAR THICKNESS CLASSIFICATION
          </span>
        </div>
        <span style={{
          fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em',
          padding: '2px 7px', borderRadius: '4px',
          background: 'rgba(251,146,60,0.12)', color: '#fb923c',
          border: '1px solid rgba(251,146,60,0.3)',
        }}>MODEL-PREDICTED</span>
      </div>

      {/* Run Button */}
      {spill && (
        <button
          onClick={handleRun}
          disabled={isRunning || isLoading}
          style={{
            width: '100%', padding: '9px', borderRadius: '7px',
            background: isRunning
              ? 'rgba(251,146,60,0.1)'
              : 'linear-gradient(135deg, rgba(251,146,60,0.3), rgba(234,88,12,0.35))',
            border: '1px solid rgba(251,146,60,0.5)',
            color: '#fff', fontSize: '0.8rem', fontWeight: 700,
            cursor: isRunning ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            transition: 'all 0.2s ease',
          }}
        >
          {isRunning
            ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Classifying sigma-0 texture...</>
            : <><Zap size={14} /> {thicknessResult ? 'Re-run Thickness Classification' : 'Run SAR Thickness Classification (P6)'}</>
          }
        </button>
      )}

      {!spill && (
        <div style={{ padding: '12px', borderRadius: '6px', background: 'rgba(7,13,24,0.5)', color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center' }}>
          Select a detected spill to run thickness classification.
        </div>
      )}

      {error && (
        <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: '0.75rem' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {thicknessResult && cfg && (
        <>
          {/* Classification card */}
          <div style={{
            padding: '12px 14px', borderRadius: '8px',
            background: cfg.gradient, border: `1px solid ${cfg.color}44`,
            boxShadow: `0 0 20px ${cfg.glow}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '38px', height: '38px', borderRadius: '8px', flexShrink: 0,
                background: `${cfg.color}22`, border: `1px solid ${cfg.color}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {cfg.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em' }}>
                  SAR CLASSIFICATION
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: cfg.color, lineHeight: 1.1 }}>
                  {thicknessResult.classification_label}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#ccc', marginTop: '2px', lineHeight: 1.3 }}>
                  {thicknessResult.classification_description.split('.')[0]}.
                </div>
              </div>
            </div>

            {/* Confidence bar */}
            <div style={{ marginTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                <span>Classifier Confidence</span>
                <span className="mono-text" style={{ color: cfg.color, fontWeight: 700 }}>{confPct}%</span>
              </div>
              <div style={{ height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                <div style={{ width: `${confPct}%`, height: '100%', background: cfg.color, transition: 'width 0.5s ease', borderRadius: '3px' }} />
              </div>
            </div>
          </div>

          {/* Backscatter metrics */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px',
          }}>
            {[
              { label: 'σ⁰ Inside', value: `${thicknessResult.sigma0_inside_mean_db.toFixed(2)} dB`, color: '#f87171' },
              { label: 'σ⁰ Buffer', value: `${thicknessResult.sigma0_buffer_mean_db.toFixed(2)} dB`, color: '#34d399' },
              { label: 'Contrast', value: `${thicknessResult.backscatter_contrast_db.toFixed(2)} dB`, color: '#fbbf24' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                padding: '7px 8px', borderRadius: '6px',
                background: 'rgba(7,13,24,0.7)', border: '1px solid var(--panel-border)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '3px' }}>{label}</div>
                <div className="mono-text" style={{ fontSize: '0.82rem', fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Fragmentation index */}
          <div style={{
            padding: '8px 12px', borderRadius: '6px',
            background: 'rgba(7,13,24,0.7)', border: '1px solid var(--panel-border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '0.7rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Polsby-Popper Fragmentation Index</span>
              <span className="mono-text" style={{ color: '#fff', fontWeight: 700 }}>
                {thicknessResult.fragmentation_index.toFixed(4)}
              </span>
            </div>
            <div style={{ height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{
                width: `${thicknessResult.fragmentation_index * 100}%`, height: '100%', borderRadius: '3px',
                background: `hsl(${(1 - thicknessResult.fragmentation_index) * 120}, 70%, 55%)`,
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '3px' }}>
              <span>0 = compact</span><span>1 = fragmented</span>
            </div>
          </div>

          {/* GLCM Texture Features */}
          <div style={{
            padding: '8px 10px', borderRadius: '6px',
            background: 'rgba(7,13,24,0.7)', border: '1px solid var(--panel-border)',
          }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <BarChart3 size={11} /> GLCM TEXTURE FEATURES (INSIDE MASK)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <GlcmBar label="Contrast" value={thicknessResult.texture_features.contrast} maxVal={30} />
              <GlcmBar label="Homogeneity" value={thicknessResult.texture_features.homogeneity} maxVal={1} />
              <GlcmBar label="Energy" value={thicknessResult.texture_features.energy} maxVal={1} />
              <GlcmBar label="Entropy" value={thicknessResult.texture_features.entropy} maxVal={8} invert />
              <GlcmBar label="Correlation" value={thicknessResult.texture_features.correlation} maxVal={1} />
              <GlcmBar label="Dissim." value={thicknessResult.texture_features.dissimilarity} maxVal={10} invert />
            </div>
          </div>

          {/* Cross-validation with Phase 5 optical */}
          <CrossValidationBadge result={thicknessResult} />

          {/* Provenance */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              provenance: {thicknessResult.provenance}
            </span>
          </div>
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
