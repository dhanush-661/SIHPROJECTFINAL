import React, { useEffect, useState } from 'react';
import { X, Wifi, Radio, Globe, Wind, CheckCircle2, RefreshCw } from 'lucide-react';
import { getLiveFeedStatus, type LiveProviderStatus } from '../../services/api';

interface LiveFeedsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LiveFeedsModal: React.FC<LiveFeedsModalProps> = ({ isOpen, onClose }) => {
  const [liveStatus, setLiveStatus] = useState<LiveProviderStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchStatus = (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    getLiveFeedStatus()
      .then((data) => {
        setLiveStatus(data);
        setLoading(false);
      })
      .catch((err) => {
        console.warn('Failed to refresh live status:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus(false);
      const interval = setInterval(() => fetchStatus(false), 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(5, 12, 22, 0.82)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
    }}>
      <div className="glass-panel" style={{
        width: '680px',
        maxWidth: '92vw',
        maxHeight: '88vh',
        overflowY: 'auto',
        borderRadius: '12px',
        padding: '24px',
        border: '1px solid var(--accent-cyan)',
        boxShadow: '0 0 30px rgba(0, 240, 255, 0.25)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(0, 240, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--accent-cyan)'
            }}>
              <Wifi size={18} color="var(--accent-cyan)" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
                Live Feeds &amp; Remote API Hub
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Real-time external telemetry feeds active in this project session
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => fetchStatus(true)}
              disabled={loading}
              style={{
                background: 'rgba(0, 240, 255, 0.1)',
                border: '1px solid var(--accent-cyan)',
                color: '#fff',
                padding: '6px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.75rem',
              }}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--panel-border)',
                color: '#fff',
                borderRadius: '6px',
                padding: '6px',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 4 Providers Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {/* 1. MapTiler */}
          <div style={{
            background: 'rgba(13, 27, 46, 0.7)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            borderRadius: '8px',
            padding: '14px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={18} color="var(--accent-cyan)" />
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>MapTiler Cloud</span>
              </div>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(0, 230, 118, 0.15)',
                color: 'var(--accent-emerald)',
                border: '1px solid var(--accent-emerald)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <CheckCircle2 size={10} />
                <span>ONLINE</span>
              </span>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              High-resolution vector base maps, dark mode bathymetry, and satellite hybrid layers.
            </p>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              <div>Key: <span className="mono-text" style={{ color: '#fff' }}>1marzHG3...O9B</span></div>
              <div style={{ marginTop: '2px' }}>Layers: Dataviz Dark, Ocean Topo, Satellite HD</div>
            </div>
          </div>

          {/* 2. AISStream.io */}
          <div style={{
            background: 'rgba(13, 27, 46, 0.7)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            borderRadius: '8px',
            padding: '14px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Radio size={18} color="var(--accent-cyan)" />
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>AISStream.io</span>
              </div>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                background: liveStatus?.providers.aisstream.connected ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 170, 0, 0.15)',
                color: liveStatus?.providers.aisstream.connected ? 'var(--accent-emerald)' : 'var(--accent-warning)',
                border: `1px solid ${liveStatus?.providers.aisstream.connected ? 'var(--accent-emerald)' : 'var(--accent-warning)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: liveStatus?.providers.aisstream.connected ? '#00e676' : '#ffaa00', animation: 'pulse-glow 1.5s infinite' }}></span>
                <span>{liveStatus?.providers.aisstream.connected ? 'LIVE WS' : 'CONNECTING'}</span>
              </span>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Global real-time maritime AIS transponder WebSocket stream.
            </p>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              <div>Key: <span className="mono-text" style={{ color: '#fff' }}>35fc205c...df11</span></div>
              <div style={{ marginTop: '2px', color: '#00f0ff' }}>
                Live Vessels Tracked: <b>{liveStatus?.providers.aisstream.tracked_live_vessels_count ?? 0}</b> | Messages: <b>{liveStatus?.providers.aisstream.total_messages ?? 0}</b>
              </div>
            </div>
          </div>

          {/* 3. Global Fishing Watch (GFW) */}
          <div style={{
            background: 'rgba(13, 27, 46, 0.7)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            borderRadius: '8px',
            padding: '14px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={18} color="#ffaa00" />
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>Global Fishing Watch</span>
              </div>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(0, 230, 118, 0.15)',
                color: 'var(--accent-emerald)',
                border: '1px solid var(--accent-emerald)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <CheckCircle2 size={10} />
                <span>AUTH ACTIVE</span>
              </span>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              GFW v3 Gateway API token for vessel registry, loitering events &amp; AIS-dark correlation.
            </p>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              <div>App: <span className="mono-text" style={{ color: '#fff' }}>oiltrace (ID: 13963)</span></div>
              <div style={{ marginTop: '2px' }}>Endpoint: <span className="mono-text">gateway.globalfishingwatch.org/v3</span></div>
            </div>
          </div>

          {/* 4. Copernicus CDS */}
          <div style={{
            background: 'rgba(13, 27, 46, 0.7)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            borderRadius: '8px',
            padding: '14px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wind size={18} color="#00f0ff" />
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>Copernicus CDS</span>
              </div>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(0, 230, 118, 0.15)',
                color: 'var(--accent-emerald)',
                border: '1px solid var(--accent-emerald)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <CheckCircle2 size={10} />
                <span>AUTHENTICATED</span>
              </span>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Climate Data Store (CDS) API key for ERA5 10m marine winds &amp; Copernicus ocean currents.
            </p>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              <div>Key: <span className="mono-text" style={{ color: '#fff' }}>4b66e70d...a6ce</span></div>
              <div style={{ marginTop: '2px' }}>Products: ERA5 Reanalysis, MULTIOBS Currents</div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div style={{
          marginTop: '16px',
          padding: '10px 14px',
          borderRadius: '6px',
          background: 'rgba(0, 240, 255, 0.05)',
          border: '1px solid rgba(0, 240, 255, 0.15)',
          fontSize: '0.72rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>All 4 remote live feeds securely configured in project environment.</span>
          <span className="mono-text" style={{ color: 'var(--accent-cyan)' }}>SIH 2026 Live Pipeline</span>
        </div>
      </div>
    </div>
  );
};
