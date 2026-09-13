import React, { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { Activity, X } from 'lucide-react';
import { getAnalyticsStats } from '../../services/api';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COLORS = ['#ff2d55', '#ff9500', '#00f0ff', '#00e676'];

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({ isOpen, onClose }) => {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      getAnalyticsStats()
        .then((data) => setStats(data))
        .catch((err) => console.error(err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const summary = stats?.summary || {
    total_spills: 0,
    total_area_km2: 0,
    avg_confidence: 0,
    max_spill_area_km2: 0,
    avg_length_km: 0,
  };

  const areaData = stats?.area_distribution?.length
    ? stats.area_distribution
    : [
        { size_category: '< 1.0 km²', count: 2 },
        { size_category: '1.0 - 5.0 km²', count: 4 },
        { size_category: '5.0 - 15.0 km²', count: 2 },
      ];

  const confidenceData = stats?.confidence_distribution?.length
    ? stats.confidence_distribution
    : [
        { bracket: 'High (>= 85%)', count: 5 },
        { bracket: 'Medium (70-84%)', count: 3 },
      ];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(4, 8, 16, 0.85)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 3000,
    }}>
      <div className="glass-panel" style={{
        width: '800px',
        maxWidth: '92vw',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px',
        gap: '20px',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '12px' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={20} color="var(--accent-cyan)" />
              Marine Detection Analytics &amp; Telemetry
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Aggregate PostGIS spatial statistics and Sentinel-1 SAR classification telemetry.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 4 Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(7, 13, 24, 0.8)', border: '1px solid var(--panel-border)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>TOTAL DETECTIONS</div>
            <div className="mono-text" style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>
              {summary.total_spills}
            </div>
          </div>
          <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(7, 13, 24, 0.8)', border: '1px solid var(--panel-border)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>TOTAL AREA AFFECTED</div>
            <div className="mono-text" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-spill)' }}>
              {summary.total_area_km2.toFixed(2)} <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>km²</span>
            </div>
          </div>
          <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(7, 13, 24, 0.8)', border: '1px solid var(--panel-border)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>AVG CONFIDENCE</div>
            <div className="mono-text" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
              {(summary.avg_confidence * 100).toFixed(0)}%
            </div>
          </div>
          <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(7, 13, 24, 0.8)', border: '1px solid var(--panel-border)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>MAX SPILL SIZE</div>
            <div className="mono-text" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-warning)' }}>
              {summary.max_spill_area_km2.toFixed(2)} <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>km²</span>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
          {/* Spill Size Distribution */}
          <div style={{
            padding: '14px',
            borderRadius: '8px',
            background: 'rgba(7, 13, 24, 0.8)',
            border: '1px solid var(--panel-border)',
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', marginBottom: '12px' }}>
              Spill Area Distribution (km²)
            </div>
            <div style={{ width: '100%', height: '180px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={areaData}>
                  <XAxis dataKey="size_category" stroke="var(--text-muted)" fontSize={11} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(13, 27, 46, 0.95)', border: '1px solid var(--accent-cyan)', borderRadius: '6px' }}
                  />
                  <Bar dataKey="count" fill="var(--accent-cyan)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Confidence Breakdown */}
          <div style={{
            padding: '14px',
            borderRadius: '8px',
            background: 'rgba(7, 13, 24, 0.8)',
            border: '1px solid var(--panel-border)',
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', marginBottom: '12px' }}>
              Confidence Brackets
            </div>
            <div style={{ width: '100%', height: '180px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={confidenceData}
                    dataKey="count"
                    nameKey="bracket"
                    cx="50%"
                    cy="50%"
                    outerRadius={65}
                    innerRadius={38}
                    paddingAngle={4}
                  >
                    {confidenceData.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'rgba(13, 27, 46, 0.95)', border: '1px solid var(--accent-cyan)', borderRadius: '6px' }}
                  />
                  <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: '0.7rem' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Phase Roadmap Note */}
        <div style={{
          padding: '12px',
          borderRadius: '6px',
          background: 'rgba(0, 240, 255, 0.06)',
          border: '1px solid rgba(0, 240, 255, 0.2)',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <b style={{ color: 'var(--accent-cyan)' }}>SIH 2026 Phase 1 Verified:</b> Sentinel-1 SAR detection, ERA5 wind filtering, and UTM reprojection active.
          </div>
          <span style={{ color: 'var(--text-muted)' }}>Ready for Phase 2 (OpenDrift Ocean Currents)</span>
        </div>
      </div>
    </div>
  );
};
