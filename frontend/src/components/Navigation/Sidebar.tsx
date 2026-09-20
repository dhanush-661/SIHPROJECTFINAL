import React, { useState } from 'react';
import { 
  Radar, 
  Waves, 
  ShieldAlert, 
  Activity, 
  Anchor, 
  ChevronRight,
  Wifi,
  FlaskConical,
  Satellite,
  ShieldCheck
} from 'lucide-react';
import { LiveFeedsModal } from '../Common/LiveFeedsModal';

export type AppPage = 'detection-fusion' | 'drift-hindcast' | 'attribution' | 'telemetry-evidence' | 'validation' | 'testing';

interface SidebarProps {
  activePage: AppPage;
  onSelectPage: (page: AppPage) => void;
  isLiveAISActive: boolean;
  onToggleLiveAIS: () => void;
  liveVesselCount: number;
  onOpenMonitors?: () => void;
}

const NAV_ITEMS: { 
  id: AppPage; 
  label: string; 
  sublabel: string; 
  icon: React.FC<{ size?: number; strokeWidth?: number; color?: string; className?: string }> 
}[] = [
  {
    id: 'detection-fusion',
    label: 'Detection & Fusion',
    sublabel: 'SAR ⟷ Optical 50/50',
    icon: Radar,
  },
  {
    id: 'drift-hindcast',
    label: 'Drift & Thickness',
    sublabel: 'Hindcast / Forecast & σ⁰',
    icon: Waves,
  },
  {
    id: 'attribution',
    label: 'Attribution & ML',
    sublabel: 'AIS Correlation & Anomaly',
    icon: ShieldAlert,
  },
  {
    id: 'telemetry-evidence',
    label: 'Telemetry & Evidence',
    sublabel: 'Overview & Chain Ledger',
    icon: Activity,
  },
  {
    id: 'validation',
    label: 'Incident Validation',
    sublabel: 'Ground Truth Benchmark',
    icon: ShieldCheck,
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onSelectPage,
  isLiveAISActive,
  onToggleLiveAIS,
  liveVesselCount,
  onOpenMonitors,
}) => {
  const [isLiveModalOpen, setIsLiveModalOpen] = useState<boolean>(false);

  return (
    <>
      <aside
        style={{
          width: '240px',
          backgroundColor: '#FFFFFF',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flexShrink: 0,
          zIndex: 900,
          boxShadow: '1px 0 3px rgba(0, 0, 0, 0.02)',
        }}
      >
        {/* Top Brand / Logo */}
        <div>
          <div
            style={{
              padding: '16px 18px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                backgroundColor: 'var(--navy-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                boxShadow: '0 2px 4px rgba(11, 79, 108, 0.25)',
              }}
            >
              <Anchor size={18} strokeWidth={2.2} />
            </div>
            <div>
              <div
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  color: 'var(--navy-primary)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                }}
              >
                AquaSentinel
              </div>
              <div
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Forensic Ops Console
              </div>
            </div>
          </div>

          {/* 4 Page Nav List */}
          <nav style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {NAV_ITEMS.map((item) => {
              const isActive = activePage === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectPage(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: isActive ? 'var(--navy-primary)' : 'transparent',
                    border: 'none',
                    color: isActive ? '#FFFFFF' : 'var(--text-primary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    boxShadow: isActive ? '0 2px 6px rgba(11, 79, 108, 0.3)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = '#F8FAFC';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div
                    style={{
                      color: isActive ? '#FFFFFF' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Icon size={18} strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '0.80rem',
                        fontWeight: isActive ? 800 : 600,
                        color: isActive ? '#FFFFFF' : '#1E293B',
                        lineHeight: 1.2,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontSize: '0.64rem',
                        color: isActive ? '#BAE6FD' : 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginTop: '2px',
                      }}
                    >
                      {item.sublabel}
                    </div>
                  </div>
                  {isActive && (
                    <ChevronRight size={14} color="#FFFFFF" strokeWidth={2.5} />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Live AIS Stream Capsule Button & System Status */}
        <div
          style={{
            padding: '14px 12px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: '#FAFCFD',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {/* Live AIS Floating Capsule Pill */}
          <div>
            <div
              style={{
                fontSize: '0.62rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '6px',
                paddingLeft: '4px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Real-time Feed
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: '6px',
                backgroundColor: isLiveAISActive ? '#F0FDF4' : '#F8FAFC',
                border: isLiveAISActive ? '1px solid #BBF7D0' : '1px solid var(--border-subtle)',
                transition: 'all 0.15s ease',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
                onClick={onToggleLiveAIS}
              >
                <span
                  className={isLiveAISActive ? 'pulse-live-indicator' : ''}
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: isLiveAISActive ? '#16A34A' : '#94A3B8',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: isLiveAISActive ? '#166534' : 'var(--text-secondary)',
                  }}
                >
                  Live AIS Stream
                </span>
              </div>

              <span
                className="mono-text"
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  color: isLiveAISActive ? '#16A34A' : 'var(--text-muted)',
                  backgroundColor: '#FFFFFF',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                }}
              >
                {liveVesselCount} vsl
              </span>
            </div>
          </div>

          {/* AOI Live Monitors Trigger */}
          {onOpenMonitors && (
            <button
              onClick={onOpenMonitors}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                width: '100%',
                padding: '6px',
                borderRadius: '6px',
                backgroundColor: '#F0F9FF',
                border: '1px solid #BAE6FD',
                color: '#0284C7',
                fontSize: '0.70rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Satellite size={13} color="#0284C7" />
              <span>Sentinel-1 AOI Monitors</span>
            </button>
          )}

          {/* Remote API Hub Trigger */}
          <button
            onClick={() => setIsLiveModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              padding: '6px',
              borderRadius: '6px',
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border-subtle)',
              color: 'var(--navy-primary)',
              fontSize: '0.70rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Wifi size={13} color="var(--navy-primary)" />
            <span>Live Feeds &amp; Remote Hub</span>
          </button>

          {/* Dedicated Developer / Test Mode Button */}
          <button
            onClick={() => onSelectPage('testing')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              padding: '6px',
              borderRadius: '6px',
              backgroundColor: activePage === 'testing' ? '#FEF3C7' : '#FFFBEB',
              border: activePage === 'testing' ? '1.5px solid #D97706' : '1px dashed #F59E0B',
              color: '#92400E',
              fontSize: '0.70rem',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FDE68A')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = activePage === 'testing' ? '#FEF3C7' : '#FFFBEB')}
          >
            <FlaskConical size={13} color="#D97706" />
            <span>Developer / Test Mode</span>
          </button>

          {/* Footer build meta */}
          <div
            className="mono-text"
            style={{
              fontSize: '0.58rem',
              color: 'var(--text-muted)',
              textAlign: 'center',
              letterSpacing: '0.04em',
            }}
          >
            COAST GUARD FORENSIC v2.6
          </div>
        </div>
      </aside>

      <LiveFeedsModal
        isOpen={isLiveModalOpen}
        onClose={() => setIsLiveModalOpen(false)}
      />
    </>
  );
};
