import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  ArrowLeft, 
  Database, 
  Calendar, 
  MapPin, 
  Radar, 
  Waves, 
  ShieldAlert, 
  Activity
} from 'lucide-react';
import { 
  getTestingDatasets, 
  getTestingSpillBundle, 
  type ValidationDatasetMetadata,
  type LiveAISVessel 
} from '../../services/api';
import type { AssembledSpillData } from '../../types/spill';
import { DetectionFusionPage } from './DetectionFusionPage';
import { DriftHindcastPage } from './DriftHindcastPage';
import { AttributionPage } from './AttributionPage';
import { TelemetryEvidencePage } from './TelemetryEvidencePage';
import type { CandidateVessel } from '../../types/vessel';

export type TestingSubTab = 'detection-fusion' | 'drift-hindcast' | 'attribution' | 'telemetry-evidence';

interface TestingPageProps {
  onReturnToLive: () => void;
  liveAISVessels: LiveAISVessel[];
  isLiveAISActive: boolean;
}

export const TestingPage: React.FC<TestingPageProps> = ({
  onReturnToLive,
  liveAISVessels,
  isLiveAISActive,
}) => {
  const [datasets, setDatasets] = useState<ValidationDatasetMetadata[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>('');
  const [bundle, setBundle] = useState<AssembledSpillData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeSubTab, setActiveSubTab] = useState<TestingSubTab>('detection-fusion');

  // Interactive state within testing mode
  const [selectedVessel, setSelectedVessel] = useState<CandidateVessel | null>(null);
  const [timelineOffsetHours, setTimelineOffsetHours] = useState<number>(0);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // Load available validation datasets on mount
  useEffect(() => {
    setIsLoading(true);
    getTestingDatasets()
      .then((data) => {
        setDatasets(data);
        if (data.length > 0) {
          setSelectedFixtureId(data[0].fixture_id);
        }
      })
      .catch((err) => console.error('Failed to fetch testing datasets:', err))
      .finally(() => setIsLoading(false));
  }, []);

  // Fetch full bundle whenever selected fixture changes
  useEffect(() => {
    if (!selectedFixtureId) return;
    setIsLoading(true);
    getTestingSpillBundle(selectedFixtureId)
      .then((res) => {
        setBundle(res);
        if (res.vessels?.candidate_vessels && res.vessels.candidate_vessels.length > 0) {
          setSelectedVessel(res.vessels.candidate_vessels[0]);
        }
      })
      .catch((err) => console.error(`Failed to load fixture bundle ${selectedFixtureId}:`, err))
      .finally(() => setIsLoading(false));
  }, [selectedFixtureId]);

  const activeMeta = datasets.find((d) => d.fixture_id === selectedFixtureId);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--bg-canvas)',
        overflow: 'hidden',
      }}
    >
      {/* 1. PERSISTENT FULL-WIDTH TEST DATA WARNING BANNER */}
      <div
        style={{
          backgroundColor: '#FEF3C7',
          borderBottom: '2px solid #F59E0B',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 890,
          boxShadow: '0 2px 4px rgba(245, 158, 11, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              padding: '6px',
              backgroundColor: '#F59E0B',
              color: '#FFFFFF',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={18} strokeWidth={2.5} />
          </div>
          <div>
            <div
              style={{
                fontSize: '0.82rem',
                fontWeight: 800,
                color: '#92400E',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-mono)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>TEST DATA / HISTORICAL VALIDATION MODE</span>
              <span
                style={{
                  fontSize: '0.62rem',
                  padding: '1px 6px',
                  backgroundColor: '#B45309',
                  color: '#FFFFFF',
                  borderRadius: '4px',
                  fontWeight: 700,
                }}
              >
                ISOLATED ENVIRONMENT
              </span>
            </div>
            <div
              style={{
                fontSize: '0.70rem',
                color: '#78350F',
                marginTop: '1px',
              }}
            >
              You are inspecting pre-computed historical validation fixtures. Live external feeds and real-time operations are strictly decoupled.
            </div>
          </div>
        </div>

        {/* Return to Live Dashboard CTA Button */}
        <button
          onClick={onReturnToLive}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--navy-primary)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(11, 79, 108, 0.3)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#083344')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--navy-primary)')}
        >
          <ArrowLeft size={16} strokeWidth={2.5} />
          <span>Return to Live Dashboard</span>
        </button>
      </div>

      {/* 2. FIXTURE SELECTION TOOLBAR */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Database size={15} color="var(--navy-primary)" />
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-mono)',
              }}
            >
              SELECT VALIDATION FIXTURE:
            </span>
          </div>

          <select
            value={selectedFixtureId}
            onChange={(e) => setSelectedFixtureId(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #D97706',
              backgroundColor: '#FFFBEB',
              color: '#92400E',
              fontSize: '0.78rem',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              outline: 'none',
              minWidth: '320px',
            }}
          >
            {datasets.map((d) => (
              <option key={d.fixture_id} value={d.fixture_id}>
                {d.title} ({d.region})
              </option>
            ))}
          </select>
        </div>

        {/* Dataset Meta Chips */}
        {activeMeta && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.68rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                backgroundColor: '#F1F5F9',
                padding: '3px 8px',
                borderRadius: '4px',
                border: '1px solid #E2E8F0',
              }}
            >
              <MapPin size={12} color="var(--navy-primary)" />
              <span>{activeMeta.region}</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.68rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                backgroundColor: '#F1F5F9',
                padding: '3px 8px',
                borderRadius: '4px',
                border: '1px solid #E2E8F0',
              }}
            >
              <Calendar size={12} color="var(--navy-primary)" />
              <span>{new Date(activeMeta.incident_date).toLocaleDateString()}</span>
            </div>

            {activeMeta.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: '0.64rem',
                  fontWeight: 700,
                  color: '#92400E',
                  backgroundColor: '#FEF3C7',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  border: '1px solid #FDE68A',
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 3. SUB-VIEW TABS REUSING DASHBOARD VIEWS */}
      <div
        style={{
          backgroundColor: '#F8FAFC',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0 20px',
          display: 'flex',
          gap: '4px',
        }}
      >
        {[
          { id: 'detection-fusion', label: '1. Detection & Optical Fusion', icon: Radar },
          { id: 'drift-hindcast', label: '2. Drift & SAR Thickness', icon: Waves },
          { id: 'attribution', label: '3. AIS Vessel ML Attribution', icon: ShieldAlert },
          { id: 'telemetry-evidence', label: '4. Forensic Evidence Ledger', icon: Activity },
        ].map((tab) => {
          const isActive = activeSubTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as TestingSubTab)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '10px 16px',
                backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--navy-primary)' : '2px solid transparent',
                color: isActive ? 'var(--navy-primary)' : 'var(--text-secondary)',
                fontSize: '0.74rem',
                fontWeight: isActive ? 800 : 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 4. MAIN EMBEDDED DASHBOARD CONTAINER (REUSING COMPONENTS) */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 900,
              gap: '12px',
            }}
          >
            <div className="spinner" style={{ width: '32px', height: '32px', borderColor: '#F59E0B', borderTopColor: 'transparent' }} />
            <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#92400E' }}>
              Loading Historical Validation Bundle...
            </div>
          </div>
        )}

        {bundle && (
          <>
            {activeSubTab === 'detection-fusion' && (
              <DetectionFusionPage
                spill={bundle.spill}
                opticalResult={bundle.optical || null}
                onOpticalUpdated={() => {
                  // Read-only in testing view
                }}
              />
            )}

            {activeSubTab === 'drift-hindcast' && (
              <DriftHindcastPage
                spill={bundle.spill}
                driftResult={bundle.drift || null}
                thicknessResult={bundle.sar_thickness || null}
                opticalResult={bundle.optical || null}
                vesselCorrelation={bundle.vessels || null}
                selectedVessel={selectedVessel}
                onSelectVessel={setSelectedVessel}
                liveAISVessels={liveAISVessels}
                isLiveAISActive={isLiveAISActive}
                onDriftUpdated={() => {}}
                onThicknessUpdated={() => {}}
                timelineOffsetHours={timelineOffsetHours}
                onTimelineOffsetChange={setTimelineOffsetHours}
                isPlayingTimeline={isPlayingTimeline}
                onTogglePlayTimeline={() => setIsPlayingTimeline(!isPlayingTimeline)}
                playbackSpeed={playbackSpeed}
                onChangeSpeed={setPlaybackSpeed}
              />
            )}

            {activeSubTab === 'attribution' && (
              <AttributionPage
                spill={bundle.spill}
                vesselCorrelation={bundle.vessels || null}
                selectedVessel={selectedVessel}
                onSelectVessel={setSelectedVessel}
                onRunAttribution={() => {}}
                isRunningAttribution={false}
              />
            )}

            {activeSubTab === 'telemetry-evidence' && (
              <TelemetryEvidencePage
                spill={bundle.spill}
                opticalResult={bundle.optical || null}
                thicknessResult={bundle.sar_thickness || null}
                vesselCorrelation={bundle.vessels || null}
                totalSpillsCount={datasets.length}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};
