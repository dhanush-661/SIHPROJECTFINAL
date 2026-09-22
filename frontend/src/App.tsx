import { useEffect, useState, useRef, useCallback } from 'react';
import { Sidebar, type AppPage } from './components/Navigation/Sidebar';
import { TopBar } from './components/Navigation/TopBar';
import { DetectionFusionPage } from './components/Pages/DetectionFusionPage';
import { DriftHindcastPage } from './components/Pages/DriftHindcastPage';
import { AttributionPage } from './components/Pages/AttributionPage';
import { TelemetryEvidencePage } from './components/Pages/TelemetryEvidencePage';
import { ValidationPage } from './components/Pages/ValidationPage';
import { TestingPage } from './components/Pages/TestingPage';
import { LiveMonitorsModal } from './components/Monitors/LiveMonitorsModal';
import { DataSourceProvider, useDataSource, assertLiveDataSource } from './context/DataSourceContext';
import {
  checkHealth,
  detectSpills,
  getPresets,
  getSpills,
  deleteSpill,
  clearAllSpills,
  correlateVessels,
  getAssembledSpill,
  getLiveAISVessels,
  getLiveAlerts,
  type LiveAISVessel,
  type LiveAlert,
} from './services/api';
import type { DriftSimulationResponse } from './types/drift';
import type { PresetAOI, SpillRecord, SystemHealth } from './types/spill';
import type { OpticalConfirmationResult, ThicknessEstimateResult } from './types/forensics';
import type { CandidateVessel, VesselCorrelationResponse } from './types/vessel';
import { Satellite, Zap, X } from 'lucide-react';

/** Deduplicates a spill list by spill_id, keeping the first occurrence (newest-first order expected). */
function deduplicateSpills(spills: SpillRecord[]): SpillRecord[] {
  const seen = new Set<string>();
  return spills.filter((s) => {
    if (seen.has(s.spill_id)) return false;
    seen.add(s.spill_id);
    return true;
  });
}

function AppContent() {
  const { dataSource, setDataSource } = useDataSource();

  // Navigation (Default always live operational views)
  const [activePage, setActivePage] = useState<AppPage>('detection-fusion');

  // Backend Health & Presets
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [presets, setPresets] = useState<PresetAOI[]>([]);
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

  // Live AOI Monitors & Alert Dispatch
  const [isMonitorsModalOpen, setIsMonitorsModalOpen] = useState<boolean>(false);
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);
  const [toastAlert, setToastAlert] = useState<LiveAlert | null>(null);

  // Timeline Scrubber State (for Drift & Hindcast)
  const [timelineOffsetHours, setTimelineOffsetHours] = useState<number>(0);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const animationTimerRef = useRef<any>(null);

  // Synchronize dataSource with activePage: only 'testing' may have dataSource === 'test'
  const handleSelectPage = (page: AppPage) => {
    setActivePage(page);
    if (page === 'testing') {
      setDataSource('test');
    } else {
      setDataSource('live');
    }
  };

  // Hydrate full incident assembly via GET /spill/{id} or clear when null
  const handleSelectSpillAndHydrate = useCallback(async (spill: SpillRecord | null) => {
    setSelectedSpill(spill);
    setOpticalResult(null);
    setThicknessResult(null);
    if (!spill) {
      setDriftResult(null);
      setVesselCorrelation(null);
      setSelectedVessel(null);
      return;
    }
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

  // Delete single incident
  const handleDeleteSpill = useCallback(async (spillId: string) => {
    try {
      await deleteSpill(spillId);
      setSpills((prev) => prev.filter((s) => s.spill_id !== spillId));
      if (selectedSpill?.spill_id === spillId) {
        handleSelectSpillAndHydrate(null);
      }
    } catch (err) {
      console.error('Failed to delete spill:', err);
      setSpills((prev) => prev.filter((s) => s.spill_id !== spillId));
      if (selectedSpill?.spill_id === spillId) {
        handleSelectSpillAndHydrate(null);
      }
    }
  }, [selectedSpill, handleSelectSpillAndHydrate]);

  // Clear all incidents
  const handleClearAllSpills = useCallback(async () => {
    try {
      await clearAllSpills();
      setSpills([]);
      handleSelectSpillAndHydrate(null);
    } catch (err) {
      console.error('Failed to clear all spills:', err);
      setSpills([]);
      handleSelectSpillAndHydrate(null);
    }
  }, [handleSelectSpillAndHydrate]);

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

  // Initial Load: Health, Presets, Live Existing Spills, and Live Alerts
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
          setSpills(deduplicateSpills(existingSpills));
        }
      })
      .catch((err) => console.error('Failed to load initial spills:', err));

    getLiveAlerts()
      .then((alerts) => setLiveAlerts(alerts))
      .catch((err) => console.debug('Failed to fetch initial alerts:', err));
  }, []);

  // WebSocket Connection for Sentinel-1 Live Alerts
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWS = () => {
      try {
        const wsUrl = 'ws://127.0.0.1:8000/api/v1/ws/live-alerts';
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('Connected to Live Detection Alerts WebSocket.');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'LIVE_DETECTION_ALERT') {
              setLiveAlerts((prev) => [data, ...prev]);
              setUnreadAlertsCount((prev) => prev + 1);
              setToastAlert(data);

              // Auto-refresh spills list so new detection appears in UI
              // Merge with existing state to avoid losing spills not yet in server list,
              // then deduplicate so no spill_id appears twice.
              getSpills().then((newSpills) => {
                if (newSpills && newSpills.length > 0) {
                  setSpills((prev) =>
                    deduplicateSpills([...newSpills, ...prev])
                  );
                }
              });
            }
          } catch (e) {
            console.debug('WS parse message:', e);
          }
        };

        ws.onclose = () => {
          console.debug('Live Alerts WebSocket closed. Reconnecting in 5s...');
          reconnectTimeout = setTimeout(connectWS, 5000);
        };

        ws.onerror = (err) => {
          console.debug('Live Alerts WebSocket error:', err);
          ws?.close();
        };
      } catch (e) {
        console.debug('WS connect failed:', e);
        reconnectTimeout = setTimeout(connectWS, 5000);
      }
    };

    connectWS();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  // Toast Auto-dismiss Timer
  useEffect(() => {
    if (toastAlert) {
      const timer = setTimeout(() => {
        setToastAlert(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [toastAlert]);

  // Navigate directly to an alert's spill
  const handleInvestigateAlert = useCallback(async (spillId: string) => {
    setActivePage('detection-fusion');
    setDataSource('live');
    setToastAlert(null);
    setUnreadAlertsCount((prev) => Math.max(0, prev - 1));
    try {
      const existing = spills.find((s) => s.spill_id === spillId);
      if (existing) {
        handleSelectSpillAndHydrate(existing);
      } else {
        const fullSpills = await getSpills();
        setSpills((prev) => deduplicateSpills([...fullSpills, ...prev]));
        const match = fullSpills.find((s) => s.spill_id === spillId);
        if (match) {
          handleSelectSpillAndHydrate(match);
        }
      }
    } catch (err) {
      console.error('Failed to investigate alert spill:', err);
    }
  }, [spills, handleSelectSpillAndHydrate, setDataSource]);

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

  // Run New SAR Detection Scan (Live Manual Mode)
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
          // Newest detection results come first; existing spills fill in for any not in response.
          return deduplicateSpills([...response.spills, ...prev]);
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

  // Run Vessel Correlation (Live)
  const handleRunVesselAttribution = async (
    strictRealOnly: boolean = true,
    radiusKm: number = 15.0,
    timeHours: number = 48.0
  ) => {
    if (!selectedSpill) return;
    setIsRunningVessels(true);
    try {
      const res = await correlateVessels(selectedSpill.spill_id, {
        strict_real_ais_only: strictRealOnly,
        investigation_radius_km: radiusKm,
        time_window_hours: timeHours,
      });
      setVesselCorrelation(res);
      if (res.candidate_vessels?.length > 0) {
        setSelectedVessel(res.candidate_vessels[0]);
      } else {
        setSelectedVessel(null);
      }
    } catch (err: any) {
      console.error('Vessel correlation error:', err);
      alert(`Vessel correlation failed: ${err.message || err}`);
    } finally {
      setIsRunningVessels(false);
    }
  };

  // Guardrail runtime verification for live operational views
  if (activePage !== 'testing') {
    assertLiveDataSource(dataSource, activePage);
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        backgroundColor: 'var(--bg-canvas)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Persistent Left Sidebar */}
      <Sidebar
        activePage={activePage}
        onSelectPage={handleSelectPage}
        isLiveAISActive={isLiveAISActive}
        onToggleLiveAIS={() => setIsLiveAISActive(!isLiveAISActive)}
        liveVesselCount={liveAISVessels.length}
        onOpenMonitors={() => setIsMonitorsModalOpen(true)}
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
        {/* TopBar shown on standard operational views */}
        {activePage !== 'testing' && (
          <TopBar
            health={health}
            spills={spills}
            selectedSpill={selectedSpill}
            onSelectSpill={handleSelectSpillAndHydrate}
            onDeleteSpill={handleDeleteSpill}
            onClearAllSpills={handleClearAllSpills}
            presets={presets}
            selectedPreset={selectedPreset}
            onSelectPreset={(p) => {
              setSelectedPreset(p);
              handleSelectSpillAndHydrate(null);
            }}
            onTriggerNewScan={handleTriggerNewScan}
            isScanning={isScanning}
            onOpenMonitors={() => setIsMonitorsModalOpen(true)}
            liveAlerts={liveAlerts}
            unreadAlertsCount={unreadAlertsCount}
            onInvestigateAlert={handleInvestigateAlert}
            onClearAlerts={() => {
              setLiveAlerts([]);
              setUnreadAlertsCount(0);
            }}
          />
        )}

        {/* Page Views Switcher */}
        <main
          style={{
            flex: 1,
            height: '100%',
            minHeight: 0,
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
              liveAISVessels={liveAISVessels}
              onNavigatePage={handleSelectPage}
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

          {activePage === 'validation' && (
            <ValidationPage />
          )}

          {activePage === 'testing' && (
            <TestingPage
              onReturnToLive={() => handleSelectPage('detection-fusion')}
              liveAISVessels={liveAISVessels}
              isLiveAISActive={isLiveAISActive}
            />
          )}
        </main>
      </div>

      {/* Floating Live Alert Toast Notification Popup */}
      {toastAlert && (
        <div
          style={{
            position: 'fixed',
            top: '72px',
            right: '24px',
            width: '330px',
            zIndex: 9999,
            backgroundColor: '#0F172A',
            border: '1.5px solid #0284C7',
            borderRadius: '10px',
            padding: '14px 16px',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.7), 0 0 15px rgba(2, 132, 199, 0.35)',
            color: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  padding: '4px',
                  borderRadius: '5px',
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  color: '#F87171',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Satellite size={14} className="animate-pulse" />
              </span>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#F87171' }}>
                Live Sentinel-1 Alert
              </span>
            </div>
            <button
              onClick={() => setToastAlert(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
              }}
            >
              <X size={15} />
            </button>
          </div>

          <div>
            <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 800, color: '#F8FAFC' }}>
              {toastAlert.monitor_name}
            </h4>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.3 }}>
              {toastAlert.spills_count} new oil slick{toastAlert.spills_count > 1 ? 's' : ''} detected from ingested SAR imagery.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px', paddingTop: '6px', borderTop: '1px solid #1E293B' }}>
            <span style={{ fontSize: '0.62rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
              {new Date(toastAlert.detected_at).toLocaleTimeString()}
            </span>
            {toastAlert.spills && toastAlert.spills.length > 0 && (
              <button
                onClick={() => {
                  handleInvestigateAlert(toastAlert.spills[0].spill_id);
                  setToastAlert(null);
                }}
                style={{
                  padding: '4px 10px',
                  backgroundColor: '#0284C7',
                  border: 'none',
                  borderRadius: '5px',
                  color: '#FFFFFF',
                  fontSize: '0.70rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: '0 2px 6px rgba(2, 132, 199, 0.4)',
                }}
              >
                <Zap size={12} />
                <span>Investigate</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sentinel-1 AOI Monitors Modal */}
      <LiveMonitorsModal
        isOpen={isMonitorsModalOpen}
        onClose={() => setIsMonitorsModalOpen(false)}
        onInvestigateSpill={(spillId) => {
          setIsMonitorsModalOpen(false);
          handleInvestigateAlert(spillId);
        }}
      />
    </div>
  );
}

export function App() {
  return (
    <DataSourceProvider>
      <AppContent />
    </DataSourceProvider>
  );
}

export default App;
