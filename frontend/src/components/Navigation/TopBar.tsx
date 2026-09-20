import React, { useState } from 'react';
import type { PresetAOI, SpillRecord, SystemHealth } from '../../types/spill';
import type { LiveAlert } from '../../services/api';
import {
  Droplet,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Radio,
  Globe2,
  Trash2,
  Bell,
  Satellite,
  Zap,
  Clock,
} from 'lucide-react';

interface TopBarProps {
  health: SystemHealth | null;
  spills: SpillRecord[];
  selectedSpill: SpillRecord | null;
  onSelectSpill: (spill: SpillRecord | null) => void;
  onDeleteSpill?: (spillId: string) => void;
  onClearAllSpills?: () => void;
  presets?: PresetAOI[];
  selectedPreset?: PresetAOI | null;
  onSelectPreset?: (preset: PresetAOI) => void;
  onTriggerNewScan?: () => void;
  isScanning?: boolean;
  onOpenMonitors?: () => void;
  liveAlerts?: LiveAlert[];
  unreadAlertsCount?: number;
  onInvestigateAlert?: (spillId: string) => void;
  onClearAlerts?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  health,
  spills,
  selectedSpill,
  onSelectSpill,
  onDeleteSpill,
  onClearAllSpills,
  presets = [],
  selectedPreset,
  onSelectPreset,
  onTriggerNewScan,
  isScanning = false,
  onOpenMonitors,
  liveAlerts = [],
  unreadAlertsCount = 0,
  onInvestigateAlert,
  onClearAlerts,
}) => {
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);

  const isHealthy = Boolean(
    health?.status &&
      (health.status.toLowerCase() === 'healthy' || health.status.toLowerCase() === 'ok')
  );

  return (
    <header
      style={{
        height: '56px',
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 850,
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
        gap: '20px',
      }}
    >
      {/* Zone 1 (Left): Active Incident Selector & Geographic Position */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div
            style={{
              padding: '5px',
              borderRadius: '6px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Droplet size={14} />
          </div>
          <span
            style={{
              fontSize: '0.70rem',
              fontWeight: 800,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontFamily: 'var(--font-mono)',
            }}
          >
            ACTIVE INCIDENT
          </span>
        </div>

        {/* Dropdown Selector */}
        <div style={{ position: 'relative' }}>
          <select
            value={selectedSpill?.spill_id || ''}
            onChange={(e) => {
              if (!e.target.value) {
                onSelectSpill(null);
                return;
              }
              const found = spills.find((s) => s.spill_id === e.target.value);
              if (found) onSelectSpill(found);
            }}
            style={{
              appearance: 'none',
              backgroundColor: '#F8FAFC',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '6px 28px 6px 10px',
              fontSize: '0.76rem',
              fontWeight: 700,
              color: 'var(--navy-primary)',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              outline: 'none',
              maxWidth: '300px',
            }}
          >
            {spills.length === 0 ? (
              <option value="">No active incidents loaded</option>
            ) : (
              <>
                <option value="">-- No Active Incident Selected ({spills.length} Available) --</option>
                {spills.map((s) => (
                  <option key={s.spill_id} value={s.spill_id}>
                    #{s.spill_id.slice(0, 16)} · {s.area_km2.toFixed(2)} km² ({new Date(s.detected_at).toLocaleDateString()})
                  </option>
                ))}
              </>
            )}
          </select>
          <ChevronDown
            size={13}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              color: 'var(--text-secondary)',
            }}
          />
        </div>

        {/* Live Sentinel Detection Provenance Badge */}
        {selectedSpill?.provenance === 'LIVE_MONITOR' && (
          <span
            style={{
              fontSize: '0.66rem',
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: '4px',
              backgroundColor: '#ECFDF5',
              color: '#059669',
              border: '1px solid #A7F3D0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Satellite size={11} className="animate-pulse" />
            LIVE S1 DETECTION
          </span>
        )}

        {/* Remove / Clear Buttons */}
        {selectedSpill && (
          <button
            onClick={() => {
              if (onDeleteSpill) {
                onDeleteSpill(selectedSpill.spill_id);
              } else {
                onSelectSpill(null);
              }
            }}
            title="Remove and delete this incident"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '5px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#DC2626',
              fontSize: '0.68rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Trash2 size={12} />
            <span>Remove</span>
          </button>
        )}

        {spills.length > 1 && onClearAllSpills && (
          <button
            onClick={onClearAllSpills}
            title="Clear all recorded incidents"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '5px',
              backgroundColor: '#F1F5F9',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              fontSize: '0.66rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span>Clear All</span>
          </button>
        )}

        {selectedSpill && (
          <span
            className="mono-text"
            style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              color: 'var(--navy-primary)',
              backgroundColor: '#F1F5F9',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #E2E8F0',
            }}
          >
            {selectedSpill.centroid[1].toFixed(3)}°N, {selectedSpill.centroid[0].toFixed(3)}°E
          </span>
        )}
      </div>

      {/* Zone 2 (Center): Compact Segmented Provenance Control */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: '#F1F4F8',
          padding: '4px 10px',
          borderRadius: '20px',
          border: '1px solid #E2E8F0',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: '0.60rem',
            fontWeight: 800,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontFamily: 'var(--font-mono)',
            marginRight: '2px',
          }}
        >
          PROVENANCE:
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563EB' }} />
          <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#1E40AF', fontFamily: 'var(--font-mono)' }}>
            DETECTED
          </span>
        </div>
        <span style={{ color: '#CBD5E1', fontSize: '0.65rem' }}>•</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#0D9488' }} />
          <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#115E59', fontFamily: 'var(--font-mono)' }}>
            MEASURED
          </span>
        </div>
        <span style={{ color: '#CBD5E1', fontSize: '0.65rem' }}>•</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#D97706' }} />
          <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#92400E', fontFamily: 'var(--font-mono)' }}>
            PREDICTED
          </span>
        </div>
        <span style={{ color: '#CBD5E1', fontSize: '0.65rem' }}>•</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#DC2626' }} />
          <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#991B1B', fontFamily: 'var(--font-mono)' }}>
            ANOMALY
          </span>
        </div>
        <span style={{ color: '#CBD5E1', fontSize: '0.65rem' }}>•</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
          <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#166534', fontFamily: 'var(--font-mono)' }}>
            VERIFIED
          </span>
        </div>
      </div>

      {/* Zone 3 (Right): AOI Preset Selector, Scan Action, Live Monitors, Alerts & Health Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {/* Target AOI Preset Selector */}
        {presets.length > 0 && onSelectPreset && (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                position: 'absolute',
                left: '8px',
                pointerEvents: 'none',
                color: 'var(--navy-primary)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Globe2 size={13} />
            </div>
            <select
              value={selectedPreset?.id || ''}
              onChange={(e) => {
                const found = presets.find((p) => p.id === e.target.value);
                if (found) onSelectPreset(found);
              }}
              style={{
                appearance: 'none',
                backgroundColor: '#F1F5F9',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '6px 26px 6px 26px',
                fontSize: '0.74rem',
                fontWeight: 700,
                color: 'var(--navy-primary)',
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                outline: 'none',
              }}
              title="Target Maritime Area of Interest (AOI)"
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.region})
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              style={{
                position: 'absolute',
                right: '8px',
                pointerEvents: 'none',
                color: 'var(--text-secondary)',
              }}
            />
          </div>
        )}

        {/* Live AOI Monitors Modal Trigger Button */}
        {onOpenMonitors && (
          <button
            onClick={onOpenMonitors}
            title="Configure automated Sentinel-1 AOI background monitors"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#0F172A',
              color: '#38BDF8',
              border: '1px solid #0284C7',
              padding: '7px 12px',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(56, 189, 248, 0.2)',
              transition: 'all 0.15s ease',
            }}
          >
            <Satellite size={13} className="animate-pulse" />
            <span>AOI Monitors</span>
          </button>
        )}

        {/* Live Detection Notifications Bell with Popover */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowAlertsDropdown(!showAlertsDropdown)}
            title="Sentinel-1 Live Detection Alerts"
            style={{
              position: 'relative',
              padding: '7px 10px',
              borderRadius: '6px',
              backgroundColor: unreadAlertsCount > 0 ? '#FEF2F2' : '#F1F5F9',
              border: unreadAlertsCount > 0 ? '1px solid #FECACA' : '1px solid var(--border-subtle)',
              color: unreadAlertsCount > 0 ? '#DC2626' : 'var(--navy-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <Bell size={14} className={unreadAlertsCount > 0 ? 'animate-bounce' : ''} />
            {unreadAlertsCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  fontSize: '0.60rem',
                  fontWeight: 800,
                  borderRadius: '9999px',
                  padding: '1px 5px',
                  border: '1px solid #FFFFFF',
                }}
              >
                {unreadAlertsCount}
              </span>
            )}
          </button>

          {/* Alerts Dropdown Drawer */}
          {showAlertsDropdown && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: '8px',
                width: '340px',
                backgroundColor: '#0F172A',
                border: '1px solid #1E293B',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
                color: '#F8FAFC',
                zIndex: 1000,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '12px 14px',
                  borderBottom: '1px solid #1E293B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#1E293B/50',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Bell size={13} color="#38BDF8" />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Live Detection Alerts</span>
                </div>
                {onClearAlerts && liveAlerts.length > 0 && (
                  <button
                    onClick={onClearAlerts}
                    style={{
                      fontSize: '0.65rem',
                      color: '#94A3B8',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div style={{ maxHeight: '280px', overflowY: 'auto', padding: '6px' }}>
                {liveAlerts.length === 0 ? (
                  <div
                    style={{
                      padding: '24px 12px',
                      textAlign: 'center',
                      color: '#64748B',
                      fontSize: '0.72rem',
                    }}
                  >
                    No live alerts received yet. Monitored AOIs will push alerts upon Sentinel-1 scene arrival.
                  </div>
                ) : (
                  liveAlerts.map((alert, idx) => (
                    <div
                      key={alert.alert_id || idx}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        backgroundColor: '#1E293B',
                        marginBottom: '6px',
                        border: '1px solid #334155',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '4px',
                        }}
                      >
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#F8FAFC' }}>
                          {alert.monitor_name}
                        </span>
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: '#7F1D1D',
                            color: '#FCA5A5',
                          }}
                        >
                          {alert.spills_count} SPILL{alert.spills_count > 1 ? 'S' : ''}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.66rem', color: '#94A3B8', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={11} />
                          <span>{new Date(alert.detected_at).toLocaleTimeString()}</span>
                        </div>
                        <div className="font-mono" style={{ fontSize: '0.60rem', color: '#38BDF8', marginTop: '2px', wordBreak: 'break-all' }}>
                          {alert.scene_id}
                        </div>
                      </div>

                      {alert.spills && alert.spills.length > 0 && onInvestigateAlert && (
                        <button
                          onClick={() => {
                            onInvestigateAlert(alert.spills[0].spill_id);
                            setShowAlertsDropdown(false);
                          }}
                          style={{
                            width: '100%',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            backgroundColor: '#0284C7',
                            color: '#FFFFFF',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                          }}
                        >
                          <Zap size={11} />
                          <span>Investigate Spill #{alert.spills[0].spill_id.slice(0, 10)}</span>
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {onTriggerNewScan && (
          <button
            onClick={onTriggerNewScan}
            disabled={isScanning}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--navy-primary)',
              color: '#FFFFFF',
              border: '1px solid var(--navy-hover)',
              padding: '7px 14px',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: isScanning ? 'wait' : 'pointer',
              boxShadow: '0 1px 3px rgba(11, 79, 108, 0.25)',
              transition: 'background-color 0.15s ease',
            }}
          >
            <Radio size={13} className={isScanning ? 'animate-spin' : ''} />
            <span>{isScanning ? 'SAR Scanning...' : 'Scan New SAR AOI'}</span>
          </button>
        )}

        {/* Low-Emphasis Separated Status Strip */}
        <div
          style={{
            borderLeft: '1px solid var(--border-subtle)',
            paddingLeft: '14px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: isHealthy ? '#F0FDF4' : '#FFFBEB',
              border: isHealthy ? '1px solid #BBF7D0' : '1px solid #FDE68A',
              padding: '3px 8px',
              borderRadius: '4px',
            }}
          >
            {isHealthy ? (
              <CheckCircle2 size={12} color="#16A34A" />
            ) : (
              <AlertTriangle size={12} color="#D97706" />
            )}
            <span
              className="mono-text"
              style={{
                fontSize: '0.66rem',
                fontWeight: 700,
                color: isHealthy ? '#166534' : '#92400E',
                letterSpacing: '0.02em',
              }}
            >
              {isHealthy ? 'GEE/FastAPI LIVE' : 'CHECKING BACKEND'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

