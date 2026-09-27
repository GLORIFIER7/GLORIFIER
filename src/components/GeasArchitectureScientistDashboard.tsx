import React, { useEffect, useMemo, useState } from 'react';

type Snapshot = {
  model: any;
  latestScan: any;
};

export function GeasArchitectureScientistDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/governance/geas/architecture', { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Unable to load GEAS architecture');
      setSnapshot(data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Architecture data unavailable');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const runScan = async () => {
    setScanning(true);
    try {
      const r = await fetch('/api/governance/geas/architecture/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Scan failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally { setScanning(false); }
  };

  const scan = snapshot?.latestScan;
  const sourceStats = useMemo(() => {
    const sources = scan?.sources || [];
    return { total: sources.length, healthy: sources.filter((x: any) => x.ok).length, unknown: sources.filter((x: any) => !x.ok).length };
  }, [scan]);

  if (loading) return <div className="p-6 text-sm opacity-70">Loading GEAS architecture intelligence…</div>;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] opacity-50">GEAS Enterprise Architecture Scientist</div>
          <h1 className="mt-1 text-2xl font-semibold">Architecture Intelligence</h1>
          <p className="mt-1 max-w-3xl text-sm opacity-65">Evidence-backed patterns, source health, architecture drift and governed recommendations. Read-only scanning; irreversible production changes are never executed.</p>
        </div>
        <button onClick={() => void runScan()} disabled={scanning} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">
          {scanning ? 'Scanning…' : 'Run authoritative scan'}
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 p-3 text-sm text-red-300">{error}</div>}

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Patterns" value={String(snapshot?.model?.patterns?.length ?? 0)} />
        <Metric label="Controls" value={String(snapshot?.model?.controls?.length ?? 0)} />
        <Metric label="Sources healthy" value={scan ? `${sourceStats.healthy}/${sourceStats.total}` : '—'} />
        <Metric label="Drift findings" value={String(scan?.drift?.length ?? 0)} />
      </div>

      <section className="rounded-xl border p-4">
        <div className="mb-3 text-sm font-medium">Architecture drift</div>
        <div className="space-y-2">
          {(scan?.drift || snapshot?.model?.drift || []).map((d: any) => (
            <div key={d.id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[120px_1fr]">
              <div className="text-xs uppercase opacity-55">{d.status} · {d.severity}</div>
              <div>
                <div className="text-sm font-medium">{d.controlId}</div>
                <div className="mt-1 text-sm opacity-70">{d.recommendation}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <div className="mb-3 text-sm font-medium">Authoritative pattern registry</div>
        <div className="space-y-2">
          {(snapshot?.model?.patterns || []).map((p: any) => (
            <div key={p.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">{p.title}</div>
                <span className="text-xs opacity-50">{p.domain}</span>
              </div>
              <div className="mt-1 text-sm opacity-70">{p.pattern}</div>
              <a className="mt-2 inline-block text-xs underline opacity-60" href={p.evidenceUrl} target="_blank" rel="noreferrer">Authoritative evidence</a>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <div className="mb-3 text-sm font-medium">GEAS operating invariants</div>
        <ul className="grid gap-2 text-sm opacity-75 md:grid-cols-2">
          <li>• Observed facts, analysis and recommendations remain distinct.</li>
          <li>• Missing evidence remains UNKNOWN.</li>
          <li>• Human authority remains final.</li>
          <li>• Provider substitution remains possible by design.</li>
          <li>• Policy is explicit and machine-evaluable where applicable.</li>
          <li>• Irreversible external actions require approval.</li>
        </ul>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border p-4"><div className="text-xs uppercase opacity-50">{label}</div><div className="mt-2 text-xl font-semibold">{value}</div></div>;
}
