import React from 'react';

export type ProvenanceType =
  | 'REAL AIS'
  | 'REAL AIS — IMPORTED'
  | 'REAL AIS — LIVE'
  | 'MODELLED'
  | 'PREDICTED'
  | 'NO AIS EVIDENCE'
  | 'SYNTHETIC DEMONSTRATION INCIDENT'
  | 'DETECTED'
  | 'MEASURED'
  | 'MODEL-PREDICTED'
  | 'ANOMALY-FLAGGED'
  | 'VERIFIED';

export interface ProvenanceBadgeProps {
  type?: ProvenanceType | string;
  provenance?: ProvenanceType | string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const PROVENANCE_CONFIG: Record<
  string,
  { bg: string; color: string; dot: string; border: string; defaultLabel: string; desc: string }
> = {
  'REAL AIS': {
    bg: 'rgba(16, 185, 129, 0.12)',
    color: '#10b981',
    dot: '#10b981',
    border: 'rgba(16, 185, 129, 0.35)',
    defaultLabel: 'REAL AIS',
    desc: 'Genuine historical AIS position observations recorded by coastal/satellite receivers.',
  },
  'REAL AIS — IMPORTED': {
    bg: 'rgba(13, 148, 136, 0.12)',
    color: '#14b8a6',
    dot: '#14b8a6',
    border: 'rgba(20, 184, 166, 0.35)',
    defaultLabel: 'REAL AIS — IMPORTED',
    desc: 'Imported authentic AIS dataset from NOAA, Danish Maritime Authority, or GFW.',
  },
  'REAL AIS — LIVE': {
    bg: 'rgba(6, 182, 212, 0.12)',
    color: '#06b6d4',
    dot: '#06b6d4',
    border: 'rgba(6, 182, 212, 0.35)',
    defaultLabel: 'REAL AIS — LIVE',
    desc: 'Real-time live vessel positions from active AISStream WebSocket stream.',
  },
  MODELLED: {
    bg: 'rgba(245, 158, 11, 0.12)',
    color: '#f59e0b',
    dot: '#f59e0b',
    border: 'rgba(245, 158, 11, 0.35)',
    defaultLabel: 'MODELLED / SIMULATED',
    desc: 'Trajectories are modelled kinematic simulations and NOT historical AIS observations.',
  },
  PREDICTED: {
    bg: 'rgba(168, 85, 247, 0.12)',
    color: '#a855f7',
    dot: '#a855f7',
    border: 'rgba(168, 85, 247, 0.35)',
    defaultLabel: 'PREDICTED',
    desc: 'Probabilistic hydrodynamic Lagrangian drift/hindcast forecast path.',
  },
  'NO AIS EVIDENCE': {
    bg: 'rgba(148, 163, 184, 0.12)',
    color: '#94a3b8',
    dot: '#94a3b8',
    border: 'rgba(148, 163, 184, 0.35)',
    defaultLabel: 'NO AIS EVIDENCE',
    desc: '0 verified AIS records found within the investigation window.',
  },
  'SYNTHETIC DEMONSTRATION INCIDENT': {
    bg: 'rgba(244, 63, 94, 0.12)',
    color: '#fb7185',
    dot: '#fb7185',
    border: 'rgba(244, 63, 94, 0.35)',
    defaultLabel: 'SYNTHETIC DEMO INCIDENT',
    desc: 'Benchmark demonstration scenario. Not a verified real-world emergency.',
  },
  DETECTED: {
    bg: 'rgba(37, 99, 235, 0.12)',
    color: '#38bdf8',
    dot: '#2563EB',
    border: 'rgba(37, 99, 235, 0.4)',
    defaultLabel: 'DETECTED',
    desc: 'Direct sensor detection from satellite SAR imagery or radar measurements.',
  },
  MEASURED: {
    bg: 'rgba(13, 148, 136, 0.12)',
    color: '#2dd4bf',
    dot: '#0D9488',
    border: 'rgba(13, 148, 136, 0.4)',
    defaultLabel: 'MEASURED',
    desc: 'In-situ physical observations, metocean sensors, or optical multi-band reflectance.',
  },
  'MODEL-PREDICTED': {
    bg: 'rgba(217, 119, 6, 0.12)',
    color: '#fbbf24',
    dot: '#D97706',
    border: 'rgba(217, 119, 6, 0.4)',
    defaultLabel: 'MODEL-PREDICTED',
    desc: 'Lagrangian hydrodynamic drift simulation and hindcast probabilistic paths.',
  },
  'ANOMALY-FLAGGED': {
    bg: 'rgba(220, 38, 38, 0.12)',
    color: '#f87171',
    dot: '#DC2626',
    border: 'rgba(220, 38, 38, 0.4)',
    defaultLabel: 'ANOMALY-FLAGGED',
    desc: 'AIS dark activity, rapid course deviations, or abnormal vessel loitering.',
  },
  VERIFIED: {
    bg: 'rgba(22, 163, 74, 0.12)',
    color: '#4ade80',
    dot: '#16A34A',
    border: 'rgba(22, 163, 74, 0.4)',
    defaultLabel: 'VERIFIED',
    desc: 'Ground truth confirmed via multi-spectral cross-validation and forensic signature match.',
  },
};

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({
  type,
  provenance,
  label,
  size = 'md',
  className = '',
}) => {
  const rawKey = (type || provenance || 'REAL AIS').trim();
  const matchedKey = Object.keys(PROVENANCE_CONFIG).find(
    (k) => k.toUpperCase() === rawKey.toUpperCase()
  ) || 'REAL AIS';

  const config = PROVENANCE_CONFIG[matchedKey] || PROVENANCE_CONFIG['REAL AIS'];
  
  const sizeStyle: React.CSSProperties =
    size === 'sm'
      ? { fontSize: '0.62rem', padding: '2px 6px', gap: '4px', height: '20px' }
      : size === 'lg'
      ? { fontSize: '0.8rem', padding: '4px 10px', gap: '6px', height: '28px' }
      : { fontSize: '0.72rem', padding: '3px 8px', gap: '5px', height: '24px' };

  return (
    <span
      className={`badge-provenance ${className}`}
      title={config.desc}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '4px',
        fontWeight: 600,
        letterSpacing: '0.03em',
        backgroundColor: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        whiteSpace: 'nowrap',
        ...sizeStyle,
      }}
    >
      <span
        style={{
          width: size === 'sm' ? '5px' : '6px',
          height: size === 'sm' ? '5px' : '6px',
          borderRadius: '50%',
          backgroundColor: config.dot,
          display: 'inline-block',
          boxShadow: `0 0 6px ${config.dot}`,
        }}
      />
      {label || config.defaultLabel}
    </span>
  );
};

