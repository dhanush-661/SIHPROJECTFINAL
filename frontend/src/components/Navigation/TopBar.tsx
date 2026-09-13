import React from 'react';
import type { SpillRecord, SystemHealth } from '../../types/spill';
import { Droplet, CheckCircle2, AlertTriangle, ChevronDown, Radio } from 'lucide-react';

interface TopBarProps {
  health: SystemHealth | null;
  spills: SpillRecord[];
  selectedSpill: SpillRecord | null;
  onSelectSpill: (spill: SpillRecord) => void;
  onTriggerNewScan?: () => void;
  isScanning?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  health,
  spills,
  selectedSpill,
  onSelectSpill,
  onTriggerNewScan,
  isScanning = false,
}) => {
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
            {spills.length === 0 && <option value="">No active incidents loaded</option>}
            {spills.map((s) => (
              <option key={s.spill_id} value={s.spill_id}>
                #{s.spill_id.slice(0, 16)} · {s.area_km2.toFixed(2)} km² ({new Date(s.detected_at).toLocaleDateString()})
              </option>
            ))}
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

      {/* Zone 3 (Right): Primary Actions & Separated Low-Emphasis Status Strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
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
            <Radio size={13} />
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
