import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock3,
  Code2,
  FlaskConical,
  Globe2,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  InternetIssue,
  ScientistAgent,
  ScientistMonetizationState,
} from '../lib/scientist-fleet';

interface AiScientistFleetConsoleProps {
  onAddEarnings?: (amount: number, description: string) => void;
  onOpenWithdrawModal?: () => void;
}

const DOMAIN_LABELS: Record<string, string> = {
  security_vulnerabilities: 'Security',
  performance_systems: 'Performance',
  statutory_compliance: 'Compliance',
  api_interoperability: 'Interoperability',
  monetization_arbitrage: 'Economics',
};

const STATUS_LABELS: Record<string, string> = {
  detected: 'Detected',
  investigating: 'Investigating',
  patch_generated: 'Patch ready',
  verified_resolved: 'Resolved',
  bounty_claimed: 'Resolved',
};

export const AiScientistFleetConsole: React.FC<AiScientistFleetConsoleProps> = () => {
  const [fleet, setFleet] = useState<ScientistAgent[]>([]);
  const [issues, setIssues] = useState<InternetIssue[]>([]);
  const [state, setState] = useState<ScientistMonetizationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadData = async () => {
    try {
      const [fleetRes, issuesRes, stateRes] = await Promise.all([
        fetch('/api/scientists/fleet', { cache: 'no-store' }),
        fetch('/api/scientists/issues', { cache: 'no-store' }),
        fetch('/api/scientists/monetization', { cache: 'no-store' }),
      ]);

      if (fleetRes.ok) {
        const data = await fleetRes.json();
        setFleet(data.fleet || []);
      }
      if (issuesRes.ok) {
        const data = await issuesRes.json();
        setIssues(data.issues || []);
      }
      if (stateRes.ok) {
        const data = await stateRes.json();
        setState(data.state || null);
      }
    } catch (error) {
      console.error('Scientist fleet refresh failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = window.setInterval(loadData, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const toggleFleet = async () => {
    if (!state || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/scientists/loop/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !state.is247AutonomousRunning }),
      });
      if (response.ok) {
        const data = await response.json();
        setState((current) =>
          current
            ? { ...current, is247AutonomousRunning: data.is247AutonomousRunning }
            : current,
        );
      }
    } catch (error) {
      console.error('Scientist fleet toggle failed:', error);
    } finally {
      setBusy(false);
    }
  };

  const activeIssues = useMemo(
    () => issues.filter((issue) => !['verified_resolved', 'bounty_claimed'].includes(issue.status)),
    [issues],
  );

  const resolvedCount = issues.length - activeIssues.length;
  const running = Boolean(state?.is247AutonomousRunning);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <FlaskConical className="h-4 w-4 text-emerald-400" />
              SCIENTIST FLEET
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">
              Autonomous intelligence workers
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Five domain specialists continuously discover, diagnose, test, and report issues under GLORIFIER governance.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
              running
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-700 bg-slate-900 text-slate-400'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${
                running ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`} />
              {running ? 'Running 24/7' : 'Paused'}
            </span>
            <button
              type="button"
              onClick={toggleFleet}
              disabled={busy || !state}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : running ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {running ? 'Pause' : 'Resume'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-4 sm:grid-cols-4">
          {[
            ['Agents', fleet.length || 5],
            ['Active issues', activeIssues.length],
            ['Resolved', resolvedCount],
            ['Cycle', state?.cycleCount || 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg bg-slate-900/70 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-slate-200">{value}</div>
            </div>
          ))}
        </div>
      </header>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Specialists</div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" />
            Governance controlled
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-6 text-sm text-slate-500">
            Loading fleet…
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {fleet.map((scientist) => (
              <article
                key={scientist.id}
                className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 transition hover:border-slate-700"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr ${
                    scientist.avatarGradient || 'from-slate-700 to-slate-800'
                  } text-xs font-bold text-white`}>
                    {scientist.codename.slice(0, 2)}
                  </div>
                  <Activity className={`h-4 w-4 ${running ? 'text-emerald-400' : 'text-slate-600'}`} />
                </div>
                <div className="mt-3 font-mono text-[11px] font-semibold text-emerald-400">
                  {scientist.codename}
                </div>
                <h3 className="mt-0.5 text-sm font-semibold text-white">{scientist.name}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{scientist.title}</p>
                {scientist.currentTask && (
                  <div className="mt-3 border-t border-slate-800 pt-3">
                    <div className="text-[10px] uppercase tracking-wide text-slate-600">Current task</div>
                    <div className="mt-1 line-clamp-2 text-[11px] text-slate-300">{scientist.currentTask}</div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Work queue</div>
            <div className="text-xs text-slate-500">Evidence and remediation candidates discovered by the fleet.</div>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1.5 text-[11px] text-slate-400 hover:bg-slate-900 hover:text-slate-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
          {activeIssues.length === 0 ? (
            <div className="flex items-center gap-3 p-5 text-sm text-slate-500">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              No active issues in the current queue.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {activeIssues.slice(0, 8).map((issue) => (
                <div key={issue.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{issue.title}</span>
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] text-slate-400">
                        {DOMAIN_LABELS[issue.domain] || issue.domain}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-slate-500">
                      <Globe2 className="h-3 w-3 shrink-0" />
                      {issue.target}
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-slate-400">{issue.summary}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <Clock3 className="h-3.5 w-3.5" />
                      {STATUS_LABELS[issue.status] || issue.status}
                    </span>
                    {issue.diagnosticDetails?.cveOrCode && (
                      <span className="inline-flex items-center gap-1 font-mono text-amber-400">
                        <Code2 className="h-3.5 w-3.5" />
                        {issue.diagnosticDetails.cveOrCode}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="flex items-center gap-2 border-t border-slate-900 pt-3 text-[11px] text-slate-600">
        <Zap className="h-3.5 w-3.5" />
        Continuous operation remains subject to provider availability, authorization, safety controls, and human governance gates.
      </footer>
    </div>
  );
};
