import React, { useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, Bot, CheckCircle2, Clock3, Gift, Landmark, RefreshCw, ShieldCheck, WalletCards, Zap, Target } from 'lucide-react';

type Channel = 'voucher' | 'crypto' | 'fiat' | 'gcash';
interface MonetizationSprintProps { onOpenWithdraw: () => void; userReference?: string; }

const channels: { id: Channel; label: string; icon: React.ReactNode; note: string }[] = [
  { id: 'voucher', label: 'Voucher', icon: <Gift className="w-4 h-4" />, note: 'Only a real buyer/provider settlement mechanism is valid.' },
  { id: 'crypto', label: 'Crypto', icon: <WalletCards className="w-4 h-4" />, note: 'Destination and network must be verified before release.' },
  { id: 'fiat', label: 'Fiat', icon: <Landmark className="w-4 h-4" />, note: 'Supported account/provider and settlement confirmation required.' },
  { id: 'gcash', label: 'GCash', icon: <BadgeDollarSign className="w-4 h-4" />, note: 'Supported business/provider onboarding and authorization required.' },
];

const stageLabels: Record<string, string> = {
  observed: 'Observed', qualified: 'Qualified', buyer_targeted: 'Buyer targeted', deliverable_ready: 'Deliverable ready',
  offer_ready: 'Offer ready', accepted: 'Accepted', revenue_verified: 'Revenue verified',
  settlement_confirmed: 'Settlement confirmed', payout_ready: 'Payout ready', closed: 'Closed', blocked: 'Blocked',
};

export const MonetizationSprint: React.FC<MonetizationSprintProps> = ({ onOpenWithdraw, userReference = 'anonymous' }) => {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [controlPlane, setControlPlane] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Channel>('gcash');
  const [payoutRequests, setPayoutRequests] = useState<any[]>([]);
  const [availableBalance, setAvailableBalance] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [sprintResponse, revenueResponse, payoutResponse] = await Promise.all([
        fetch('/api/monetization/sprint'),
        fetch('/api/revenue/control-plane'),
        fetch('/api/payouts?userReference=' + encodeURIComponent(userReference)),
      ]);
      const [sprintPayload, revenuePayload, payoutPayload] = await Promise.all([sprintResponse.json(), revenueResponse.json(), payoutResponse.json()]);
      if (!sprintResponse.ok || !sprintPayload.ok) throw new Error(sprintPayload.error || 'Sprint unavailable');
      setSnapshot(sprintPayload.sprint);
      if (revenueResponse.ok && revenuePayload.ok) setControlPlane(revenuePayload.snapshot);
      if (payoutResponse.ok && payoutPayload.ok) setPayoutRequests(Array.isArray(payoutPayload.payouts) ? payoutPayload.payouts : []);
    } catch {
      setSnapshot(null);
      setControlPlane(null);
      setPayoutRequests([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [userReference]);

  const verified = Number(controlPlane?.economicTruth?.verifiedRevenue ?? 0);
  const estimated = Number(snapshot?.estimatedPipelineUsd ?? controlPlane?.machines?.monetization?.estimatedPipeline ?? 0);
  const payoutReadyCount = Number(snapshot?.payoutReadyCount ?? 0);
  const opportunities = Array.isArray(snapshot?.opportunities) ? snapshot.opportunities : [];
  const counts = snapshot?.counts || {};

  const hasPendingPayout = payoutRequests.some((p: any) => ['pending','processing'].includes(p.status));

  const gates = useMemo(() => [
    { label: 'Verified evidence', done: opportunities.some((x: any) => ['revenue_verified','settlement_confirmed','payout_ready','closed'].includes(x.stage)) },
    { label: 'Buyer acceptance', done: opportunities.some((x: any) => ['accepted','revenue_verified','settlement_confirmed','payout_ready','closed'].includes(x.stage)) },
    { label: 'Settlement confirmed', done: opportunities.some((x: any) => ['settlement_confirmed','payout_ready','closed'].includes(x.stage)) },
    { label: 'Payout request', done: hasPendingPayout || opportunities.some((x: any) => ['payout_ready','closed'].includes(x.stage)) },
  ], [opportunities, hasPendingPayout]);

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 to-slate-950 p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider"><Zap className="w-4 h-4" /> 7-Day Monetization Sprint</div>
            <div className="mb-4 rounded-lg border border-emerald-500/20 bg-slate-950/60 p-4"><div className="text-xs text-slate-500 uppercase">Neon Verified Available</div><div className="text-2xl font-semibold text-emerald-300">{availableBalance ? `${Number(availableBalance.availableUsd || 0).toFixed(2)}` : '—'}</div><div className="text-[11px] text-slate-500 mt-1">{availableBalance ? 'Paid revenue − refunds − disputes − pending/processing/paid payouts' : 'Waiting for authoritative ledger'}</div></div><h2 className="text-2xl font-bold text-white mt-1">AI Monetization Scientists → Verified Payout</h2>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">Turn real demand into evidence-backed offers, verified revenue events, confirmed settlement, and an authorized payout request. The seven-day target is a work target, not a guaranteed payment date.</p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 text-xs font-semibold"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><div className="text-xs text-slate-500 uppercase">Verified revenue</div><div className="text-2xl font-mono font-bold text-emerald-400 mt-1">${verified.toFixed(2)}</div><div className="text-[11px] text-slate-500 mt-1">External evidence required.</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><div className="text-xs text-slate-500 uppercase">Estimated pipeline</div><div className="text-2xl font-mono font-bold text-amber-300 mt-1">${estimated.toFixed(2)}</div><div className="text-[11px] text-slate-500 mt-1">NOT VERIFIED; never payout balance.</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><div className="text-xs text-slate-500 uppercase">Payout-ready opportunities</div><div className="text-2xl font-bold text-white mt-1">{payoutReadyCount}</div><div className="text-[11px] text-slate-500 mt-1">{verified > 0 ? 'Verified funds detected' : 'No verified funds detected'}</div></div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
        <div className="flex items-center gap-2 mb-2"><Target className="w-5 h-5 text-cyan-400" /><h3 className="font-bold text-white">Fractional & outcome monetization</h3></div>
        <p className="text-xs text-slate-400 mb-4">Monetization Scientists can price verified work by measured token usage or by an externally verified outcome. Pricing is a proposal until the buyer/provider authorizes it.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-sm font-semibold text-white">Fractional Pay-Per-Token</div>
            <div className="text-[11px] text-slate-500 mt-1">Metered consumption • 1K-token unit</div>
            <div className="mt-3 text-xs text-slate-300">Formula: verified token usage × authorized rate.</div>
            <div className="mt-2 text-[10px] text-amber-300">Rate must be externally agreed; usage is not revenue until settled.</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-sm font-semibold text-white">Outcome-Based</div>
            <div className="text-[11px] text-slate-500 mt-1">Pay for a defined, measurable result</div>
            <div className="mt-3 text-xs text-slate-300">Formula: verified outcome × authorized commercial terms.</div>
            <div className="mt-2 text-[10px] text-amber-300">Outcome acceptance and settlement evidence are mandatory.</div>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-[11px] text-slate-400">
          <span className="text-cyan-300 font-semibold">Scientist mandate:</span> discover demand, model unit economics, propose pricing, verify evidence, and improve conversion — never manufacture a buyer, rate, outcome, contract, invoice, or payment.
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
        <div className="flex items-center gap-2 mb-4"><Bot className="w-5 h-5 text-cyan-400" /><h3 className="font-bold text-white">Scientist revenue queue</h3></div>
        <div className="grid gap-3">
          {(snapshot?.scientists || []).map((scientist: any) => (
            <div key={scientist.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div><div className="text-sm font-semibold text-slate-200">{scientist.name}</div><div className="text-[11px] text-slate-500">{scientist.specialties.join(' • ')}</div></div>
              <span className="text-[10px] px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">ACTIVE QUEUE</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {['observed','qualified','offer_ready','accepted','revenue_verified','settlement_confirmed','payout_ready','blocked'].map(stage => (
            <div key={stage} className="rounded-lg border border-slate-800 bg-slate-950 p-3"><div className="text-[10px] text-slate-500">{stageLabels[stage]}</div><div className="text-lg font-bold text-slate-200">{counts[stage] || 0}</div></div>
          ))}
        </div>
        {opportunities.length > 0 && (
          <div className="mt-4 space-y-2">
            {opportunities.slice(0, 10).map((op: any) => (
              <div key={op.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div><div className="text-sm font-semibold text-white">{op.title}</div><div className="text-[11px] text-slate-500">{op.scientistId} • {op.estimatedAmountUsd == null ? 'No estimate' : `Estimated ${Number(op.estimatedAmountUsd).toFixed(2)}`}</div></div>
                  <span className="text-[10px] rounded-full px-2 py-1 border border-slate-700 text-slate-300">{stageLabels[op.stage] || op.stage}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
        <h3 className="font-bold text-white mb-4">Payout route</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {channels.map(channel => <button key={channel.id} onClick={() => setSelected(channel.id)} className={`text-left rounded-xl border p-4 transition-colors ${selected === channel.id ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-700'}`}><div className="flex items-center gap-2 text-slate-200 font-semibold">{channel.icon}{channel.label}</div><p className="text-[11px] text-slate-500 mt-2">{channel.note}</p></button>)}
        </div>
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Selected route: {channels.find(c => c.id === selected)?.label}</div>
          <p className="text-xs text-slate-400 mt-2">Payout requests are recorded as pending and require human approval plus provider settlement evidence. GLORIFIER does not fabricate earnings, voucher codes, buyer acceptance, or payment confirmation.</p>
          <button onClick={onOpenWithdraw} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400"><WalletCards className="w-4 h-4" /> Open Payout</button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
        <h3 className="font-bold text-white mb-4">Execution gates</h3>
        <div className="grid gap-3">{gates.map((gate, index) => <div key={gate.label} className="flex items-center gap-3">{gate.done ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Clock3 className="w-5 h-5 text-amber-300" />}<div className="text-sm text-slate-300"><span className="text-slate-500 mr-2">{index + 1}.</span>{gate.label}</div></div>)}</div>
      </div>
    </section>
  );
};
