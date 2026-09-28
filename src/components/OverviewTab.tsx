import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  ShieldCheck, 
  TrendingUp, 
  Activity, 
  ArrowUpRight, 
  Cpu, 
  Lock, 
  EyeOff, 
  Play, 
  Pause, 
  CheckCircle2, 
  Sparkles,
  ExternalLink,
  Shield,
  Layers,
  Users
} from 'lucide-react';
import { SovereignStats, DataFootprintSource, MonetizationPolicy, CompensationTransaction } from '../types';
import { PrivacyShieldProgressBar } from './PrivacyShieldProgressBar';
import { LiveEconomicData } from './LiveEconomicData';
import { BusinessModelPanel } from './BusinessModelPanel';
import { ValuationEnginePanel } from './ValuationEnginePanel';
import { EconomicOperatingSystemPanel } from './EconomicOperatingSystemPanel';
import { BusinessIntelligenceArchitecturePanel } from './BusinessIntelligenceArchitecturePanel';

interface OverviewTabProps {
  stats: SovereignStats;
  footprints: DataFootprintSource[];
  policy: MonetizationPolicy;
  onUpdatePolicy: (newPolicy: Partial<MonetizationPolicy>) => void;
  onToggleFootprint: (id: string) => void;
  onNavigateToTab: (tab: string) => void;
  transactions: CompensationTransaction[];
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  stats,
  footprints,
  policy,
  onUpdatePolicy,
  onToggleFootprint,
  onNavigateToTab,
  transactions
}) => {
  const [controlPlane, setControlPlane] = useState<any>(null);
  const [controlPlaneError, setControlPlaneError] = useState<string | null>(null);

  const [governanceBusy, setGovernanceBusy] = useState(false);
  const [assetVerification, setAssetVerification] = useState<any>(null);
  const [assetVerificationError, setAssetVerificationError] = useState<string | null>(null);

  const loadAssetVerification = async () => {
    try {
      const response = await fetch('/api/assets/verification', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Asset verification unavailable');
      setAssetVerification(payload);
      setAssetVerificationError(null);
    } catch (error: any) {
      setAssetVerificationError(error?.message || 'Asset verification unavailable');
    }
  };

  const loadControlPlane = async () => {
    try {
      const response = await fetch('/api/revenue/control-plane');
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Control plane unavailable');
      setControlPlane(payload.snapshot);
      setControlPlaneError(null);
    } catch (error: any) {
      setControlPlaneError(error?.message || 'Control plane unavailable');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/revenue/control-plane');
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'Control plane unavailable');
        if (!cancelled) {
          setControlPlane(payload.snapshot);
          setControlPlaneError(null);
        }
      } catch (error: any) {
        if (!cancelled) setControlPlaneError(error?.message || 'Control plane unavailable');
      }
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    loadAssetVerification();
    const timer = window.setInterval(loadAssetVerification, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const runGovernanceCheck = async () => {
    setGovernanceBusy(true);
    try {
      const response = await fetch('/api/revenue/control-plane/govern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine: 'opportunity-engine',
          actionType: 'observe',
          objective: 'Run a governed GLORIFIER Revenue Control Plane observation and record the evidence state.',
          reversible: true,
          actor: 'human-owner'
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Governance check failed');
      await loadControlPlane();
    } catch (error: any) {
      setControlPlaneError(error?.message || 'Governance check failed');
    } finally {
      setGovernanceBusy(false);
    }
  };

  const activeMonetizingCount = footprints.filter(f => f.isMonetized).length;
  const shieldedCount = footprints.filter(f => !f.isMonetized).length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-slate-950 border border-slate-800 p-5 md:p-6 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h1 className="text-xl md:text-2xl font-bold text-white">GLORIFIER Overview</h1>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Unified asset, evidence, custody, ownership, valuation, and revenue verification.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadAssetVerification}
              className="text-xs px-3 py-1.5 rounded-md border border-slate-700 text-slate-300 hover:text-white"
            >
              Refresh
            </button>
            <span className="text-[10px] font-mono px-2.5 py-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              GAV-1.1
            </span>
          </div>
        </div>

        {assetVerificationError && (
          <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
            {assetVerificationError}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="text-[10px] uppercase font-bold tracking-wide text-emerald-300">Overall Verification</div>
            <div className="text-lg font-bold text-white mt-2">
              {assetVerification?.summary?.verificationLabel || 'NOT OBSERVABLE'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">FULLY VERIFIED only when all required checks pass.</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-[10px] uppercase font-bold tracking-wide text-slate-500">Accounts</div>
            <div className="text-lg font-bold text-white mt-2">{assetVerification?.summary?.accounts ?? '—'}</div>
            <div className="text-[11px] text-slate-400 mt-1">Source and authorization state</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-[10px] uppercase font-bold tracking-wide text-slate-500">Holdings</div>
            <div className="text-lg font-bold text-white mt-2">{assetVerification?.summary?.holdings ?? '—'}</div>
            <div className="text-[11px] text-slate-400 mt-1">Ownership/custody evidence</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-[10px] uppercase font-bold tracking-wide text-slate-500">Evidence</div>
            <div className="text-lg font-bold text-white mt-2">{assetVerification?.summary?.evidence ?? '—'}</div>
            <div className="text-[11px] text-slate-400 mt-1">Source, hash, freshness</div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-bold text-white">Verification Labels</h2>
              <p className="text-[11px] text-slate-400 mt-1">Every observable record is explicitly classified.</p>
            </div>
            <span className="text-[10px] font-mono text-slate-500">NO FABRICATED EVIDENCE</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[
              ['FULLY VERIFIED', 'All required checks pass.'],
              ['VERIFIED', 'The individual asset/evidence item meets its applicable evidence requirements.'],
              ['PARTIALLY VERIFIED', 'Some evidence exists, but a required ownership/custody or other check is incomplete.'],
              ['NOT VERIFIED', 'Insufficient qualifying evidence.'],
              ['DEGRADED', 'Verification infrastructure/source is impaired.'],
              ['NOT OBSERVABLE', 'GLORIFIER has no observable authorized/source data for the item.']
            ].map(([label, description]) => (
              <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                <div className="text-[10px] font-bold text-emerald-300">{label}</div>
                <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">{description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">All Labeled Data</h2>
            <span className="text-[10px] text-slate-500">Source → Observation → Evidence → Verification Status</span>
          </div>

          {[
            ...(assetVerification?.completeLabeledData?.accounts || []).map((item: any) => ({
              kind: 'ACCOUNT',
              id: item.id,
              detail: item.provider || 'source account',
              label: item.label
            })),
            ...(assetVerification?.completeLabeledData?.holdings || []).map((item: any) => ({
              kind: item.assetClass?.toUpperCase() || 'HOLDING',
              id: item.id,
              detail: [item.symbol, item.quantity != null ? 'qty ' + item.quantity : null, item.marketValue != null ? 'value ' + item.marketValue : null].filter(Boolean).join(' • '),
              label: item.label
            })),
            ...(assetVerification?.completeLabeledData?.evidence || []).map((item: any) => ({
              kind: 'EVIDENCE',
              id: item.id,
              detail: [item.source, item.evidenceType, item.observedAt].filter(Boolean).join(' • '),
              label: item.label
            })),
            {
              kind: 'REVENUE',
              id: 'verified-revenue',
              detail: assetVerification?.completeLabeledData?.revenue?.verified ? 'Qualifying economic/settlement evidence present' : 'Requires qualifying economic/settlement evidence',
              label: assetVerification?.completeLabeledData?.revenue?.label || 'NOT VERIFIED'
            }
          ].map((item: any) => (
            <div key={item.kind + ':' + item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500">{item.kind}</span>
                  <span className="text-xs font-semibold text-slate-200 truncate">{item.id}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 break-words">{item.detail}</div>
              </div>
              <span className="shrink-0 text-[10px] font-bold font-mono px-2 py-1 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-300">
                {item.label}
              </span>
            </div>
          ))}

          {!assetVerification?.completeLabeledData && !assetVerificationError && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-500">
              Waiting for the authoritative verification report.
            </div>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[10px] text-slate-400">
          Economic truth remains separate: market value and estimates are not revenue. Revenue becomes VERIFIED only from qualifying economic and settlement evidence.
        </div>
      </section>

      <LiveEconomicData />
      <BusinessModelPanel />
      <ValuationEnginePanel />
      <EconomicOperatingSystemPanel />
      <BusinessIntelligenceArchitecturePanel />

      <section className="rounded-xl bg-slate-950 border border-slate-800 p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div><h2 className="text-base font-bold text-white flex items-center gap-2"><Layers className="w-4 h-4 text-emerald-400" />GLORIFIER Revenue Control Plane</h2><p className="text-xs text-slate-400 mt-1">One governance boundary for every value-creation machine.</p></div>
          <span className="text-[10px] font-mono px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">GRCP-1.0</span>
        </div>
        {controlPlaneError && <div className="text-xs text-amber-300 mb-3">Control plane: {controlPlaneError}</div>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            ['Verified Revenue', controlPlane ? '$' + Number(controlPlane.economicTruth?.verifiedRevenue || 0).toFixed(2) : '—', 'VERIFIED'],
            ['Pending Approvals', controlPlane?.governance?.pendingApprovals ?? '—', 'HUMAN'],
            ['Blocked Actions', controlPlane?.governance?.blockedActions ?? '—', 'GOVERNED'],
            ['Connections', controlPlane?.machines?.connections?.total ?? '—', 'REGISTERED']
          ].map(([label,value,badge]) => <div key={String(label)} className="rounded-lg bg-slate-900 border border-slate-800 p-3"><div className="text-[10px] uppercase font-bold text-slate-500">{label}</div><div className="text-lg font-bold text-white mt-1">{value}</div><div className="text-[9px] font-mono text-emerald-400 mt-1">{badge}</div></div>)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Object.keys(controlPlane?.policy?.machines || {}).map(key => <div key={key} className="rounded-md bg-slate-900/80 border border-slate-800 px-3 py-2 text-[10px] text-slate-300"><span className="text-emerald-400 mr-1">●</span>{key}</div>)}
        </div>
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-[10px] text-slate-400">Economic truth: estimates and expected value are <span className="text-amber-300 font-semibold">NOT VERIFIED</span>. Market value is not revenue. Missing evidence is not zero. Consequential actions remain human-authorized.</div>
      </section>

      {/* Two Column Layout: Quick Stream Switchboard & Real-time Compensation Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 cols: Quick Stream Switchboard */}
        <div className="lg:col-span-7 rounded-xl bg-slate-900 border border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                Footprint Streams Switchboard
              </h3>
              <p className="text-xs text-slate-400">
                Grant or revoke AI monetization access to your internet digital footprint.
              </p>
            </div>
            <button
              onClick={() => onNavigateToTab('footprints')}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
            >
              Full Inspection & Noise &rarr;
            </button>
          </div>

          <div className="space-y-2.5">
            {footprints.map((fp) => (
              <div
                key={fp.id}
                id={`stream-row-${fp.id}`}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    fp.isMonetized 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : 'bg-slate-800 text-slate-500 border border-slate-700'
                  }`}>
                    {fp.isMonetized ? <Activity className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white truncate">{fp.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                        {fp.platform}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                      <span>{(fp.dataPointsMonthly / 1000).toFixed(0)}k points/mo</span>
                      <span className="font-mono text-emerald-400 font-medium">
                        {fp.isMonetized ? `+$${fp.userMonthlyCompUsd.toFixed(2)}/mo` : '$0.00 (Shielded)'}
                      </span>
                      <span className="hidden sm:inline text-slate-500 font-mono">
                        {fp.privacyTier}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pl-2">
                  <button
                    onClick={() => onToggleFootprint(fp.id)}
                    id={`toggle-btn-${fp.id}`}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                      fp.isMonetized
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {fp.isMonetized ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Monetizing
                      </>
                    ) : (
                      <>
                        <Lock className="w-3 h-3 text-slate-400" />
                        Shielded Private
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl bg-slate-900 border border-slate-800 p-5">
          <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-white flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" />Governed Action Feed</h3><p className="text-xs text-slate-400">Recorded control-plane decisions, not simulated earnings.</p></div><div className="flex gap-2"><button onClick={loadControlPlane} className="text-[10px] px-2 py-1 rounded border border-slate-700 text-slate-300 hover:text-white">Refresh</button><button onClick={runGovernanceCheck} disabled={governanceBusy} className="text-[10px] px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 disabled:opacity-50">{governanceBusy ? 'Running…' : 'Run Check'}</button></div></div>
          <div className="space-y-2">
            {(controlPlane?.governance?.recentEvents || []).slice(0,5).map((event:any) => <div key={event.id} className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 text-xs"><div className="flex justify-between gap-3"><span className="font-semibold text-slate-200">{event.machine}</span><span className={event.status === 'blocked' ? 'text-amber-300' : 'text-emerald-300'}>{event.status}</span></div><div className="text-[11px] text-slate-400 mt-1">{event.actionType} • evidence: {event.evidenceStatus}</div></div>)}
            {!controlPlane?.governance?.recentEvents?.length && <div className="text-xs text-slate-500 py-4">No governance events recorded yet. Run a governance check or execute a governed action to create the first real event.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
