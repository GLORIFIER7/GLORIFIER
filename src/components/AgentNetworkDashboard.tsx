import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Search, ShieldCheck, Network, ArrowRight, RefreshCw, Handshake, FileCheck2 } from 'lucide-react';

type Agent = {
  id: string;
  name: string;
  provider: string;
  role: string;
  protocol: string;
  capabilities: string[];
  status: string;
  risk: string;
  scopes: string[];
  lastVerifiedAt?: string | null;
};

type Recommendation = Agent & { score?: number; reasons?: string[] };

export const AgentNetworkDashboard: React.FC = () => {
  const [agents, setAgents] = useState<Recommendation[]>([]);
  const [query, setQuery] = useState('');
  const [capability, setCapability] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = capability.trim() ? `?capability=${encodeURIComponent(capability.trim())}&limit=24` : '?limit=24';
      const discovery = await fetch(`/api/agents/discover${params}`, { cache: 'no-store' });
      if (discovery.ok) {
        const payload = await discovery.json();
        setAgents(Array.isArray(payload.recommendations) ? payload.recommendations : []);
        return;
      }
      const registry = await fetch('/api/agents/registry', { cache: 'no-store' });
      if (!registry.ok) throw new Error(`Agent network HTTP ${registry.status}`);
      const payload = await registry.json();
      setAgents(Array.isArray(payload.agents) ? payload.agents : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Agent network unavailable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(a =>
      [a.name, a.provider, a.role, a.protocol, ...(a.capabilities || [])].join(' ').toLowerCase().includes(q)
    );
  }, [agents, query]);

  const statusLabel = (status: string) => status === 'active' || status === 'authorized' ? 'Connected' : status === 'discovered' ? 'Discoverable' : status;

  return (
    <section className="space-y-6">
      <div className="border-b border-slate-800 pb-5">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono uppercase tracking-wider">
              <Network className="h-4 w-4" /> AI Agent Network
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Discover. Collaborate. Verify.</h2>
            <p className="mt-1 text-sm text-slate-400 max-w-2xl">
              A provider-neutral discovery layer for AI agents. Relevance, protocol compatibility and evidence guide discovery; discovery never grants execution authority.
            </p>
          </div>
          <button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh network
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_260px] gap-3">
        <label className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
          <Search className="h-4 w-4 text-slate-500" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search agents, providers, roles or capabilities..." className="w-full bg-transparent outline-none text-sm text-white placeholder:text-slate-600" />
        </label>
        <input value={capability} onChange={e => setCapability(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void load(); }} placeholder="Capability filter (e.g. research)" className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none" />
      </div>

      {error && <div className="rounded-md border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-300">{error}</div>}

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {visible.map(agent => (
          <article key={agent.id} className="rounded-lg border border-slate-800 bg-[#0b0b0b] p-4 hover:border-slate-700 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-md border border-slate-700 bg-slate-900 flex items-center justify-center"><Bot className="h-5 w-5 text-emerald-400" /></div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
                  <p className="text-[11px] text-slate-500">{agent.provider} · {agent.role}</p>
                </div>
              </div>
              {agent.score !== undefined && <span className="font-mono text-[10px] text-emerald-300">{Math.round(agent.score * 100)}% match</span>}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {(agent.capabilities || []).slice(0, 6).map(c => <span key={c} className="rounded border border-slate-800 px-2 py-1 text-[10px] text-slate-400">{c}</span>)}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-900 flex items-center justify-between text-[10px]">
              <span className="inline-flex items-center gap-1 text-slate-400"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> {statusLabel(agent.status)}</span>
              <span className="font-mono text-slate-600">{agent.protocol}</span>
            </div>
            {agent.reasons?.length ? <p className="mt-2 text-[10px] text-slate-600">{agent.reasons.join(' · ')}</p> : null}
            <button className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-md border border-slate-800 py-2 text-xs text-slate-300 hover:bg-slate-900">
              <Handshake className="h-3.5 w-3.5" /> Request governed collaboration <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </article>
        ))}
      </div>

      {!loading && !visible.length && <div className="rounded-lg border border-dashed border-slate-800 p-10 text-center text-sm text-slate-500">No matching agents discovered yet.</div>}

      <div className="grid md:grid-cols-3 gap-3">
        {[
          ['Capability graph', 'Find agents by what they can actually do.', Search],
          ['Evidence reputation', 'Verification events strengthen discoverability without creating fake trust.', FileCheck2],
          ['Governed handoff', 'A discovery match becomes an A2A task only through policy and authority controls.', ShieldCheck]
        ].map(([title, body, Icon]) => {
          const I = Icon as React.ComponentType<{className?: string}>;
          return <div key={String(title)} className="rounded-lg border border-slate-800 bg-slate-950 p-4"><I className="h-4 w-4 text-emerald-400" /><h4 className="mt-3 text-xs font-semibold text-white">{title}</h4><p className="mt-1 text-[11px] leading-5 text-slate-500">{body}</p></div>;
        })}
      </div>
    </section>
  );
};
