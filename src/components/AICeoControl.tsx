import React, { useEffect, useState } from 'react';
import {
  BrainCircuit,
  ShieldCheck,
  UserCheck,
  Bot,
  RefreshCw,
  Globe,
  CheckCircle2,
  Cpu,
  Zap,
  Lock,
  Radio,
  Network,
  Scale,
  FileCode,
  Layers,
  ArrowRight
} from 'lucide-react';
import { buildAICeoStatus } from '../lib/ai-ceo';
import { GlobalSyncManifest } from '../lib/global-sync';

type Agent = { id: string; role: string; authority: string };
type Status = {
  role: string;
  version: string;
  status: string;
  authority: Record<string, boolean>;
  chainOfCommand: string[];
  agents: Agent[];
  operatingPrinciples: string[];
  generatedAt: string;
};

export const AICeoControl: React.FC = () => {
  const [status, setStatus] = useState(() => buildAICeoStatus());
  const [manifest, setManifest] = useState<GlobalSyncManifest | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const loadStatus = () => {
    setStatus(buildAICeoStatus());
  };

  const loadSyncManifest = async () => {
    try {
      const res = await fetch('/api/sync/global');
      if (res.ok) {
        const data = await res.json();
        if (data.manifest) {
          setManifest(data.manifest);
        }
      }
    } catch (err) {
      console.warn('Unable to load initial global sync manifest:', err);
    }
  };

  const handleTriggerFullSync = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await fetch('/api/sync/global', { method: 'POST' });
      const data = await res.json();
      if (data.ok && data.manifest) {
        setManifest(data.manifest);
        setSyncFeedback('Governed synchronization completed for the connected GLORIFIER registry.');
      } else {
        throw new Error(data.error || 'Synchronization returned non-ok status');
      }
    } catch (err: any) {
      setSyncFeedback(`Global sync failed: ${err.message}. No local fallback or synthetic synchronization was claimed.`);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    void loadSyncManifest();
  }, []);

  return (
    <section className="space-y-6">
      {/* AI CEO Master Header */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-400 ring-1 ring-emerald-500/20">
              <BrainCircuit className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black tracking-tight text-white">GLORIFIER AI CEO</h2>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                  GPT Orchestration • Provider-Neutral
                </span>
              </div>
              <p className="text-sm text-slate-400">
                GPT-led orchestration with governed provider routing • Evidence before execution
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerFullSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Running Governed GPT Sync...' : 'Run Governed GPT Sync'}
            </button>
            <button
              onClick={loadStatus}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reload Policy
            </button>
          </div>
        </div>

        {syncFeedback && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs font-medium text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{syncFeedback}</span>
          </div>
        )}

        {/* Executive Authority & Governance Cards */}
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <UserCheck className="mb-2 h-5 w-5 text-emerald-400" />
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Final Authority</div>
            <div className="mt-1 font-bold text-emerald-300">Human Owner (Supreme Rights)</div>
            <p className="mt-1 text-xs text-slate-400">Deployment, merges, secrets & financial commitments require human approval.</p>
          </div>
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <ShieldCheck className="mb-2 h-5 w-5 text-cyan-400" />
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Operational Principle</div>
            <div className="mt-1 font-bold text-cyan-300">Evidence Proves. AI Synthesizes.</div>
            <p className="mt-1 text-xs text-slate-400">Agents operate, agents collaborate, humans govern.</p>
          </div>
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
            <Bot className="mb-2 h-5 w-5 text-violet-400" />
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500">A2A Protocol & Fleet State</div>
            <div className="mt-1 font-bold text-violet-300">GLORIFIER-A2A-v1 • 100% Consensus</div>
            <p className="mt-1 text-xs text-slate-400">Continuous 24/7 pairing across OpenAI GPT-4o, Gemini & Codex fleet.</p>
          </div>
        </div>
      </div>

      {/* Global Synthesis & Synchronization Manifest */}
      {manifest && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Radio className="h-5 w-5 text-emerald-400 animate-pulse" />
                <h3 className="text-lg font-bold text-white">Global Synthesis & Synchronization Manifest</h3>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                  Consensus: {manifest.consensusScore}%
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Synchronized at: {new Date(manifest.synchronizedAt).toLocaleString()} • Manifest ID: {manifest.id}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-[11px] text-slate-400">
                SHA-256 Evidence: {manifest.evidenceDigestSha256.slice(0, 16)}...
              </span>
            </div>
          </div>

          {/* Executive Synthesis Summary */}
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">Executive Multi-Model Synthesis Verdict</div>
            <p className="mt-1 text-sm leading-relaxed text-slate-200">
              {manifest.executiveSynthesis}
            </p>
          </div>

          {/* Synchronized AI Agents Grid */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-cyan-400" />
                Synchronized AI Agent Fleet ({manifest.agents.length} Active Nodes)
              </h4>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {manifest.agents.map(agent => (
                <div key={agent.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 hover:border-slate-700 transition">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-white">{agent.name}</span>
                    <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                      {agent.status}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{agent.role}</div>
                  <p className="mt-2 text-xs text-slate-300 line-clamp-2 bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                    "{agent.consensusContribution}"
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {agent.capabilities.slice(0, 3).map(cap => (
                      <span key={cap} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400 font-mono">
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Synchronized Internet Nodes Grid */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Globe className="h-4 w-4 text-emerald-400" />
                Synchronized Internet & Infrastructure Footprints ({manifest.internetNodes.length} Nodes)
              </h4>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {manifest.internetNodes.map(node => (
                <div key={node.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-white">{node.name}</span>
                    <span className="rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-400">
                      {node.status}
                    </span>
                  </div>
                  <a
                    href={node.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block text-xs font-mono text-emerald-400 hover:underline truncate"
                  >
                    {node.url}
                  </a>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Category: {node.category}</span>
                    <span>Synced: Just now</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Prioritized Directives */}
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              Prioritized Operational Directives
            </h4>
            <div className="grid gap-2 md:grid-cols-2">
              {manifest.prioritizedDirectives.map((dir, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                  <span className="font-mono text-emerald-400 font-bold">{idx + 1}.</span>
                  <span>{dir}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chain of Command */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Layers className="h-4 w-4 text-violet-400" />
          Synchronized Chain of Command
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {status.chainOfCommand.map((item, index) => (
            <React.Fragment key={item}>
              <span className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
                {item}
              </span>
              {index < status.chainOfCommand.length - 1 && (
                <ArrowRight className="h-4 w-4 text-emerald-500" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Executive Guardrails */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Lock className="h-4 w-4 text-cyan-400" />
          Permanent Executive Guardrails
        </h3>
        <ul className="grid gap-2 md:grid-cols-2">
          {status.operatingPrinciples.map(item => (
            <li key={item} className="flex items-center gap-2 text-xs text-slate-300">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
