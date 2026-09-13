import { useEffect, useState, useRef, useCallback } from 'react';
import { Sidebar, type AppPage } from './components/Navigation/Sidebar';
import { TopBar } from './components/Navigation/TopBar';
import { DetectionFusionPage } from './components/Pages/DetectionFusionPage';
import { DriftHindcastPage } from './components/Pages/DriftHindcastPage';
import { AttributionPage } from './components/Pages/AttributionPage';
import { TelemetryEvidencePage } from './components/Pages/TelemetryEvidencePage';
import {
  checkHealth,
  detectSpills,
  getPresets,
  getSpills,
  correlateVessels,
  getAssembledSpill,
  getLiveAISVessels,
  type LiveAISVessel,
} from './services/api';
import type { DriftSimulationResponse } from './types/drift';
import type { PresetAOI, SpillRecord, SystemHealth } from './types/spill';
import type { OpticalConfirmationResult, ThicknessEstimateResult } from './types/forensics';
import type { CandidateVessel, VesselCorrelationResponse } from './types/vessel';

export function App() {
  // Navigation
  const [activePage, setActivePage] = useState<AppPage>('detection-fusion');

  // Backend Health & Presets
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [, setPresets] = useState<PresetAOI[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<PresetAOI | null>(null);

  // Spills & Active Incident
  const [spills, setSpills] = useState<SpillRecord[]>([]);
  const [selectedSpill, setSelectedSpill] = useState<SpillRecord | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // Phase 2 Drift State
  const [driftResult, setDriftResult] = useState<DriftSimulationResponse | null>(null);

  // Phase 3 Vessel Attribution State
  const [vesselCorrelation, setVesselCorrelation] = useState<VesselCorrelationResponse | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<CandidateVessel | null>(null);
  const [isRunningVessels, setIsRunningVessels] = useState<boolean>(false);

  // Phase 5 + 6 Forensics State
  const [opticalResult, setOpticalResult] = useState<OpticalConfirmationResult | null>(null);
  const [thicknessResult, setThicknessResult] = useState<ThicknessEstimateResult | null>(null);

  // Real-time Live AIS Stream (AISStream.io)
  const [isLiveAISActive, setIsLiveAISActive] = useState<boolean>(true);
  const [liveAISVessels, setLiveAISVessels] = useState<LiveAISVessel[]>([]);

  // Timeline Scrubber State (for Drift & Hindcast)
  const [timelineOffsetHours, setTimelineOffsetHours] = useState<number>(0);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const animationTimerRef = useRef<any>(null);

  // Hydrate full incident assembly via GET /spill/{id}
  const handleSelectSpillAndHydrate = useCallback(async (spill: SpillRecord) => {
    setSelectedSpill(spill);
    setOpticalResult(null);
    setThicknessResult(null);
    try {
      const full = await getAssembledSpill(spill.spill_id);
      if (full.drift) setDriftResult(full.drift);
      if (full.vessels) {
        setVesselCorrelation(full.vessels);
        if (full.vessels.candidate_vessels?.length > 0) {
          setSelectedVessel(full.vessels.candidate_vessels[0]);
        }
      }
      if (full.optical) setOpticalResult(full.optical);
      if (full.sar_thickness) setThicknessResult(full.sar_thickness);
    } catch (err) {
      console.warn('Full assembly auto-fetch warning:', err);
    }
  }, []);

  // Polling Live AIS stream
  useEffect(() => {
    if (!isLiveAISActive) return;
    const fetchLiveVessels = () => {
      getLiveAISVessels(selectedPreset?.bbox as [number, number, number, number] | undefined, 150)
        .then((vessels) => {
          if (vessels && vessels.length > 0) {
            setLiveAISVessels(vessels);
          }
        })
        .catch((err) => console.debug('Live AIS polling:', err));
    };

    fetchLiveVessels();
    const timer = setInterval(fetchLiveVessels, 4000);
    return () => clearInterval(timer);
  }, [isLiveAISActive, selectedPreset]);

  // Initial Load: Health, Presets, and Existing Spills
  useEffect(() => {
    checkHealth()
      .then((h) => setHealth(h))
      .catch((err) => console.warn('Health check warning:', err));

    getPresets()
      .then((presetList) => {
        setPresets(presetList);
        if (presetList.length > 0) {
          setSelectedPreset(presetList[0]);
        }
      })
      .catch((err) => console.error('Failed to load presets:', err));

    getSpills()
      .then((existingSpills) => {
        if (existingSpills.length > 0) {
          setSpills(existingSpills);
          handleSelectSpillAndHydrate(existingSpills[0]);
        }
      })
      .catch((err) => console.error('Failed to load initial spills:', err));
  }, [handleSelectSpillAndHydrate]);

  // Timeline Animation Loop
  useEffect(() => {
    if (isPlayingTimeline) {
      animationTimerRef.current = setInterval(() => {
        setTimelineOffsetHours((prev) => {
          const next = prev + 0.5 * playbackSpeed;
          if (next > 24) {
            setIsPlayingTimeline(false);
            return 24;
          }
          return next;
        });
      }, 400);
    } else {
      if (animationTimerRef.current) clearInterval(animationTimerRef.current);
    }
    return () => {
      if (animationTimerRef.current) clearInterval(animationTimerRef.current);
    };
  }, [isPlayingTimeline, playbackSpeed]);


  // Run New SAR Detection Scan
  const handleTriggerNewScan = async () => {
    if (!selectedPreset) return;
    setIsScanning(true);
    try {
      const response = await detectSpills({
        aoi: selectedPreset.bbox,
        date_range: selectedPreset.default_date_range,
        sensitivity: 0.75,
        wind_threshold_min_ms: 2.0,
      });

      if (response.spills && response.spills.length > 0) {
        setSpills((prev) => {
          const newIds = new Set(response.spills.map((s) => s.spill_id));
          const filteredPrev = prev.filter((s) => !newIds.has(s.spill_id));
          return [...response.spills, ...filteredPrev];
        });
        handleSelectSpillAndHydrate(response.spills[0]);
      }
    } catch (err: any) {
      console.error('Detection pipeline error:', err);
      alert(`Detection failed: ${err.message || err}`);
    } finally {
      setIsScanning(false);
    }
  };

  // Run Vessel Correlation
  const handleRunVesselAttribution = async () => {
    if (!selectedSpill) return;
    setIsRunningVessels(true);
    try {
      const res = await correlateVessels(selectedSpill.spill_id);
      setVesselCorrelation(res);
      if (res.candidate_vessels?.length > 0) {
        setSelectedVessel(res.candidate_vessels[0]);
      }
    } catch (err: any) {
      console.error('Vessel correlation error:', err);
      alert(`Vessel correlation failed: ${err.message || err}`);
    } finally {
      setIsRunningVessels(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        backgroundColor: 'var(--bg-canvas)',
        overflow: 'hidden',
      }}
    >
      {/* Persistent Left Sidebar */}
      <Sidebar
        activePage={activePage}
        onSelectPage={setActivePage}
        isLiveAISActive={isLiveAISActive}
        onToggleLiveAIS={() => setIsLiveAISActive(!isLiveAISActive)}
        liveVesselCount={liveAISVessels.length}
      />

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Persistent Top Bar */}
        <TopBar
          health={health}
          spills={spills}
          selectedSpill={selectedSpill}
          onSelectSpill={handleSelectSpillAndHydrate}
          onTriggerNewScan={handleTriggerNewScan}
          isScanning={isScanning}
        />

        {/* Page Views Switcher */}
        <main
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {activePage === 'detection-fusion' && (
            <DetectionFusionPage
              spill={selectedSpill}
              opticalResult={opticalResult}
              onOpticalUpdated={(res) => setOpticalResult(res)}
            />
          )}

          {activePage === 'drift-hindcast' && (
            <DriftHindcastPage
              spill={selectedSpill}
              driftResult={driftResult}
              thicknessResult={thicknessResult}
              opticalResult={opticalResult}
              vesselCorrelation={vesselCorrelation}
              selectedVessel={selectedVessel}
              onSelectVessel={setSelectedVessel}
              liveAISVessels={liveAISVessels}
              isLiveAISActive={isLiveAISActive}
              onDriftUpdated={(res) => setDriftResult(res)}
              onThicknessUpdated={(res) => setThicknessResult(res)}
              timelineOffsetHours={timelineOffsetHours}
              onTimelineOffsetChange={setTimelineOffsetHours}
              isPlayingTimeline={isPlayingTimeline}
              onTogglePlayTimeline={() => setIsPlayingTimeline(!isPlayingTimeline)}
              playbackSpeed={playbackSpeed}
              onChangeSpeed={setPlaybackSpeed}
            />
          )}

          {activePage === 'attribution' && (
            <AttributionPage
              spill={selectedSpill}
              vesselCorrelation={vesselCorrelation}
              selectedVessel={selectedVessel}
              onSelectVessel={setSelectedVessel}
              onRunAttribution={handleRunVesselAttribution}
              isRunningAttribution={isRunningVessels}
            />
          )}

          {activePage === 'telemetry-evidence' && (
            <TelemetryEvidencePage
              spill={selectedSpill}
              opticalResult={opticalResult}
              thicknessResult={thicknessResult}
              vesselCorrelation={vesselCorrelation}
              totalSpillsCount={spills.length}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
