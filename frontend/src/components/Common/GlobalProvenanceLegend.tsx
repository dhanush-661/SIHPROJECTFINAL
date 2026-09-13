import React, { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import { PROVENANCE_CONFIG, ProvenanceBadge } from './ProvenanceBadge';
import type { ProvenanceType } from '../../types/spill';

export const GlobalProvenanceLegend: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const entries = Object.keys(PROVENANCE_CONFIG) as ProvenanceType[];

  return (
    <div
      className="glass-panel"
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '16px',
        zIndex: 850,
        padding: '8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        maxWidth: isExpanded ? '380px' : '260px',
        transition: 'max-width 0.25s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Info size={14} color="var(--accent-cyan)" />
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ffffff', letterSpacing: '0.04em' }}>
            PROVENANCE STANDARDS
          </span>
        </div>
        <button
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {/* Badges preview row when collapsed */}
      {!isExpanded && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
          {entries.map((p) => (
            <ProvenanceBadge key={p} provenance={p} size="sm" />
          ))}
        </div>
      )}

      {/* Expanded view with detailed descriptions */}
      {isExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          {entries.map((p) => {
            const cfg = PROVENANCE_CONFIG[p];
            return (
              <div
                key={p}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  background: 'rgba(7, 13, 24, 0.6)',
                  border: `1px solid ${cfg.border}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <ProvenanceBadge provenance={p} size="sm" />
                </div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', lineHeight: 1.3, marginTop: '2px' }}>
                  {cfg.desc}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
