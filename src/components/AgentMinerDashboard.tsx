import React, { useEffect, useState } from 'react';
import { Cpu, Play, Pause, ShieldCheck, RefreshCw } from 'lucide-react';

type Snapshot = {
  status: string;
  mode: string;
  cadence: string;
  cyclesCompleted: number;
  providers: Array<{ id: string; name: string; kind: string; enabled: boolean; healthy: boolean }>;
  safety: { humanAuthorizationRequiredForCompute: boolean; custody: string; automaticFundMovement: boolean; guaranteedReturns: boolean };
  lastCycle: { completedAt: string; status: string; providersUsed: string[]; workQueued: number; estimatedRevenueUsd: number | null; verifiedRevenueUsd: number | null } | null;
};

export const AgentMinerDashboard: React.FC = () => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const r = await fetch('/api/agent-miner/status', { cache: 'no-store' });
    if (!r.ok) throw new Error('Agent Miner status unavailable');
    setSnapshot(await r.json());
  };
  useEffect(() => { void load().catch(console.error); const id = window.setInterval(() => void load().catch(console.error), 30000); return () => window.clearInterval(id); }, []);
  const run = async (path: string, body?: object) => {
    setBusy(true);
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Agent Miner request failed');
      await load();
    } finally { setBusy(false); }
  };
  const s = snapshot;
  return <section className="space-y-5">
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div><div className="flex items-center gap-2"><Cpu className="h-5 w-5 text-emerald-400"/><h2 className="text-xl font-semibold">Agent Miner</h2><span className="text-[10px] uppercase tracking-wider border border-slate-700 px-2 py-1 rounded text-slate-400">24/7</span></div>
      <p className="text-xs text-slate-500 mt-1">Provider-neutral mining intelligence with explicitly authorized compute execution.</p></div>
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => void run('/api/agent-miner/run')} className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs hover:bg-slate-900"><RefreshCw className="h-4 w-4"/>Run cycle</button>
        <button disabled={busy} onClick={() => void run('/api/agent-miner/control', { running: s?.status !== 'RUNNING', mode: 'intelligence' })} className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10">{s?.status === 'RUNNING' ? <Pause className="h-4 w-4"/> : <Play className="h-4 w-4"/>}{s?.status === 'RUNNING' ? 'Pause' : 'Start'}</button>
      </div>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[['Status', s?.status || 'Loading'], ['Mode', s?.mode || '—'], ['Cycles', s?.cyclesCompleted ?? '—'], ['Cadence', s?.cadence || '—']].map(([k,v]) => <div key={String(k)} className="rounded-md border border-slate-800 bg-slate-900/40 p-4"><div className="text-[10px] uppercase text-slate-500">{k}</div><div className="mt-1 text-lg font-semibold">{String(v)}</div></div>)}
    </div>
    <div className="rounded-md border border-slate-800 p-4">
      <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-emerald-400"/>Governance boundary</div>
      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-slate-400">
        <span>Compute authorization: {s?.safety.humanAuthorizationRequiredForCompute ? 'Required' : 'Not required'}</span>
        <span>Custody: {s?.safety.custody || '—'}</span><span>Auto fund movement: {s?.safety.automaticFundMovement ? 'Enabled' : 'Disabled'}</span><span>Guaranteed returns: {s?.safety.guaranteedReturns ? 'Claimed' : 'None'}</span>
      </div>
    </div>
    <div className="rounded-md border border-slate-800 overflow-hidden">
      <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Federated intelligence & compute</div>
      <div className="divide-y divide-slate-800">{(s?.providers || []).map(p => <div key={p.id} className="px-4 py-3 flex items-center justify-between"><div><div className="text-sm">{p.name}</div><div className="text-[10px] text-slate-500">{p.kind}</div></div><div className="text-[10px] uppercase text-slate-500">{p.enabled ? (p.healthy ? 'healthy' : 'enabled / unverified') : 'disabled'}</div></div>)}</div>
    </div>
    <div className="text-[11px] text-slate-500">AI models contribute intelligence and orchestration; they do not create physical mining hashrate. No evidence means no verified revenue.</div>
  </section>;
};
