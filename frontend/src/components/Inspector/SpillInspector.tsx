import React, { useState } from 'react';
import {
  Clock,
  Copy,
  Crosshair,
  FileCode,
  X
} from 'lucide-react';
import type { SpillRecord } from '../../types/spill';

interface SpillInspectorProps {
  spill: SpillRecord | null;
  onClose: () => void;
  onCenterMap: (spill: SpillRecord) => void;
  onTriggerDrift?: (spill: SpillRecord) => void;
}

export const SpillInspector: React.FC<SpillInspectorProps> = ({
  spill,
  onClose,
  onCenterMap,
  onTriggerDrift,
}) => {
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!spill) return null;

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(spill, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const confidencePct = Math.round(spill.confidence * 100);
  const confidenceColor =
    confidencePct >= 85 ? 'var(--accent-spill)' : confidencePct >= 70 ? 'var(--accent-warning)' : 'var(--text-muted)';

  return (
    <div className="glass-panel" style={{
      width: '380px',
      maxHeight: 'calc(100vh - 100px)',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px',
      gap: '12px',
      overflowY: 'auto',
      zIndex: 900,
    }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--accent-spill)',
            boxShadow: '0 0 8px var(--accent-spill)',
          }} />
          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>
            SPILL FEATURE INSPECTOR
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '4px',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Spill ID & Provenance Badge */}
      <div style={{
        padding: '8px 10px',
        borderRadius: '6px',
        background: 'rgba(7, 13, 24, 0.7)',
        border: '1px solid var(--panel-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>SPILL ID</span>
          <span className="mono-text" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
            {spill.spill_id}
          </span>
        </div>
        <span style={{
          fontSize: '0.68rem',
          fontWeight: 700,
          background: 'rgba(255, 45, 85, 0.2)',
          color: 'var(--accent-spill)',
          border: '1px solid rgba(255, 45, 85, 0.4)',
          padding: '2px 8px',
          borderRadius: '4px',
        }}>
          {spill.provenance}
        </span>
      </div>

      {/* Primary Metrics Grid (Area, Perimeter, Length, Width) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {/* Area */}
        <div style={{
          padding: '8px 10px',
          borderRadius: '6px',
          background: 'rgba(7, 13, 24, 0.7)',
          border: '1px solid var(--panel-border)',
        }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>SURFACE AREA (UTM)</div>
          <div className="mono-text" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
            {spill.area_km2.toFixed(3)} <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>km²</span>
          </div>
        </div>

        {/* Perimeter */}
        <div style={{
          padding: '8px 10px',
          borderRadius: '6px',
          background: 'rgba(7, 13, 24, 0.7)',
          border: '1px solid var(--panel-border)',
        }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>PERIMETER</div>
          <div className="mono-text" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
            {spill.perimeter_km.toFixed(2)} <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>km</span>
          </div>
        </div>

        {/* Major Axis (MRR Length) */}
        <div style={{
          padding: '8px 10px',
          borderRadius: '6px',
          background: 'rgba(7, 13, 24, 0.7)',
          border: '1px solid var(--panel-border)',
        }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>MRR LENGTH</div>
          <div className="mono-text" style={{ fontSize: '1.0rem', fontWeight: 600, color: '#fff' }}>
            {spill.length_km.toFixed(2)} <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>km</span>
          </div>
        </div>

        {/* Minor Axis (MRR Width) */}
        <div style={{
          padding: '8px 10px',
          borderRadius: '6px',
          background: 'rgba(7, 13, 24, 0.7)',
          border: '1px solid var(--panel-border)',
        }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>MRR WIDTH</div>
          <div className="mono-text" style={{ fontSize: '1.0rem', fontWeight: 600, color: '#fff' }}>
            {spill.width_km.toFixed(2)} <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>km</span>
          </div>
        </div>
      </div>

      {/* Orientation & Compass Needle */}
      <div style={{
        padding: '10px 12px',
        borderRadius: '6px',
        background: 'rgba(7, 13, 24, 0.7)',
        border: '1px solid var(--panel-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>PRINCIPAL ORIENTATION</span>
          <div className="mono-text" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
            {spill.orientation_deg.toFixed(1)}° <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>rel True N</span>
          </div>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            Elongation ratio: {(spill.aspect_ratio || (spill.length_km / Math.max(spill.width_km, 0.001))).toFixed(1)}:1
          </span>
        </div>

        {/* Compass Visualizer */}
        <div className="compass-ring">
          <div
            className="compass-needle"
            style={{
              transform: `rotate(${spill.orientation_deg}deg)`,
              transition: 'transform 0.4s ease',
            }}
          />
          <span style={{ position: 'absolute', top: '2px', fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)' }}>N</span>
        </div>
      </div>

      {/* Confidence & Estimated Age */}
      <div style={{
        padding: '10px 12px',
        borderRadius: '6px',
        background: 'rgba(7, 13, 24, 0.7)',
        border: '1px solid var(--panel-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        {/* Confidence Progress */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>SAR Detection Confidence</span>
            <span className="mono-text" style={{ fontSize: '0.8rem', fontWeight: 700, color: confidenceColor }}>
              {confidencePct}%
            </span>
          </div>
          <div style={{ height: '5px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden' }}>
            <div style={{ width: `${confidencePct}%`, height: '100%', background: confidenceColor, transition: 'width 0.4s ease' }} />
          </div>
        </div>

        {/* Estimated Age */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <Clock size={14} color="var(--accent-cyan)" />
          <span>Estimated Age:</span>
          <b className="mono-text" style={{ color: '#fff' }}>
            {spill.estimated_age_hours[0].toFixed(1)} - {spill.estimated_age_hours[1].toFixed(1)} hrs
          </b>
        </div>
      </div>

      {/* Environmental & Radar Metadata */}
      <div style={{
        padding: '10px 12px',
        borderRadius: '6px',
        background: 'rgba(7, 13, 24, 0.7)',
        border: '1px solid var(--panel-border)',
        fontSize: '0.72rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>ERA5 Marine Wind:</span>
          <span className="mono-text" style={{ color: '#fff' }}>
            {spill.wind_speed_ms ? `${spill.wind_speed_ms.toFixed(1)} m/s` : '6.2 m/s'} ({spill.wind_direction_deg?.toFixed(0) || '225'}°)
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Centroid (WGS84):</span>
          <span className="mono-text" style={{ color: 'var(--accent-cyan)' }}>
            [{spill.centroid[0].toFixed(4)}, {spill.centroid[1].toFixed(4)}]
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Source SAR Granule:</span>
          <span className="mono-text" style={{ color: '#fff', fontSize: '0.62rem', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }}>
            {spill.source_image}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: 'auto' }}>
        <button
          onClick={() => onCenterMap(spill)}
          style={{
            padding: '8px',
            borderRadius: '6px',
            background: 'rgba(0, 240, 255, 0.15)',
            border: '1px solid var(--accent-cyan)',
            color: 'var(--accent-cyan)',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <Crosshair size={14} />
          <span>Center on Map</span>
        </button>

        <button
          onClick={() => setShowJsonModal(true)}
          style={{
            padding: '8px',
            borderRadius: '6px',
            background: 'rgba(13, 27, 46, 0.8)',
            border: '1px solid var(--panel-border)',
            color: '#fff',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <FileCode size={14} color="var(--text-secondary)" />
          <span>Contract JSON</span>
        </button>
      </div>

      {onTriggerDrift && (
        <button
          onClick={() => onTriggerDrift(spill)}
          style={{
            width: '100%',
            padding: '9px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, rgba(255, 149, 0, 0.25) 0%, rgba(255, 85, 0, 0.3) 100%)',
            border: '1px solid var(--accent-warning)',
            color: '#ffffff',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <span>Model Lagrangian Drift &amp; Hindcast &rarr;</span>
        </button>
      )}

      {/* JSON Modal Viewer */}
      {showJsonModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
        }}>
          <div className="glass-panel" style={{
            width: '600px',
            maxWidth: '90vw',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff' }}>
                Exact JSON Output Contract
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={copyJson}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    background: 'rgba(0, 240, 255, 0.15)',
                    border: '1px solid var(--accent-cyan)',
                    color: 'var(--accent-cyan)',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                  }}
                >
                  <Copy size={12} />
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => setShowJsonModal(false)}
                  style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <pre className="mono-text" style={{
              background: '#040810',
              padding: '12px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              color: '#00f0ff',
              overflowY: 'auto',
              border: '1px solid var(--panel-border)',
              maxHeight: '55vh',
            }}>
              {JSON.stringify(spill, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
