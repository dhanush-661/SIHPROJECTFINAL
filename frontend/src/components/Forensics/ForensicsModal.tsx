import React, { useState, useEffect } from 'react';
import { X, Eye, Layers, FlaskConical, ShieldCheck, Lock } from 'lucide-react';
import type { SpillRecord } from '../../types/spill';
import type { OpticalConfirmationResult, ThicknessEstimateResult } from '../../types/forensics';
import { OpticalFusionPanel } from './OpticalFusionPanel';
import { SARThicknessPanel } from './SARThicknessPanel';
import { EvidenceLedgerPanel } from './EvidenceLedgerPanel';
import { getOpticalFusion, getThicknessClassification } from '../../services/api';

interface ForensicsModalProps {
  isOpen: boolean;
  onClose: () => void;
  spill: SpillRecord | null;
  /** Allows parent to pass pre-assembled results (from hydrated /spill/{id}) */
  initialOptical?: OpticalConfirmationResult | null;
  initialThickness?: ThicknessEstimateResult | null;
}

type ForensicsTab = 'optical' | 'thickness' | 'evidence';

export const ForensicsModal: React.FC<ForensicsModalProps> = ({
  isOpen,
  onClose,
  spill,
  initialOptical,
  initialThickness,
}) => {
  const [activeTab, setActiveTab] = useState<ForensicsTab>('optical');
  const [opticalResult, setOpticalResult] = useState<OpticalConfirmationResult | null>(
    initialOptical || null
  );
  const [thicknessResult, setThicknessResult] = useState<ThicknessEstimateResult | null>(
    initialThickness || null
  );
  const [isLoadingOptical, setIsLoadingOptical] = useState(false);
  const [isLoadingThickness, setIsLoadingThickness] = useState(false);

  // When spill changes or modal opens, fetch cached results if not injected
  useEffect(() => {
    if (!spill || !isOpen) return;

    if (!initialOptical) {
      setIsLoadingOptical(true);
      getOpticalFusion(spill.spill_id)
        .then(setOpticalResult)
        .catch(() => setOpticalResult(null))
        .finally(() => setIsLoadingOptical(false));
    } else {
      setOpticalResult(initialOptical);
    }

    if (!initialThickness) {
      setIsLoadingThickness(true);
      getThicknessClassification(spill.spill_id)
        .then(setThicknessResult)
        .catch(() => setThicknessResult(null))
        .finally(() => setIsLoadingThickness(false));
    } else {
      setThicknessResult(initialThickness);
    }
  }, [spill, isOpen, initialOptical, initialThickness]);

  if (!isOpen) return null;

  const tabs: { id: ForensicsTab; label: string; icon: React.ReactNode; color: string; hasData: boolean }[] = [
    {
      id: 'optical',
      label: 'Optical Fusion (P5)',
      icon: <Eye size={13} />,
      color: '#818cf8',
      hasData: !!opticalResult,
    },
    {
      id: 'thickness',
      label: 'SAR Thickness (P6)',
      icon: <Layers size={13} />,
      color: '#fb923c',
      hasData: !!thicknessResult,
    },
    {
      id: 'evidence',
      label: 'Evidence Ledger (P7)',
      icon: <Lock size={13} />,
      color: '#10b981',
      hasData: true,
    },
  ];

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(4, 8, 16, 0.75)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      animation: 'fadeIn 0.2s ease',
    }}>
      <div
        className="glass-panel"
        style={{
          width: '520px',
          maxWidth: '95vw',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          boxShadow: '0 0 60px rgba(129,140,248,0.18), 0 0 120px rgba(251,146,60,0.08)',
        }}
      >
        {/* ── Modal Header ─────────────────────────────────────────────────────── */}
        <div style={{
          padding: '14px 18px 10px',
          borderBottom: '1px solid var(--panel-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(7,13,24,0.6)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '6px',
              background: 'linear-gradient(135deg, rgba(129,140,248,0.3), rgba(251,146,60,0.3))',
              border: '1px solid rgba(129,140,248,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FlaskConical size={14} color="#818cf8" />
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', letterSpacing: '0.03em' }}>
                FORENSIC ANALYSIS
              </div>
              {spill && (
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {spill.spill_id}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Cross-validation indicator: shows when both are done */}
            {opticalResult?.optical_confirmed && thicknessResult?.cross_validated_with_optical !== null && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '3px 8px', borderRadius: '4px',
                background: thicknessResult?.cross_validated_with_optical === true
                  ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)',
                border: `1px solid ${thicknessResult?.cross_validated_with_optical === true ? 'rgba(52,211,153,0.4)' : 'rgba(251,191,36,0.4)'}`,
                fontSize: '0.62rem', fontWeight: 700,
                color: thicknessResult?.cross_validated_with_optical === true ? '#34d399' : '#fbbf24',
              }}>
                <ShieldCheck size={11} />
                {thicknessResult?.cross_validated_with_optical === true ? 'MULTI-SENSOR VALIDATED' : 'OPTICAL CONTRADICTION'}
              </div>
            )}

            <button
              onClick={onClose}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Phase Tabs ───────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', padding: '8px 12px',
          gap: '6px', flexShrink: 0,
          borderBottom: '1px solid var(--panel-border)',
          background: 'rgba(7,13,24,0.4)',
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                padding: '7px 10px', borderRadius: '6px',
                background: activeTab === tab.id ? `${tab.color}22` : 'transparent',
                border: activeTab === tab.id ? `1px solid ${tab.color}66` : '1px solid transparent',
                color: activeTab === tab.id ? tab.color : 'var(--text-secondary)',
                fontWeight: 700, fontSize: '0.74rem',
                cursor: 'pointer', transition: 'all 0.15s ease',
                position: 'relative',
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {/* Data indicator dot */}
              {tab.hasData && (
                <span style={{
                  position: 'absolute', top: '4px', right: '6px',
                  width: '5px', height: '5px', borderRadius: '50%',
                  background: tab.color, boxShadow: `0 0 4px ${tab.color}`,
                }} />
              )}
            </button>
          ))}
        </div>

        {/* ── Scrollable Panel Content ──────────────────────────────────────── */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '14px 16px',
        }}>
          {activeTab === 'optical' && (
            <OpticalFusionPanel
              spill={spill}
              opticalResult={opticalResult}
              isLoading={isLoadingOptical}
              onResultChange={setOpticalResult}
            />
          )}
          {activeTab === 'thickness' && (
            <SARThicknessPanel
              spill={spill}
              thicknessResult={thicknessResult}
              isLoading={isLoadingThickness}
              onResultChange={setThicknessResult}
            />
          )}
          {activeTab === 'evidence' && (
            <EvidenceLedgerPanel
              spill={spill}
            />
          )}
        </div>

        {/* ── Footer disclaimer ─────────────────────────────────────────────── */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--panel-border)',
          fontSize: '0.62rem', color: 'var(--text-muted)',
          background: 'rgba(7,13,24,0.5)', flexShrink: 0,
        }}>
          Optical appearance codes per Bonn Agreement (BAOAC). SAR thickness uses Polsby-Popper fragmentation & GLCM texture. All data is provenance-tagged (MODEL-PREDICTED / MEASURED).
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
};
