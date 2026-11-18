import React, { useEffect, useState } from 'react';
import { Receipt, Gauge, Users, Database, Bot, FileText, WalletCards } from 'lucide-react';

export const EconomicOperatingSystemPanel: React.FC = () => {
  const [data,setData]=useState<any>(null);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      try{
        const r=await fetch('/api/economic-os');
        const p=await r.json();
        if(!r.ok||!p.ok) throw new Error(p.error||'Economic OS unavailable');
        if(!cancelled) setData(p.snapshot);
      }catch(e:any){if(!cancelled)setError(e?.message||'Economic OS unavailable');}
    };
    void load();
    const t=window.setInterval(() => { void load(); }, 15000);
    return()=>{cancelled=true;window.clearInterval(t);}
  },[]);
  const c=data?.counts||{};
  const cards=[
    ['Pricing',c.pricing,Receipt],['GWU Metered',c.gwuQuantity,Gauge],['Active Customers',c.activeCustomers,Users],
    ['Data Products',c.dataProducts,Database],['Agent Services',c.agentServices,Bot],['Contracts',c.contracts,FileText],
    ['Invoices',c.invoices,Receipt],['Verified Payments',c.verifiedPayments,WalletCards]
  ];
  return <section className="rounded-xl bg-slate-950 border border-slate-800 p-5">
    <div className="flex items-center justify-between mb-4">
      <div><h2 className="text-base font-bold text-white">GBM-2.0 Economic Operating System</h2><p className="text-xs text-slate-400 mt-1">One economic truth architecture across every commercial engine.</p></div>
      <span className="text-[10px] font-mono px-2 py-1 rounded bg-slate-900 text-emerald-300 border border-slate-700">{data?.version||'GEOS-1.0'}</span>
    </div>
    {error&&<div className="text-xs text-amber-300 mb-3">{error}</div>}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {cards.map(([label,value,Icon])=><div key={String(label)} className="rounded-lg bg-slate-900 border border-slate-800 p-3">
        <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-slate-500"><Icon className="w-3 h-3"/>{label}</div>
        <div className="text-lg font-bold text-white mt-1">{value??'—'}</div>
      </div>)}
    </div>
    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"><div className="text-[10px] text-slate-500">Verified Revenue</div><div className="text-lg font-bold text-emerald-300">{data?'$'+Number(data.verifiedRevenue?.usd||0).toFixed(2):'—'}</div><div className="text-[9px] font-mono text-emerald-400">VERIFIED</div></div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"><div className="text-[10px] text-slate-500">ROI Evidence</div><div className="text-lg font-bold text-white">{c.roiEvidence??'—'}</div><div className="text-[9px] font-mono text-amber-300">NOT REVENUE</div></div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"><div className="text-[10px] text-slate-500">Economic Events</div><div className="text-lg font-bold text-white">{data?.recentEventTypes?.reduce((s:any,x:any)=>s+Number(x.count||0),0)??'—'}</div><div className="text-[9px] font-mono text-slate-400">AUDIT TRAIL</div></div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"><div className="text-[10px] text-slate-500">Truth Rule</div><div className="text-xs font-semibold text-slate-300 mt-2">Payment evidence + external reference required</div></div>
    </div>
    <div className="mt-3 text-[10px] text-slate-400">Price, usage, customer ROI, pipeline, contracts and invoices remain separate from revenue. Missing evidence is not zero. Consequential actions remain human-authorized.</div>
  </section>;
};
