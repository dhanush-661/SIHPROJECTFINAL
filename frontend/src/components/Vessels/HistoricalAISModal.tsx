import React, { useState, useEffect } from 'react';
import {
  X,
  Upload,
  Database,
  FileSpreadsheet,
  Layers,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Ship
} from 'lucide-react';
import {
  getAisStats,
  importAisCsv,
  importAisGeoJson,
  clearAisDatabase
} from '../../services/api';
import type { AisTableStats } from '../../types/vessel';

interface HistoricalAISModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDatasetImported?: () => void;
}

export const HistoricalAISModal: React.FC<HistoricalAISModalProps> = ({
  isOpen,
  onClose,
  onDatasetImported,
}) => {
  const [stats, setStats] = useState<AisTableStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedTab, setSelectedTab] = useState<'upload' | 'templates' | 'stats'>('upload');

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const data = await getAisStats();
      setStats(data);
    } catch (err: any) {
      console.warn('Failed to fetch AIS stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStats();
      setStatusMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploading(true);
    setStatusMessage(null);

    try {
      let res;
      if (file.name.endsWith('.geojson') || file.name.endsWith('.json')) {
        res = await importAisGeoJson(file, `GEOJSON:${file.name}`);
      } else {
        res = await importAisCsv(file, `CSV:${file.name}`);
      }

      setStatusMessage({
        type: 'success',
        text: `Successfully ingested ${res.pings_imported.toLocaleString()} AIS pings for ${res.unique_vessels} authentic vessels.`
      });
      await fetchStats();
      if (onDatasetImported) onDatasetImported();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to import dataset file.'
      });
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleImportSample = async (format: 'noaa' | 'gfw' | 'geojson') => {
    setUploading(true);
    setStatusMessage(null);
    try {
      let res;
      if (format === 'noaa') {
        const sampleCsv = `MMSI,BaseDateTime,LAT,LON,SOG,COG,Heading,VesselName,IMO,VesselType,Length,Draft
419008912,2026-09-06T17:30:00Z,19.20,72.45,11.4,140.0,140.0,DESH SHOBHA,IMO9384721,80,244.0,15.2
419008912,2026-09-06T18:00:00Z,19.25,72.50,11.2,142.0,142.0,DESH SHOBHA,IMO9384721,80,244.0,15.2
419008912,2026-09-06T18:30:00Z,19.29,72.55,11.0,141.0,141.0,DESH SHOBHA,IMO9384721,80,244.0,15.2
419003451,2026-09-06T17:45:00Z,19.12,72.38,8.5,210.0,210.0,JAG LEELA,IMO9215432,80,130.0,8.4
419003451,2026-09-06T18:15:00Z,19.16,72.42,8.4,212.0,212.0,JAG LEELA,IMO9215432,80,130.0,8.4
419007621,2026-09-06T18:20:00Z,19.32,72.62,12.5,135.0,135.0,SWARNA BRAHMAPUTRA,IMO9456789,82,182.0,11.8
636015522,2026-09-06T18:40:00Z,19.05,72.30,13.8,320.0,320.0,VALE RIO,IMO9811002,70,360.0,18.5
`;
        res = await importAisCsv(sampleCsv, 'SAMPLE_NOAA_CADASTRE');
      } else if (format === 'gfw') {
        const gfwCsv = `ssvid,timestamp,lat,lon,speed,course,vessel_class,flag,vessel_name
419008912,2026-09-06T17:00:00Z,19.15,72.40,11.5,138.0,crude_tanker,IND,DESH SHOBHA
419008912,2026-09-06T17:30:00Z,19.20,72.45,11.4,140.0,crude_tanker,IND,DESH SHOBHA
419008912,2026-09-06T18:00:00Z,19.25,72.50,11.2,142.0,crude_tanker,IND,DESH SHOBHA
419008912,2026-09-06T18:30:00Z,19.29,72.55,11.0,141.0,crude_tanker,IND,DESH SHOBHA
354992019,2026-09-06T18:10:00Z,19.22,72.48,10.2,145.0,chemical_tanker,PAN,RED SEA PIONEER
354992019,2026-09-06T18:40:00Z,19.27,72.53,10.1,146.0,chemical_tanker,PAN,RED SEA PIONEER
`;
        res = await importAisCsv(gfwCsv, 'SAMPLE_GFW_CADASTRE');
      } else {
        const geojson = {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: [
                  [72.40, 19.15],
                  [72.45, 19.20],
                  [72.50, 19.25],
                  [72.55, 19.30]
                ]
              },
              properties: {
                mmsi: "419008912",
                vessel_name: "DESH SHOBHA",
                ship_type: "Crude Oil Tanker",
                flag: "India",
                imo: "9384721",
                timestamps: [
                  "2026-09-06T17:00:00Z",
                  "2026-09-06T17:30:00Z",
                  "2026-09-06T18:00:00Z",
                  "2026-09-06T18:30:00Z"
                ],
                speeds: [11.5, 11.4, 11.2, 11.0],
                courses: [138.0, 140.0, 142.0, 141.0]
              }
            }
          ]
        };
        res = await importAisGeoJson(geojson, 'SAMPLE_GEOJSON_TRACK');
      }

      setStatusMessage({
        type: 'success',
        text: `Sample template successfully imported: ${res.pings_imported} pings across ${res.unique_vessels} vessels.`
      });
      await fetchStats();
      if (onDatasetImported) onDatasetImported();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to import sample template.'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleClearDb = async () => {
    if (!window.confirm('Are you sure you want to purge all records in the historical AIS database? This will clear all imported CSV and live persisted points.')) {
      return;
    }
    setClearing(true);
    setStatusMessage(null);
    try {
      const res = await clearAisDatabase();
      setStatusMessage({
        type: 'success',
        text: res.message
      });
      await fetchStats();
      if (onDatasetImported) onDatasetImported();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to clear AIS database.'
      });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '20px',
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '750px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '12px',
          backgroundColor: '#0F172A',
          border: '1.5px solid #0284C7',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(2, 132, 199, 0.3)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1E293B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#090E1A',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                backgroundColor: 'rgba(2, 132, 199, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #0284C7',
              }}
            >
              <Database size={18} color="#38BDF8" />
            </div>
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#F8FAFC' }}>
                Historical AIS Dataset Importer &amp; Forensics Store
              </div>
              <div style={{ fontSize: '0.70rem', color: '#94A3B8' }}>
                Local SQLite Telemetry &bull; NOAA Marine Cadastre &bull; GFW &bull; DMA &bull; GeoJSON
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #1E293B',
            backgroundColor: '#0B1120',
            padding: '0 20px',
            gap: '8px',
          }}
        >
          <button
            onClick={() => setSelectedTab('upload')}
            style={{
              padding: '10px 14px',
              border: 'none',
              background: 'transparent',
              borderBottom: selectedTab === 'upload' ? '2px solid #0284C7' : '2px solid transparent',
              color: selectedTab === 'upload' ? '#38BDF8' : '#94A3B8',
              fontSize: '0.76rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Upload size={14} />
            <span>Upload File (CSV / GeoJSON)</span>
          </button>

          <button
            onClick={() => setSelectedTab('templates')}
            style={{
              padding: '10px 14px',
              border: 'none',
              background: 'transparent',
              borderBottom: selectedTab === 'templates' ? '2px solid #0284C7' : '2px solid transparent',
              color: selectedTab === 'templates' ? '#38BDF8' : '#94A3B8',
              fontSize: '0.76rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <FileSpreadsheet size={14} />
            <span>Verified Sample Templates</span>
          </button>

          <button
            onClick={() => setSelectedTab('stats')}
            style={{
              padding: '10px 14px',
              border: 'none',
              background: 'transparent',
              borderBottom: selectedTab === 'stats' ? '2px solid #0284C7' : '2px solid transparent',
              color: selectedTab === 'stats' ? '#38BDF8' : '#94A3B8',
              fontSize: '0.76rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Database size={14} />
            <span>Database Status</span>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Status Message Alert */}
          {statusMessage && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${statusMessage.type === 'success' ? '#10B981' : '#EF4444'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '0.75rem',
                color: statusMessage.type === 'success' ? '#34D399' : '#F87171',
              }}
            >
              {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1fr',
              gap: '10px',
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: '#090E1A',
              border: '1px solid #1E293B',
            }}
          >
            <div>
              <span style={{ fontSize: '0.62rem', color: '#64748B', display: 'block', fontWeight: 600 }}>TOTAL PINGS</span>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#38BDF8', fontFamily: 'var(--font-mono)' }}>
                {stats?.total_historical_pings?.toLocaleString() ?? 0}
              </span>
            </div>
            <div>
              <span style={{ fontSize: '0.62rem', color: '#64748B', display: 'block', fontWeight: 600 }}>AUTHENTIC VESSELS</span>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#10B981', fontFamily: 'var(--font-mono)' }}>
                {stats?.unique_vessels_tracked?.toLocaleString() ?? 0}
              </span>
            </div>
            <div>
              <span style={{ fontSize: '0.62rem', color: '#64748B', display: 'block', fontWeight: 600 }}>COVERAGE WINDOW</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#F8FAFC', fontFamily: 'var(--font-mono)' }}>
                {stats?.earliest_timestamp ? new Date(stats.earliest_timestamp).toLocaleDateString() : 'None'}
              </span>
            </div>
            <div>
              <span style={{ fontSize: '0.62rem', color: '#64748B', display: 'block', fontWeight: 600 }}>LOCAL STORE</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase' }}>
                {stats?.status || 'ONLINE'}
              </span>
            </div>
          </div>

          {/* Tab 1: Upload */}
          {selectedTab === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div
                style={{
                  border: '2px dashed #0284C7',
                  borderRadius: '10px',
                  padding: '30px 20px',
                  textAlign: 'center',
                  backgroundColor: 'rgba(2, 132, 199, 0.05)',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <input
                  type="file"
                  accept=".csv,.geojson,.json"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: uploading ? 'wait' : 'pointer',
                    width: '100%',
                    height: '100%',
                  }}
                />
                <Upload size={36} color="#38BDF8" style={{ marginBottom: '10px' }} />
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#F8FAFC' }}>
                  {uploading ? 'Parsing and Ingesting AIS Telemetry...' : 'Drag & Drop Historical AIS CSV or GeoJSON'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '6px' }}>
                  Supports NOAA Marine Cadastre, Global Fishing Watch (GFW), DMA Denmark, or GeoJSON FeatureCollection
                </div>
              </div>

              <div style={{ fontSize: '0.72rem', color: '#64748B', lineHeight: 1.4 }}>
                <strong>Required CSV Columns:</strong> MMSI / ssvid, Timestamp / BaseDateTime, Latitude, Longitude (optional: SOG, COG, Heading, VesselName, ShipType, IMO, Length, DWT).
              </div>
            </div>
          )}

          {/* Tab 2: Sample Templates */}
          {selectedTab === 'templates' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
                Instantly load verified sample historical AIS telemetry tracks around the Mumbai High &amp; Arabian Sea chokepoint to benchmark strict attribution:
              </div>

              {/* Template Card 1 */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#0B1120',
                  border: '1px solid #1E293B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={14} color="#38BDF8" />
                    <span>NOAA Marine Cadastre Benchmark (4 Tankers, 7 Pings)</span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                    Includes DESH SHOBHA, JAG LEELA, SWARNA BRAHMAPUTRA, VALE RIO
                  </div>
                </div>
                <button
                  onClick={() => handleImportSample('noaa')}
                  disabled={uploading}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '5px',
                    backgroundColor: '#0284C7',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: uploading ? 'wait' : 'pointer',
                  }}
                >
                  Load NOAA CSV
                </button>
              </div>

              {/* Template Card 2 */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#0B1120',
                  border: '1px solid #1E293B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Ship size={14} color="#10B981" />
                    <span>Global Fishing Watch (GFW) Cadastre (2 Tankers, 6 Pings)</span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                    Standard ssvid, timestamp, lat, lon format with DESH SHOBHA &amp; RED SEA PIONEER
                  </div>
                </div>
                <button
                  onClick={() => handleImportSample('gfw')}
                  disabled={uploading}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '5px',
                    backgroundColor: '#059669',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: uploading ? 'wait' : 'pointer',
                  }}
                >
                  Load GFW CSV
                </button>
              </div>

              {/* Template Card 3 */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#0B1120',
                  border: '1px solid #1E293B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={14} color="#F59E0B" />
                    <span>GeoJSON Multi-Point LineString Track</span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                    LineString trajectory with synchronized timestamps, speeds &amp; courses
                  </div>
                </div>
                <button
                  onClick={() => handleImportSample('geojson')}
                  disabled={uploading}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '5px',
                    backgroundColor: '#D97706',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: uploading ? 'wait' : 'pointer',
                  }}
                >
                  Load GeoJSON
                </button>
              </div>
            </div>
          )}

          {/* Tab 3: Database Stats Breakdown */}
          {selectedTab === 'stats' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
                Breakdown of telemetry points stored in local SQLite database by source tag:
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {stats?.sources_breakdown && Object.keys(stats.sources_breakdown).length > 0 ? (
                  Object.entries(stats.sources_breakdown).map(([src, count]) => (
                    <div
                      key={src}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#0B1120',
                        border: '1px solid #1E293B',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.74rem',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: '#F8FAFC' }}>{src}</span>
                      <span style={{ fontWeight: 700, color: '#38BDF8', fontFamily: 'var(--font-mono)' }}>
                        {count.toLocaleString()} pings
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#64748B', fontSize: '0.74rem' }}>
                    No telemetry records currently in database. Upload a CSV/GeoJSON or connect live AIS stream.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #1E293B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#090E1A',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchStats}
              disabled={loadingStats}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '5px',
                backgroundColor: '#1E293B',
                border: '1px solid #334155',
                color: '#F8FAFC',
                fontSize: '0.70rem',
                fontWeight: 600,
                cursor: loadingStats ? 'wait' : 'pointer',
              }}
            >
              <RefreshCw size={12} className={loadingStats ? 'animate-spin' : ''} />
              <span>Refresh Stats</span>
            </button>

            <button
              onClick={handleClearDb}
              disabled={clearing || !stats?.total_historical_pings}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '5px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #EF4444',
                color: '#F87171',
                fontSize: '0.70rem',
                fontWeight: 600,
                cursor: clearing || !stats?.total_historical_pings ? 'not-allowed' : 'pointer',
              }}
            >
              <Trash2 size={12} />
              <span>Purge AIS Store</span>
            </button>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: '5px',
              backgroundColor: '#0284C7',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
