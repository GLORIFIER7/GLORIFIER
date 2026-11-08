import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Database, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { SovereignStats, DataFootprintSource, MonetizationPolicy, CompensationTransaction } from '../types';
import {
  parseOperationalReport,
  summarizeEndpoint,
  summarizeOperationalReportResponse,
  summarizeRevenueEvidence,
  summarizeRuntime,
  type EndpointSummary,
  type OperationalReport,
} from '../lib/public-evidence-overview';

interface OverviewTabProps {
  stats: SovereignStats;
  footprints: DataFootprintSource[];
  policy: MonetizationPolicy;
  onUpdatePolicy: (newPolicy: Partial<MonetizationPolicy>) => void;
  onToggleFootprint: (id: string) => void;
  onNavigateToTab: (tab: string) => void;
  transactions: CompensationTransaction[];
}

type Observation = {
  httpStatus: number | null;
  body: unknown;
};

type Snapshot = Record<string, Observation>;

const ENDPOINTS = {
  health: '/api/health',
  reports: '/api/reports/summary',
  runtime: '/api/runtime-verification?probeAi=false',
  identity: '/api/identity',
  authBoundary: '/api/app-state',
  assets: '/api/assets/verification',
  valuation: '/api/valuation',
  economicOs: '/api/economic-os',
  revenueControlPlane: '/api/revenue/control-plane',
  monetization: '/api/monetization/dashboard',
  workUnits: '/api/work-units/summary',
} as const;

const readObservation = async (path: string, credentials: RequestCredentials = 'same-origin'): Promise<Observation> => {
  try {
    const response = await fetch(path, { cache: 'no-store', credentials });
    const body = await response.json().catch(() => null);
    return { httpStatus: response.status, body };
  } catch {
    return { httpStatus: null, body: null };
  }
};

const observationSummary = (observation?: Observation): EndpointSummary =>
  summarizeEndpoint(observation?.httpStatus ?? null, observation?.body);

const formatTimestamp = (value: string | null | undefined): string =>
  value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not supplied by the source';

const StatusPill: React.FC<{ label: string; tone?: 'good' | 'warn' | 'neutral' }> = ({ label, tone = 'neutral' }) => {
  const toneClass = tone === 'good'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : tone === 'warn'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-slate-700 bg-slate-900 text-slate-300';
  return <span className={'inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ' + toneClass}>{label}</span>;
};

const EndpointRow: React.FC<{ name: string; path: string; observation?: Observation }> = ({ name, path, observation }) => {
  const summary = observationSummary(observation);
  const tone = summary.label === 'RESPONDING' || summary.label === 'PROTECTED'
    ? 'good'
    : summary.label === 'NOT AVAILABLE' || summary.label === 'NOT READY' || summary.label === 'UNKNOWN'
      ? 'warn'
      : 'neutral';
  return (
    <div className="flex flex-col gap-1 border-b border-slate-800 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-200">{name}</div>
        <code className="text-[10px] text-slate-500">{path}</code>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{summary.detail}</p>
      </div>
      <StatusPill label={summary.label} tone={tone} />
    </div>
  );
};

export const OverviewTab: React.FC<OverviewTabProps> = ({ onNavigateToTab }) => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkWarning, setCheckWarning] = useState(false);

  const refresh = useCallback(async () => {
    const attemptedAt = new Date().toISOString();
    const keys = Object.keys(ENDPOINTS) as Array<keyof typeof ENDPOINTS>;
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        keys.map(async (key) => [key, await readObservation(ENDPOINTS[key], key === 'authBoundary' ? 'omit' : 'same-origin')] as const),
      );
      const entries = results.map((result, index) =>
        result.status === 'fulfilled'
          ? result.value
          : [keys[index], { httpStatus: null, body: null }] as const,
      );
      setSnapshot(Object.fromEntries(entries));
      setCheckWarning(results.some((result) => result.status === 'rejected'));
    } catch {
      setCheckWarning(true);
    } finally {
      setCheckedAt(attemptedAt);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const observation = (key: keyof typeof ENDPOINTS): Observation | undefined => snapshot?.[key];
  const report: OperationalReport | null = parseOperationalReport(observation('reports')?.body);
  const runtime = summarizeRuntime(observation('runtime')?.body);
  const health = observationSummary(observation('health'));
  const reportsStatus = summarizeOperationalReportResponse(observation('reports')?.httpStatus ?? null, observation('reports')?.body);
  const identity = observationSummary(observation('identity'));
  const authBoundary = observationSummary(observation('authBoundary'));
  const runtimePayload = observation('runtime')?.body as any;
  const databaseLatency = runtimePayload?.checks?.database?.latencyMs;
  const revenueEvidence = summarizeRevenueEvidence(report);
  const identityPayload = (observation('identity')?.body as any)?.identity;

  const legacyRoutes: ReadonlyArray<{ key: keyof typeof ENDPOINTS; name: string; path: string }> = [
    { key: 'assets', name: 'Asset custody and verification', path: ENDPOINTS.assets },
    { key: 'valuation', name: 'Valuation', path: ENDPOINTS.valuation },
    { key: 'economicOs', name: 'Economic operating system', path: ENDPOINTS.economicOs },
    { key: 'revenueControlPlane', name: 'Revenue control plane', path: ENDPOINTS.revenueControlPlane },
    { key: 'monetization', name: 'Monetization dashboard', path: ENDPOINTS.monetization },
    { key: 'workUnits', name: 'Work-unit summary', path: ENDPOINTS.workUnits },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-lg md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              <h1 className="text-xl font-bold text-white md:text-2xl">GLORIFIER production evidence</h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
              GLORIFIER is developing a provider-neutral AI orchestration and governance layer.
              This deployment exposes a public frontend and a limited set of Worker-native APIs.
              The checks below report only what the public production endpoints currently return;
              they do not certify every module or intended capability.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 disabled:opacity-50"
          >
            <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />
            {loading ? 'Checking…' : 'Refresh evidence'}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <span>Read-only GET checks</span>
          <span>•</span>
          <span>Checked: {formatTimestamp(checkedAt)}</span>
          <span>•</span>
          <span>Operational report timestamp: {formatTimestamp(report?.generatedAt)}</span>
        </div>
        {checkWarning && <p role="status" className="mt-2 text-[11px] text-amber-200">One or more checks could not be completed. Their status is shown as UNKNOWN rather than inferred.</p>}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cloudflare Worker</div>
          <div className="mt-2"><StatusPill label={health.label} tone={health.label === 'RESPONDING' ? 'good' : 'warn'} /></div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{health.detail}</p>
          <p className="mt-2 text-[10px] text-slate-500">The health endpoint says backend, authentication and database are not probed by that route.</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Neon operational reporting</div>
          <div className="mt-2"><StatusPill label={reportsStatus.label} tone={report ? 'good' : 'warn'} /></div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            {report
              ? 'Six exact row counts returned through Neon Hyperdrive. This verifies this read-only reporting query, not every database table, write path or application workflow.'
              : reportsStatus.detail}
          </p>
          {typeof databaseLatency === 'number' && <p className="mt-1 text-[10px] text-slate-500">Runtime probe latency: {databaseLatency.toLocaleString()} ms.</p>}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Organizational identity</div>
          <div className="mt-2"><StatusPill label={identity.label} tone={identity.label === 'RESPONDING' ? 'good' : 'warn'} /></div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{identity.detail}</p>
          <p className="mt-1 text-[10px] text-slate-500">
            Domain: {identityPayload?.domainConfigured === true ? 'configured' : 'not configured'} · Email: {identityPayload?.emailConfigured === true ? 'configured' : 'not configured'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Unauthenticated app-state boundary</div>
          <div className="mt-2"><StatusPill label={authBoundary.label} tone={authBoundary.label === 'PROTECTED' ? 'good' : 'warn'} /></div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{authBoundary.detail}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-emerald-400" />
          <h2 className="text-base font-bold text-white">Observed operational records</h2>
        </div>
        {report ? (
          <>
            <div className="mt-1 text-[11px] text-slate-400">
              Source: Neon Hyperdrive · exact row-count query · generated {formatTimestamp(report.generatedAt)}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {([
                ['Connection approvals', report.counts.connectionApprovals],
                ['Connection events', report.counts.connectionEvents],
                ['Registered connections', report.counts.registeredConnections],
                ['Intelligence analyses', report.counts.intelligenceAnalyses],
                ['Intelligence evidence rows', report.counts.intelligenceEvidence],
                ['Intelligence reports', report.counts.intelligenceReports],
              ] as const).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <div className="text-[10px] leading-relaxed text-slate-400">{label}</div>
                  <div className="mt-2 text-xl font-bold tabular-nums text-white">{value.toLocaleString()}</div>
                  <div className="mt-1 text-[9px] text-slate-500">Rows observed</div>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-[11px] leading-relaxed text-slate-400">
              These are database row counts, not unique people, customers, active sessions, sales, payments, revenue, asset holdings or proof of business outcomes.
            </p>
          </>
        ) : (
          <p className="mt-3 text-xs text-amber-200">{observationSummary(observation('reports')).detail} No counts are displayed when the required Neon evidence contract is absent.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-400" />
          <h2 className="text-base font-bold text-white">Runtime checks and limits</h2>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {([
            ['Worker', runtime.worker],
            ['Neon database', runtime.database],
            ['Neural integration', runtime.neural],
            ['Authentication probe', runtime.authentication],
            ['AI inference', runtime.ai],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
              <div className="text-[10px] text-slate-400">{label}</div>
              <div className="mt-2 text-xs font-semibold text-slate-200">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-100">
          The runtime request uses probeAi=false and does not execute an AI model. Neural readiness is displayed from the current runtime response above. A successful Worker or database probe does not establish AI inference or end-to-end agent execution.
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-300" />
          <h2 className="text-base font-bold text-white">Other Overview APIs</h2>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          These GET routes power asset, valuation, economic, monetization and work-unit panels. Their current response is shown individually; an unavailable route is not replaced with a guessed value.
        </p>
        <div className="mt-2">
          {legacyRoutes.map((route) => (
            <EndpointRow
              key={route.key}
              name={route.name}
              path={route.path}
              observation={observation(route.key)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <h2 className="text-base font-bold text-white">Economic and asset truth</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div className="text-[10px] uppercase text-slate-400">Revenue evidence</div>
            <div className="mt-2 text-sm font-bold text-amber-200">{revenueEvidence.label}</div>
            <p className="mt-1 text-[11px] text-slate-400">{revenueEvidence.detail}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div className="text-[10px] uppercase text-slate-400">Asset custody and holdings</div>
            <div className="mt-2 text-sm font-bold text-amber-200">{observationSummary(observation('assets')).label === 'RESPONDING' ? 'Endpoint responding; inspect item-level evidence' : 'NOT VERIFIED'}</div>
            <p className="mt-1 text-[11px] text-slate-400">No asset ownership or custody claim is made by the operational row counts.</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div className="text-[10px] uppercase text-slate-400">Company valuation</div>
            <div className="mt-2 text-sm font-bold text-amber-200">{observationSummary(observation('valuation')).label === 'RESPONDING' ? 'Model endpoint responding; estimate is not market value' : 'NOT OBSERVABLE'}</div>
            <p className="mt-1 text-[11px] text-slate-400">No company valuation or market price is inferred from software activity counts.</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="text-xs font-semibold text-slate-200">Architecture intent versus deployed proof</div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          Provider neutrality, governed agent workflows, broad interoperability and automated business execution are project objectives. This page verifies only the endpoints and evidence listed above. A navigation item, code module, configuration value, simulated example or passing unit test does not by itself establish a live integration, protocol conformance, production execution or economic outcome.
        </p>
        <button
          type="button"
          onClick={() => onNavigateToTab('integrations')}
          className="mt-3 rounded-md border border-slate-700 px-3 py-2 text-[11px] text-slate-300 hover:text-white"
        >
          Open integration module
        </button>
      </section>
    </div>
  );
};
