import React, { useEffect, useState } from 'react';
import { Bot, BrainCircuit, DollarSign, Gauge, Play, ShieldCheck, TrendingUp, Wallet } from 'lucide-react';
import { MonetizationPolicy, SovereignStats } from '../types';
import type { User } from 'firebase/auth';
import { authenticatedFetch } from '../lib/firebase';

interface MonetizationManagerProps {
  policy: MonetizationPolicy;
  stats: SovereignStats;
  onUpdatePolicy: (policy: Partial<MonetizationPolicy>) => void;
  currentUser?: User | null;
}

export const MonetizationManager: React.FC<MonetizationManagerProps> = ({ policy, stats, onUpdatePolicy, currentUser }) => {
  const [checkoutLoading, setCheckoutLoading] = useState< 'pro' | 'business' | null>(null);
  const [subscription, setSubscription] = useState<{ plan_id?: string; status?: string; expires_at?: string } | null>(null);
  const [paymentMessage, setPaymentMessage] = useState('');

  useEffect(() => {
    if (!currentUser) { setSubscription(null); return; }
    let cancelled = false;
    void authenticatedFetch('/api/monetization/subscription?customerReference=' + encodeURIComponent(currentUser.uid), { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.ok !== true) throw new Error(data?.error || 'Subscription status unavailable');
        if (!cancelled) setSubscription(data.subscription || null);
      })
      .catch((error) => {
        if (!cancelled) setPaymentMessage(error instanceof Error ? error.message : 'Subscription status unavailable');
      });

    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('token');
    if (params.get('payment') === 'success' && orderId) {
      setPaymentMessage('Verifying payment with the server…');
      void authenticatedFetch('/api/monetization/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerReference: currentUser.uid, orderId }),
      }).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        const confirmed = data?.subscription;
        if (!response.ok || data?.ok !== true || confirmed?.active !== true || confirmed?.verifiedRevenue !== true || !confirmed?.plan?.id || !confirmed?.revenueEvent?.eventId) {
          throw new Error(data?.error || 'The server did not confirm a completed PayPal capture and active subscription.');
        }
        if (cancelled) return;
        setSubscription({ plan_id: confirmed.plan.id, status: 'active' });
        setPaymentMessage('Payment capture and active subscription were confirmed by the server.');
        window.history.replaceState({}, '', window.location.pathname);
      }).catch((error) => {
        if (!cancelled) setPaymentMessage(error instanceof Error ? error.message : 'Payment confirmation failed.');
      });
    } else if (params.get('payment') === 'cancelled') {
      setPaymentMessage('PayPal checkout was cancelled. No subscription was activated.');
      window.history.replaceState({}, '', window.location.pathname);
    }
    return () => { cancelled = true; };
  }, [currentUser]);

  const startCheckout = async (planId: 'pro' | 'business') => {
    if (!currentUser) { setPaymentMessage('Sign in with Google before purchasing a plan.'); return; }
    setCheckoutLoading(planId); setPaymentMessage('');
    try {
      const response = await authenticatedFetch('/api/monetization/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerReference: currentUser.uid, planId }) });
      const data = await response.json();
      const approvalUrl = data?.checkout?.approvalUrl || data?.approvalUrl;
      let parsedApprovalUrl: URL | null = null;
      try { parsedApprovalUrl = new URL(approvalUrl); } catch { parsedApprovalUrl = null; }
      const allowedPayPalHost = parsedApprovalUrl &&
        (parsedApprovalUrl.hostname === 'paypal.com' || parsedApprovalUrl.hostname.endsWith('.paypal.com'));
      if (!response.ok || data?.ok !== true || !parsedApprovalUrl || parsedApprovalUrl.protocol !== 'https:' || !allowedPayPalHost) {
        throw new Error(data.error || 'Checkout did not return a valid PayPal approval URL');
      }
      window.location.href = parsedApprovalUrl.href;
    } catch (error) {
      setPaymentMessage(error instanceof Error ? error.message : 'Checkout unavailable.');
      setCheckoutLoading(null);
    }
  };
  const [goal, setGoal] = useState('Find a zero-budget first customer for GLORIFIER. Do not assume revenue, verified privacy enforcement, or connected data sources.');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);


  const runManager = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ai/broker-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: goal,
          policyContext: {
            minimumMonthlyFloorUsd: policy.minimumMonthlyFloorUsd,
            brokerMode: policy.brokerMode,
            globalEpsilon: policy.globalEpsilon,
            allowAiModelPretraining: policy.allowAiModelPretraining,
          },
        }),
      });
      const data = await response.json();
      setReply(data.reply || data.error || 'No AI response returned.');
    } catch (error) {
      setReply(error instanceof Error ? error.message : 'Monetization manager is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-widest">
              <Bot className="w-4 h-4" /> AI Bot Monetization Manager
            </div>
            <h2 className="mt-2 text-2xl font-bold text-white">Monetization Analysis & Policy Controls</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              AI-assisted analysis of possible business models and configured policy settings. No buyer demand, privacy enforcement, autonomous execution, or revenue is established by this panel.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <div className="text-xs text-slate-400">Illustrative projection (not verified revenue)</div>
            <div className="text-2xl font-bold font-mono text-amber-300">NOT ESTIMATED</div>
          </div>
        </div>
      </div>


      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-emerald-400">PayPal subscriptions · server confirmation required</div>
            <h3 className="mt-1 text-xl font-bold text-white">GLORIFIER Plans</h3>
            <p className="mt-1 text-sm text-slate-400">Payments are processed by PayPal. Access becomes active only after the server confirms a completed PayPal capture.</p>
          </div>
          <div className="text-xs text-slate-400">{currentUser ? 'Signed in' : 'Sign in required'}</div>
        </div>
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="font-semibold text-white">Free</div><div className="mt-1 text-2xl font-bold">$0</div>
            <div className="mt-2 text-xs text-slate-400">Basic tools with usage limits.</div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="font-semibold text-white">Pro</div><div className="mt-1 text-2xl font-bold">$9.99<span className="text-xs text-slate-500">/month</span></div>
            <div className="mt-2 text-xs text-slate-400">1,000 AI credits per 30 days.</div>
            <button onClick={() => startCheckout('pro')} disabled={checkoutLoading !== null} className="mt-4 w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{checkoutLoading === 'pro' ? 'Opening PayPal...' : 'Subscribe Pro'}</button>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
            <div className="font-semibold text-white">Business</div><div className="mt-1 text-2xl font-bold">$49.00<span className="text-xs text-slate-500">/month</span></div>
            <div className="mt-2 text-xs text-slate-400">10,000 AI credits per 30 days.</div>
            <button onClick={() => startCheckout('business')} disabled={checkoutLoading !== null} className="mt-4 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{checkoutLoading === 'business' ? 'Opening PayPal...' : 'Subscribe Business'}</button>
          </div>
        </div>
        {subscription && <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-200">Server-reported subscription record: {subscription.plan_id} · {subscription.status}{subscription.expires_at ? ' · renews/expires ' + new Date(subscription.expires_at).toLocaleDateString() : ''}</div>}
        {paymentMessage && <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">{paymentMessage}</div>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Current Pacing', value: 'NOT VERIFIED', icon: TrendingUp },
          { label: 'Active Streams', value: 'NOT VERIFIED', icon: Gauge },
          { label: 'Privacy Enforcement', value: 'NOT VERIFIED', icon: ShieldCheck },
          { label: 'Verified Available Balance', value: 'NOT VERIFIED', icon: Wallet },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{item.label}</span>
              <item.icon className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-xl font-bold font-mono text-white">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center gap-2 text-white font-semibold">
            <BrainCircuit className="w-5 h-5 text-emerald-400" />
            Ask the Monetization Bot
          </div>
          <textarea
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            className="mt-4 w-full min-h-32 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-200 outline-none focus:border-emerald-500/50"
            placeholder="Describe your monetization goal..."
          />
          <button
            onClick={runManager}
            disabled={loading || !goal.trim()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            <Play className="w-4 h-4" /> {loading ? 'Analyzing...' : 'Run AI Analysis'}
          </button>
          {reply && (
            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm leading-6 text-slate-300 whitespace-pre-wrap">
              {reply}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center gap-2 font-semibold text-white">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            Strategy Controls
          </div>
          <label className="mt-5 block text-xs text-slate-400">Operating mode</label>
          <select
            value={policy.brokerMode}
            onChange={(event) => onUpdatePolicy({ brokerMode: event.target.value as MonetizationPolicy['brokerMode'] })}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          >
            <option value="strict-sovereign">Strict Sovereign</option>
            <option value="balanced-protective">Balanced Protective</option>
            <option value="autonomous-maximize">Maximize target · runtime NOT VERIFIED</option>
          </select>

          <label className="mt-5 block text-xs text-slate-400">Proposed minimum monthly floor · not a buyer offer</label>
          <input
            type="number"
            min="0"
            max="100"
            value={policy.minimumMonthlyFloorUsd}
            onChange={(event) => onUpdatePolicy({ minimumMonthlyFloorUsd: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          />

          <label className="mt-5 flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={policy.autoNegotiateHighBids}
              onChange={(event) => onUpdatePolicy({ autoNegotiateHighBids: event.target.checked })}
            />
            Set AI high-bid negotiation preference · execution NOT VERIFIED
          </label>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-emerald-400">Voluntary Support</div>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Support GLORIFIER voluntarily through PayPal.Me. This external link does not automatically notify GLORIFIER or verify a payment in the revenue ledger. Verify receipts in PayPal before recording support as received revenue.
            </p>
            <a
              href="https://paypal.me/glorifier"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              <Wallet className="w-4 h-4" /> Support GLORIFIER via PayPal.Me
            </a>
          </div>

          <div className="mt-5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
            The bot provides analysis and recommendations. External payments, data sharing and governance changes should require explicit authorization.
          </div>
        </div>
      </div>
    </section>
  );
};
