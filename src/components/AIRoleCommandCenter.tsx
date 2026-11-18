import React, { useState } from 'react';
import { Scale, BarChart3, Send, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';

type Role = 'attorney' | 'dataScientist';

const roleConfig = {
  attorney: {
    label: 'AI Attorney',
    subtitle: 'Data policy & compliance',
    icon: Scale,
    placeholder: 'Review our data retention policy for privacy, consent, deletion, and compliance risks...',
  },
  dataScientist: {
    label: 'AI Data Scientist',
    subtitle: 'Analysis & evidence',
    icon: BarChart3,
    placeholder: 'Analyze this dataset, metric movement, experiment, or schema and identify key findings...',
  },
} as const;

export const AIRoleCommandCenter: React.FC = () => {
  const [role, setRole] = useState<Role>('attorney');
  const [task, setTask] = useState('');
  const [context, setContext] = useState('');
  const [output, setOutput] = useState('');
  const [meta, setMeta] = useState<{model?: string; provider?: string; disclaimer?: string} | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runAnalysis = async () => {
    if (!task.trim()) return;
    setLoading(true);
    setError('');
    setOutput('');
    setMeta(null);
    try {
      const response = await fetch('/api/ai/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, task: task.trim(), context: context.trim() ? { notes: context.trim() } : {} }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI role analysis failed');
      setOutput(data.output || 'No analysis returned.');
      setMeta({ model: data.modelUsed, provider: data.provider, disclaimer: data.disclaimer });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const active = roleConfig[role];
  const Icon = active.icon;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">AI Specialist Command Center</h2>
              <p className="text-xs text-slate-400 mt-1">Route governance and analytical work to a dedicated AI specialist through the existing provider orchestration layer.</p>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 font-mono">Human review remains required for consequential decisions.</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(Object.keys(roleConfig) as Role[]).map((id) => {
          const config = roleConfig[id];
          const RoleIcon = config.icon;
          const selected = role === id;
          return (
            <button key={id} onClick={() => setRole(id)} className={`text-left rounded-xl border p-4 transition-all ${selected ? 'border-emerald-500/60 bg-slate-800/80' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${id === 'attorney' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-cyan-500/10 text-cyan-400'}`}>
                  <RoleIcon className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{config.label}</div>
                  <div className="text-xs text-slate-400">{config.subtitle}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Icon className="w-4 h-4 text-emerald-400" />
          <div>
            <h3 className="text-sm font-bold text-white">{active.label}</h3>
            <p className="text-[11px] text-slate-500">{active.subtitle}</p>
          </div>
        </div>
        <label className="block text-xs font-semibold text-slate-300 mb-2" htmlFor="glorifier-AIRoleCommandCenter-tsx-1">Task</label>
        <textarea id="glorifier-AIRoleCommandCenter-tsx-1" value={task} onChange={(e) => setTask(e.target.value)} placeholder={active.placeholder} rows={4} className="w-full rounded-lg bg-slate-950 border border-slate-800 p-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-emerald-500/50 resize-y" />
        <label className="block text-xs font-semibold text-slate-300 mt-4 mb-2" htmlFor="glorifier-AIRoleCommandCenter-tsx-2">Context / Data Notes</label>
        <textarea id="glorifier-AIRoleCommandCenter-tsx-2" value={context} onChange={(e) => setContext(e.target.value)} placeholder="Add non-secret facts, metrics, policy text, schema notes, assumptions, or other context." rows={3} className="w-full rounded-lg bg-slate-950 border border-slate-800 p-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-emerald-500/50 resize-y" />
        <div className="flex items-center justify-between gap-3 mt-4">
          <div className="text-[11px] text-slate-500">Do not enter passwords, API keys, or unnecessary personal identifiers.</div>
          <button onClick={runAnalysis} disabled={loading || !task.trim()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-xs font-bold">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? 'Analyzing…' : 'Run Specialist'}
          </button>
        </div>
      </div>

      {(output || error) && (
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-bold text-white">Analysis Result</h3>
            {meta?.provider && <span className="text-[10px] font-mono text-emerald-400">{meta.provider} / {meta.model}</span>}
          </div>
          {error ? (
            <div className="flex gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3"><AlertTriangle className="w-4 h-4 shrink-0" /><span>{error}</span></div>
          ) : (
            <>
              <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-200 font-sans">{output}</pre>
              {meta?.disclaimer && <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500">{meta.disclaimer}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
};
