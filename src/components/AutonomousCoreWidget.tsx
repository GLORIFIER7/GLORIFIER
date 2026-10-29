import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CircleHelp, RefreshCw, ShieldCheck, Workflow, Network, LockKeyhole } from 'lucide-react';

type EvidenceStatus = 'verified' | 'partially-verified' | 'not-verified' | 'degraded' | 'not-observable';
type CheckResult = { status: EvidenceStatus; label: string; detail: string; checkedAt?: string; source: string };

const STATUS: Record<EvidenceStatus, { label: string; className: string; dot: string }> = {
  verified: { label: 'VERIFIED', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' },
  'partially-verified': { label: 'PARTIALLY VERIFIED', className: 'border-amber-500/30 bg-amber-500/10 text-amber-200', dot: 'bg-amber-400' },
  'not-verified': { label: 'NOT VERIFIED', className: 'border-rose-500/30 bg-rose-500/10 text-rose-300', dot: 'bg-rose-400' },
  degraded: { label: 'DEGRADED', className: 'border-orange-500/30 bg-orange-500/10 text-orange-300', dot: 'bg-orange-400' },
  'not-observable': { label: 'NOT OBSERVABLE', className: 'border-slate-700 bg-slate-900 text-slate-300', dot: 'bg-slate-500' },
};

const unavailable = (source: string, detail = 'No qualifying evidence was returned.') : CheckResult => ({
  status: 'not-observable', label: STATUS['not-observable'].label, detail, source,
});

function classifyRuntime(payload: any, source: string, checkedAt: string): CheckResult {
  if (!payload || typeof payload !== 'object') return unavailable(source, 'Response was not a valid JSON object.');
  if (payload.ok === true && payload.status === 'verified-for-probed-dependencies' && payload.checks?.database?.ok === true) {
    return { status: 'verified', label: STATUS.verified.label, detail: 'The runtime endpoint reports successful checks for the dependencies it actually probed. This does not establish overall production readiness.', checkedAt, source };
  }
  if (payload.ok === true && payload.checks && typeof payload.checks === 'object') {
    const failed = Object.entries(payload.checks).filter(([, value]: [string, any]) => value?.ok === false).map(([key]) => key);
    return { status: failed.length ? 'degraded' : 'partially-verified', label: failed.length ? STATUS.degraded.label : STATUS['partially-verified'].label, detail: failed.length ? `Failed probes: ${failed.join(', ')}.` : 'A response was received, but it does not satisfy the full verification contract.', checkedAt, source };
  }
  return { status: payload.status === 'not-ready' ? 'degraded' : 'not-verified', label: STATUS[payload.status === 'not-ready' ? 'degraded' : 'not-verified'].label, detail: String(payload.error || payload.reason || payload.code || 'Runtime verification contract was not satisfied.'), checkedAt, source };
}

function StatusBadge({ status }: { status: EvidenceStatus }) {
  const config = STATUS[status];
  return <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${config.className}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />{config.label}</span>;
}

function EvidenceCard({ title, description, result, icon: Icon }: { title: string; description: string; result: CheckResult; icon: React.ComponentType<{ className?: string }> }) {
  return <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3"><span className="rounded-xl border border-slate-700 bg-slate-950 p-2 text-cyan-300"><Icon className="h-4 w-4" aria-hidden="true" /></span><div><h3 className="text-sm font-semibold text-slate-100">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{description}</p></div></div>
    </div>
    <div className="mt-4"><StatusBadge status={result.status} /></div>
    <p className="mt-3 break-words text-xs leading-5 text-slate-300">{result.detail}</p>
    <dl className="mt-4 space-y-2 border-t border-slate-800 pt-3 text-[11px]">
      <div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><dt className="text-slate-500">Evidence source</dt><dd className="break-all text-slate-300 sm:text-right">{result.source}</dd></div>
      <div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><dt className="text-slate-500">Observed at</dt><dd className="text-slate-300 sm:text-right">{result.checkedAt || 'No timestamp'}</dd></div>
    </dl>
  </section>;
}

export const AutonomousCoreWidget: React.FC = () => {
  const [checks, setChecks] = useState<Record<string, CheckResult>>({
    health: unavailable('/api/health', 'Live probe has not run in this browser session.'),
    runtime: unavailable('/api/runtime-verification?probeAi=false', 'Live probe has not run in this browser session.'),
    ci: unavailable('GitHub Actions integration', 'No authenticated CI evidence adapter is connected to this widget.'),
    security: unavailable('Security evidence adapter', 'No current security scan result is connected to this widget.'),
    interoperability: unavailable('Provider and protocol registry', 'No current cross-provider probe is connected to this widget.'),
  });
  const [busy, setBusy] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<string | null>(null);
  const [notice, setNotice] = useState('Live checks have not run yet.');

  const refresh = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const checkedAt = new Date().toISOString();
    setLastAttempt(checkedAt);
    setNotice('Querying read-only runtime endpoints. Other domains remain not observable unless a verified adapter supplies evidence.');
    const endpoints = [
      { key: 'health', url: '/api/health', source: 'GET /api/health' },
      { key: 'runtime', url: '/api/runtime-verification?probeAi=false', source: 'GET /api/runtime-verification?probeAi=false' },
    ];

    const outcomes = await Promise.all(endpoints.map(async endpoint => {
      try {
        const response = await fetch(endpoint.url, { method: 'GET', cache: 'no-store', headers: { accept: 'application/json' } });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const status: EvidenceStatus = response.status >= 500 ? 'degraded' : 'not-verified';
          return [endpoint.key, { status, label: STATUS[status].label, detail: `HTTP ${response.status}. ${String(payload?.error || payload?.code || 'Endpoint did not return a successful response.')}`, checkedAt, source: endpoint.source }] as const;
        }
        if (endpoint.key === 'health') {
          const workerReady = payload?.ok === true && payload?.status === 'worker-ready' && payload?.layer === 'cloudflare-worker';
          const status: EvidenceStatus = workerReady ? 'verified' : 'partially-verified';
          return [endpoint.key, { status, label: STATUS[status].label, detail: workerReady ? 'Cloudflare Worker health endpoint responded successfully. This verifies the Worker layer only, not backend, authentication, database, or AI provider health.' : 'An HTTP-success response was received, but the Worker health contract was not fully satisfied.', checkedAt, source: endpoint.source }] as const;
        }
        return [endpoint.key, classifyRuntime(payload, endpoint.source, checkedAt)] as const;
      } catch (error) {
        return [endpoint.key, unavailable(endpoint.source, error instanceof Error ? error.message : 'Network request failed.')] as const;
      }
    }));

    setChecks(previous => ({ ...previous, ...Object.fromEntries(outcomes) }));
    setBusy(false);
    setNotice('Read-only probe completed. Only the endpoints listed below were queried; no deployment, credential change, merge, or protected operation was performed.');
  }, [busy]);

  useEffect(() => { void refresh(); }, []); // initial read-only probes only

  const summary = Object.values(checks).reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return <div className="space-y-6">
    <section className="relative isolate overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-20 [background-image:linear-gradient(rgba(100,116,139,.14)_1px,transparent_1px),linear-gradient(90deg,rgba(100,116,139,.14)_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="relative mx-auto flex h-32 w-32 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-slate-950 shadow-[0_0_40px_rgba(34,211,238,0.08)] sm:mx-0 sm:h-40 sm:w-40">
          <div aria-hidden="true" className="absolute inset-3 rounded-full border border-purple-400/30 motion-safe:animate-[spin_60s_linear_infinite]" />
          <div aria-hidden="true" className="absolute inset-6 rounded-full border border-cyan-400/20" />
          <span className="bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-6xl font-light text-transparent">∞</span>
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">GLORIFIER Services · Est. 2022</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Autonomous Core</h1>
          <p className="mt-2 text-sm text-slate-400">GEAS governance · runtime evidence · provider-neutral orchestration</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <span className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 font-mono text-xs text-purple-200">v∞.0 baseline</span>
            <span className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">System lock: designation only</span>
          </div>
        </div>
      </div>
      <p className="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs leading-5 text-slate-400">The immutable baseline is an architectural designation, not proof that deployed code or infrastructure is immutable. Statuses below are derived from observed responses or explicitly marked not observable.</p>
    </section>

    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-base font-semibold text-slate-100">Evidence registry</h2><p className="mt-1 text-xs leading-5 text-slate-400">Read-only probes. No secrets are requested or exposed.</p></div>
        <button type="button" onClick={() => void refresh()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-wait disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${busy ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />{busy ? 'Checking…' : 'Refresh evidence'}</button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(['verified','partially-verified','not-verified','degraded','not-observable'] as EvidenceStatus[]).map(status => <div key={status} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[10px] leading-4 text-slate-500">{STATUS[status].label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-slate-100">{summary[status] || 0}</p></div>)}
      </div>
      <p role="status" aria-live="polite" className="mt-4 text-xs leading-5 text-slate-400">{notice}</p>
      <p className="mt-1 text-[11px] text-slate-500">Last probe attempt: {lastAttempt || 'Not yet run'}</p>
    </section>

    <div className="grid gap-4 sm:grid-cols-2">
      <EvidenceCard title="Worker health" description="Checks the frontend-serving Worker layer only." result={checks.health} icon={Activity} />
      <EvidenceCard title="Runtime dependencies" description="Queries the configured runtime-verification contract without probing AI providers." result={checks.runtime} icon={CheckCircle2} />
      <EvidenceCard title="Verification CI" description="GitHub Actions must be connected through a trusted server-side adapter." result={checks.ci} icon={Workflow} />
      <EvidenceCard title="Security posture" description="Current dependency and security scan evidence is required." result={checks.security} icon={ShieldCheck} />
      <EvidenceCard title="AI interoperability" description="Provider, adapter and protocol health needs source-backed probes." result={checks.interoperability} icon={Network} />
    </div>

    <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 sm:p-5">
      <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" /><div><h2 className="text-sm font-semibold text-amber-100">GEAS protected-action boundary</h2><p className="mt-2 text-xs leading-5 text-slate-300">This widget does not merge pull requests, deploy services, change secrets, spend funds, or transfer assets. No approval backend is connected here; protected operations remain unavailable from this screen until an authenticated, auditable approval workflow is implemented.</p><p className="mt-3 flex items-center gap-2 text-[11px] text-slate-400"><LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" /> Human owner retains approval authority.</p></div></div>
    </section>

    <p className="flex items-start gap-2 px-1 text-[11px] leading-5 text-slate-500"><CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Evidence proves. AI synthesizes. A successful UI render or HTTP health response alone does not establish full production readiness.</p>
  </div>;
};

export default AutonomousCoreWidget;
