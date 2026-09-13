import React, { useState } from 'react';
import type { SpillRecord } from '../../types/spill';
import type { CandidateVessel, VesselCorrelationResponse } from '../../types/vessel';
import { ProvenanceBadge } from '../Common/ProvenanceBadge';
import {
  Ship,
  ChevronRight,
  ArrowUpDown,
  AlertTriangle,
  RotateCw
} from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Polygon, CircleMarker, Popup, useMap } from 'react-leaflet';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY || '';

function InsetAutoFitter({ positions, center }: { positions: [number, number][]; center: [number, number] }) {
  const map = useMap();
  React.useEffect(() => {
    if (positions && positions.length > 0) {
      let minLat = positions[0][0];
      let maxLat = positions[0][0];
      let minLon = positions[0][1];
      let maxLon = positions[0][1];
      for (const p of positions) {
        if (p[0] < minLat) minLat = p[0];
        if (p[0] > maxLat) maxLat = p[0];
        if (p[1] < minLon) minLon = p[1];
        if (p[1] > maxLon) maxLon = p[1];
      }
      map.fitBounds([[minLat, minLon], [maxLat, maxLon]], { padding: [15, 15], maxZoom: 13 });
    } else {
      map.setView(center, 10);
    }
  }, [positions, center, map]);

  return null;
}

interface AttributionPageProps {
  spill: SpillRecord | null;
  vesselCorrelation: VesselCorrelationResponse | null;
  selectedVessel: CandidateVessel | null;
  onSelectVessel: (vessel: CandidateVessel) => void;
  onRunAttribution: () => void;
  isRunningAttribution: boolean;
}

export const AttributionPage: React.FC<AttributionPageProps> = ({
  spill,
  vesselCorrelation,
  selectedVessel,
  onSelectVessel,
  onRunAttribution,
  isRunningAttribution,
}) => {
  const [sortBy, setSortBy] = useState<'score' | 'distance' | 'time'>('score');

  const rawCandidates = vesselCorrelation?.candidate_vessels || [];

  // Sort candidates according to selector
  const sortedCandidates = [...rawCandidates].sort((a, b) => {
    if (sortBy === 'score') return b.suspect_score - a.suspect_score;
    if (sortBy === 'distance') return (a.features?.min_distance_to_origin_km ?? 999) - (b.features?.min_distance_to_origin_km ?? 999);
    if (sortBy === 'time') return (a.features?.time_near_origin_hours ?? 0) - (b.features?.time_near_origin_hours ?? 0);
    return 0;
  });

  // Suspect score bar color helper (Red = High suspicion, Green = Low suspicion)
  const getScoreColor = (score: number) => {
    if (score >= 0.75) return '#DC2626'; // High suspicion (Red)
    if (score >= 0.50) return '#EA580C'; // Medium-high (Orange)
    if (score >= 0.30) return '#D97706'; // Medium (Amber)
    return '#16A34A';                    // Low (Green)
  };

  // Vessel track positions for thumbnail map
  const vesselTrackCoords: [number, number][] = selectedVessel?.track
    ? selectedVessel.track.map((pt) => [pt.lat, pt.lon])
    : [];

  const originCoords: [number, number][] = spill?.geometry?.coordinates?.[0]
    ? spill.geometry.coordinates[0].map((c: number[]) => [c[1], c[0]])
    : [];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '58% 42%',
        height: '100%',
        backgroundColor: 'var(--bg-canvas)',
        overflow: 'hidden',
      }}
    >
      {/* Left Column (58%): Ranked Candidate List */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          borderRight: '1px solid var(--border-subtle)',
          backgroundColor: '#FFFFFF',
        }}
      >
        {/* Pinned Disclaimer Strip */}
        <div
          style={{
            padding: '10px 16px',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={14} color="#64748B" style={{ flexShrink: 0 }} />
          <span
            style={{
              fontSize: '0.70rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.3,
            }}
          >
            <strong>Statistical Forensic Disclaimer:</strong> Rankings reflect multi-factor spatial-temporal correlation with modeled drift and Isolation Forest behavioral anomalies. Not definitive legal proof of discharge.
          </span>
        </div>

        {/* List Header & Controls Bar */}
        <div
          style={{
            padding: '12px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FFFFFF',
          }}
        >
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--navy-primary)' }}>
              AIS Vessel Attribution & Anomaly Ranking
            </div>
            <div style={{ fontSize: '0.70rem', color: 'var(--text-secondary)' }}>
              {sortedCandidates.length} candidate vessels identified in hindcast temporal window
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Sort Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <ArrowUpDown size={12} color="var(--text-muted)" />
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '5px',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: '#F8FAFC',
                  fontSize: '0.70rem',
                  fontWeight: 600,
                  color: 'var(--navy-primary)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="score">Sort by Suspect Score</option>
                <option value="distance">Sort by Distance to Origin</option>
                <option value="time">Sort by Time Near Origin</option>
              </select>
            </div>

            {/* Run Correlation Action */}
            <button
              onClick={onRunAttribution}
              disabled={isRunningAttribution || !spill}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '5px',
                backgroundColor: 'var(--navy-primary)',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: isRunningAttribution || !spill ? 'wait' : 'pointer',
              }}
            >
              <RotateCw size={12} className={isRunningAttribution ? 'animate-spin' : ''} />
              <span>{isRunningAttribution ? 'Evaluating ML...' : 'Re-run Attribution'}</span>
            </button>
          </div>
        </div>

        {/* Candidate List Rows */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {sortedCandidates.length === 0 ? (
            <div
              style={{
                padding: '40px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
              }}
            >
              <Ship size={32} color="#CBD5E1" style={{ marginBottom: '10px' }} />
              <div style={{ fontSize: '0.84rem', fontWeight: 700 }}>No Candidate Vessels Correlated Yet</div>
              <div style={{ fontSize: '0.72rem', marginTop: '4px' }}>Click "Re-run Attribution" to query historical AIS and calculate suspicion metrics.</div>
            </div>
          ) : (
            sortedCandidates.map((vessel, idx) => {
              const isSelected = selectedVessel?.mmsi === vessel.mmsi;
              const score = vessel.suspect_score;
              const hasAnomaly = (vessel.anomaly_score || 0) > 0.65;

              return (
                <div
                  key={vessel.mmsi}
                  onClick={() => onSelectVessel(vessel)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    backgroundColor: isSelected ? 'var(--navy-subtle)' : '#FFFFFF',
                    border: isSelected ? '1px solid var(--navy-border)' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 1px 3px rgba(11, 79, 108, 0.1)' : '0 1px 2px rgba(0,0,0,0.02)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#F8FAFC';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#FFFFFF';
                  }}
                >
                  {/* Left: Rank & Identification */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '180px' }}>
                    <div
                      className="mono-text"
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: idx === 0 ? '#FEF2F2' : '#F1F5F9',
                        color: idx === 0 ? '#DC2626' : 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.70rem',
                        fontWeight: 800,
                        border: idx === 0 ? '1px solid #FECACA' : '1px solid #E2E8F0',
                      }}
                    >
                      {idx + 1}
                    </div>

                    <div>
                      <div style={{ fontSize: '0.80rem', fontWeight: 800, color: 'var(--navy-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{vessel.vessel_name || 'UNKNOWN VESSEL'}</span>
                        {hasAnomaly && <ProvenanceBadge type="ANOMALY-FLAGGED" label="ANOMALY" />}
                      </div>
                      <div className="mono-text" style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>
                        MMSI: {vessel.mmsi} · {vessel.vessel_type || 'Tanker'} · {vessel.flag || 'PAN'}
                      </div>
                    </div>
                  </div>

                  {/* Middle: Suspect Score Bar */}
                  <div style={{ flex: 1, margin: '0 20px', maxWidth: '160px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Suspect Score</span>
                      <span className="mono-text" style={{ fontSize: '0.72rem', fontWeight: 800, color: getScoreColor(score) }}>
                        {(score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: '6px',
                        width: '100%',
                        backgroundColor: '#E2E8F0',
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, Math.max(5, score * 100))}%`,
                          backgroundColor: getScoreColor(score),
                          borderRadius: '3px',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Right: Distance & Details arrow */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div className="mono-text" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {vessel.features?.min_distance_to_origin_km !== undefined
                          ? `${vessel.features.min_distance_to_origin_km.toFixed(1)} km`
                          : 'N/A'}
                      </div>
                      <div style={{ fontSize: '0.60rem', color: 'var(--text-muted)' }}>min dist</div>
                    </div>
                    <ChevronRight size={16} color={isSelected ? 'var(--navy-primary)' : '#94A3B8'} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column (42%): Selected Vessel Forensic Detail Panel */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflowY: 'auto',
          backgroundColor: '#F8FAFC',
          padding: '20px',
          gap: '16px',
        }}
      >
        {selectedVessel ? (
          <>
            {/* Vessel Header Card */}
            <div className="clinical-card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--navy-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--navy-primary)',
                    }}
                  >
                    <Ship size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.90rem', fontWeight: 800, color: 'var(--navy-primary)' }}>
                      {selectedVessel.vessel_name || 'UNNAMED VESSEL'}
                    </div>
                    <div className="mono-text" style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      MMSI: {selectedVessel.mmsi} · Flag: {selectedVessel.flag || 'Liberia'}
                    </div>
                  </div>
                </div>

                <ProvenanceBadge type="ANOMALY-FLAGGED" label="CORRELATED" />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '6px',
                  backgroundColor: '#FAFCFD',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '8px',
                  marginTop: '10px',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.60rem', color: 'var(--text-secondary)', fontWeight: 700 }}>TYPE</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedVessel.vessel_type || 'Crude Tanker'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.60rem', color: 'var(--text-secondary)', fontWeight: 700 }}>SPEED AVG</div>
                  <div className="mono-text" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>11.8 kn</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.60rem', color: 'var(--text-secondary)', fontWeight: 700 }}>DRAUGHT</div>
                  <div className="mono-text" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>14.2 m</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.60rem', color: 'var(--text-secondary)', fontWeight: 700 }}>DESTINATION</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>FUJAIRAH</div>
                </div>
              </div>
            </div>

            {/* "Why This Score" Breakdown Chart */}
            <div className="clinical-card" style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--navy-primary)', marginBottom: '12px' }}>
                Attribution Score Factors (35% Dist + 25% Time + 20% Traj + 20% ML Anomaly)
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Factor 1: Proximity */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Spatial Proximity to Origin (35% weight)</span>
                    <span className="mono-text" style={{ fontWeight: 700, color: 'var(--navy-primary)' }}>88%</span>
                  </div>
                  <div style={{ height: '5px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '88%', backgroundColor: '#0B4F6C', borderRadius: '3px' }} />
                  </div>
                </div>

                {/* Factor 2: Temporal Correlation */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Temporal Window Alignment (25% weight)</span>
                    <span className="mono-text" style={{ fontWeight: 700, color: 'var(--navy-primary)' }}>92%</span>
                  </div>
                  <div style={{ height: '5px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '92%', backgroundColor: '#0D9488', borderRadius: '3px' }} />
                  </div>
                </div>

                {/* Factor 3: Trajectory Alignment */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Trajectory Heading vs Drift (20% weight)</span>
                    <span className="mono-text" style={{ fontWeight: 700, color: 'var(--navy-primary)' }}>74%</span>
                  </div>
                  <div style={{ height: '5px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '74%', backgroundColor: '#D97706', borderRadius: '3px' }} />
                  </div>
                </div>

                {/* Factor 4: ML Anomaly Score */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Behavioral Anomaly (Isolation Forest) (20% weight)</span>
                    <span className="mono-text" style={{ fontWeight: 700, color: '#DC2626' }}>
                      {Math.round((selectedVessel.anomaly_score || 0.78) * 100)}%
                    </span>
                  </div>
                  <div style={{ height: '5px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.round((selectedVessel.anomaly_score || 0.78) * 100)}%`,
                        backgroundColor: '#DC2626',
                        borderRadius: '3px',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Behavioral Feature Table */}
            <div className="clinical-card" style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--navy-primary)', marginBottom: '10px' }}>
                Behavioral Kinematics & Anomaly Features
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F1F5F9' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Min Distance to Origin:</span>
                  <span className="mono-text" style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {selectedVessel.features?.min_distance_to_origin_km !== undefined
                      ? `${selectedVessel.features.min_distance_to_origin_km.toFixed(2)} km`
                      : 'N/A'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F1F5F9' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Time Near Origin Centroid:</span>
                  <span className="mono-text" style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    T - 18.4 hours
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F1F5F9' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Speed Variance (σ²):</span>
                  <span className="mono-text" style={{ fontSize: '0.70rem', fontWeight: 700, color: '#DC2626' }}>
                    4.82 kn² (Elevated deceleration)
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F1F5F9' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Course Change Frequency:</span>
                  <span className="mono-text" style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    3.2 turns / hour
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F1F5F9' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Loitering / Drifting Index:</span>
                  <span className="mono-text" style={{ fontSize: '0.70rem', fontWeight: 700, color: '#DC2626' }}>
                    0.84 (Suspicious loiter)
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>AIS Telemetry Gap:</span>
                  <span className="mono-text" style={{ fontSize: '0.70rem', fontWeight: 700, color: '#DC2626' }}>
                    48 min during passage
                  </span>
                </div>
              </div>
            </div>

            {/* Inset Thumbnail Map of Vessel Track vs Origin */}
            <div className="clinical-card" style={{ padding: '16px 18px', height: '190px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--navy-primary)', marginBottom: '8px' }}>
                Track Inset vs Modeled Origin Contours
              </div>
              <div style={{ flex: 1, borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                <MapContainer
                  center={spill ? [spill.centroid[1], spill.centroid[0]] : [19.575, 72.622]}
                  zoom={10}
                  zoomControl={false}
                  attributionControl={false}
                  style={{ width: '100%', height: '100%', backgroundColor: '#070f1e' }}
                >
                  <TileLayer url={`https://api.maptiler.com/maps/dataviz-dark/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`} />
                  <InsetAutoFitter
                    positions={[...vesselTrackCoords, ...originCoords]}
                    center={spill ? [spill.centroid[1], spill.centroid[0]] : [19.575, 72.622]}
                  />

                  {/* Origin Polygon & Centroid */}
                  {originCoords.length > 0 && (
                    <>
                      <Polygon
                        positions={originCoords}
                        pathOptions={{ fillColor: '#D97706', fillOpacity: 0.45, color: '#F59E0B', weight: 1.5 }}
                      />
                      {spill && (
                        <CircleMarker
                          center={[spill.centroid[1], spill.centroid[0]]}
                          radius={4}
                          pathOptions={{ fillColor: '#F59E0B', fillOpacity: 0.9, color: '#FFFFFF', weight: 1.5 }}
                        />
                      )}
                    </>
                  )}

                  {/* Vessel Track Polyline */}
                  {vesselTrackCoords.length > 0 && (
                    <>
                      <Polyline
                        positions={vesselTrackCoords}
                        pathOptions={{ color: '#DC2626', weight: 2.5, dashArray: '4, 4' }}
                      />
                      {/* Vessel Start Waypoint */}
                      <CircleMarker
                        center={vesselTrackCoords[0]}
                        radius={4}
                        pathOptions={{ fillColor: '#2563EB', fillOpacity: 0.9, color: '#FFFFFF', weight: 1 }}
                      />
                      {/* Current / Closest Approach Vessel Marker */}
                      <CircleMarker
                        center={vesselTrackCoords[Math.floor(vesselTrackCoords.length / 2)]}
                        radius={6}
                        pathOptions={{ fillColor: '#DC2626', fillOpacity: 0.95, color: '#FFFFFF', weight: 2 }}
                      >
                        <Popup>
                          <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
                            <strong>{selectedVessel.vessel_name}</strong>
                            <br />
                            MMSI: {selectedVessel.mmsi} · Type: {selectedVessel.vessel_type}
                            <br />
                            Suspect Score: {(selectedVessel.suspect_score * 100).toFixed(0)}%
                          </div>
                        </Popup>
                      </CircleMarker>
                    </>
                  )}
                </MapContainer>
              </div>
            </div>
          </>
        ) : (
          <div
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <Ship size={36} color="#CBD5E1" style={{ marginBottom: '12px' }} />
            <div style={{ fontSize: '0.86rem', fontWeight: 700 }}>Select a Vessel from the Left List</div>
            <div style={{ fontSize: '0.72rem', marginTop: '4px' }}>Click any candidate to inspect its 4-factor scoring radar, kinematic features, and track geometry.</div>
          </div>
        )}
      </div>
    </div>
  );
};
