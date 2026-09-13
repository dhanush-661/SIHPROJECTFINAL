import React from 'react';

export type ProvenanceType = 'DETECTED' | 'MEASURED' | 'MODEL-PREDICTED' | 'ANOMALY-FLAGGED' | 'VERIFIED';

export interface ProvenanceBadgeProps {
  type?: ProvenanceType | string;
  provenance?: ProvenanceType | string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const PROVENANCE_CONFIG: Record<
  ProvenanceType,
  { class: string; dot: string; border: string; defaultLabel: string; desc: string }
> = {
  DETECTED: {
    class: 'badge-detected',
    dot: '#2563EB',
    border: 'rgba(37, 99, 235, 0.4)',
    defaultLabel: 'DETECTED',
    desc: 'Direct sensor detection from satellite SAR imagery or radar measurements.',
  },
  MEASURED: {
    class: 'badge-measured',
    dot: '#0D9488',
    border: 'rgba(13, 148, 136, 0.4)',
    defaultLabel: 'MEASURED',
    desc: 'In-situ physical observations, metocean sensors, or optical multi-band reflectance.',
  },
  'MODEL-PREDICTED': {
    class: 'badge-predicted',
    dot: '#D97706',
    border: 'rgba(217, 119, 6, 0.4)',
    defaultLabel: 'MODEL-PREDICTED',
    desc: 'Lagrangian hydrodynamic drift simulation and hindcast probabilistic paths.',
  },
  'ANOMALY-FLAGGED': {
    class: 'badge-anomaly',
    dot: '#DC2626',
    border: 'rgba(220, 38, 38, 0.4)',
    defaultLabel: 'ANOMALY-FLAGGED',
    desc: 'AIS dark activity, rapid course deviations, or abnormal vessel loitering.',
  },
  VERIFIED: {
    class: 'badge-verified',
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
  const badgeKey = (type || provenance || 'DETECTED') as ProvenanceType;
  const config = PROVENANCE_CONFIG[badgeKey] || PROVENANCE_CONFIG.DETECTED;
  const sizeStyle =
    size === 'sm'
      ? { fontSize: '0.62rem', padding: '1px 5px', gap: '3px' }
      : size === 'lg'
      ? { fontSize: '0.8rem', padding: '3px 8px', gap: '6px' }
      : {};

  return (
    <span
      className={`badge-provenance ${config.class} ${className}`}
      style={sizeStyle}
    >
      <span
        style={{
          width: size === 'sm' ? '4px' : '5px',
          height: size === 'sm' ? '4px' : '5px',
          borderRadius: '50%',
          backgroundColor: config.dot,
          display: 'inline-block',
        }}
      />
      {label || config.defaultLabel}
    </span>
  );
};
