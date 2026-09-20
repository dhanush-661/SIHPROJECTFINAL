import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck,
  Play,
  RotateCw,
  Upload,
  ExternalLink,
  Layers,
  Compass,
  Info,
  Check,
  AlertTriangle
} from 'lucide-react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  Popup,
  Rectangle,
  useMap
} from 'react-leaflet';
import L from 'leaflet';
import {
  getExternalIncidents,
  runValidation,
  seedExternalIncidents,
  importExternalIncidents,
  getSpills
} from '../../services/api';
import type {
  ExternalIncident,
  ValidationRunResponse
} from '../../types/validation';
import type { SpillRecord } from '../../types/spill';

// Preset AOI definitions for historical validation benchmarking
interface ValidationPreset {
  id: string;
  name: string;
  subtitle: string;
  aoi: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  date_start: string;
  date_end: string;
  center: [number, number];
  zoom: number;
}

const PRESET_BENCHMARKS: ValidationPreset[] = [
  {
    id: 'global-all',
    name: 'All Global Reference Catalog Incidents',
    subtitle: 'Comprehensive audit across all pre-seeded reference basins',
    aoi: [-180, -90, 180, 90],
    date_start: '2017-01-01',
    date_end: '2025-12-31',
    center: [15.0, 75.0],
    zoom: 3,
  },
  {
    id: 'ennore-2017',
    name: 'Ennore / Chennai Port Collision (MT Dawn Kanchipuram)',
    subtitle: 'Indian Coast Guard ground truth reference (Tamil Nadu, 2017)',
    aoi: [80.20, 13.15, 80.45, 13.35],
    date_start: '2017-01-27',
    date_end: '2017-01-30',
    center: [13.25, 80.34],
    zoom: 12,
  },
  {
    id: 'mumbai-high-2023',
    name: 'Mumbai High Offshore Production Basin',
    subtitle: 'SkyTruth Cerulean slick detection vs S-1 SAR pipeline (2023)',
    aoi: [71.0, 19.2, 71.6, 19.6],
    date_start: '2023-11-01',
    date_end: '2023-11-10',
    center: [19.42, 71.35],
    zoom: 11,
  },
  {
    id: 'malacca-2023',
    name: 'Strait of Malacca Bilge Water Discharge TSS',
    subtitle: 'High-density shipping corridor linear transit anomaly',
    aoi: [101.2, 2.5, 101.7, 2.9],
    date_start: '2023-08-10',
    date_end: '2023-08-15',
    center: [2.75, 101.45],
    zoom: 11,
  },
  {
    id: 'wakashio-2020',
    name: 'MV Wakashio Grounding (Pointe d\'Esny, Mauritius)',
    subtitle: 'UN OCHA / EMSA verified heavy bunker fuel reef spill',
    aoi: [57.65, -20.50, 57.82, -20.35],
    date_start: '2020-08-05',
    date_end: '2020-08-10',
    center: [-20.44, 57.74],
    zoom: 12,
  },
  {
    id: 'taylor-gom-2023',
    name: 'Taylor Energy MC20 Persistent Sheen (Gulf of Mexico)',
    subtitle: 'NOAA MPSR / SkyTruth continuous subsea release plume',
    aoi: [-89.10, 28.80, -88.85, 29.05],
    date_start: '2023-04-10',
    date_end: '2023-04-20',
    center: [28.93, -88.97],
    zoom: 12,
  },
  {
    id: 'redsea-2024',
    name: 'Southern Red Sea Tanker Discharge Corridor',
    subtitle: 'Bab-el-Mandeb maritime shipping lane breach incident',
    aoi: [43.0, 12.8, 43.3, 13.1],
    date_start: '2024-01-15',
    date_end: '2024-01-22',
    center: [12.95, 43.15],
    zoom: 11,
  },
];

// Custom Map Controller to smoothly reposition view
function MapAutoView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [center, zoom, map]);
  return null;
}

// Marker Icon for External Reference Ground Truth (Amber / Gold)
const externalRefIcon = L.divIcon({
  className: 'ext-ref-marker',
  html: `
    <div style="
      position: relative;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        position: absolute;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #F59E0B;
        opacity: 0.25;
        border: 1px dashed #D97706;
      "></div>
      <div style="
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #F59E0B;
        border: 2px solid #FFFFFF;
        box-shadow: 0 0 6px rgba(245, 158, 11, 0.8);
      "></div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// Marker Icon for AquaSentinel Pipeline Detection (Cyan / Blue)
const detectionPulseIcon = L.divIcon({
  className: 'detection-marker',
  html: `
    <div style="
      position: relative;
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        position: absolute;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: #00F0FF;
        opacity: 0.3;
        animation: pulse-glow 2s infinite ease-in-out;
      "></div>
      <div style="
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #00F0FF;
        border: 2px solid #FFFFFF;
        box-shadow: 0 0 8px rgba(0, 240, 255, 0.9);
      "></div>
    </div>
  `,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

export const ValidationPage: React.FC = () => {
  // Preset & Filter Controls
  const [selectedPreset, setSelectedPreset] = useState<ValidationPreset>(PRESET_BENCHMARKS[1]); // Default to Ennore
  const [dateStart, setDateStart] = useState<string>(PRESET_BENCHMARKS[1].date_start);
  const [dateEnd, setDateEnd] = useState<string>(PRESET_BENCHMARKS[1].date_end);
  const [timeWindowHours, setTimeWindowHours] = useState<number>(48.0);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number>(15.0);

  // Data State
  const [externalIncidents, setExternalIncidents] = useState<ExternalIncident[]>([]);
  const [operationalSpills, setOperationalSpills] = useState<SpillRecord[]>([]);
  const [validationRun, setValidationRun] = useState<ValidationRunResponse | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [filterTab, setFilterTab] = useState<'ALL' | 'MATCHED' | 'MISSED' | 'UNVALIDATED'>('ALL');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importSourceName, setImportSourceName] = useState<string>('External Partner Feed');
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // Map view position state
  const [mapCenter, setMapCenter] = useState<[number, number]>(PRESET_BENCHMARKS[1].center);
  const [mapZoom, setMapZoom] = useState<number>(PRESET_BENCHMARKS[1].zoom);

  // Load external incidents and operational spills
  const fetchData = useCallback(async () => {
    try {
      const [extList, spillList] = await Promise.all([
        getExternalIncidents({ limit: 150 }),
        getSpills(150),
      ]);
      setExternalIncidents(extList);
      setOperationalSpills(spillList);
    } catch (err: any) {
      console.error('Failed to load validation dataset:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Preset Change
  const handleSelectPreset = (preset: ValidationPreset) => {
    setSelectedPreset(preset);
    setDateStart(preset.date_start);
    setDateEnd(preset.date_end);
    setMapCenter(preset.center);
    setMapZoom(preset.zoom);
    setValidationRun(null);
  };

  // Execute Validation Run
  const handleExecuteValidation = async () => {
    setIsValidating(true);
    setNotification(null);
    try {
      const response = await runValidation({
        aoi: selectedPreset.aoi,
        date_start: dateStart,
        date_end: dateEnd,
        time_window_hours: timeWindowHours,
        max_distance_km: maxDistanceKm,
      });
      setValidationRun(response);
      setNotification({
        type: 'success',
        message: `Validation complete: ${response.matched_count} matched, ${response.missed_count} missed out of ${response.total_external_incidents} reference records.`,
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Validation execution failed.',
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Re-seed curated ground-truth incidents
  const handleSeedDatabase = async () => {
    setIsSeeding(true);
    try {
      const res = await seedExternalIncidents();
      await fetchData();
      setNotification({
        type: 'success',
        message: res.message || `Pre-seeded ${res.seeded_count} verified reference records.`,
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to seed reference dataset.',
      });
    } finally {
      setIsSeeding(false);
    }
  };

  // Import custom GeoJSON / JSON
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsImporting(true);
    try {
      const parsed = JSON.parse(importJsonText);
      let incidentsToImport = [];

      if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
        incidentsToImport = parsed.features.map((feat: any, idx: number) => ({
          incident_id: feat.properties?.id || `ext-imp-${idx}`,
          source_name: importSourceName,
          reported_at: feat.properties?.reported_at || feat.properties?.time || new Date().toISOString(),
          geometry: feat.geometry,
          estimated_area_km2: feat.properties?.area_km2 || feat.properties?.area,
          confidence_or_score: feat.properties?.confidence || 0.9,
          source_url: feat.properties?.url,
          notes_or_vessel: feat.properties?.notes || feat.properties?.vessel,
        }));
      } else if (Array.isArray(parsed)) {
        incidentsToImport = parsed;
      } else {
        throw new Error('Unsupported JSON format. Expected GeoJSON FeatureCollection or JSON array.');
      }

      const res = await importExternalIncidents({
        source_name: importSourceName,
        incidents: incidentsToImport,
      });

      await fetchData();
      setIsImportModalOpen(false);
      setImportJsonText('');
      setNotification({
        type: 'success',
        message: res.message || `Successfully imported ${res.imported_count} incidents.`,
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: `Import failed: ${err.message}`,
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Filter comparisons list
  const filteredComparisons = useMemo(() => {
    if (!validationRun) return [];
    if (filterTab === 'ALL') return validationRun.comparisons;
    if (filterTab === 'MATCHED') return validationRun.comparisons.filter((c) => c.status === 'MATCHED');
    if (filterTab === 'MISSED') return validationRun.comparisons.filter((c) => c.status === 'MISSED');
    if (filterTab === 'UNVALIDATED') return validationRun.comparisons.filter((c) => c.status === 'UNVALIDATED_DETECTION');
    return validationRun.comparisons;
  }, [validationRun, filterTab]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#0A1118',
        color: '#E2E8F0',
        overflowY: 'auto',
        fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
      }}
    >
      {/* 1. Header Framing & Forensic Disclaimer Card */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid #1E293B',
          background: 'linear-gradient(180deg, #0F172A 0%, #0A1118 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #0B4F6C 0%, #0284C7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
              }}
            >
              <ShieldCheck size={22} strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: '#F8FAFC',
                    letterSpacing: '-0.02em',
                    margin: 0,
                  }}
                >
                  Sentinel-1 Detection Validation &amp; Incident Database
                </h1>
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#38BDF8',
                    backgroundColor: 'rgba(2, 132, 199, 0.15)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  PIPELINE AUDITING &amp; BENCHMARK
                </span>
              </div>
              <p
                style={{
                  fontSize: '0.78rem',
                  color: '#94A3B8',
                  margin: '4px 0 0 0',
                  lineHeight: 1.4,
                }}
              >
                Audits detection credibility against public ground-truth records (SkyTruth Cerulean, NOAA MPSR, CleanSeaNet).
                All reference records are isolated in a dedicated table tagged{' '}
                <strong style={{ color: '#F59E0B' }}>EXTERNAL-REFERENCE</strong> and never streamed to operational alerts.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleSeedDatabase}
              disabled={isSeeding}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '6px',
                backgroundColor: '#1E293B',
                border: '1px solid #334155',
                color: '#CBD5E1',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <RotateCw size={14} className={isSeeding ? 'animate-spin' : ''} />
              <span>{isSeeding ? 'Seeding...' : 'Seed Reference Catalog'}</span>
            </button>

            <button
              onClick={() => setIsImportModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '6px',
                backgroundColor: '#1E293B',
                border: '1px solid #334155',
                color: '#CBD5E1',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Upload size={14} />
              <span>Import GeoJSON</span>
            </button>
          </div>
        </div>

        {notification && (
          <div
            style={{
              marginTop: '12px',
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: notification.type === 'success' ? 'rgba(22, 163, 74, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: notification.type === 'success' ? '1px solid #16A34A' : '1px solid #EF4444',
              color: notification.type === 'success' ? '#86EFAC' : '#FCA5A5',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {notification.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 2. Controls & Benchmark Configuration Bar */}
      <div
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid #1E293B',
          backgroundColor: '#0F172A',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        {/* Preset Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: '1 1 240px' }}>
          <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
            Reference Benchmark AOI
          </label>
          <select
            value={selectedPreset.id}
            onChange={(e) => {
              const p = PRESET_BENCHMARKS.find((item) => item.id === e.target.value);
              if (p) handleSelectPreset(p);
            }}
            style={{
              padding: '7px 10px',
              borderRadius: '6px',
              backgroundColor: '#1E293B',
              border: '1px solid #334155',
              color: '#F8FAFC',
              fontSize: '0.76rem',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {PRESET_BENCHMARKS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date Start */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
            Date Start
          </label>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              backgroundColor: '#1E293B',
              border: '1px solid #334155',
              color: '#F8FAFC',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          />
        </div>

        {/* Date End */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
            Date End
          </label>
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              backgroundColor: '#1E293B',
              border: '1px solid #334155',
              color: '#F8FAFC',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          />
        </div>

        {/* Time Window Tolerance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '140px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
              Time Window (±h)
            </label>
            <span style={{ fontSize: '0.65rem', color: '#38BDF8', fontFamily: 'var(--font-mono)' }}>
              ±{timeWindowHours}h
            </span>
          </div>
          <input
            type="range"
            min="6"
            max="96"
            step="6"
            value={timeWindowHours}
            onChange={(e) => setTimeWindowHours(parseFloat(e.target.value))}
            style={{ accentColor: '#0284C7', cursor: 'pointer' }}
          />
        </div>

        {/* Distance Tolerance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '140px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
              Spatial Radius (km)
            </label>
            <span style={{ fontSize: '0.65rem', color: '#38BDF8', fontFamily: 'var(--font-mono)' }}>
              {maxDistanceKm} km
            </span>
          </div>
          <input
            type="range"
            min="2"
            max="50"
            step="1"
            value={maxDistanceKm}
            onChange={(e) => setMaxDistanceKm(parseFloat(e.target.value))}
            style={{ accentColor: '#0284C7', cursor: 'pointer' }}
          />
        </div>

        {/* Run Validation CTA */}
        <button
          onClick={handleExecuteValidation}
          disabled={isValidating}
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 18px',
            borderRadius: '6px',
            backgroundColor: '#0284C7',
            border: 'none',
            color: '#FFFFFF',
            fontSize: '0.80rem',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)',
            transition: 'all 0.15s ease',
          }}
        >
          {isValidating ? (
            <>
              <RotateCw size={16} className="animate-spin" />
              <span>Comparing Algorithms...</span>
            </>
          ) : (
            <>
              <Play size={16} />
              <span>Execute Validation Pass</span>
            </>
          )}
        </button>
      </div>

      {/* 3. Plain KPI Metrics & Transparent Match Summary */}
      <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
          }}
        >
          {/* Card 1: Reference Incidents */}
          <div
            style={{
              backgroundColor: '#1E293B',
              borderRadius: '8px',
              padding: '12px 16px',
              border: '1px solid #334155',
            }}
          >
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
              Reference Ground Truth
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F8FAFC', fontFamily: 'var(--font-mono)' }}>
                {validationRun ? validationRun.total_external_incidents : externalIncidents.length}
              </span>
              <span style={{ fontSize: '0.65rem', color: '#F59E0B', fontWeight: 700 }}>EXTERNAL-REFERENCE</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '4px' }}>
              Public ground-truth catalog records in monitored AOI
            </div>
          </div>

          {/* Card 2: Matched Incidents */}
          <div
            style={{
              backgroundColor: '#064E3B',
              borderRadius: '8px',
              padding: '12px 16px',
              border: '1px solid #059669',
            }}
          >
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#A7F3D0', textTransform: 'uppercase' }}>
              Matched Detections
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34D399', fontFamily: 'var(--font-mono)' }}>
                {validationRun ? validationRun.matched_count : 0}
              </span>
              <span style={{ fontSize: '0.65rem', color: '#A7F3D0', fontWeight: 700 }}>CONFIRMED</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#6EE7B7', marginTop: '4px' }}>
              Reference spills detected by AquaSentinel pipeline
            </div>
          </div>

          {/* Card 3: Missed Incidents */}
          <div
            style={{
              backgroundColor: '#451A03',
              borderRadius: '8px',
              padding: '12px 16px',
              border: '1px solid #D97706',
            }}
          >
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#FDE68A', textTransform: 'uppercase' }}>
              Missed Reference Incidents
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FBBF24', fontFamily: 'var(--font-mono)' }}>
                {validationRun ? validationRun.missed_count : 0}
              </span>
              <span style={{ fontSize: '0.65rem', color: '#FDE68A', fontWeight: 700 }}>POTENTIAL FN</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#FCD34D', marginTop: '4px' }}>
              Reference reported but not detected in acquisition
            </div>
          </div>

          {/* Card 4: Unvalidated Operational Detections */}
          <div
            style={{
              backgroundColor: '#1E1B4B',
              borderRadius: '8px',
              padding: '12px 16px',
              border: '1px solid #6366F1',
            }}
          >
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#C7D2FE', textTransform: 'uppercase' }}>
              Unvalidated Operational Slicks
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#818CF8', fontFamily: 'var(--font-mono)' }}>
                {validationRun ? validationRun.unvalidated_detections_count : operationalSpills.length}
              </span>
              <span style={{ fontSize: '0.65rem', color: '#C7D2FE', fontWeight: 700 }}>OPERATIONAL</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#A5B4FC', marginTop: '4px' }}>
              AquaSentinel detections with no external report
            </div>
          </div>
        </div>

        {/* Honest Plain-Language Headline Box */}
        {validationRun && (
          <div
            style={{
              backgroundColor: '#0F172A',
              border: '1px solid #38BDF8',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <Info size={20} color="#38BDF8" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#F8FAFC' }}>
                {validationRun.summary_headline}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#94A3B8', marginTop: '2px' }}>
                Tolerance settings applied: Spatial radius ≤ {validationRun.max_distance_km} km, Temporal window ±{validationRun.time_window_hours} hours.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Split Map & Comparison Results Matrix */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(400px, 1.2fr) minmax(450px, 1.3fr)',
          gap: '16px',
          padding: '0 24px 24px 24px',
          minHeight: '520px',
        }}
      >
        {/* Left: Leaflet Map Overlay */}
        <div
          style={{
            backgroundColor: '#0F172A',
            borderRadius: '8px',
            border: '1px solid #1E293B',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Map Subheader */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid #1E293B',
              backgroundColor: '#1E293B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Compass size={16} color="#38BDF8" />
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#F8FAFC' }}>
                Spatial Verification Map
              </span>
            </div>

            {/* Map Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00F0FF', display: 'inline-block' }} />
                <span style={{ color: '#E2E8F0' }}>AquaSentinel Detection</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#F59E0B', display: 'inline-block' }} />
                <span style={{ color: '#FCD34D' }}>External Reference</span>
              </div>
            </div>
          </div>

          {/* Map Container */}
          <div style={{ flex: 1, position: 'relative' }}>
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              style={{ width: '100%', height: '100%', backgroundColor: '#0B132B' }}
              zoomControl={true}
            >
              <MapAutoView center={mapCenter} zoom={mapZoom} />

              {/* Free, high-res dark marine base tile layer without watermark */}
              <TileLayer
                attribution="&copy; Esri, DeLorme, NAVTEQ"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />

              {/* Evaluated AOI Bounding Box */}
              {selectedPreset.id !== 'global-all' && (
                <Rectangle
                  bounds={[
                    [selectedPreset.aoi[1], selectedPreset.aoi[0]],
                    [selectedPreset.aoi[3], selectedPreset.aoi[2]],
                  ]}
                  pathOptions={{
                    color: '#38BDF8',
                    weight: 1.5,
                    dashArray: '4, 4',
                    fillOpacity: 0.04,
                  }}
                />
              )}

              {/* External Reference Incidents (Amber Polygons / Markers) */}
              {externalIncidents.map((inc) => (
                <React.Fragment key={inc.incident_id}>
                  {inc.geometry && (
                    <GeoJSON
                      key={`geom-${inc.incident_id}`}
                      data={inc.geometry as any}
                      style={{
                        color: '#F59E0B',
                        weight: 2,
                        dashArray: '3, 4',
                        fillColor: '#F59E0B',
                        fillOpacity: 0.25,
                      }}
                    />
                  )}
                  <Marker position={[inc.centroid[1], inc.centroid[0]]} icon={externalRefIcon}>
                    <Popup className="dark-popup">
                      <div style={{ color: '#0F172A', padding: '4px', maxWidth: '240px' }}>
                        <div style={{ fontSize: '0.70rem', fontWeight: 800, color: '#D97706', textTransform: 'uppercase' }}>
                          EXTERNAL REFERENCE
                        </div>
                        <div style={{ fontSize: '0.80rem', fontWeight: 800, color: '#1E293B', marginTop: '2px' }}>
                          {inc.source_name}
                        </div>
                        <div style={{ fontSize: '0.70rem', color: '#64748B', marginTop: '2px' }}>
                          Reported: {inc.reported_at}
                        </div>
                        {inc.estimated_area_km2 && (
                          <div style={{ fontSize: '0.70rem', color: '#1E293B', fontWeight: 600, marginTop: '2px' }}>
                            Area: {inc.estimated_area_km2} km²
                          </div>
                        )}
                        {inc.notes_or_vessel && (
                          <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: '4px', fontStyle: 'italic' }}>
                            {inc.notes_or_vessel}
                          </div>
                        )}
                        {inc.source_url && (
                          <a
                            href={inc.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.68rem',
                              color: '#0284C7',
                              fontWeight: 700,
                              marginTop: '6px',
                              textDecoration: 'none',
                            }}
                          >
                            <span>Open Source Catalog</span>
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                </React.Fragment>
              ))}

              {/* AquaSentinel Pipeline Detections (Cyan Polygons / Markers) */}
              {operationalSpills.map((spill) => (
                <React.Fragment key={spill.spill_id}>
                  {spill.geometry && (
                    <GeoJSON
                      key={`s-geom-${spill.spill_id}`}
                      data={spill.geometry as any}
                      style={{
                        color: '#00F0FF',
                        weight: 2,
                        fillColor: '#00F0FF',
                        fillOpacity: 0.35,
                      }}
                    />
                  )}
                  <Marker position={[spill.centroid[1], spill.centroid[0]]} icon={detectionPulseIcon}>
                    <Popup>
                      <div style={{ color: '#0F172A', padding: '4px', maxWidth: '240px' }}>
                        <div style={{ fontSize: '0.70rem', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase' }}>
                          AQUASENTINEL DETECTION
                        </div>
                        <div style={{ fontSize: '0.80rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                          {spill.spill_id}
                        </div>
                        <div style={{ fontSize: '0.70rem', color: '#64748B', marginTop: '2px' }}>
                          Detected: {spill.detected_at}
                        </div>
                        <div style={{ fontSize: '0.70rem', color: '#1E293B', fontWeight: 600, marginTop: '2px' }}>
                          Area: {spill.area_km2.toFixed(2)} km² | Conf: {(spill.confidence * 100).toFixed(0)}%
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '2px' }}>
                          Source: {spill.source_image}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                </React.Fragment>
              ))}
            </MapContainer>
          </div>
        </div>

        {/* Right: Comparisons Breakdown Matrix */}
        <div
          style={{
            backgroundColor: '#0F172A',
            borderRadius: '8px',
            border: '1px solid #1E293B',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header & Tabs */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid #1E293B',
              backgroundColor: '#1E293B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={16} color="#38BDF8" />
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#F8FAFC' }}>
                Benchmark Comparison Matrix
              </span>
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['ALL', 'MATCHED', 'MISSED', 'UNVALIDATED'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: filterTab === tab ? '#0284C7' : '#334155',
                    color: filterTab === tab ? '#FFFFFF' : '#94A3B8',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Comparisons List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {!validationRun && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px 20px',
                  color: '#64748B',
                  textAlign: 'center',
                }}
              >
                <ShieldCheck size={36} color="#334155" style={{ marginBottom: '10px' }} />
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94A3B8' }}>
                  No Active Validation Run
                </div>
                <div style={{ fontSize: '0.72rem', maxWidth: '320px', marginTop: '4px' }}>
                  Select an AOI benchmark preset or date range and click <strong>"Execute Validation Pass"</strong> above to benchmark pipeline accuracy.
                </div>
              </div>
            )}

            {validationRun && filteredComparisons.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748B', fontSize: '0.75rem' }}>
                No records match the active filter tab '{filterTab}'.
              </div>
            )}

            {validationRun &&
              filteredComparisons.map((comp) => {
                const isMatched = comp.status === 'MATCHED';
                const isMissed = comp.status === 'MISSED';

                return (
                  <div
                    key={comp.comparison_id}
                    style={{
                      borderRadius: '6px',
                      backgroundColor: '#1E293B',
                      border: isMatched
                        ? '1px solid #059669'
                        : isMissed
                        ? '1px solid #D97706'
                        : '1px solid #4F46E5',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    {/* Top Row: Status badge & Source */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.64rem',
                            fontWeight: 800,
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: '0.04em',
                            backgroundColor: isMatched
                              ? '#064E3B'
                              : isMissed
                              ? '#451A03'
                              : '#1E1B4B',
                            color: isMatched
                              ? '#34D399'
                              : isMissed
                              ? '#FBBF24'
                              : '#818CF8',
                            border: isMatched
                              ? '1px solid #059669'
                              : isMissed
                              ? '1px solid #D97706'
                              : '1px solid #6366F1',
                          }}
                        >
                          {comp.status}
                        </span>

                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#F8FAFC' }}>
                          {comp.external_incident
                            ? comp.external_incident.source_name
                            : `Operational Detection: ${comp.matched_spill_id}`}
                        </span>
                      </div>

                      {comp.external_incident?.source_url && (
                        <a
                          href={comp.external_incident.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.68rem',
                            color: '#38BDF8',
                            textDecoration: 'none',
                          }}
                        >
                          <span>Source Report</span>
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>

                    {/* Middle Details Grid */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                        gap: '6px',
                        fontSize: '0.68rem',
                        backgroundColor: '#0F172A',
                        padding: '8px 10px',
                        borderRadius: '4px',
                      }}
                    >
                      {comp.external_incident && (
                        <div>
                          <span style={{ color: '#64748B' }}>Reported Date: </span>
                          <span style={{ color: '#CBD5E1', fontFamily: 'var(--font-mono)' }}>
                            {comp.external_incident.reported_at.slice(0, 16).replace('T', ' ')}
                          </span>
                        </div>
                      )}

                      {comp.matched_detection_summary && (
                        <div>
                          <span style={{ color: '#64748B' }}>Detected Date: </span>
                          <span style={{ color: '#CBD5E1', fontFamily: 'var(--font-mono)' }}>
                            {comp.matched_detection_summary.detected_at.slice(0, 16).replace('T', ' ')}
                          </span>
                        </div>
                      )}

                      {comp.spatial_distance_km !== null && comp.spatial_distance_km !== undefined && (
                        <div>
                          <span style={{ color: '#64748B' }}>Spatial Offset: </span>
                          <span style={{ color: '#38BDF8', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                            {comp.spatial_distance_km} km
                          </span>
                        </div>
                      )}

                      {comp.temporal_delta_hours !== null && comp.temporal_delta_hours !== undefined && (
                        <div>
                          <span style={{ color: '#64748B' }}>Time Delta: </span>
                          <span style={{ color: '#38BDF8', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                            ±{comp.temporal_delta_hours}h
                          </span>
                        </div>
                      )}

                      {comp.overlap_type && (
                        <div>
                          <span style={{ color: '#64748B' }}>Overlap Type: </span>
                          <span style={{ color: '#CBD5E1', fontWeight: 600 }}>{comp.overlap_type}</span>
                        </div>
                      )}
                    </div>

                    {/* Verdict Notes */}
                    <div style={{ fontSize: '0.70rem', color: '#94A3B8', lineHeight: 1.35 }}>
                      {comp.notes}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* 5. Custom GeoJSON Import Modal */}
      {isImportModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#0F172A',
              border: '1px solid #334155',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '560px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={18} color="#38BDF8" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#F8FAFC' }}>
                  Import External Ground Truth Records
                </h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '1.1rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleImportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.70rem', fontWeight: 700, color: '#94A3B8' }}>
                  Source Provider / Catalog Name
                </label>
                <input
                  type="text"
                  value={importSourceName}
                  onChange={(e) => setImportSourceName(e.target.value)}
                  placeholder="e.g. SkyTruth Cerulean Export, EMSA CleanSeaNet, NOAA MPSR"
                  required
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: '#1E293B',
                    border: '1px solid #334155',
                    color: '#F8FAFC',
                    fontSize: '0.78rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.70rem', fontWeight: 700, color: '#94A3B8' }}>
                  GeoJSON FeatureCollection or JSON Array
                </label>
                <textarea
                  rows={8}
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  placeholder='{"type": "FeatureCollection", "features": [ ... ]}'
                  required
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: '#1E293B',
                    border: '1px solid #334155',
                    color: '#F8FAFC',
                    fontSize: '0.72rem',
                    fontFamily: 'var(--font-mono, monospace)',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ fontSize: '0.66rem', color: '#64748B' }}>
                All imported incidents will be tagged with provenance <strong style={{ color: '#F59E0B' }}>EXTERNAL-REFERENCE</strong> and stored in the isolated <code style={{ color: '#38BDF8' }}>external_incidents</code> table.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    backgroundColor: '#334155',
                    border: 'none',
                    color: '#CBD5E1',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isImporting}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    backgroundColor: '#0284C7',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isImporting ? 'Importing...' : 'Save Reference Records'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
