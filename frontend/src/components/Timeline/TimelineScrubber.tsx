import React from 'react';
import { Play, Pause, RotateCcw, Clock } from 'lucide-react';
import { ProvenanceBadge } from '../Common/ProvenanceBadge';

interface TimelineScrubberProps {
  detectedAtIso: string;
  backwardHours?: number;
  forwardHours?: number;
  originLikelyOffsetHours?: number;
  currentOffsetHours: number;
  onOffsetChange: (offsetHours: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  speed: number;
  onChangeSpeed: (speed: number) => void;
}

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  detectedAtIso,
  backwardHours = 48,
  forwardHours = 24,
  originLikelyOffsetHours = -18,
  currentOffsetHours,
  onOffsetChange,
  isPlaying,
  onTogglePlay,
  speed,
  onChangeSpeed,
}) => {
  const minOffset = -backwardHours;
  const maxOffset = forwardHours;
  const totalSpan = backwardHours + forwardHours;

  // Calculate simulated ISO time
  const baseTimestamp = new Date(detectedAtIso || '2026-09-07T05:42:00Z').getTime();
  const currentTimestamp = baseTimestamp + currentOffsetHours * 3600 * 1000;
  const simulatedDate = new Date(currentTimestamp);
  const formattedSimulatedDate = simulatedDate.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';

  // State regime label
  const regime =
    currentOffsetHours < -0.25
      ? { label: 'BACKWARD HINDCAST', provenance: 'MODEL-PREDICTED', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' }
      : currentOffsetHours > 0.25
      ? { label: 'FORWARD SPREAD FORECAST', provenance: 'MODEL-PREDICTED', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' }
      : { label: 'SAR DETECTION INSTANT (T₀)', provenance: 'DETECTED', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' };

  // Calculate percentage positions for markers
  const originPct = ((originLikelyOffsetHours - minOffset) / totalSpan) * 100;
  const detectionPct = ((-minOffset) / totalSpan) * 100;

  return (
    <div
      style={{
        padding: '12px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        backgroundColor: '#FFFFFF',
      }}
    >
      {/* Top Header: Current Simulated Time & Provenance Regime */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              padding: '4px',
              borderRadius: '5px',
              backgroundColor: '#F1F5F9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--navy-primary)',
            }}
          >
            <Clock size={14} />
          </div>
          <div>
            <span style={{ fontSize: '0.60rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700, letterSpacing: '0.04em' }}>
              SIMULATED MARITIME EVENT CLOCK
            </span>
            <span className="mono-text" style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--navy-primary)' }}>
              {formattedSimulatedDate}
            </span>
          </div>

          <span
            className="mono-text"
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: '4px',
              backgroundColor: regime.bg,
              border: `1px solid ${regime.border}`,
              color: regime.color,
            }}
          >
            {currentOffsetHours === 0
              ? 'T₀ (Detected)'
              : currentOffsetHours > 0
              ? `T +${currentOffsetHours.toFixed(1)} hrs`
              : `T ${currentOffsetHours.toFixed(1)} hrs`}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ProvenanceBadge provenance={regime.provenance} size="sm" />
        </div>
      </div>

      {/* Scrubber Bar Track with Labels Positioned Above With Connecting Ticks */}
      <div style={{ position: 'relative', width: '100%', padding: '24px 0 10px 0' }}>
        {/* Origin Marker (Above track with downward connecting tick) */}
        <div
          style={{
            position: 'absolute',
            top: '0px',
            left: `${originPct}%`,
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            cursor: 'pointer',
            zIndex: 15,
          }}
          onClick={() => onOffsetChange(originLikelyOffsetHours)}
          title="Jump to Estimated Release Window"
        >
          <span
            className="mono-text"
            style={{
              fontSize: '0.62rem',
              color: '#92400E',
              fontWeight: 800,
              whiteSpace: 'nowrap',
              backgroundColor: '#FEF3C7',
              border: '1px solid #FCD34D',
              padding: '1px 5px',
              borderRadius: '3px',
              lineHeight: 1.2,
            }}
          >
            Origin (-18h)
          </span>
          <div style={{ width: '1.5px', height: '10px', backgroundColor: '#D97706', marginTop: '2px' }} />
        </div>

        {/* Detection Marker T₀ (Above track with downward connecting tick) */}
        <div
          style={{
            position: 'absolute',
            top: '0px',
            left: `${detectionPct}%`,
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            cursor: 'pointer',
            zIndex: 15,
          }}
          onClick={() => onOffsetChange(0)}
          title="Jump to SAR Acquisition T₀"
        >
          <span
            className="mono-text"
            style={{
              fontSize: '0.62rem',
              color: '#1E40AF',
              fontWeight: 800,
              whiteSpace: 'nowrap',
              backgroundColor: '#DBEAFE',
              border: '1px solid #93C5FD',
              padding: '1px 5px',
              borderRadius: '3px',
              lineHeight: 1.2,
            }}
          >
            T₀ SAR Scan
          </span>
          <div style={{ width: '2px', height: '10px', backgroundColor: '#2563EB', marginTop: '2px' }} />
        </div>

        {/* Forecast End Marker (+24h) */}
        <div
          style={{
            position: 'absolute',
            top: '0px',
            right: '0%',
            transform: 'translateX(50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 15,
          }}
        >
          <span
            className="mono-text"
            style={{
              fontSize: '0.62rem',
              color: '#166534',
              fontWeight: 800,
              whiteSpace: 'nowrap',
              backgroundColor: '#DCFCE7',
              border: '1px solid #86EFAC',
              padding: '1px 5px',
              borderRadius: '3px',
              lineHeight: 1.2,
            }}
          >
            +24h Forecast
          </span>
          <div style={{ width: '1.5px', height: '10px', backgroundColor: '#16A34A', marginTop: '2px' }} />
        </div>

        {/* Track Visual Underlay */}
        <div
          style={{
            position: 'absolute',
            top: '28px',
            left: 0,
            right: 0,
            height: '6px',
            borderRadius: '3px',
            background: 'linear-gradient(to right, #D97706 0%, #F59E0B 65%, #2563EB 66%, #16A34A 100%)',
            opacity: 0.25,
          }}
        />

        {/* Native Range Slider */}
        <input
          type="range"
          min={minOffset}
          max={maxOffset}
          step={0.25}
          value={currentOffsetHours}
          onChange={(e) => onOffsetChange(parseFloat(e.target.value))}
          style={{
            width: '100%',
            position: 'relative',
            zIndex: 10,
            cursor: 'ew-resize',
            accentColor: 'var(--navy-primary)',
            margin: '4px 0',
          }}
        />
      </div>

      {/* Scrubber Controls Footer with Left-Aligned Consistent Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '2px' }}>
        {/* Left Playback Controls with Consistent Height (30px) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onTogglePlay}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              height: '30px',
              padding: '0 14px',
              borderRadius: '6px',
              backgroundColor: isPlaying ? '#FEF2F2' : 'var(--navy-primary)',
              border: isPlaying ? '1px solid #FECACA' : '1px solid var(--navy-hover)',
              color: isPlaying ? '#DC2626' : '#FFFFFF',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
              transition: 'all 0.15s ease',
            }}
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
            <span>{isPlaying ? 'Pause' : 'Play Replay'}</span>
          </button>

          <button
            onClick={() => onOffsetChange(0)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              height: '30px',
              padding: '0 10px',
              borderRadius: '6px',
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title="Reset to SAR Detection Instant (T₀)"
          >
            <RotateCcw size={12} />
            <span>Reset T₀</span>
          </button>

          <button
            onClick={() => onOffsetChange(originLikelyOffsetHours)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '30px',
              padding: '0 10px',
              borderRadius: '6px',
              backgroundColor: '#FFFBEB',
              border: '1px solid #FDE68A',
              color: '#92400E',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Origin Window
          </button>
        </div>

        {/* Playback Speed Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 700, marginRight: '4px' }}>SPEED:</span>
          {[1, 2, 5, 10].map((s) => (
            <button
              key={s}
              onClick={() => onChangeSpeed(s)}
              style={{
                height: '26px',
                padding: '0 8px',
                borderRadius: '4px',
                fontSize: '0.68rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: speed === s ? 'var(--navy-primary)' : '#F1F5F9',
                color: speed === s ? '#FFFFFF' : 'var(--text-secondary)',
                border: speed === s ? 'none' : '1px solid var(--border-subtle)',
                transition: 'all 0.15s ease',
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
