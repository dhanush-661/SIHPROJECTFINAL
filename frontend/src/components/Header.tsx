import React, { useState } from 'react';
import { Activity, Radio, Satellite, BarChart2, Wifi } from 'lucide-react';
import type { SystemHealth } from '../types/spill';
import { LiveFeedsModal } from './Common/LiveFeedsModal';

interface HeaderProps {
  health: SystemHealth | null;
  totalSpills: number;
  totalArea: number;
  onOpenAnalytics: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  totalSpills,
  totalArea,
  onOpenAnalytics,
}) => {
  const [showLiveModal, setShowLiveModal] = useState<boolean>(false);

  return (
    <>
      <header className="glass-panel" style={{
        margin: '12px 16px',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 1000,
        position: 'relative',
      }}>
        {/* Brand & Mission Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            background: 'radial-gradient(circle, #00f0ff 0%, #0c1929 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--accent-cyan)',
            boxShadow: '0 0 12px rgba(0, 240, 255, 0.35)',
          }}>
            <Satellite size={22} color="#00f0ff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#fff' }}>
                AquaSentinel
              </h1>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(0, 240, 255, 0.15)',
                color: 'var(--accent-cyan)',
                border: '1px solid rgba(0, 240, 255, 0.3)',
              }}>
                SIH 2026 Phase 1-4
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Marine Oil-Spill SAR Detection, Drift Simulation &amp; Live Vessel Attribution
            </p>
          </div>
        </div>

        {/* Live System Pipeline Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Active Detections */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            padding: '4px 10px',
            borderRadius: '6px',
            background: 'rgba(255, 45, 85, 0.12)',
            border: '1px solid rgba(255, 45, 85, 0.3)',
          }}>
            <span style={{ color: 'var(--accent-spill)', fontWeight: 700 }}>{totalSpills} Spills</span>
            <span style={{ color: 'var(--text-muted)' }}>|</span>
            <span className="mono-text" style={{ color: '#fff' }}>{totalArea.toFixed(1)} km²</span>
          </div>

          {/* Sensor Status */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            padding: '4px 10px',
            borderRadius: '6px',
            background: 'rgba(13, 27, 46, 0.6)',
            border: '1px solid var(--panel-border)',
          }}>
            <Radio size={14} color="var(--accent-cyan)" />
            <span style={{ color: 'var(--text-secondary)' }}>Sensor:</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>Sentinel-1 SAR</span>
          </div>

          {/* Live Feeds Hub Badge */}
          <button
            onClick={() => setShowLiveModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(0, 230, 118, 0.12)',
              border: '1px solid rgba(0, 230, 118, 0.35)',
              color: 'var(--accent-emerald)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-emerald)', animation: 'pulse-glow 1.5s infinite' }}></span>
            <Wifi size={14} color="var(--accent-emerald)" />
            <span style={{ fontWeight: 700 }}>Live Feeds (4 Active)</span>
          </button>

          {/* Engine Mode */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            padding: '4px 10px',
            borderRadius: '6px',
            background: 'rgba(13, 27, 46, 0.6)',
            border: '1px solid var(--panel-border)',
          }}>
            <Activity size={14} color={health?.status === 'HEALTHY' ? 'var(--accent-emerald)' : 'var(--accent-warning)'} />
            <span style={{ color: 'var(--text-secondary)' }}>Engine:</span>
            <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
              {health?.gee_connected ? 'GEE Live' : 'SAR GeoEngine (UTM)'}
            </span>
          </div>

          {/* Analytics Action */}
          <button
            onClick={onOpenAnalytics}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.2) 0%, rgba(13, 27, 46, 0.8) 100%)',
              border: '1px solid var(--accent-cyan)',
              color: '#fff',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <BarChart2 size={16} color="var(--accent-cyan)" />
            <span>Analytics &amp; Logs</span>
          </button>
        </div>
      </header>

      {/* Live Feeds Telemetry Modal */}
      <LiveFeedsModal isOpen={showLiveModal} onClose={() => setShowLiveModal(false)} />
    </>
  );
};

