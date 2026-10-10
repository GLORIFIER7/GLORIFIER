import React, { useEffect, useState } from 'react';
import { Activity, Globe2, Code2, Users, Cpu, Search, Database, DollarSign, Lightbulb, RefreshCw, ShieldCheck } from 'lucide-react';

type Insight = {
  id: string;
  title: string;
  status: 'live' | 'connector' | 'protected';
  summary: string;
  metrics: { label: string; value: string }[];
  actions: string[];
};

const ICONS: Record<string, React.ElementType> = {
  web_mentions: Globe2,
  github: Code2,
  competitors: Users,
  trends: Cpu,
  search: Search,
  telemetry: Activity,
  revenue: DollarSign,
  opportunities: Lightbulb,
};

export const BusinessIntelligenceDashboard: React.FC = () => {
  const [report, setReport] = useState<{generatedAt:string; insights: Insight[]; executiveSummary:string} | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const collect = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/business-intelligence/report');
      if (!res.ok) throw new Error(`Collection HTTP ${res.status}`);
      setReport(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Business intelligence collection failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void collect(); }, []);

  return (
    <div className="space-y-5">
      <section className="rounded-xl bg-slate-900 border border-slate-800 p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-cyan-400" />
              <h2 className="text-base font-bold text-white">GLORIFIER Business Intelligence</h2>
              <span className="text-[9px] uppercase px-2 py-1 rounded-full border border-cyan-500/30 text-cyan-300 bg-cyan-500/10">Continuous intelligence</span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              One command center for GLORIFIER public footprint, engineering activity, market signals, first-party telemetry, verified revenue and data-product opportunities.
            </p>
          </div>
          <button onClick={() => void collect()} disabled={loading} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-bold disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Collecting…' : 'Collect now'}
          </button>
        </div>
        <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
          <ShieldCheck className="inline w-3.5 h-3.5 mr-1" />
          Business intelligence is separated from private/raw data. Commercialization still requires consent, privacy review and verified source rights.
        </div>
        {error && <div className="mt-3 text-xs text-rose-300">{error}</div>}
        {report?.executiveSummary && (
          <div className="mt-4 rounded-lg bg-slate-950 border border-slate-800 p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Executive summary</div>
            <p className="text-sm text-slate-200 mt-1">{report.executiveSummary}</p>
            <div className="text-[10px] text-slate-600 mt-2">Generated {new Date(report.generatedAt).toLocaleString()}</div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(report?.insights ?? []).map((item) => {
          const Icon = ICONS[item.id] || Database;
          return (
            <article key={item.id} className="rounded-xl bg-slate-900/80 border border-slate-800 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">{item.title}</h3>
                </div>
                <span className={`text-[9px] uppercase px-2 py-1 rounded-full border ${item.status === 'live' ? 'border-emerald-500/30 text-emerald-300' : item.status === 'protected' ? 'border-amber-500/30 text-amber-300' : 'border-slate-700 text-slate-400'}`}>{item.status}</span>
              </div>
              <p className="text-xs text-slate-400 mt-3">{item.summary}</p>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {item.metrics.map((m) => <div key={m.label} className="rounded-lg bg-slate-950 border border-slate-800 p-2"><div className="text-[9px] uppercase text-slate-500">{m.label}</div><div className="text-sm font-bold text-slate-200 mt-1">{m.value}</div></div>)}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800">
                <div className="text-[9px] uppercase text-slate-500 mb-1">Business actions</div>
                <ul className="text-xs text-slate-300 space-y-1 list-disc pl-4">{item.actions.map(a => <li key={a}>{a}</li>)}</ul>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
