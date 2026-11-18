import React, { useEffect, useState } from 'react';
import { BrainCircuit, Globe2, Activity, Database, Network, ShieldCheck } from 'lucide-react';

export const BusinessIntelligenceArchitecturePanel: React.FC = () => {
  const [data,setData]=useState<any>(null);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      try{
        const r=await fetch('/api/business-intelligence/architecture');
        const p=await r.json();
        if(!r.ok || !p.ok) throw new Error(p.error || 'BI architecture unavailable');
        if(!cancelled) setData(p.architecture);
      }catch(e:any){ if(!cancelled) setError(e?.message || 'BI architecture unavailable'); }
    };
    void load();
    const timer=window.setInterval(() => { void load(); }, 60000);
    return()=>{cancelled=true;window.clearInterval(timer);};
  },[]);

  const stages=data?.pipeline || [];
  const families=data?.sourceFamilies || [];
  const domains=data?.intelligenceDomains || [];

  return <section className="rounded-xl bg-slate-950 border border-slate-800 p-5">
    <div className="flex items-center justify-between gap-4 mb-4">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-emerald-400"/>Global Business Intelligence Architecture</h2>
        <p className="text-xs text-slate-400 mt-1">Provider-neutral intelligence across connected systems and authorized/public sources.</p>
      </div>
      <span className="text-[10px] font-mono px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">GBIS-2.0</span>
    </div>
    {error && <div className="text-xs text-amber-300 mb-3">{error}</div>}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {[
        ['Source Families',families.length,<Globe2 className="w-3.5 h-3.5"/>],
        ['BI Domains',domains.length,<Database className="w-3.5 h-3.5"/>],
        ['Pipeline Stages',stages.length,<Activity className="w-3.5 h-3.5"/>],
        ['Governance',data?.governance?.humanAuthority ? 'Human authority':'—',<ShieldCheck className="w-3.5 h-3.5"/>]
      ].map(([label,value,icon])=><div key={String(label)} className="rounded-lg bg-slate-900 border border-slate-800 p-3">
        <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">{icon}{label}</div>
        <div className="text-lg font-bold text-white mt-1">{value}</div>
      </div>)}
    </div>
    <div className="flex flex-wrap gap-1.5 mb-4">{families.map((x:any)=><span key={x} className="text-[10px] px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">{x}</span>)}</div>
    <div className="flex items-center gap-1 overflow-x-auto pb-2">{stages.map((x:any,i:number)=><React.Fragment key={x}>
      <span className="whitespace-nowrap text-[10px] px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">{x}</span>
      {i<stages.length-1 && <span className="text-emerald-400">→</span>}
    </React.Fragment>)}</div>
    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-[10px] text-slate-400">
      <span className="text-emerald-300 font-semibold">Truth controls:</span> estimates are NOT VERIFIED; expected value is NOT VERIFIED; market value is not revenue; missing evidence is not zero; consequential actions require human approval.
    </div>
  </section>;
};
