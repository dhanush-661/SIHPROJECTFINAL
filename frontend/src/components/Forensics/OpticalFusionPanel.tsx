import React, { useState } from 'react';
import {
  Eye,
  RefreshCw,
  Cloud,
  CheckCircle2,
  XCircle,
  Info,
  Droplets,
  Palette,
} from 'lucide-react';
import type { SpillRecord } from '../../types/spill';
import type { OpticalConfirmationResult, HueCluster } from '../../types/forensics';
import { runOpticalFusion } from '../../services/api';

interface OpticalFusionPanelProps {
  spill: SpillRecord | null;
  opticalResult: OpticalConfirmationResult | null;
  isLoading: boolean;
  onResultChange: (result: OpticalConfirmationResult) => void;
}

// ── Bonn Agreement reference ──────────────────────────────────────────────────
const BONN_META: Record<number, { color: string; glow: string; icon: string }> = {
  1: { color: '#a8c4d4', glow: 'rgba(168,196,212,0.35)', icon: '〰️' },
  2: { color: '#d4a8d4', glow: 'rgba(212,168,212,0.35)', icon: '🌈' },
  3: { color: '#b8bcc0', glow: 'rgba(184,188,192,0.35)', icon: '🔩' },
  4: { color: '#8b6914', glow: 'rgba(139,105,20,0.35)',  icon: '🟤' },
  5: { color: '#2a1a08', glow: 'rgba(42,26,8,0.6)',     icon: '⬛' },
};

function BonnCodeBadge({ code, label }: { code: number; label: string }) {
  const meta = BONN_META[code] || { color: '#fff', glow: 'transparent', icon: '?' };
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '10px 14px',
      borderRadius: '8px',
      background: `linear-gradient(135deg, ${meta.glow}, rgba(7,13,24,0.8))`,
      border: `1px solid ${meta.color}55`,
      boxShadow: `0 0 16px ${meta.glow}`,
    }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: '50%',
        background: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.1rem', flexShrink: 0,
        boxShadow: `0 0 12px ${meta.glow}`,
      }}>
        <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#fff', fontWeight: 700 }}>{code}</span>
      </div>
      <div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em' }}>
          BONN AGREEMENT CODE
        </div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: meta.color }}>{label}</div>
      </div>
    </div>
  );
}

function HuePill({ cluster }: { cluster: HueCluster }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '4px 8px', borderRadius: '20px',
      background: `${cluster.rgb_hex}22`,
      border: `1px solid ${cluster.rgb_hex}55`,
      fontSize: '0.68rem',
    }}>
      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: cluster.rgb_hex, flexShrink: 0 }} />
      <span style={{ color: '#ccc', whiteSpace: 'nowrap' }}>
        {cluster.relative_weight_pct.toFixed(1)}% · {cluster.hue_deg.toFixed(0)}°
      </span>
    </div>
  );
}

function ReflectanceBar({ band, value, max = 0.25 }: { band: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const BAND_COLORS: Record<string, string> = {
    B2_blue: '#4a9eff', B3_green: '#4ade80', B4_red: '#f87171', B8_nir: '#a78bfa',
  };
  const color = BAND_COLORS[band] || '#fff';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem' }}>
      <span style={{ width: '52px', color: 'var(--text-muted)', flexShrink: 0 }}>{band.replace('_', ' ')}</span>
      <div style={{ flex: 1, height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.5s ease' }} />
      </div>
      <span className="mono-text" style={{ color: '#fff', width: '40px', textAlign: 'right' }}>{value.toFixed(4)}</span>
    </div>
  );
}

export const OpticalFusionPanel: React.FC<OpticalFusionPanelProps> = ({
  spill,
  opticalResult,
  isLoading,
  onResultChange,
}) => {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('AUTO');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!spill) return;
    setIsRunning(true);
    setError(null);
    try {
      const result = await runOpticalFusion(spill.spill_id, {
        max_cloud_cover_pct: 20,
        time_window_hours: 48,
        buffer_meters: 300,
        satellite_platform: selectedPlatform,
        include_thermal: true,
      });
      onResultChange(result);
    } catch (err: any) {
      setError(err.message || 'Optical fusion failed');
    } finally {
      setIsRunning(false);
    }
  };

  const confirmed = opticalResult?.optical_confirmed;

  const statusConfig = confirmed === true
    ? { icon: <CheckCircle2 size={16} />, color: '#34d399', label: 'OPTICALLY CONFIRMED', bg: 'rgba(52,211,153,0.12)' }
    : confirmed === false
    ? { icon: <XCircle size={16} />, color: '#f87171', label: 'NOT CONFIRMED', bg: 'rgba(248,113,113,0.12)' }
    : confirmed === null
    ? { icon: <Cloud size={16} />, color: '#94a3b8', label: 'NO CLEAN SCENE', bg: 'rgba(148,163,184,0.1)' }
    : { icon: <Info size={16} />, color: 'var(--text-muted)', label: 'NOT EVALUATED', bg: 'transparent' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: '8px', borderBottom: '1px solid var(--panel-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Eye size={15} color="#818cf8" />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>
            MULTI-SATELLITE OPTICAL &amp; THERMAL FUSION
          </span>
        </div>
        <span style={{
          fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em',
          padding: '2px 7px', borderRadius: '4px',
          background: 'rgba(129,140,248,0.15)', color: '#818cf8',
          border: '1px solid rgba(129,140,248,0.3)',
        }}>MEASURED</span>
      </div>

      {/* Constellation Selector */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '4px',
        padding: '3px',
        background: 'rgba(7,13,24,0.6)',
        borderRadius: '7px',
        border: '1px solid var(--panel-border)',
      }}>
        {[
          { id: 'AUTO', label: 'Auto (Best)', hint: 'S2+L8+L9' },
          { id: 'SENTINEL_2', label: 'Sentinel-2', hint: '10m MSI' },
          { id: 'LANDSAT_8', label: 'Landsat 8', hint: '30m+TIRS' },
          { id: 'LANDSAT_9', label: 'Landsat 9', hint: '30m+TIRS' },
        ].map((p) => {
          const isActive = selectedPlatform === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedPlatform(p.id)}
              style={{
                padding: '6px 4px',
                borderRadius: '5px',
                border: isActive ? '1px solid rgba(129,140,248,0.6)' : '1px solid transparent',
                background: isActive ? 'rgba(129,140,248,0.2)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-muted)',
                fontSize: '0.68rem',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              <div>{p.label}</div>
              <div style={{ fontSize: '0.55rem', opacity: 0.75 }}>{p.hint}</div>
            </button>
          );
        })}
      </div>

      {/* Run Button */}
      {spill && (
        <button
          onClick={handleRun}
          disabled={isRunning || isLoading}
          style={{
            width: '100%', padding: '9px',
            borderRadius: '7px',
            background: isRunning
              ? 'rgba(129,140,248,0.1)'
              : 'linear-gradient(135deg, rgba(129,140,248,0.3), rgba(99,102,241,0.35))',
            border: '1px solid rgba(129,140,248,0.5)',
            color: '#fff', fontSize: '0.8rem', fontWeight: 700,
            cursor: isRunning ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            transition: 'all 0.2s ease',
          }}
        >
          {isRunning
            ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Querying {selectedPlatform === 'AUTO' ? 'Satellite Constellation' : selectedPlatform}...</>
            : <><Eye size={14} /> {opticalResult ? `Re-run ${selectedPlatform} Fusion` : `Run Optical Fusion (${selectedPlatform})`}</>
          }
        </button>
      )}

      {!spill && (
        <div style={{ padding: '12px', borderRadius: '6px', background: 'rgba(7,13,24,0.5)', color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center' }}>
          Select a detected spill to run multi-satellite optical fusion.
        </div>
      )}

      {error && (
        <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: '0.75rem' }}>
          {error}
        </div>
      )}

      {/* Result Card */}
      {opticalResult && (
        <>
          {/* Confirmation Status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 12px', borderRadius: '6px',
            background: statusConfig.bg,
            border: `1px solid ${statusConfig.color}44`,
            color: statusConfig.color,
          }}>
            {statusConfig.icon}
            <span style={{ fontWeight: 700, fontSize: '0.78rem' }}>{statusConfig.label}</span>
          </div>

          {/* Scene & Satellite metadata row */}
          {(opticalResult.scene_id || opticalResult.sentinel2_scene_id) && (
            <div style={{
              padding: '8px 10px', borderRadius: '6px',
              background: 'rgba(7,13,24,0.7)', border: '1px solid var(--panel-border)',
              fontSize: '0.68rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#818cf8', fontWeight: 700, letterSpacing: '0.04em' }}>
                  {opticalResult.satellite_platform || 'Sentinel-2 MSI'}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}>
                  {opticalResult.resolution_meters ? `${opticalResult.resolution_meters}m resolution` : '10m'}
                </span>
              </div>
              <div className="mono-text" style={{ color: '#c4b5fd', wordBreak: 'break-all', marginBottom: '6px', fontSize: '0.65rem' }}>
                {opticalResult.scene_id || opticalResult.sentinel2_scene_id}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                <div><span style={{ color: 'var(--text-muted)' }}>Cloud Cover: </span><span className="mono-text" style={{ color: '#34d399' }}>{opticalResult.scene_cloud_cover_pct?.toFixed(1)}%</span></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Δt to SAR: </span><span className="mono-text" style={{ color: '#fbbf24' }}>{opticalResult.time_difference_hours?.toFixed(1)}h</span></div>
                {opticalResult.slick_coverage_pct !== null && (
                  <div><span style={{ color: 'var(--text-muted)' }}>Slick Coverage: </span><span className="mono-text" style={{ color: '#fff' }}>{opticalResult.slick_coverage_pct?.toFixed(1)}%</span></div>
                )}
                <div><span style={{ color: 'var(--text-muted)' }}>Thickness: </span><span className="mono-text" style={{ color: '#c4b5fd' }}>{opticalResult.estimated_thickness_range_um || '—'}</span></div>
              </div>
            </div>
          )}

          {/* Landsat Thermal Infrared Radiometry (TIRS Band 10) */}
          {opticalResult.thermal_telemetry && (
            <div style={{
              padding: '8px 10px', borderRadius: '6px',
              background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(245,158,11,0.08))',
              border: '1px solid rgba(245,158,11,0.3)',
              fontSize: '0.68rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  🔥 THERMAL INFRARED (TIRS BAND 10)
                </span>
                <span className="mono-text" style={{ color: opticalResult.thermal_telemetry.thermal_contrast_k >= 1.0 ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
                  ΔT: {opticalResult.thermal_telemetry.thermal_contrast_k > 0 ? `+${opticalResult.thermal_telemetry.thermal_contrast_k.toFixed(1)}K` : `${opticalResult.thermal_telemetry.thermal_contrast_k.toFixed(1)}K`}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '6px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Slick Temp: </span>
                  <span className="mono-text" style={{ color: '#fff' }}>
                    {opticalResult.thermal_telemetry.brightness_temp_k.toFixed(1)}K ({(opticalResult.thermal_telemetry.brightness_temp_k - 273.15).toFixed(1)}°C)
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Sea Ambient: </span>
                  <span className="mono-text" style={{ color: '#94a3b8' }}>
                    {opticalResult.thermal_telemetry.ambient_sea_temp_k.toFixed(1)}K ({(opticalResult.thermal_telemetry.ambient_sea_temp_k - 273.15).toFixed(1)}°C)
                  </span>
                </div>
              </div>
              <div style={{ color: '#e2e8f0', fontSize: '0.64rem', lineHeight: 1.4, borderTop: '1px solid rgba(245,158,11,0.15)', paddingTop: '4px' }}>
                {opticalResult.thermal_telemetry.thermal_signature}
              </div>
            </div>
          )}

          {/* Bonn Agreement Code */}
          {opticalResult.bonn_code !== null && opticalResult.bonn_label && (
            <BonnCodeBadge code={opticalResult.bonn_code} label={opticalResult.bonn_label} />
          )}

          {/* Hue Clusters */}
          {opticalResult.hue_clusters && opticalResult.hue_clusters.length > 0 && (
            <div style={{
              padding: '8px 10px', borderRadius: '6px',
              background: 'rgba(7,13,24,0.7)', border: '1px solid var(--panel-border)',
            }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Palette size={11} /> KMEANS HUE CLUSTERS (SLICK MASK)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {opticalResult.hue_clusters.map((c) => (
                  <HuePill key={c.cluster_id} cluster={c} />
                ))}
              </div>
            </div>
          )}

          {/* Mean Reflectance */}
          {opticalResult.mean_reflectance && (
            <div style={{
              padding: '8px 10px', borderRadius: '6px',
              background: 'rgba(7,13,24,0.7)', border: '1px solid var(--panel-border)',
            }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Droplets size={11} /> MEAN SURFACE REFLECTANCE (INSIDE MASK)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {Object.entries(opticalResult.mean_reflectance).map(([band, val]) => (
                  <ReflectanceBar key={band} band={band} value={val as number} />
                ))}
              </div>
            </div>
          )}

          {/* Reason */}
          <div style={{
            padding: '7px 10px', borderRadius: '6px',
            background: 'rgba(7,13,24,0.5)', border: '1px solid var(--panel-border)',
            fontSize: '0.68rem', color: 'var(--text-secondary)',
            fontStyle: 'italic', lineHeight: 1.5,
          }}>
            {opticalResult.reason}
          </div>

          {/* Provenance */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              provenance: {opticalResult.provenance}
            </span>
          </div>
        </>
      )}

      {/* style for spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
