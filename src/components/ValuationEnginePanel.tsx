import React, { useEffect, useState } from 'react';
import { BarChart3, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';

export const ValuationEnginePanel: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/valuation');
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Valuation engine unavailable');
      setData(payload.valuation);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Valuation engine unavailable');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  const money = (value: number | null) =>
    value == null || !Number.isFinite(Number(value)) ? '—' : '$' + Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <section className="rounded-xl bg-slate-950 border border-slate-800 p-5">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            GLORIFIER Valuation Engine
          </h2>
          <p className="text-xs text-slate-400 mt-1">Evidence-backed valuation analysis that never manufactures a market price.</p>
        </div>
        <button onClick={load} disabled={refreshing} className="p-2 rounded-md border border-slate-700 text-slate-400 hover:text-white disabled:opacity-50" title="Refresh valuation">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <div className="text-xs text-amber-300 mb-3">{error}</div>}

      {!data ? (
        <div className="text-xs text-slate-500">Collecting evidence…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg bg-slate-900 border border-slate-800 p-3">
              <div className="text-[10px] uppercase font-bold text-slate-500">Valuation Range</div>
              <div className="text-lg font-bold text-white mt-1">{money(data.valuation?.low)} – {money(data.valuation?.high)}</div>
              <div className="text-[9px] font-mono text-amber-300 mt-1">{data.valuation?.label}</div>
            </div>
            <div className="rounded-lg bg-slate-900 border border-slate-800 p-3">
              <div className="text-[10px] uppercase font-bold text-slate-500">Midpoint</div>
              <div className="text-lg font-bold text-white mt-1">{money(data.valuation?.midpoint)}</div>
              <div className="text-[9px] font-mono text-slate-500 mt-1">MODEL ESTIMATE</div>
            </div>
            <div className="rounded-lg bg-slate-900 border border-slate-800 p-3">
              <div className="text-[10px] uppercase font-bold text-slate-500">Confidence</div>
              <div className="text-lg font-bold text-white mt-1">{Math.round(Number(data.valuation?.confidence || 0) * 100)}%</div>
              <div className="text-[9px] font-mono text-slate-500 mt-1">EVIDENCE COVERAGE</div>
            </div>
            <div className="rounded-lg bg-slate-900 border border-slate-800 p-3">
              <div className="text-[10px] uppercase font-bold text-slate-500">Verified Revenue</div>
              <div className="text-lg font-bold text-white mt-1">{money(data.observedInputs?.verifiedRevenue)}</div>
              <div className="text-[9px] font-mono text-amber-300 mt-1">{data.observedInputs?.verifiedRevenue == null ? 'NOT OBSERVABLE' : 'SOURCE-REPORTED INPUT · NOT A VERIFIED VALUATION'}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
            {[
              ['Customers', data.observedInputs?.customers],
              ['Work Units', data.observedInputs?.workUnits],
              ['Authorized Connections', data.observedInputs?.authorizedConnections],
              ['IP Research Runs', data.observedInputs?.ipResearchRuns],
              ['Product Maturity', String(data.observedInputs?.productMaturityScore ?? 0) + '/100']
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-md bg-slate-900/70 border border-slate-800 px-3 py-2">
                <div className="text-[9px] uppercase text-slate-500">{label}</div>
                <div className="text-sm font-semibold text-slate-200 mt-1">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              {data.status === 'calculated' ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-amber-300" />}
              {data.status === 'calculated' ? 'Valuation model calculated from recorded evidence' : 'Valuation not available yet'}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Estimates remain NOT VERIFIED. Personal asset holdings are excluded unless explicitly recorded as company-owned valuation evidence.
              An external transaction price, investment round or appraisal must be independently evidenced before it becomes a market value.
            </p>
          </div>

          {data.limitations?.length > 0 && (
            <div className="mt-3 text-[10px] text-slate-500">
              <span className="text-slate-400 font-semibold">Evidence gaps:</span> {data.limitations.slice(0, 3).join(' • ')}
            </div>
          )}
        </>
      )}
    </section>
  );
};
