import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Satellite,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { AOIMonitor, AOIMonitorCreate } from '../../services/api';
import {
  createMonitor,
  deleteMonitor,
  getMonitors,
  pollMonitorNow,
  updateMonitor,
} from '../../services/api';

interface LiveMonitorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvestigateSpill?: (spillId: string) => void;
}

export const LiveMonitorsModal: React.FC<LiveMonitorsModalProps> = ({
  isOpen,
  onClose,
  onInvestigateSpill,
}) => {
  const [monitors, setMonitors] = useState<AOIMonitor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [pollResult, setPollResult] = useState<{ id: string; result: any } | null>(null);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // New monitor form state
  const [newName, setNewName] = useState('');
  const [minLon, setMinLon] = useState('71.0');
  const [minLat, setMinLat] = useState('18.5');
  const [maxLon, setMaxLon] = useState('73.0');
  const [maxLat, setMaxLat] = useState('20.2');
  const [intervalHours, setIntervalHours] = useState(6);
  const [submitting, setSubmitting] = useState(false);

  const fetchMonitors = async () => {
    try {
      setLoading(true);
      const data = await getMonitors();
      setMonitors(data);
      setActionError(null);
    } catch (err: any) {
      setActionError(err.message || 'Failed to fetch monitors.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMonitors();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleActive = async (monitor: AOIMonitor) => {
    try {
      const updated = await updateMonitor(monitor.id, { is_active: !monitor.is_active });
      setMonitors(prev => prev.map(m => (m.id === updated.id ? updated : m)));
    } catch (err: any) {
      setActionError(err.message || 'Failed to update monitor.');
    }
  };

  const handleIntervalChange = async (monitorId: string, hours: number) => {
    try {
      const updated = await updateMonitor(monitorId, { poll_interval_hours: hours });
      setMonitors(prev => prev.map(m => (m.id === updated.id ? updated : m)));
    } catch (err: any) {
      setActionError(err.message || 'Failed to update interval.');
    }
  };

  const handleDelete = async (monitorId: string) => {
    if (!window.confirm('Are you sure you want to delete this AOI monitor?')) return;
    try {
      await deleteMonitor(monitorId);
      setMonitors(prev => prev.filter(m => m.id !== monitorId));
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete monitor.');
    }
  };

  const handlePollNow = async (monitorId: string) => {
    try {
      setPollingId(monitorId);
      setPollResult(null);
      setActionError(null);
      const res = await pollMonitorNow(monitorId);
      setPollResult({ id: monitorId, result: res });
      await fetchMonitors();
    } catch (err: any) {
      setActionError(err.message || 'Manual poll failed.');
    } finally {
      setPollingId(null);
    }
  };

  const handleCreateMonitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      setSubmitting(true);
      setActionError(null);
      const bbox = [
        parseFloat(minLon),
        parseFloat(minLat),
        parseFloat(maxLon),
        parseFloat(maxLat),
      ];
      const payload: AOIMonitorCreate = {
        name: newName.trim(),
        bbox_json: JSON.stringify(bbox),
        poll_interval_hours: intervalHours,
        is_active: true,
      };
      const created = await createMonitor(payload);
      setMonitors(prev => [created, ...prev]);
      setShowAddForm(false);
      setNewName('');
    } catch (err: any) {
      setActionError(err.message || 'Failed to create monitor.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        backgroundColor: 'rgba(5, 12, 22, 0.85)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '860px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0F172A',
          border: '1px solid rgba(14, 165, 233, 0.35)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(14, 165, 233, 0.15)',
          color: '#F8FAFC',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: '#0B1120',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                padding: '0.5rem',
                borderRadius: '10px',
                backgroundColor: 'rgba(14, 165, 233, 0.12)',
                border: '1px solid rgba(14, 165, 233, 0.3)',
                color: '#38BDF8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Satellite size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
                  Sentinel-1 Live AOI Monitors
                </h2>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: '#34D399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}
                >
                  <Radio size={11} /> Scheduler Online
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: '2px 0 0 0' }}>
                Automated Sentinel-1 SAR archive polling & real-time oil slick alert dispatch
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '0.4rem',
              color: '#94A3B8',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {actionError && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '10px',
                fontSize: '0.8rem',
                color: '#FCA5A5',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <AlertTriangle size={16} />
              <span>{actionError}</span>
            </div>
          )}

          {/* Controls Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>Total Active Monitors:</span>
              <span
                style={{
                  padding: '0.15rem 0.5rem',
                  backgroundColor: '#1E293B',
                  borderRadius: '6px',
                  fontWeight: 700,
                  color: '#38BDF8',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                {monitors.filter(m => m.is_active).length} / {monitors.length}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                onClick={fetchMonitors}
                disabled={loading}
                style={{
                  padding: '0.4rem 0.8rem',
                  backgroundColor: '#1E293B',
                  color: '#CBD5E1',
                  borderRadius: '8px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                style={{
                  padding: '0.4rem 0.9rem',
                  backgroundColor: showAddForm ? '#475569' : '#0284C7',
                  color: '#FFFFFF',
                  borderRadius: '8px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
                }}
              >
                <Plus size={14} />
                <span>{showAddForm ? 'Cancel Form' : 'Add New AOI Monitor'}</span>
              </button>
            </div>
          </div>

          {/* Add Monitor Form */}
          {showAddForm && (
            <form
              onSubmit={handleCreateMonitor}
              style={{
                padding: '1.25rem',
                backgroundColor: '#1E293B',
                border: '1px solid rgba(14, 165, 233, 0.3)',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#38BDF8',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <Globe size={16} />
                <span>Configure New Sentinel-1 AOI Monitor</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94A3B8', marginBottom: '0.25rem' }}>
                    AOI Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Suez Canal Southern Anchorage"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.75rem',
                      backgroundColor: '#0F172A',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      color: '#FFFFFF',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94A3B8', marginBottom: '0.25rem' }}>
                    Polling Interval
                  </label>
                  <select
                    value={intervalHours}
                    onChange={e => setIntervalHours(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.75rem',
                      backgroundColor: '#0F172A',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      color: '#FFFFFF',
                      outline: 'none',
                    }}
                  >
                    <option value={1}>Every 1 Hour (Fast Polling)</option>
                    <option value={3}>Every 3 Hours</option>
                    <option value={6}>Every 6 Hours (Standard)</option>
                    <option value={12}>Every 12 Hours</option>
                    <option value={24}>Every 24 Hours</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94A3B8', marginBottom: '0.25rem' }}>
                  Bounding Box Coordinates [WGS84]
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                  <div>
                    <span style={{ fontSize: '0.65rem', color: '#64748B' }}>Min Lon (W)</span>
                    <input
                      type="number"
                      step="any"
                      required
                      value={minLon}
                      onChange={e => setMinLon(e.target.value)}
                      style={{ width: '100%', padding: '0.35rem 0.5rem', backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.75rem', color: '#FFF' }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.65rem', color: '#64748B' }}>Min Lat (S)</span>
                    <input
                      type="number"
                      step="any"
                      required
                      value={minLat}
                      onChange={e => setMinLat(e.target.value)}
                      style={{ width: '100%', padding: '0.35rem 0.5rem', backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.75rem', color: '#FFF' }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.65rem', color: '#64748B' }}>Max Lon (E)</span>
                    <input
                      type="number"
                      step="any"
                      required
                      value={maxLon}
                      onChange={e => setMaxLon(e.target.value)}
                      style={{ width: '100%', padding: '0.35rem 0.5rem', backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.75rem', color: '#FFF' }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.65rem', color: '#64748B' }}>Max Lat (N)</span>
                    <input
                      type="number"
                      step="any"
                      required
                      value={maxLat}
                      onChange={e => setMaxLat(e.target.value)}
                      style={{ width: '100%', padding: '0.35rem 0.5rem', backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.75rem', color: '#FFF' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  style={{
                    padding: '0.4rem 0.8rem',
                    backgroundColor: '#334155',
                    color: '#E2E8F0',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '0.4rem 1rem',
                    backgroundColor: '#0284C7',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  <span>Activate Monitor</span>
                </button>
              </div>
            </form>
          )}

          {/* Monitors List */}
          {loading && monitors.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <Loader2 size={28} className="animate-spin" style={{ color: '#38BDF8' }} />
              <span style={{ fontSize: '0.8rem' }}>Loading Sentinel-1 Live Monitors...</span>
            </div>
          ) : monitors.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', fontSize: '0.8rem' }}>
              No AOI monitors configured. Click "Add New AOI Monitor" above to register an area.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {monitors.map(monitor => {
                const bbox = monitor.bbox_json ? JSON.parse(monitor.bbox_json) : null;
                const isPolling = pollingId === monitor.id;

                return (
                  <div
                    key={monitor.id}
                    style={{
                      padding: '1rem',
                      borderRadius: '12px',
                      backgroundColor: monitor.is_active ? 'rgba(30, 41, 59, 0.7)' : 'rgba(15, 23, 42, 0.6)',
                      border: monitor.is_active ? '1px solid rgba(14, 165, 233, 0.25)' : '1px solid rgba(255, 255, 255, 0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {/* Left: Info */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#FFFFFF' }}>{monitor.name}</span>
                          <span
                            style={{
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              fontSize: '0.65rem',
                              fontWeight: 800,
                              letterSpacing: '0.04em',
                              backgroundColor: monitor.is_active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.2)',
                              color: monitor.is_active ? '#34D399' : '#94A3B8',
                              border: monitor.is_active ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(100, 116, 139, 0.3)',
                            }}
                          >
                            {monitor.is_active ? 'ACTIVE' : 'PAUSED'}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#64748B', fontFamily: 'monospace' }}>ID: {monitor.id}</span>
                        </div>

                        {bbox && (
                          <div style={{ fontSize: '0.75rem', color: '#94A3B8', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}>
                            <Globe size={12} color="#64748B" />
                            <span>
                              BBox: [{bbox[0].toFixed(2)}, {bbox[1].toFixed(2)}, {bbox[2].toFixed(2)}, {bbox[3].toFixed(2)}]
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {/* Polling Interval Select */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '6px', padding: '0.25rem 0.5rem' }}>
                          <Clock size={12} color="#94A3B8" />
                          <select
                            value={monitor.poll_interval_hours}
                            onChange={e => handleIntervalChange(monitor.id, Number(e.target.value))}
                            style={{ backgroundColor: 'transparent', border: 'none', color: '#F8FAFC', fontSize: '0.75rem', outline: 'none', cursor: 'pointer' }}
                          >
                            <option value={1} style={{ background: '#0F172A' }}>1h</option>
                            <option value={3} style={{ background: '#0F172A' }}>3h</option>
                            <option value={6} style={{ background: '#0F172A' }}>6h</option>
                            <option value={12} style={{ background: '#0F172A' }}>12h</option>
                            <option value={24} style={{ background: '#0F172A' }}>24h</option>
                          </select>
                        </div>

                        {/* Poll Now Button */}
                        <button
                          onClick={() => handlePollNow(monitor.id)}
                          disabled={isPolling}
                          style={{
                            padding: '0.35rem 0.75rem',
                            backgroundColor: isPolling ? '#334155' : 'rgba(2, 132, 199, 0.25)',
                            color: '#38BDF8',
                            border: '1px solid rgba(14, 165, 233, 0.4)',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            cursor: isPolling ? 'wait' : 'pointer',
                          }}
                        >
                          {isPolling ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} fill="#38BDF8" />}
                          <span>{isPolling ? 'Polling GEE...' : 'Poll Now'}</span>
                        </button>

                        {/* Active Toggle Switch */}
                        <button
                          onClick={() => handleToggleActive(monitor)}
                          style={{
                            width: '40px',
                            height: '22px',
                            borderRadius: '9999px',
                            backgroundColor: monitor.is_active ? '#0284C7' : '#334155',
                            border: 'none',
                            cursor: 'pointer',
                            position: 'relative',
                            transition: 'background-color 0.2s',
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              top: '2px',
                              left: monitor.is_active ? '20px' : '3px',
                              width: '18px',
                              height: '18px',
                              borderRadius: '50%',
                              backgroundColor: '#FFFFFF',
                              transition: 'left 0.2s',
                            }}
                          />
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDelete(monitor.id)}
                          style={{
                            padding: '0.35rem',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#94A3B8',
                            cursor: 'pointer',
                            borderRadius: '6px',
                          }}
                          title="Delete Monitor"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Lower Info Bar */}
                    <div
                      style={{
                        paddingTop: '0.5rem',
                        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '0.5rem',
                        fontSize: '0.72rem',
                        color: '#94A3B8',
                      }}
                    >
                      <div>
                        <span style={{ color: '#64748B' }}>Last Checked: </span>
                        <span style={{ color: '#E2E8F0' }}>
                          {monitor.last_checked_at
                            ? new Date(monitor.last_checked_at).toLocaleTimeString() + ' ' + new Date(monitor.last_checked_at).toLocaleDateString()
                            : 'Pending first poll'}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>Last S1 Scene: </span>
                        <span style={{ fontFamily: 'monospace', color: '#38BDF8', fontSize: '0.7rem' }}>
                          {monitor.last_processed_scene_id ? monitor.last_processed_scene_id.slice(0, 32) + '...' : 'None processed yet'}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>Spills Detected: </span>
                        <span style={{ fontWeight: 700, color: monitor.spills_detected_count > 0 ? '#F59E0B' : '#E2E8F0' }}>
                          {monitor.spills_detected_count}
                        </span>
                      </div>
                    </div>

                    {/* Poll Result Message */}
                    {pollResult && pollResult.id === monitor.id && (
                      <div
                        style={{
                          marginTop: '0.25rem',
                          padding: '0.5rem 0.75rem',
                          backgroundColor: 'rgba(15, 23, 42, 0.9)',
                          border: '1px solid rgba(14, 165, 233, 0.35)',
                          borderRadius: '8px',
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <CheckCircle2 size={15} color="#34D399" />
                          <span style={{ color: '#F8FAFC' }}>
                            {pollResult.result.status === 'no_new_scene'
                              ? 'No new Sentinel-1 scenes ingested since last poll.'
                              : `Processed scene ${pollResult.result.scene_id} (${pollResult.result.spills_detected} spills detected)`}
                          </span>
                        </div>
                        {pollResult.result.spills && pollResult.result.spills.length > 0 && onInvestigateSpill && (
                          <button
                            onClick={() => onInvestigateSpill(pollResult.result.spills[0].spill_id)}
                            style={{
                              padding: '0.25rem 0.6rem',
                              backgroundColor: '#0284C7',
                              color: '#FFF',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              cursor: 'pointer',
                            }}
                          >
                            <Zap size={12} />
                            <span>Investigate</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '0.75rem 1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: '#0B1120',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: '#64748B',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Activity size={13} color="#38BDF8" />
            <span>Sentinel-1 SAR C-band Revisit Period: ~6-12 Days per Satellite Orbit</span>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '0.35rem 0.9rem',
              backgroundColor: '#1E293B',
              color: '#F8FAFC',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
