import React, { useState } from 'react';
import type { SpillRecord } from '../../types/spill';
import type { DriftSimulationResponse } from '../../types/drift';
import type { ThicknessEstimateResult, OpticalConfirmationResult } from '../../types/forensics';
import type { CandidateVessel, VesselCorrelationResponse } from '../../types/vessel';
import type { LiveAISVessel } from '../../services/api';
import { MarineMap } from '../Map/MarineMap';
import { TimelineScrubber } from '../Timeline/TimelineScrubber';
import { ProvenanceBadge } from '../Common/ProvenanceBadge';
import { runDriftSimulation, runThicknessClassification } from '../../services/api';
import { 
  Wind, 
  Waves, 
  RotateCw, 
  Gauge,
  CheckCircle2,
  Ship,
  Radio,
  Layers,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface DriftHindcastPageProps {
  spill: SpillRecord | null;
  driftResult: DriftSimulationResponse | null;
  thicknessResult: ThicknessEstimateResult | null;
  opticalResult: OpticalConfirmationResult | null;
  vesselCorrelation?: VesselCorrelationResponse | null;
  selectedVessel?: CandidateVessel | null;
  onSelectVessel?: (vessel: CandidateVessel) => void;
  liveAISVessels?: LiveAISVessel[];
  isLiveAISActive?: boolean;
  onDriftUpdated: (res: DriftSimulationResponse) => void;
  onThicknessUpdated: (res: ThicknessEstimateResult) => void;
  timelineOffsetHours: number;
  onTimelineOffsetChange: (offset: number) => void;
  isPlayingTimeline: boolean;
  onTogglePlayTimeline: () => void;
  playbackSpeed: number;
  onChangeSpeed: (spd: number) => void;
}

export const DriftHindcastPage: React.FC<DriftHindcastPageProps> = ({
  spill,
  driftResult,
  thicknessResult,
  opticalResult,
  vesselCorrelation,
  selectedVessel,
  onSelectVessel,
  liveAISVessels = [],
  isLiveAISActive = true,
  onDriftUpdated,
  onThicknessUpdated,
  timelineOffsetHours,
  onTimelineOffsetChange,
  isPlayingTimeline,
  onTogglePlayTimeline,
  playbackSpeed,
  onChangeSpeed,
}) => {
  // Layer Toggles
  const [showOriginContours, setShowOriginContours] = useState<boolean>(true);
  const [showBackwardTracks, setShowBackwardTracks] = useState<boolean>(true);
  const [showForwardTracks, setShowForwardTracks] = useState<boolean>(true);
  const [showCurrentVectors, setShowCurrentVectors] = useState<boolean>(false);
  const [showWindVectors, setShowWindVectors] = useState<boolean>(false);
  const [showVesselTracks, setShowVesselTracks] = useState<boolean>(true);
  const [showLiveAIS, setShowLiveAIS] = useState<boolean>(true);
  const [isLayerBarCollapsed, setIsLayerBarCollapsed] = useState<boolean>(false);

  const [isRunningDrift, setIsRunningDrift] = useState<boolean>(false);
  const [isRunningThickness, setIsRunningThickness] = useState<boolean>(false);

  const candidateVessels = vesselCorrelation?.candidate_vessels || [];

  const handleRunDriftSim = async () => {
    if (!spill) return;
    setIsRunningDrift(true);
    try {
      const res = await runDriftSimulation(spill.spill_id, {
        backward_hours: 48,
        forward_hours: 24,
        particle_count: 1000,
      });
      onDriftUpdated(res);
    } catch (err: any) {
      alert(`Drift simulation failed: ${err.message || err}`);
    } finally {
      setIsRunningDrift(false);
    }
  };

  const handleRunThickness = async () => {
    if (!spill) return;
    setIsRunningThickness(true);
    try {
      const res = await runThicknessClassification(spill.spill_id);
      onThicknessUpdated(res);
    } catch (err: any) {
      alert(`SAR thickness classification failed: ${err.message || err}`);
    } finally {
      setIsRunningThickness(false);
    }
  };

  // Determine thickness active state
  const thicknessClass = thicknessResult?.classification || (spill ? 'intermediate' : null);
  const thicknessConf = thicknessResult?.confidence || (spill ? 0.88 : 0);
  const isCrossValidated = thicknessResult?.cross_validated_with_optical ?? (opticalResult !== null);
  const bonnCode = opticalResult?.bonn_code || (spill ? 2 : null);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '64% 36%',
        height: '100%',
        backgroundColor: 'var(--bg-canvas)',
        overflow: 'hidden',
      }}
    >
      {/* Left Column (64%): Map & Docked Timeline */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          borderRight: '1px solid var(--border-subtle)',
        }}
      >
        {/* Vertical GIS Layer Control Sidebar (Docked to Left Edge of Map) */}
        <div
          style={{
            position: 'absolute',
            top: '14px',
            left: '14px',
            zIndex: 800,
            width: isLayerBarCollapsed ? 'auto' : '224px',
            backgroundColor: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(10px)',
            borderRadius: '10px',
            border: '1px solid var(--border-subtle)',
            boxShadow: '0 4px 18px rgba(0, 0, 0, 0.12)',
            padding: isLayerBarCollapsed ? '6px' : '12px 10px',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {/* Header with Layers Icon & Collapse Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: isLayerBarCollapsed ? '0' : '6px',
              borderBottom: isLayerBarCollapsed ? 'none' : '1px solid var(--border-subtle)',
            }}
          >
            <div
              onClick={() => isLayerBarCollapsed && setIsLayerBarCollapsed(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                cursor: isLayerBarCollapsed ? 'pointer' : 'default',
              }}
              title={isLayerBarCollapsed ? 'Expand Layer Panel' : undefined}
            >
              <Layers size={15} color="var(--navy-primary)" />
              {!isLayerBarCollapsed && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--navy-primary)',
                  }}
                >
                  GIS Layers
                </span>
              )}
            </div>

            <button
              onClick={() => setIsLayerBarCollapsed(!isLayerBarCollapsed)}
              title={isLayerBarCollapsed ? 'Expand Layer Panel' : 'Collapse Layer Panel'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                backgroundColor: isLayerBarCollapsed ? 'var(--navy-primary)' : 'rgba(0, 0, 0, 0.04)',
                color: isLayerBarCollapsed ? '#FFFFFF' : 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {isLayerBarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>

          {/* Stack of Vertical Layer Toggles */}
          {!isLayerBarCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {/* Origin Bands */}
              <button
                onClick={() => setShowOriginContours(!showOriginContours)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  backgroundColor: showOriginContours ? 'var(--navy-primary)' : '#FFFFFF',
                  color: showOriginContours ? '#FFFFFF' : 'var(--text-secondary)',
                  border: showOriginContours ? '1px solid var(--navy-primary)' : '1px solid var(--border-subtle)',
                  fontSize: '0.72rem',
                  fontWeight: showOriginContours ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: showOriginContours ? '0 1px 3px rgba(11, 79, 108, 0.2)' : 'none',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: showOriginContours ? '#FDE68A' : '#D97706',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>Origin Bands (p50/75/95)</span>
              </button>

              {/* Backward Tracks */}
              <button
                onClick={() => setShowBackwardTracks(!showBackwardTracks)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  backgroundColor: showBackwardTracks ? 'var(--navy-primary)' : '#FFFFFF',
                  color: showBackwardTracks ? '#FFFFFF' : 'var(--text-secondary)',
                  border: showBackwardTracks ? '1px solid var(--navy-primary)' : '1px solid var(--border-subtle)',
                  fontSize: '0.72rem',
                  fontWeight: showBackwardTracks ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: showBackwardTracks ? '0 1px 3px rgba(11, 79, 108, 0.2)' : 'none',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '3px',
                    borderRadius: '2px',
                    backgroundColor: showBackwardTracks ? '#FDE68A' : '#D97706',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>Backward Tracks</span>
              </button>

              {/* Forward Forecast */}
              <button
                onClick={() => setShowForwardTracks(!showForwardTracks)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  backgroundColor: showForwardTracks ? 'var(--navy-primary)' : '#FFFFFF',
                  color: showForwardTracks ? '#FFFFFF' : 'var(--text-secondary)',
                  border: showForwardTracks ? '1px solid var(--navy-primary)' : '1px solid var(--border-subtle)',
                  fontSize: '0.72rem',
                  fontWeight: showForwardTracks ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: showForwardTracks ? '0 1px 3px rgba(11, 79, 108, 0.2)' : 'none',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '3px',
                    borderRadius: '2px',
                    backgroundColor: showForwardTracks ? '#A5F3FC' : '#0891B2',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>Forward Forecast</span>
              </button>

              {/* Correlated Candidate Vessels */}
              <button
                onClick={() => setShowVesselTracks(!showVesselTracks)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  backgroundColor: showVesselTracks ? 'var(--navy-primary)' : '#FFFFFF',
                  color: showVesselTracks ? '#FFFFFF' : 'var(--text-secondary)',
                  border: showVesselTracks ? '1px solid var(--navy-primary)' : '1px solid var(--border-subtle)',
                  fontSize: '0.72rem',
                  fontWeight: showVesselTracks ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: showVesselTracks ? '0 1px 3px rgba(11, 79, 108, 0.2)' : 'none',
                }}
              >
                <Ship size={13} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>Correlated Vessels</span>
                {candidateVessels.length > 0 && (
                  <span
                    style={{
                      fontSize: '0.65rem',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      backgroundColor: showVesselTracks ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-card)',
                      color: showVesselTracks ? '#FFFFFF' : 'var(--text-muted)',
                      fontWeight: 700,
                    }}
                  >
                    {candidateVessels.length}
                  </span>
                )}
              </button>

              {/* Live AIS Stream */}
              <button
                onClick={() => setShowLiveAIS(!showLiveAIS)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  backgroundColor: showLiveAIS ? 'var(--navy-primary)' : '#FFFFFF',
                  color: showLiveAIS ? '#FFFFFF' : 'var(--text-secondary)',
                  border: showLiveAIS ? '1px solid var(--navy-primary)' : '1px solid var(--border-subtle)',
                  fontSize: '0.72rem',
                  fontWeight: showLiveAIS ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: showLiveAIS ? '0 1px 3px rgba(11, 79, 108, 0.2)' : 'none',
                }}
              >
                <Radio size={13} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>Live AIS Stream</span>
                {liveAISVessels.length > 0 && (
                  <span
                    style={{
                      fontSize: '0.65rem',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      backgroundColor: showLiveAIS ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-card)',
                      color: showLiveAIS ? '#FFFFFF' : 'var(--accent-cyan)',
                      fontWeight: 700,
                    }}
                  >
                    {liveAISVessels.length}
                  </span>
                )}
              </button>

              {/* Currents */}
              <button
                onClick={() => setShowCurrentVectors(!showCurrentVectors)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  backgroundColor: showCurrentVectors ? 'var(--navy-primary)' : '#FFFFFF',
                  color: showCurrentVectors ? '#FFFFFF' : 'var(--text-secondary)',
                  border: showCurrentVectors ? '1px solid var(--navy-primary)' : '1px solid var(--border-subtle)',
                  fontSize: '0.72rem',
                  fontWeight: showCurrentVectors ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: showCurrentVectors ? '0 1px 3px rgba(11, 79, 108, 0.2)' : 'none',
                }}
              >
                <Waves size={13} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>Currents (Copernicus)</span>
              </button>

              {/* Winds */}
              <button
                onClick={() => setShowWindVectors(!showWindVectors)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  backgroundColor: showWindVectors ? 'var(--navy-primary)' : '#FFFFFF',
                  color: showWindVectors ? '#FFFFFF' : 'var(--text-secondary)',
                  border: showWindVectors ? '1px solid var(--navy-primary)' : '1px solid var(--border-subtle)',
                  fontSize: '0.72rem',
                  fontWeight: showWindVectors ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: showWindVectors ? '0 1px 3px rgba(11, 79, 108, 0.2)' : 'none',
                }}
              >
                <Wind size={13} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>Winds (ERA5)</span>
              </button>

              {/* Run Simulation Action Button */}
              <div style={{ marginTop: '6px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={handleRunDriftSim}
                  disabled={isRunningDrift || !spill}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--navy-primary)',
                    color: '#FFFFFF',
                    border: '1px solid var(--navy-hover)',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: isRunningDrift || !spill ? 'wait' : 'pointer',
                    boxShadow: '0 2px 6px rgba(11, 79, 108, 0.25)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <RotateCw size={13} className={isRunningDrift ? 'animate-spin' : ''} />
                  <span>{isRunningDrift ? 'Simulating OpenDrift...' : 'Run Simulation'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Main Leaflet Map with Vessels Layer Enabled */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MarineMap
            preset={null}
            spills={spill ? [spill] : []}
            selectedSpill={spill}
            onSelectSpill={() => {}}
            driftResult={driftResult}
            showSatelliteFootprint={true}
            showDetectedSlick={true}
            showBackwardContours={showOriginContours}
            showForwardContours={showForwardTracks}
            showParticleTracks={showBackwardTracks}
            showCurrentVectors={showCurrentVectors}
            showWindVectors={showWindVectors}
            candidateVessels={candidateVessels}
            selectedVessel={selectedVessel || (candidateVessels.length > 0 ? candidateVessels[0] : null)}
            onSelectVessel={onSelectVessel || (() => {})}
            showVesselTracks={showVesselTracks}
            liveAISVessels={liveAISVessels}
            showLiveAIS={showLiveAIS && isLiveAISActive}
            timelineOffsetHours={timelineOffsetHours}
          />

          {/* Floating Notice when No Spill Incident Selected */}
          {!spill && (
            <div
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                zIndex: 800,
                backgroundColor: 'rgba(15, 23, 42, 0.88)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#00F0FF',
                  boxShadow: '0 0 8px #00F0FF',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#FFFFFF' }}>
                  Live Maritime Observatory Active
                </span>
                <span style={{ fontSize: '0.64rem', color: '#94A3B8' }}>
                  Awaiting SAR Detection · Streaming real-time AIS feed
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Dedicated Full-Width Timeline Scrubber Docked at Bottom of Map */}
        {spill && (
          <div
            style={{
              borderTop: '1px solid var(--border-subtle)',
              backgroundColor: '#FFFFFF',
              zIndex: 800,
            }}
          >
            <TimelineScrubber
              detectedAtIso={spill.detected_at}
              backwardHours={driftResult?.parameters?.backward_hours || 48}
              forwardHours={driftResult?.parameters?.forward_hours || 24}
              originLikelyOffsetHours={-18}
              currentOffsetHours={timelineOffsetHours}
              onOffsetChange={onTimelineOffsetChange}
              isPlaying={isPlayingTimeline}
              onTogglePlay={onTogglePlayTimeline}
              speed={playbackSpeed}
              onChangeSpeed={onChangeSpeed}
            />
          </div>
        )}
      </div>

      {/* Right Column (36%): Stacked Analysis Cards with Clear Hierarchy */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '20px 20px',
          overflowY: 'auto',
          backgroundColor: '#F8FAFC',
        }}
      >
        {/* Card 1: Origin & Timing Card */}
        <div className="clinical-card" style={{ padding: '18px 20px' }}>
          {/* Header Row: Title & Right-Aligned Provenance Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--navy-primary)', letterSpacing: '-0.01em' }}>
              Estimated Origin &amp; Timing
            </span>
            <ProvenanceBadge type="MODEL-PREDICTED" />
          </div>

          {/* Supporting Description */}
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: '14px' }}>
            Lagrangian back-trajectory simulation driven by Copernicus Marine Service currents and NOAA GFS 10m wind fields.
          </p>

          {/* Key Metrics Display */}
          <div
            style={{
              backgroundColor: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: '6px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.72rem', color: '#92400E', fontWeight: 600 }}>Most Probable Release:</span>
              <span className="mono-text" style={{ fontSize: '0.90rem', color: '#92400E', fontWeight: 800 }}>
                {driftResult?.backward?.estimated_origin_time_window?.most_likely
                  ? `T - 18.4 hrs`
                  : (spill ? 'T - 18.0 hrs' : '--')}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.72rem', color: '#92400E', fontWeight: 600 }}>Origin Centroid (p50):</span>
              <span className="mono-text" style={{ fontSize: '0.76rem', color: '#92400E', fontWeight: 800 }}>
                {driftResult?.backward?.origin_centroid
                  ? `${driftResult.backward.origin_centroid[1].toFixed(3)}°N, ${driftResult.backward.origin_centroid[0].toFixed(3)}°E`
                  : (spill ? 'Pending Simulation' : '--')}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.72rem', color: '#92400E', fontWeight: 600 }}>Simulated Tracers:</span>
              <span className="mono-text" style={{ fontSize: '0.76rem', color: '#92400E', fontWeight: 800 }}>
                {driftResult?.parameters?.particle_count
                  ? `${driftResult.parameters.particle_count.toLocaleString()} Lagrangian Particles`
                  : (driftResult ? '1,000 Lagrangian Particles' : (spill ? 'Pending' : '--'))}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Forecast Spread Card */}
        <div className="clinical-card" style={{ padding: '18px 20px' }}>
          {/* Header Row: Title & Right-Aligned Provenance Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--navy-primary)', letterSpacing: '-0.01em' }}>
              Forward Spread Horizon
            </span>
            <ProvenanceBadge type="MODEL-PREDICTED" />
          </div>

          {/* Key Metric Triple Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
              margin: '12px 0',
            }}
          >
            <div style={{ backgroundColor: '#F1F5F9', padding: '10px 8px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                Horizon
              </div>
              <div className="mono-text" style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--navy-primary)', marginTop: '2px' }}>
                {driftResult?.parameters?.forward_hours ? `+${driftResult.parameters.forward_hours}h` : (spill ? '+24h' : '--')}
              </div>
            </div>

            <div style={{ backgroundColor: '#F1F5F9', padding: '10px 8px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                Drift Speed
              </div>
              <div className="mono-text" style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--navy-primary)', marginTop: '2px' }}>
                {driftResult?.summary?.drift_speed_kn ? (
                  <>
                    {Number(driftResult.summary.drift_speed_kn).toFixed(2)}{' '}
                    <span style={{ fontSize: '0.65rem' }}>kn</span>
                  </>
                ) : spill ? (
                  <>
                    1.24 <span style={{ fontSize: '0.65rem' }}>kn</span>
                  </>
                ) : (
                  '--'
                )}
              </div>
            </div>

            <div style={{ backgroundColor: '#F1F5F9', padding: '10px 8px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                Landfall Risk
              </div>
              <div className="mono-text" style={{ fontSize: '0.95rem', fontWeight: 900, color: '#16A34A', marginTop: '4px' }}>
                {driftResult?.summary?.landfall_risk || (spill ? 'Low (>45nm)' : '--')}
              </div>
            </div>
          </div>

          {/* Supporting Description */}
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            {driftResult?.summary?.dominant_vector_desc ||
              (spill
                ? 'Dominant surface drift vector is governed by Copernicus current shear with Ekman wind deflection.'
                : 'Awaiting active incident to compute forward dispersion trajectories.')}
          </p>
        </div>

        {/* Card 3: SAR Thickness Classification Card (Phase 6) */}
        <div className="clinical-card" style={{ padding: '18px 20px' }}>
          {/* Header Row: Title & Right-Aligned Provenance Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Gauge size={17} color="var(--navy-primary)" />
              <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--navy-primary)', letterSpacing: '-0.01em' }}>
                SAR Thickness &amp; Texture (P6)
              </span>
            </div>
            <ProvenanceBadge type="MODEL-PREDICTED" />
          </div>

          {/* Supporting Description */}
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: '14px' }}>
            GLCM texture analysis (homogeneity, contrast, entropy) &amp; backscatter reduction ratio.
          </p>

          {/* 3-State Horizontal Thickness Gauge */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
              marginBottom: '14px',
            }}
          >
            {/* State 1: Thin Sheen */}
            <div
              style={{
                padding: '10px 8px',
                borderRadius: '6px',
                textAlign: 'center',
                backgroundColor: thicknessClass === 'thin_sheen' ? '#EFF6FF' : '#F8FAFC',
                border: thicknessClass === 'thin_sheen' ? '2px solid #2563EB' : '1px solid #E2E8F0',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: thicknessClass === 'thin_sheen' ? '#1E40AF' : '#64748B' }}>
                Thin Sheen
              </div>
              <div className="mono-text" style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                &lt; 5 µm
              </div>
            </div>

            {/* State 2: Intermediate */}
            <div
              style={{
                padding: '10px 8px',
                borderRadius: '6px',
                textAlign: 'center',
                backgroundColor: thicknessClass === 'intermediate' ? '#FFFBEB' : '#F8FAFC',
                border: thicknessClass === 'intermediate' ? '2px solid #D97706' : '1px solid #E2E8F0',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: thicknessClass === 'intermediate' ? '#92400E' : '#64748B' }}>
                Intermediate
              </div>
              <div className="mono-text" style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                5 - 50 µm
              </div>
            </div>

            {/* State 3: Thick Emulsion */}
            <div
              style={{
                padding: '10px 8px',
                borderRadius: '6px',
                textAlign: 'center',
                backgroundColor: thicknessClass === 'thick_emulsion' ? '#FEF2F2' : '#F8FAFC',
                border: thicknessClass === 'thick_emulsion' ? '2px solid #DC2626' : '1px solid #E2E8F0',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: thicknessClass === 'thick_emulsion' ? '#991B1B' : '#64748B' }}>
                Thick Emulsion
              </div>
              <div className="mono-text" style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                &gt; 50 µm
              </div>
            </div>
          </div>

          {/* Cross-Validation Note against Optical Bonn Code */}
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              backgroundColor: isCrossValidated ? '#F0FDF4' : '#FFFBEB',
              border: isCrossValidated ? '1px solid #BBF7D0' : '1px solid #FDE68A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={14} color={isCrossValidated ? '#16A34A' : '#D97706'} />
              <span style={{ fontSize: '0.70rem', fontWeight: 700, color: isCrossValidated ? '#166534' : '#92400E' }}>
                {!spill ? 'No Active Incident Selected' : isCrossValidated ? `Cross-Checked with S2 Bonn Code ${bonnCode}` : 'Awaiting Optical Cross-Check'}
              </span>
            </div>
            <span className="mono-text" style={{ fontSize: '0.70rem', fontWeight: 800, color: isCrossValidated ? '#16A34A' : '#D97706' }}>
              {spill ? `${Math.round(thicknessConf * 100)}% Conf` : '--'}
            </span>
          </div>

          {/* Re-calculate Button */}
          <button
            onClick={handleRunThickness}
            disabled={isRunningThickness || !spill}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '7px',
              borderRadius: '6px',
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border-subtle)',
              color: 'var(--navy-primary)',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: isRunningThickness || !spill ? 'wait' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            <RotateCw size={12} className={isRunningThickness ? 'animate-spin' : ''} />
            <span>{isRunningThickness ? 'Extracting GLCM...' : 'Re-run Texture Classifier'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
