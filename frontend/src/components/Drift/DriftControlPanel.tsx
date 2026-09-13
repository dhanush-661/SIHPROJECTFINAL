import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  GitCommit,
  Loader2,
  Play,
  RotateCcw,
  TrendingUp,
  Waves,
  Wind
} from 'lucide-react';
import type { DriftSimulationRequest, DriftSimulationResponse } from '../../types/drift';
import type { SpillRecord } from '../../types/spill';

interface DriftControlPanelProps {
  spill: SpillRecord | null;
  driftResult: DriftSimulationResponse | null;
  isRunningDrift: boolean;
  onRunDrift: (req: DriftSimulationRequest) => void;
  
  // Layer visibility state
  showSatelliteFootprint?: boolean;
  setShowSatelliteFootprint?: (val: boolean) => void;
  showDetectedSlick?: boolean;
  setShowDetectedSlick?: (val: boolean) => void;
  showBackwardContours: boolean;
  setShowBackwardContours: (val: boolean) => void;
  showForwardContours: boolean;
  setShowForwardContours: (val: boolean) => void;
  showParticleTracks: boolean;
  setShowParticleTracks: (val: boolean) => void;
  showCurrentVectors: boolean;
  setShowCurrentVectors: (val: boolean) => void;
  showWindVectors: boolean;
  setShowWindVectors: (val: boolean) => void;
  showVesselTracks?: boolean;
  setShowVesselTracks?: (val: boolean) => void;
}

export const DriftControlPanel: React.FC<DriftControlPanelProps> = ({
  spill,
  driftResult,
  isRunningDrift,
  onRunDrift,
  showSatelliteFootprint,
  setShowSatelliteFootprint,
  showDetectedSlick,
  setShowDetectedSlick,
  showBackwardContours,
  setShowBackwardContours,
  showForwardContours,
  setShowForwardContours,
  showParticleTracks,
  setShowParticleTracks,
  showCurrentVectors,
  setShowCurrentVectors,
  showWindVectors,
  setShowWindVectors,
  showVesselTracks,
  setShowVesselTracks,
}) => {

  const [backwardHours, setBackwardHours] = useState<number>(48);
  const [forwardHours, setForwardHours] = useState<number>(24);
  const [particleCount, setParticleCount] = useState<number>(1000);
  const [windFactor, setWindFactor] = useState<number>(0.03);

  const handleTrigger = () => {
    onRunDrift({
      backward_hours: backwardHours,
      forward_hours: forwardHours,
      particle_count: particleCount,
      wind_factor: windFactor,
      diffusion_coef_m2s: 5.0,
    });
  };

  return (
    <div className="glass-panel" style={{
      width: '380px',
      maxHeight: 'calc(100vh - 100px)',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px',
      gap: '14px',
      overflowY: 'auto',
      zIndex: 900,
    }}>
      {/* Panel Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--panel-border)', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Waves size={18} color="var(--accent-cyan)" />
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Lagrangian Drift &amp; Hindcast
          </h2>
        </div>
        <span style={{ fontSize: '0.68rem', color: 'var(--accent-emerald)', fontWeight: 600 }}>
          Phase 2 Model
        </span>
      </div>

      {/* Target Spill Header */}
      {spill ? (
        <div style={{
          padding: '8px 10px',
          borderRadius: '6px',
          background: 'rgba(7, 13, 24, 0.8)',
          border: '1px solid var(--panel-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ACTIVE TARGET SPILL</span>
            <div className="mono-text" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-spill)' }}>
              {spill.spill_id}
            </div>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#fff' }}>
            <b>{spill.area_km2.toFixed(2)}</b> km²
          </span>
        </div>
      ) : (
        <div style={{
          padding: '10px',
          borderRadius: '6px',
          background: 'rgba(255, 170, 0, 0.1)',
          border: '1px solid rgba(255, 170, 0, 0.3)',
          fontSize: '0.75rem',
          color: 'var(--accent-warning)',
        }}>
          Select or detect an oil spill to initiate trajectory modeling.
        </div>
      )}

      {/* Simulation Controls */}
      <div style={{
        padding: '12px',
        borderRadius: '8px',
        background: 'rgba(7, 13, 24, 0.6)',
        border: '1px solid var(--panel-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}>
        {/* Backward Hindcast Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <RotateCcw size={12} color="var(--accent-warning)" />
              Backward Hindcast Window
            </span>
            <span className="mono-text" style={{ fontSize: '0.78rem', color: 'var(--accent-warning)', fontWeight: 700 }}>
              -{backwardHours} hrs
            </span>
          </div>
          <input
            type="range"
            min="12"
            max="72"
            step="6"
            value={backwardHours}
            onChange={(e) => setBackwardHours(parseInt(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent-warning)', cursor: 'pointer' }}
          />
        </div>

        {/* Forward Forecast Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <TrendingUp size={12} color="var(--accent-cyan)" />
              Forward Forecast Window
            </span>
            <span className="mono-text" style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>
              +{forwardHours} hrs
            </span>
          </div>
          <input
            type="range"
            min="12"
            max="48"
            step="6"
            value={forwardHours}
            onChange={(e) => setForwardHours(parseInt(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
          />
        </div>

        {/* Particle Count & Windage */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Particles</span>
            <select
              value={particleCount}
              onChange={(e) => setParticleCount(parseInt(e.target.value))}
              style={{
                width: '100%',
                background: 'rgba(13, 27, 46, 0.9)',
                border: '1px solid var(--panel-border)',
                color: '#fff',
                padding: '6px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                outline: 'none',
              }}
            >
              <option value="500">500 Particles</option>
              <option value="1000">1,000 Particles</option>
              <option value="2000">2,000 Particles</option>
            </select>
          </div>

          <div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Wind Drift (%)</span>
            <select
              value={windFactor}
              onChange={(e) => setWindFactor(parseFloat(e.target.value))}
              style={{
                width: '100%',
                background: 'rgba(13, 27, 46, 0.9)',
                border: '1px solid var(--panel-border)',
                color: '#fff',
                padding: '6px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                outline: 'none',
              }}
            >
              <option value="0.02">2.0% Windage</option>
              <option value="0.03">3.0% (Standard)</option>
              <option value="0.04">4.0% High Drift</option>
            </select>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <button
        onClick={handleTrigger}
        disabled={!spill || isRunningDrift}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '8px',
          background: isRunningDrift
            ? 'rgba(0, 240, 255, 0.2)'
            : 'linear-gradient(135deg, #ff9500 0%, #ff5500 100%)',
          color: isRunningDrift ? 'var(--accent-warning)' : '#ffffff',
          fontWeight: 700,
          fontSize: '0.88rem',
          border: 'none',
          cursor: (!spill || isRunningDrift) ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          boxShadow: isRunningDrift ? 'none' : '0 0 16px rgba(255, 149, 0, 0.4)',
          transition: 'all 0.2s ease',
        }}
      >
        {isRunningDrift ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            <span>Simulating Lagrangian RK4...</span>
          </>
        ) : (
          <>
            <Play size={18} />
            <span>Compute Drift &amp; Hindcast (POST /drift)</span>
          </>
        )}
      </button>

      {/* Map Layer Toggles */}
      <div>
        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
          DRIFT &amp; HYDRODYNAMIC MAP LAYERS
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '4px' }}>
          {/* Satellite Footprint Toggle */}
          {setShowSatelliteFootprint && (
            <button
              onClick={() => setShowSatelliteFootprint(!showSatelliteFootprint)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: '6px',
                background: showSatelliteFootprint ? 'rgba(0, 240, 255, 0.15)' : 'rgba(7, 13, 24, 0.5)',
                border: showSatelliteFootprint ? '1px solid var(--accent-cyan)' : '1px solid var(--panel-border)',
                color: showSatelliteFootprint ? '#fff' : 'var(--text-muted)',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00f0ff' }} />
                Satellite Scene Footprint (AOI)
              </span>
              {showSatelliteFootprint ? <Eye size={14} color="#00f0ff" /> : <EyeOff size={14} />}
            </button>
          )}

          {/* Detected Slick Polygon Toggle */}
          {setShowDetectedSlick && (
            <button
              onClick={() => setShowDetectedSlick(!showDetectedSlick)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: '6px',
                background: showDetectedSlick ? 'rgba(255, 45, 85, 0.15)' : 'rgba(7, 13, 24, 0.5)',
                border: showDetectedSlick ? '1px solid var(--accent-spill)' : '1px solid var(--panel-border)',
                color: showDetectedSlick ? '#fff' : 'var(--text-muted)',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-spill)' }} />
                Detected SAR Slick Polygon (UTM)
              </span>
              {showDetectedSlick ? <Eye size={14} color="var(--accent-spill)" /> : <EyeOff size={14} />}
            </button>
          )}

          {/* Backward Contours */}
          <button
            onClick={() => setShowBackwardContours(!showBackwardContours)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '6px',
              background: showBackwardContours ? 'rgba(255, 149, 0, 0.15)' : 'rgba(7, 13, 24, 0.5)',
              border: showBackwardContours ? '1px solid var(--accent-warning)' : '1px solid var(--panel-border)',
              color: showBackwardContours ? '#fff' : 'var(--text-muted)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff9500' }} />
              Backward Origin Contours (p50/p75/p95)
            </span>
            {showBackwardContours ? <Eye size={14} color="#ff9500" /> : <EyeOff size={14} />}
          </button>


          {/* Forward Contours */}
          <button
            onClick={() => setShowForwardContours(!showForwardContours)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '6px',
              background: showForwardContours ? 'rgba(0, 240, 255, 0.15)' : 'rgba(7, 13, 24, 0.5)',
              border: showForwardContours ? '1px solid var(--accent-cyan)' : '1px solid var(--panel-border)',
              color: showForwardContours ? '#fff' : 'var(--text-muted)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00f0ff' }} />
              Forward Spread Contours (p50/p75/p95)
            </span>
            {showForwardContours ? <Eye size={14} color="#00f0ff" /> : <EyeOff size={14} />}
          </button>

          {/* Particle Trajectory Streamlines */}
          <button
            onClick={() => setShowParticleTracks(!showParticleTracks)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '6px',
              background: showParticleTracks ? 'rgba(0, 230, 118, 0.15)' : 'rgba(7, 13, 24, 0.5)',
              border: showParticleTracks ? '1px solid var(--accent-emerald)' : '1px solid var(--panel-border)',
              color: showParticleTracks ? '#fff' : 'var(--text-muted)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <GitCommit size={14} color="var(--accent-emerald)" />
              Sampled Particle Streamlines
            </span>
            {showParticleTracks ? <Eye size={14} color="var(--accent-emerald)" /> : <EyeOff size={14} />}
          </button>

          {/* Current Vectors */}
          <button
            onClick={() => setShowCurrentVectors(!showCurrentVectors)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '6px',
              background: showCurrentVectors ? 'rgba(0, 119, 182, 0.25)' : 'rgba(7, 13, 24, 0.5)',
              border: showCurrentVectors ? '1px solid #0077b6' : '1px solid var(--panel-border)',
              color: showCurrentVectors ? '#fff' : 'var(--text-muted)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Waves size={14} color="#00d2ff" />
              Copernicus Ocean Currents (uo, vo)
            </span>
            {showCurrentVectors ? <Eye size={14} color="#00d2ff" /> : <EyeOff size={14} />}
          </button>

          {/* Wind Vectors */}
          <button
            onClick={() => setShowWindVectors(!showWindVectors)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '6px',
              background: showWindVectors ? 'rgba(255, 170, 0, 0.15)' : 'rgba(7, 13, 24, 0.5)',
              border: showWindVectors ? '1px solid var(--accent-warning)' : '1px solid var(--panel-border)',
              color: showWindVectors ? '#fff' : 'var(--text-muted)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Wind size={14} color="var(--accent-warning)" />
              ERA5 Marine Wind Vectors
            </span>
            {showWindVectors ? <Eye size={14} color="var(--accent-warning)" /> : <EyeOff size={14} />}
          </button>

          {/* Candidate Vessel AIS Tracks */}
          {setShowVesselTracks && (
            <button
              onClick={() => setShowVesselTracks(!showVesselTracks)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: '6px',
                background: showVesselTracks ? 'rgba(244, 63, 94, 0.15)' : 'rgba(7, 13, 24, 0.5)',
                border: showVesselTracks ? '1px solid #f43f5e' : '1px solid var(--panel-border)',
                color: showVesselTracks ? '#fff' : 'var(--text-muted)',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <TrendingUp size={14} color="#f43f5e" />
                Vessel AIS Tracks (Suspect Color-Coded)
              </span>
              {showVesselTracks ? <Eye size={14} color="#f43f5e" /> : <EyeOff size={14} />}
            </button>
          )}
        </div>
      </div>


      {/* Drift Results Telemetry */}
      {driftResult && (
        <div style={{
          marginTop: 'auto',
          padding: '12px',
          borderRadius: '8px',
          background: 'rgba(7, 13, 24, 0.95)',
          border: '1px solid var(--panel-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          fontSize: '0.73rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px' }}>
            <span style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>ESTIMATED ORIGIN WINDOW</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Hindcast</span>
          </div>
          <div style={{ color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div>Earliest: <b className="mono-text" style={{ color: '#fff' }}>{driftResult.backward.estimated_origin_time_window.start.slice(0, 16).replace('T', ' ')} UTC</b></div>
            <div>Most Likely: <b className="mono-text" style={{ color: 'var(--accent-warning)' }}>{driftResult.backward.estimated_origin_time_window.most_likely.slice(0, 16).replace('T', ' ')} UTC</b></div>
            <div>Origin Centroid: <b className="mono-text" style={{ color: '#00f0ff' }}>[{driftResult.backward.origin_centroid[0].toFixed(4)}, {driftResult.backward.origin_centroid[1].toFixed(4)}]</b></div>
            <div>Spread Radius: <b style={{ color: '#fff' }}>{driftResult.backward.origin_spread_radius_km.toFixed(1)} km</b></div>
          </div>
        </div>
      )}
    </div>
  );
};
