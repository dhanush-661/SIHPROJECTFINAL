import React from 'react';
import {
  Layers,
  Play,
  Sliders,
  Wind,
  CheckCircle2,
  Loader2,
  Crosshair
} from 'lucide-react';
import type { DateRange, PresetAOI } from '../../types/spill';

interface DetectionPanelProps {
  presets: PresetAOI[];
  selectedPreset: PresetAOI | null;
  onSelectPreset: (preset: PresetAOI) => void;
  dateRange: DateRange;
  onChangeDateRange: (range: DateRange) => void;
  sensitivity: number;
  onChangeSensitivity: (val: number) => void;
  isScanning: boolean;
  onRunDetection: () => void;
  lastMetadata: any | null;
}

export const DetectionPanel: React.FC<DetectionPanelProps> = ({
  presets,
  selectedPreset,
  onSelectPreset,
  dateRange,
  onChangeDateRange,
  sensitivity,
  onChangeSensitivity,
  isScanning,
  onRunDetection,
  lastMetadata,
}) => {
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
          <Layers size={18} color="var(--accent-cyan)" />
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            SAR Mission Controls
          </h2>
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>VV Polarized</span>
      </div>

      {/* 1. Maritime AOI Presets */}
      <div>
        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
          TARGET MARITIME REGION (AOI)
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
          {presets.map((preset) => {
            const isSelected = selectedPreset?.id === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => onSelectPreset(preset)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: isSelected ? 'rgba(0, 240, 255, 0.15)' : 'rgba(13, 27, 46, 0.5)',
                  border: isSelected ? '1px solid var(--accent-cyan)' : '1px solid var(--panel-border)',
                  color: isSelected ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: isSelected ? 'var(--accent-cyan)' : '#fff' }}>
                    {preset.name}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {preset.region}
                  </div>
                </div>
                <Crosshair size={14} color={isSelected ? 'var(--accent-cyan)' : 'var(--text-muted)'} />
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Acquisition Date Range */}
      <div>
        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
          SENTINEL-1 ACQUISITION WINDOW
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Start Date</span>
            <input
              type="date"
              value={dateRange.start_date}
              onChange={(e) => onChangeDateRange({ ...dateRange, start_date: e.target.value })}
              style={{
                width: '100%',
                background: 'rgba(7, 13, 24, 0.8)',
                border: '1px solid var(--panel-border)',
                color: '#fff',
                padding: '6px 8px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                outline: 'none',
              }}
            />
          </div>
          <div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>End Date</span>
            <input
              type="date"
              value={dateRange.end_date}
              onChange={(e) => onChangeDateRange({ ...dateRange, end_date: e.target.value })}
              style={{
                width: '100%',
                background: 'rgba(7, 13, 24, 0.8)',
                border: '1px solid var(--panel-border)',
                color: '#fff',
                padding: '6px 8px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                outline: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* 3. Algorithm Sensitivity & Wind Threshold */}
      <div style={{
        padding: '10px 12px',
        borderRadius: '6px',
        background: 'rgba(7, 13, 24, 0.6)',
        border: '1px solid var(--panel-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sliders size={12} color="var(--accent-cyan)" />
              Dark Spot Sensitivity
            </span>
            <span className="mono-text" style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
              {(sensitivity * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min="0.2"
            max="1.0"
            step="0.05"
            value={sensitivity}
            onChange={(e) => onChangeSensitivity(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Wind size={12} color="var(--accent-warning)" />
              ERA5 Wind Filter (Min)
            </span>
            <span className="mono-text" style={{ fontSize: '0.75rem', color: 'var(--accent-warning)', fontWeight: 600 }}>
              &gt; 2.0 m/s
            </span>
          </div>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            Discards calm water look-alikes (&lt;2.0 m/s) automatically.
          </p>
        </div>
      </div>

      {/* 4. Action Trigger Button */}
      <button
        onClick={onRunDetection}
        disabled={isScanning}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '8px',
          background: isScanning
            ? 'rgba(0, 240, 255, 0.2)'
            : 'linear-gradient(135deg, #00f0ff 0%, #0077b6 100%)',
          color: isScanning ? 'var(--accent-cyan)' : '#070d18',
          fontWeight: 700,
          fontSize: '0.88rem',
          border: 'none',
          cursor: isScanning ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          boxShadow: isScanning ? 'none' : '0 0 16px rgba(0, 240, 255, 0.4)',
          transition: 'all 0.2s ease',
        }}
      >
        {isScanning ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            <span>Scanning SAR Sentinel-1...</span>
          </>
        ) : (
          <>
            <Play size={18} />
            <span>Run SAR Detection (POST /detect)</span>
          </>
        )}
      </button>

      {/* 5. Processing Telemetry Log */}
      {lastMetadata && (
        <div style={{
          marginTop: 'auto',
          padding: '10px',
          borderRadius: '6px',
          background: 'rgba(7, 13, 24, 0.9)',
          border: '1px solid var(--panel-border)',
          fontSize: '0.72rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-emerald)', fontWeight: 600, marginBottom: '6px' }}>
            <CheckCircle2 size={14} />
            <span>Pipeline Executed Successfully</span>
          </div>
          <div style={{ color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div>Candidates Evaluated: <b style={{ color: '#fff' }}>{lastMetadata.candidates_analyzed || 0}</b></div>
            <div>Calm Water FP Discarded: <b style={{ color: 'var(--accent-warning)' }}>{lastMetadata.false_positives_filtered || 0}</b></div>
            <div>Spills Vectorized: <b style={{ color: 'var(--accent-spill)' }}>{lastMetadata.detected_spills_count || 0}</b></div>
            <div>Projection: <b className="mono-text" style={{ color: 'var(--accent-cyan)' }}>Local UTM</b></div>
          </div>
        </div>
      )}
    </div>
  );
};
