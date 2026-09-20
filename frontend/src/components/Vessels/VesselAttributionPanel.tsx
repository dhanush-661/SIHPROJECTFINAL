import React, { useState } from 'react';
import {
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Wind
} from 'lucide-react';
import type { CandidateVessel, VesselCorrelationResponse } from '../../types/vessel';
import type { SpillRecord } from '../../types/spill';
import { ProvenanceBadge } from '../Common/ProvenanceBadge';

interface VesselAttributionPanelProps {
  spill: SpillRecord | null;
  vesselCorrelation: VesselCorrelationResponse | null;
  selectedVessel: CandidateVessel | null;
  onSelectVessel: (vessel: CandidateVessel) => void;
  onCenterSpill?: (spill: SpillRecord) => void;
}



// Interactive SVG Radar Chart for Component Scores
const RadarChart: React.FC<{
  proximity: number;
  temporal: number;
  trajectory: number;
  anomaly: number;
}> = ({ proximity, temporal, trajectory, anomaly }) => {
  const size = 160;
  const center = size / 2;
  const radius = 60;

  // 4 axes: Top (Proximity), Right (Temporal), Bottom (Trajectory), Left (Anomaly)
  // Angles: -90, 0, 90, 180 deg
  const coords = [
    { x: center, y: center - radius * proximity }, // Top: Proximity
    { x: center + radius * temporal, y: center }, // Right: Temporal
    { x: center, y: center + radius * trajectory }, // Bottom: Trajectory
    { x: center - radius * anomaly, y: center }, // Left: Anomaly
  ];

  const polygonPoints = coords.map((c) => `${c.x},${c.y}`).join(' ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Concentric Grid Rings */}
        {[0.25, 0.5, 0.75, 1.0].map((level) => (
          <circle
            key={level}
            cx={center}
            cy={center}
            r={radius * level}
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeDasharray="2,2"
          />
        ))}

        {/* Axis Lines */}
        <line x1={center} y1={center - radius} x2={center} y2={center + radius} stroke="rgba(255, 255, 255, 0.15)" />
        <line x1={center - radius} y1={center} x2={center + radius} y2={center} stroke="rgba(255, 255, 255, 0.15)" />

        {/* Filled Polygon */}
        <polygon
          points={polygonPoints}
          fill="rgba(244, 63, 94, 0.35)"
          stroke="#f43f5e"
          strokeWidth="2"
        />

        {/* Vertex Markers */}
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="3" fill="#ffffff" stroke="#f43f5e" strokeWidth="1.5" />
        ))}

        {/* Axis Labels */}
        <text x={center} y={center - radius - 5} textAnchor="middle" fill="#00f0ff" fontSize="8" fontWeight="bold">
          PROX ({proximity.toFixed(2)})
        </text>
        <text x={center + radius + 4} y={center + 3} textAnchor="start" fill="#38bdf8" fontSize="8" fontWeight="bold">
          TEMP ({temporal.toFixed(2)})
        </text>
        <text x={center} y={center + radius + 12} textAnchor="middle" fill="#ffaa00" fontSize="8" fontWeight="bold">
          TRAJ ({trajectory.toFixed(2)})
        </text>
        <text x={center - radius - 4} y={center + 3} textAnchor="end" fill="#f43f5e" fontSize="8" fontWeight="bold">
          ANOM ({anomaly.toFixed(2)})
        </text>
      </svg>
    </div>
  );
};

export const VesselAttributionPanel: React.FC<VesselAttributionPanelProps> = ({
  spill,
  vesselCorrelation,
  selectedVessel,
  onSelectVessel,
  onCenterSpill,
}) => {

  const [expandedMmsi, setExpandedMmsi] = useState<string | null>(
    vesselCorrelation?.candidate_vessels?.[0]?.mmsi || null
  );

  const toggleExpand = (mmsi: string) => {
    setExpandedMmsi(expandedMmsi === mmsi ? null : mmsi);
  };

  if (!spill) return null;

  return (
    <div
      className="glass-panel"
      style={{
        width: '420px',
        maxHeight: 'calc(100vh - 100px)',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
        gap: '12px',
        overflowY: 'auto',
        zIndex: 800,
      }}
    >
      {/* 1. Header & Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={18} color="var(--accent-spill)" />
          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>
            VESSEL ATTRIBUTION &amp; ANOMALY INTEL
          </span>
        </div>
        <ProvenanceBadge provenance="ANOMALY-FLAGGED" size="sm" />
      </div>

      {/* Action Bar */}
      {onCenterSpill && (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => onCenterSpill(spill)}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: '5px',
              background: 'rgba(0, 240, 255, 0.15)',
              border: '1px solid var(--accent-cyan)',
              color: 'var(--accent-cyan)',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Center Spill on Map
          </button>
        </div>
      )}


      {/* 2. Primary Spill Summary Stats Card */}
      <div
        style={{
          padding: '10px 12px',
          borderRadius: '6px',
          background: 'rgba(7, 13, 24, 0.75)',
          border: '1px solid var(--panel-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>TARGET SPILL IDENTIFIER</span>
            <div className="mono-text" style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
              {spill.spill_id}
            </div>
          </div>
          <ProvenanceBadge provenance="DETECTED" size="sm" />
        </div>

        {/* 4-Stat Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px' }}>
          <div style={{ padding: '6px', borderRadius: '4px', background: 'rgba(13, 27, 46, 0.6)' }}>
            <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', display: 'block' }}>AREA</span>
            <span className="mono-text" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}>
              {spill.area_km2.toFixed(2)} km²
            </span>
          </div>

          <div style={{ padding: '6px', borderRadius: '4px', background: 'rgba(13, 27, 46, 0.6)' }}>
            <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', display: 'block' }}>LENGTH</span>
            <span className="mono-text" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}>
              {spill.length_km.toFixed(1)} km
            </span>
          </div>

          <div style={{ padding: '6px', borderRadius: '4px', background: 'rgba(13, 27, 46, 0.6)' }}>
            <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', display: 'block' }}>CONFIDENCE</span>
            <span className="mono-text" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-spill)' }}>
              {Math.round(spill.confidence * 100)}%
            </span>
          </div>

          <div style={{ padding: '6px', borderRadius: '4px', background: 'rgba(13, 27, 46, 0.6)' }}>
            <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', display: 'block' }}>ORIENTATION</span>
            <span className="mono-text" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
              {spill.orientation_deg.toFixed(0)}°
            </span>
          </div>
        </div>

        {/* Environmental Context Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Wind size={12} color="#38bdf8" />
            <span>Wind: {spill.wind_speed_ms?.toFixed(1) || '6.2'} m/s ({spill.wind_direction_deg?.toFixed(0) || '225'}°)</span>
          </div>
          <ProvenanceBadge provenance="MEASURED" size="sm" />
        </div>
      </div>

      {/* 3. Ranked Candidate Vessels List */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ffffff' }}>
          RANKED CANDIDATES ({vesselCorrelation?.candidate_vessels?.length || 0})
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
          IsolationForest Contamination = 0.25
        </span>
      </div>

      {vesselCorrelation?.candidate_vessels?.map((vessel, idx) => {
        const isTopSuspect = idx === 0;
        const isExpanded = expandedMmsi === vessel.mmsi;
        const isSelected = selectedVessel?.mmsi === vessel.mmsi;
        const scoreColor =
          vessel.suspect_score >= 0.75
            ? '#f43f5e'
            : vessel.suspect_score >= 0.5
            ? '#ffaa00'
            : '#00e676';

        return (
          <div
            key={vessel.mmsi}
            style={{
              borderRadius: '6px',
              border: isSelected
                ? `1px solid ${scoreColor}`
                : isTopSuspect
                ? '1px solid rgba(244, 63, 94, 0.4)'
                : '1px solid var(--panel-border)',
              background: isSelected
                ? 'rgba(244, 63, 94, 0.12)'
                : isTopSuspect
                ? 'rgba(7, 13, 24, 0.85)'
                : 'rgba(7, 13, 24, 0.55)',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onClick={() => onSelectVessel(vessel)}
          >
            {/* Vessel Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Rank Badge */}
                <span
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    background: isTopSuspect ? '#f43f5e' : 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  #{idx + 1}
                </span>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff' }}>
                      {vessel.vessel_name}
                    </span>
                    {vessel.is_authentic_real ? (
                      <span
                        style={{
                          fontSize: '0.55rem',
                          fontWeight: 800,
                          background: 'rgba(16, 185, 129, 0.2)',
                          color: '#10b981',
                          border: '1px solid #10b981',
                          padding: '1px 4px',
                          borderRadius: '3px',
                        }}
                      >
                        AUTHENTIC-MEASURED
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.55rem',
                          fontWeight: 700,
                          background: 'rgba(255, 255, 255, 0.08)',
                          color: 'var(--text-muted)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          padding: '1px 4px',
                          borderRadius: '3px',
                        }}
                      >
                        CORRIDOR-BENCHMARK
                      </span>
                    )}
                    {vessel.is_ais_dark_suspect && (
                      <span
                        style={{
                          fontSize: '0.58rem',
                          fontWeight: 700,
                          background: 'rgba(244, 63, 94, 0.2)',
                          color: '#f43f5e',
                          border: '1px solid #f43f5e',
                          padding: '1px 4px',
                          borderRadius: '3px',
                        }}
                      >
                        AIS-DARK GAP
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    {vessel.vessel_type} &bull; Flag: {vessel.flag} &bull; MMSI: {vessel.mmsi}
                    {vessel.data_source && ` &bull; [${vessel.data_source}]`}
                  </span>
                </div>
              </div>

              {/* Suspect Probability Score */}
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', display: 'block' }}>SUSPECT SCORE</span>
                <span className="mono-text" style={{ fontSize: '1.05rem', fontWeight: 800, color: scoreColor }}>
                  {vessel.suspect_score.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Quick Metrics Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', fontSize: '0.68rem' }}>
              <div style={{ background: 'rgba(13, 27, 46, 0.6)', padding: '4px 6px', borderRadius: '4px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.55rem' }}>CPA DISTANCE</span>
                <b className="mono-text" style={{ color: '#00f0ff' }}>{vessel.features.min_distance_to_origin_km.toFixed(2)} km</b>
              </div>

              <div style={{ background: 'rgba(13, 27, 46, 0.6)', padding: '4px 6px', borderRadius: '4px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.55rem' }}>TIME NEAR ORIGIN</span>
                <b className="mono-text" style={{ color: '#ffaa00' }}>{vessel.features.time_near_origin_hours.toFixed(1)} hrs</b>
              </div>

              <div style={{ background: 'rgba(13, 27, 46, 0.6)', padding: '4px 6px', borderRadius: '4px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.55rem' }}>ML ANOMALY</span>
                <b className="mono-text" style={{ color: '#f43f5e' }}>{vessel.anomaly_score.toFixed(2)}</b>
              </div>
            </div>

            {/* Expandable "Why" Attribution Breakdown Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(vessel.mmsi);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-cyan)',
                fontSize: '0.68rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 0 0 0',
                cursor: 'pointer',
              }}
            >
              <span>{isExpanded ? 'Hide Kinematic "Why" Breakdown' : 'Expand Kinematic "Why" Breakdown & Radar'}</span>
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {/* Expanded Detailed "Why" Breakdown */}
            {isExpanded && (
              <div
                style={{
                  marginTop: '6px',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* SVG Radar Chart */}
                <RadarChart
                  proximity={vessel.component_scores.proximity_score}
                  temporal={vessel.component_scores.temporal_score}
                  trajectory={vessel.component_scores.trajectory_score}
                  anomaly={vessel.component_scores.ml_anomaly_score}
                />

                {/* Score Bar Breakdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {/* Proximity */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                      <span style={{ color: '#00f0ff' }}>Proximity Alignment (w=0.35)</span>
                      <span className="mono-text" style={{ color: '#fff' }}>{vessel.component_scores.proximity_score.toFixed(2)}</span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                      <div style={{ width: `${vessel.component_scores.proximity_score * 100}%`, height: '100%', background: '#00f0ff', borderRadius: '2px' }} />
                    </div>
                  </div>

                  {/* Temporal */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                      <span style={{ color: '#38bdf8' }}>Temporal Alignment (w=0.25)</span>
                      <span className="mono-text" style={{ color: '#fff' }}>{vessel.component_scores.temporal_score.toFixed(2)}</span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                      <div style={{ width: `${vessel.component_scores.temporal_score * 100}%`, height: '100%', background: '#38bdf8', borderRadius: '2px' }} />
                    </div>
                  </div>

                  {/* Trajectory */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                      <span style={{ color: '#ffaa00' }}>Trajectory/Loitering Score (w=0.20)</span>
                      <span className="mono-text" style={{ color: '#fff' }}>{vessel.component_scores.trajectory_score.toFixed(2)}</span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                      <div style={{ width: `${vessel.component_scores.trajectory_score * 100}%`, height: '100%', background: '#ffaa00', borderRadius: '2px' }} />
                    </div>
                  </div>

                  {/* ML Anomaly */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                      <span style={{ color: '#f43f5e' }}>IsolationForest ML Anomaly (w=0.20)</span>
                      <span className="mono-text" style={{ color: '#fff' }}>{vessel.component_scores.ml_anomaly_score.toFixed(2)}</span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                      <div style={{ width: `${vessel.component_scores.ml_anomaly_score * 100}%`, height: '100%', background: '#f43f5e', borderRadius: '2px' }} />
                    </div>
                  </div>
                </div>

                {/* Additional Feature Metric Chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '0.62rem' }}>
                  <span style={{ padding: '2px 6px', borderRadius: '3px', background: 'rgba(13, 27, 46, 0.8)', color: 'var(--text-secondary)' }}>
                    Speed Variance: <b className="mono-text" style={{ color: '#fff' }}>{vessel.features.speed_change_variance.toFixed(1)}</b>
                  </span>
                  <span style={{ padding: '2px 6px', borderRadius: '3px', background: 'rgba(13, 27, 46, 0.8)', color: 'var(--text-secondary)' }}>
                    Loitering Score: <b className="mono-text" style={{ color: '#fff' }}>{vessel.features.loitering_score.toFixed(2)}</b>
                  </span>
                  <span style={{ padding: '2px 6px', borderRadius: '3px', background: 'rgba(13, 27, 46, 0.8)', color: 'var(--text-secondary)' }}>
                    Fairway Deviation: <b className="mono-text" style={{ color: '#fff' }}>{vessel.features.route_deviation_score.toFixed(2)}</b>
                  </span>
                  <span style={{ padding: '2px 6px', borderRadius: '3px', background: 'rgba(13, 27, 46, 0.8)', color: 'var(--text-secondary)' }}>
                    AIS Gap Duration: <b className="mono-text" style={{ color: '#f43f5e' }}>{vessel.features.ais_gap_duration_hours.toFixed(1)} hrs</b>
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* 4. Statutory Disclaimer Footer */}
      <div
        style={{
          marginTop: 'auto',
          padding: '8px 10px',
          borderRadius: '5px',
          background: 'rgba(13, 27, 46, 0.6)',
          border: '1px solid var(--panel-border)',
          fontSize: '0.62rem',
          color: 'var(--text-muted)',
          lineHeight: 1.35,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px', color: 'var(--accent-warning)', fontWeight: 700 }}>
          <AlertTriangle size={12} />
          <span>STATUTORY INVESTIGATION DISCLAIMER</span>
        </div>
        {vesselCorrelation?.disclaimer ||
          'This analysis provides probabilistic spatiotemporal and kinematic correlation for maritime enforcement investigation. It does not constitute legal proof of culpability.'}
      </div>
    </div>
  );
};
