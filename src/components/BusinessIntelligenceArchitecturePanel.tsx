import React, { useEffect, useState } from 'react';
import { BrainCircuit, Globe2, Activity, Database, ShieldCheck, AlertTriangle } from 'lucide-react';

type RuntimeStatus = {
  status?: string;
  pipeline?: {
    status?: string;
    completedCount?: number;
    totalStages?: number;
    stages?: Array<{ index: number; name: string; status: string }>;
  };
  snapshot?: {
    counts?: Record<string, number>;
    latestIngestion?: {
      reportId?: string;
      generatedAt?: string;
      status?: string;
      evidenceCount?: number;
      observationsUpserted?: number;
      signalsUpserted?: number;
      rejectedEvidenceCount?: number;
    } | null;
  };
};

type AdvisoryResponse = {
  status?: string;
  generatedAt?: string;
  limitations?: string[];
  evidenceRefs?: string[];
  intelligence?: {
    sourceCount?: number;
    sourceStatuses?: string[];
    evidenceCount?: number;
    evidence?: Array<{ id: string; source: string; title: string; url: string; publishedAt?: string | null }>;
    signals?: Array<{ id: string; title: string; description: string; evidenceRefs: string[] }>;
  };
  geas?: {
    status?: string;
    scanId?: string | null;
    completedAt?: string | null;
    sourceCount?: number;
    evidenceCount?: number;
    analysisEvidenceCount?: number;
    claimSupportedEvidenceCount?: number;
    drift?: Array<{ id: string; controlId: string; status: string; severity: string; observed: string; recommendation: string }>;
    recommendations?: string[];
  };
  governance?: {
    advisoryOnly?: boolean;
    humanApprovalRequired?: boolean;
    irreversibleActionsExecuted?: boolean;
  };
  economicTruth?: string;
};

export const BusinessIntelligenceArchitecturePanel: React.FC = () => {
  const [data,setData]=useState<any>(null);
  const [runtime,setRuntime]=useState<RuntimeStatus|null>(null);
  const [advisory,setAdvisory]=useState<AdvisoryResponse|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [runtimeError,setRuntimeError]=useState<string|null>(null);
  const [advisoryError,setAdvisoryError]=useState<string|null>(null);

  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      const requests = await Promise.allSettled([
        fetch('/api/business-intelligence/architecture').then(async r=>{const p=await r.json();if(!r.ok||!p.ok)throw new Error(p.error||'BI architecture unavailable');return p.architecture;}),
        fetch('/api/business-intelligence/status').then(async r=>{const p=await r.json();if(!r.ok||!p.ok)throw new Error(p.error||'BI runtime status unavailable');return p;}),
        fetch('/api/business-intelligence/advisory').then(async r=>{const p=await r.json();if(!r.ok||!p.ok)throw new Error(p.error||'GEAS business advisory unavailable');return p.advisory;})
      ]);
      if(cancelled) return;
      if(requests[0].status==='fulfilled'){setData(requests[0].value);setError(null);}
      else setError(requests[0].reason?.message||'BI architecture unavailable');
      if(requests[1].status==='fulfilled'){setRuntime(requests[1].value);setRuntimeError(null);}
      else setRuntimeError(requests[1].reason?.message||'BI runtime status unavailable');
      if(requests[2].status==='fulfilled'){setAdvisory(requests[2].value);setAdvisoryError(null);}
      else setAdvisoryError(requests[2].reason?.message||'GEAS business advisory unavailable');
    };
    void load();
    const timer=window.setInterval(() => { void load(); }, 60000);
    return()=>{cancelled=true;window.clearInterval(timer);};
  },[]);

  const families=data?.sourceFamilies || [];
  const domains=data?.intelligenceDomains || [];
  const pipelineStages=runtime?.pipeline?.stages || [];
  const counts=runtime?.snapshot?.counts || {};
  const latest=runtime?.snapshot?.latestIngestion;
  const geas=advisory?.geas;
  const drift=geas?.drift || [];
  const signals=advisory?.intelligence?.signals || [];
  const evidence=advisory?.intelligence?.evidence || [];
  const completedCount=runtime?.pipeline?.completedCount ?? 0;
  const totalStages=runtime?.pipeline?.totalStages ?? data?.pipeline?.length ?? 15;

  return <section className="rounded-xl bg-slate-950 border border-slate-800 p-5 space-y-5">
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-emerald-400"/>Global Business Intelligence</h2>
        <p className="text-xs text-slate-400 mt-1">GBIS-2.0 · evidence ingestion, live pipeline state and GEAS decision support.</p>
      </div>
      <span className="text-[10px] font-mono px-2 py-1 rounded bg-slate-900 text-slate-300 border border-slate-700">GBIS-2.0</span>
    </div>

    {error && <div className="text-xs text-amber-300">{error}</div>}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        ['Source Families',families.length,<Globe2 className="w-3.5 h-3.5"/>],
        ['BI Domains',domains.length,<Database className="w-3.5 h-3.5"/>],
        ['Persisted Observations',counts.observations ?? '—',<Activity className="w-3.5 h-3.5"/>],
        ['Pipeline Stages',`${completedCount}/${totalStages}`,<ShieldCheck className="w-3.5 h-3.5"/>]
      ].map(([label,value,icon])=><div key={String(label)} className="rounded-lg bg-slate-900 border border-slate-800 p-3">
        <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">{icon}{label}</div>
        <div className="text-lg font-bold text-white mt-1">{value}</div>
      </div>)}
    </div>

    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
      <div className="flex justify-between gap-3 items-center">
        <div className="text-xs font-semibold text-white">Pipeline execution</div>
        <span className="text-[10px] font-mono text-amber-300">{runtime?.pipeline?.status || (runtimeError ? 'unavailable' : 'loading')}</span>
      </div>
      {runtimeError && <div className="text-xs text-amber-300">{runtimeError} · runtime progress is NOT VERIFIED.</div>}
      {latest && <div className="text-[10px] text-slate-400">Last report: {latest.reportId} · {latest.status} · {latest.evidenceCount ?? 0} evidence records · {latest.observationsUpserted ?? 0} observations · {latest.signalsUpserted ?? 0} signals · rejected {latest.rejectedEvidenceCount ?? 0}</div>}
      {!latest && !runtimeError && <div className="text-[10px] text-slate-400">No persisted GBIS ingestion run has been recorded.</div>}
      <div className="flex flex-wrap gap-1.5">
        {pipelineStages.map(stage=><span key={stage.name} className={`text-[10px] px-2 py-1 rounded border ${stage.status==='completed'?'bg-emerald-500/10 border-emerald-500/30 text-emerald-300':stage.status==='not-implemented'?'bg-slate-950 border-slate-700 text-slate-500':'bg-amber-500/10 border-amber-500/20 text-amber-300'}`}>
          {stage.name}: {stage.status}
        </span>)}
      </div>
    </div>

    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-white flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 text-amber-300"/>GEAS Business Intelligence Advisory</div>
        <span className="text-[10px] font-mono text-amber-300">{advisory?.status || (advisoryError ? 'unavailable' : 'loading')}</span>
      </div>
      {advisoryError && <div className="text-xs text-amber-300">{advisoryError} · advisory not verified.</div>}
      {!advisoryError && advisory && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            ['Intelligence evidence',advisory.intelligence?.evidenceCount ?? 0],
            ['GEAS evidence',geas?.evidenceCount ?? 0],
            ['Analysis evidence',geas?.analysisEvidenceCount ?? 0],
            ['Claim-supported',geas?.claimSupportedEvidenceCount ?? 0],
          ].map(([label,value])=><div key={String(label)} className="rounded bg-slate-950 p-2">
            <div className="text-[9px] uppercase text-slate-500">{label}</div>
            <div className="text-sm text-white font-semibold">{value}</div>
          </div>)}
        </div>
        <div className="text-[10px] text-slate-400">
          GEAS scan: {geas?.scanId || 'not available'} · drift findings: {drift.length} · Human approval required: {advisory.governance?.humanApprovalRequired ? 'yes' : 'not established'}
        </div>
        {advisory.intelligence?.sourceStatuses?.map((item,index)=><div key={index} className="text-[10px] text-slate-400">Source collection: {item}</div>)}
        {advisory.limitations?.map((item,index)=><div key={index} className="text-[10px] text-amber-300">{item}</div>)}
        {drift.slice(0,4).map(item=><div key={item.id} className="border-t border-slate-800 pt-2">
          <div className="text-xs text-white">{item.severity.toUpperCase()} · {item.controlId} · {item.status}</div>
          <div className="text-[10px] text-slate-400 mt-1">{item.observed}</div>
          <div className="text-[10px] text-slate-300 mt-1">Recommendation: {item.recommendation}</div>
        </div>)}
        {signals.slice(0,4).map(item=><div key={item.id} className="border-t border-slate-800 pt-2">
          <div className="text-xs text-white">{item.title}</div>
          <div className="text-[10px] text-slate-400 mt-1">{item.description}</div>
          <div className="text-[10px] text-slate-500 mt-1">Evidence refs: {item.evidenceRefs.join(', ')}</div>
        </div>)}
        {evidence.slice(0,6).map(item=><div key={item.id} className="text-[10px] text-slate-300">
          <a className="underline decoration-slate-600 hover:text-white" href={item.url} target="_blank" rel="noreferrer">{item.source}: {item.title}</a>
          <span className="text-slate-500"> · {item.id}</span>
        </div>)}
        <div className="text-[10px] text-slate-400">{advisory.economicTruth}</div>
      </>}
      <div className="text-[10px] text-slate-400 border-t border-slate-800 pt-2">
        Advisory only. It cannot authorize deployment, contracts, payments or irreversible actions. Missing evidence is not a zero-risk finding.
      </div>
    </div>

    <div className="flex flex-wrap gap-1.5">
      {families.map((x:any)=><span key={x} className="text-[10px] px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">{x}</span>)}
    </div>
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-[10px] text-slate-400">
      <span className="text-emerald-300 font-semibold">Evidence boundary:</span> source discovery, model synthesis and architecture recommendations are advisory evidence. Implementation claims remain unverified until independently supported. Estimated opportunity value is not verified revenue.
    </div>
  </section>;
};
