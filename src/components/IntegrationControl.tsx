import React, { useEffect, useState } from 'react';
import { Activity, CheckCircle2, CircleAlert, ExternalLink, Globe2, LockKeyhole, RefreshCw } from 'lucide-react';
import { IntelligenceHub } from './IntelligenceHub';
import { MediatorDashboard } from './MediatorDashboard';

type CollaborationProvider = { id: string; name: string; category: string; capabilities: string[]; status: string; authorized: boolean; requiresHumanApproval: boolean; connectionId: string | null; scopes: string[]; };

type DataClassification = {
  verificationStatus: 'verified' | 'not-verified';
  configurationStatus: 'configured' | 'needs-configuration' | 'available' | 'optional';
  verificationEvidence: string | null;
  truthRule: string;
};

type Integration = {
  id: string;
  name: string;
  category: string;
  status: string;
  detail: string;
  publicUrl: string;
  verificationStatus?: DataClassification['verificationStatus'];
  configurationStatus?: DataClassification['configurationStatus'];
  verificationEvidence?: string | null;
  truthRule?: string;
};

type DataStatus = {
  ok: boolean;
  generatedAt: string;
  policy: {
    verifiedMeansEvidenceBacked: boolean;
    configuredDoesNotMeanVerified: boolean;
    estimatedDoesNotMeanVerified: boolean;
    humanFinalAuthority: boolean;
  };
  summary: {
    total: number;
    verified: number;
    notVerified: number;
    configured: number;
    needsConfiguration: number;
  };
  data: Integration[];
};

type Registry = {
  ok: boolean;
  generatedAt: string;
  policy: {
    secretsExposed: boolean;
    privateCredentialsReturned: boolean;
    coreInfrastructureIndependentOfGoogleCloud: boolean;
  };
  integrations: Integration[];
};

const statusLabel: Record<string, string> = {
  connected: 'Connected',
  configured: 'Configured',
  ready: 'Ready',
  available: 'Available',
  'public-monitoring': 'Public monitoring',
  planned: 'Planned',
  optional: 'Optional',
  'needs-config': 'Needs configuration'
};

export const IntegrationControl: React.FC = () => {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collaboration, setCollaboration] = useState<CollaborationProvider[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [agentSyncing, setAgentSyncing] = useState(false);
  const [agentSyncMessage, setAgentSyncMessage] = useState('');
  const [bountyPrograms, setBountyPrograms] = useState<any[]>([]);
  const [bountyFindings, setBountyFindings] = useState<any[]>([]);
  const [bountyRevenue, setBountyRevenue] = useState<any[]>([]);
  const [alpacaStatus, setAlpacaStatus] = useState<any[]>([]);
  const [alpacaMessage, setAlpacaMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/integrations', { cache: 'no-store' });
      if (!response.ok) throw new Error('Integration registry unavailable');
      setRegistry(await response.json());

      const dataStatusResponse = await fetch('/api/data-status', { cache: 'no-store' });
      if (dataStatusResponse.ok) setDataStatus(await dataStatusResponse.json());

      const collaborationResponse = await fetch('/api/collaboration/status', { cache: 'no-store' });
      if (collaborationResponse.ok) setCollaboration((await collaborationResponse.json()).providers || []);

      const agentResponse = await fetch('/api/agents/registry', { cache: 'no-store' });
      if (agentResponse.ok) setAgents((await agentResponse.json()).agents || []);

      const bountyResponse = await fetch('/api/bounties/programs', { cache: 'no-store' });
      if (bountyResponse.ok) setBountyPrograms((await bountyResponse.json()).programs || []);

      const findingResponse = await fetch('/api/bounties/findings', { cache: 'no-store' });
      if (findingResponse.ok) setBountyFindings((await findingResponse.json()).findings || []);

      const revenueResponse = await fetch('/api/bounties/revenue', { cache: 'no-store' });
      if (revenueResponse.ok) setBountyRevenue((await revenueResponse.json()).summary || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load integration registry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <section className="space-y-6">
      <MediatorDashboard />
      <div className="border-t border-slate-900 pt-6" />
      {dataStatus && (
        <section className="border border-slate-800 bg-slate-950 p-5">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Data truth control</div>
              <h2 className="text-xl font-semibold text-white mt-1">Verification & Configuration</h2>
              <p className="text-xs text-slate-400 mt-1">Configuration or connection never proves truth. Only qualifying evidence can mark data verified.</p>
            </div>
            <div className="text-[10px] text-slate-500">Updated {new Date(dataStatus.generatedAt).toLocaleString()}</div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-800 mt-5 border border-slate-800">
            {[
              ['Total', dataStatus.summary.total],
              ['Verified', dataStatus.summary.verified],
              ['Not verified', dataStatus.summary.notVerified],
              ['Needs configuration', dataStatus.summary.needsConfiguration],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-slate-950 p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
                <div className="text-2xl font-semibold text-white mt-1">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-3">Integration</th>
                  <th className="px-3 py-3">Configuration</th>
                  <th className="px-3 py-3">Truth</th>
                  <th className="px-3 py-3">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {dataStatus.data.map((item) => (
                  <tr key={item.id} className="border-b border-slate-900 last:border-0">
                    <td className="px-3 py-3">
                      <div className="font-medium text-white">{item.name}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{item.category}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex border border-slate-700 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300">
                        {item.configurationStatus === 'needs-configuration' ? 'Needs configuration' : item.configurationStatus}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex border px-2 py-1 text-[10px] uppercase tracking-wide ${item.verificationStatus === 'verified' ? 'border-emerald-500/40 text-emerald-300' : 'border-amber-500/40 text-amber-300'}`}>
                        {item.verificationStatus === 'verified' ? 'Verified' : 'Not verified'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      {item.verificationEvidence || 'No qualifying evidence recorded'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-[10px] text-slate-500">
            Policy: {dataStatus.policy.configuredDoesNotMeanVerified ? 'configured ≠ verified' : 'configuration policy unavailable'} · {dataStatus.policy.estimatedDoesNotMeanVerified ? 'estimated ≠ verified' : 'estimate policy unavailable'} · Human final authority: {dataStatus.policy.humanFinalAuthority ? 'active' : 'not confirmed'}.
          </div>
        </section>
      )}

      <IntelligenceHub />
      <div className="border-t border-slate-800 pt-8" />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Global Integration Control</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">One control surface for public web presence, code, AI, data and infrastructure integrations.</p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Alpaca brokerage — read-only</div>
            <p className="text-xs text-slate-400 mt-1">Official OAuth authorization only. GLORIFIER does not enable trading or fund movement.</p>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Human authorization</span>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={async () => {
            try {
              setAlpacaMessage('Opening official Alpaca authorization…');
              const r = await fetch('/api/broker/alpaca/connect?env=live', { cache: 'no-store' });
              const d = await r.json();
              if (!r.ok) throw new Error(d.error || 'OAuth configuration unavailable');
              window.location.assign(d.authorizationUrl);
            } catch (e) { setAlpacaMessage(e instanceof Error ? e.message : 'Unable to start authorization'); }
          }} className="px-3 py-2 rounded-lg bg-white text-slate-950 text-xs font-semibold">Connect live account</button>
          <button onClick={async () => {
            try {
              setAlpacaMessage('Opening official Alpaca paper authorization…');
              const r = await fetch('/api/broker/alpaca/connect?env=paper', { cache: 'no-store' });
              const d = await r.json();
              if (!r.ok) throw new Error(d.error || 'OAuth configuration unavailable');
              window.location.assign(d.authorizationUrl);
            } catch (e) { setAlpacaMessage(e instanceof Error ? e.message : 'Unable to start authorization'); }
          }} className="px-3 py-2 rounded-lg border border-slate-700 text-slate-200 text-xs font-semibold">Connect paper account</button>
          <button onClick={async () => {
            try {
              const r = await fetch('/api/broker/alpaca/status', { cache: 'no-store' });
              const d = await r.json();
              if (!r.ok) throw new Error(d.error || 'Status unavailable');
              setAlpacaStatus(d.status || []);
              setAlpacaMessage('Status refreshed from the authenticated backend.');
            } catch (e) { setAlpacaMessage(e instanceof Error ? e.message : 'Unable to read broker status'); }
          }} className="px-3 py-2 rounded-lg border border-slate-800 text-slate-400 text-xs font-semibold">Refresh status</button>
        </div>
        {alpacaStatus.length > 0 && <div className="mt-3 space-y-2">
          {alpacaStatus.map((item: any) => <div key={item.id} className="border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
            <div className="text-emerald-300 font-semibold">Authorized · {item.environment}</div>
            <div className="text-slate-400 mt-1">Read-only: yes · Trading: disabled · Fund movement: disabled · Account: {item.accountRef || 'not observed'}</div>
          </div>)}
        </div>}
        {alpacaMessage && <div className="mt-3 text-xs text-slate-500">{alpacaMessage}</div>}
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
          <LockKeyhole className="w-4 h-4" /> Credential isolation
        </div>
        <p className="text-xs text-slate-400 mt-1">The registry exposes integration status only. API keys, tokens, database URLs and private credentials are never returned to the browser.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</div>
      )}

      {collaboration.length > 0 && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5">
          <div className="flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-indigo-300" />
            <h3 className="font-semibold text-white">Global Synthesis & Collaboration</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">External AI and platform ecosystems use the same connection, authorization and audit model.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            {collaboration.map((provider) => (
              <div key={provider.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-white">{provider.name}</span>
                  <span className="text-[10px] rounded-full px-2 py-1 bg-slate-800 text-slate-300">{provider.authorized ? 'Authorized' : 'Discovered / permission-gated'}</span>
                </div>
                <div className="text-[10px] text-slate-500 uppercase mt-2">{provider.category}</div>
                <div className="flex flex-wrap gap-1 mt-3">{provider.capabilities.map((cap) => <span key={cap} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400">{cap}</span>)}</div>
                <div className="text-[10px] text-emerald-400 mt-3">Human approval required for consequential actions</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {agents.length > 0 && (
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Globe2 className="w-5 h-5 text-cyan-300" />
                <h3 className="font-semibold text-white">Global Agent Registry</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">Protocol-aware discovery and synchronization for internal and authorized external agents.</p>
            </div>
            <button
              onClick={async () => {
                setAgentSyncing(true); setAgentSyncMessage('');
                try {
                  const response = await fetch('/api/agents/synchronize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor: 'human-owner' }) });
                  const data = await response.json();
                  if (!response.ok) throw new Error(data.error || 'Synchronization failed');
                  setAgentSyncMessage(`Synchronized ${data.agentCount} agents; audit records written to Neon.`);
                  await load();
                } catch (err) {
                  setAgentSyncMessage(err instanceof Error ? err.message : 'Synchronization failed');
                } finally { setAgentSyncing(false); }
              }}
              disabled={agentSyncing}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-xs font-semibold text-cyan-200 border border-cyan-500/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${agentSyncing ? 'animate-spin' : ''}`} /> {agentSyncing ? 'Syncing…' : 'Synchronize agents'}
            </button>
          </div>
          {agentSyncMessage && <div className="mt-3 text-xs text-cyan-300">{agentSyncMessage}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            {agents.map((agent) => (
              <div key={agent.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-white">{agent.name}</span>
                  <span className="text-[10px] rounded-full px-2 py-1 bg-slate-800 text-slate-300">{agent.status}</span>
                </div>
                <div className="text-[10px] text-slate-500 uppercase mt-2">{agent.provider} · {agent.protocol}</div>
                <div className="flex flex-wrap gap-1 mt-3">{(agent.capabilities || []).map((cap: string) => <span key={cap} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400">{cap}</span>)}</div>
                <div className="text-[10px] text-emerald-400 mt-3">{agent.requiresHumanApproval ? 'Human approval required for consequential actions' : 'No approval gate'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {bountyPrograms.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-300" />
            <h3 className="font-semibold text-white">AI Bounty Hunter & Security Research</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">Discover legitimate bounty programs, map authorized scope, assist with security research, prepare evidence, and track rewards. Testing and submission remain authorization- and human-review gated.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            {bountyPrograms.map((program) => (
              <div key={program.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">{program.platform}</span>
                  <span className="text-[10px] rounded-full px-2 py-1 bg-slate-800 text-slate-300">{program.status}</span>
                </div>
                <div className="text-xs text-slate-300 mt-2">{program.name}</div>
                <div className="text-[10px] text-slate-500 uppercase mt-2">{program.programType} · {program.rewardCurrency}</div>
                <div className="flex flex-wrap gap-1 mt-3">{(program.capabilities || []).map((cap: string) => <span key={cap} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400">{cap}</span>)}</div>
                <div className="text-[10px] text-amber-300 mt-3">Authorized scope required · human review before submission</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div className="text-xs font-semibold text-white">Research pipeline</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2 text-[10px]">
              {['AI discovery','Scope verification','Evidence','Human review','Submission / reward'].map((step) => <div key={step} className="rounded bg-slate-900 px-2 py-2 text-slate-400">{step}</div>)}
            </div>
            <div className="text-[10px] text-slate-500 mt-2">{bountyFindings.length} tracked finding(s); no automatic exploitation or financial commitment.</div>
          </div>
        </div>
      )}

      {bountyPrograms.length > 0 && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <div className="text-sm font-semibold text-white">Bounty Revenue Ledger</div>
          <p className="text-xs text-slate-400 mt-1">Tracks verified rewards and payouts only; GLORIFIER does not invent earnings or move funds automatically.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {bountyRevenue.length === 0 ? (
              <div className="text-xs text-slate-500">No confirmed bounty revenue recorded yet.</div>
            ) : bountyRevenue.map((item: any) => (
              <div key={item.currency} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className="text-[10px] uppercase text-slate-500">{item.currency}</div>
                <div className="text-xl font-bold text-emerald-300 mt-1">{item.netConfirmed.toLocaleString()}</div>
                <div className="text-[10px] text-slate-500 mt-1">Confirmed net · {item.eventCount} ledger events</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {registry && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-500 uppercase">Integrations</div>
              <div className="text-2xl font-bold text-white mt-1">{registry.integrations.length}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-500 uppercase">Credentials exposed</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{registry.policy.secretsExposed ? 'Yes' : 'No'}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-500 uppercase">GCP dependency</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{registry.policy.coreInfrastructureIndependentOfGoogleCloud ? 'Optional' : 'Required'}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {registry.integrations.map((item) => {
              const active = ['connected', 'configured', 'public-monitoring'].includes(item.status);
              return (
                <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {active ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <CircleAlert className="w-4 h-4 text-amber-400 shrink-0" />}
                      <h3 className="font-semibold text-white">{item.name}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">{statusLabel[item.status] || item.status}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">{item.detail}</p>
                    <div className="text-[10px] text-slate-600 mt-2 uppercase tracking-wider">{item.category}</div>
                  </div>
                  <a href={item.publicUrl} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-emerald-400 shrink-0" aria-label={`Open ${item.name}`}>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              );
            })}
          </div>

          <div className="text-[10px] text-slate-600 flex items-center gap-1">
            <Activity className="w-3 h-3" /> Registry refreshed {new Date(registry.generatedAt).toLocaleString()}
          </div>
        </>
      )}
    </section>
  );
};
