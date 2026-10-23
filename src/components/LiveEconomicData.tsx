import React, { useEffect, useState } from 'react';

type Summary = {
  assets?: {
    accountCount: number;
    holdingCount: number;
    marketValueByCurrency: Record<string, number>;
    verification?: { verified: number; notVerified: number };
  };
  revenue?: { verified: number };
  evidence?: { count: number; latestObservedAt: string | null };
};

type Quote = { symbol: string; price: number; observedAt: string };

const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];

export const LiveEconomicData: React.FC = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [summaryResponse, ...quoteResponses] = await Promise.all([
          fetch('/api/reports/summary'),
          ...symbols.map((symbol) => fetch('/api/assets/providers/binance-public/quote/' + symbol))
        ]);
        if (!summaryResponse.ok) throw new Error('Economic summary unavailable');
        const summaryPayload = await summaryResponse.json();
        const quotePayloads = await Promise.all(quoteResponses.map((response) => response.json()));
        if (!active) return;
        setSummary(summaryPayload.report || null);
        setQuotes(quotePayloads.filter((item) => item?.ok && item?.result).map((item) => ({
          symbol: item.result.symbol,
          price: Number(item.result.price),
          observedAt: item.result.observedAt
        })));
        setError(null);
      } catch (e: any) {
        if (active) setError(e?.message || 'Live economic data unavailable');
      }
    };
    load();
    const interval = window.setInterval(load, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  return (
    <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-xl space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-white">GLORIFIER Live Economic Data</h2>
          <p className="text-xs text-slate-400 mt-1">Refresh is attempted every 30 seconds; values remain NOT VERIFIED until source and evidence checks pass.</p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-300">NOT VERIFIED</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Asset accounts', summary?.assets?.accountCount ?? '—'],
          ['Holdings recorded', summary?.assets?.holdingCount ?? '—'],
          ['Verified revenue', summary?.revenue?.verified ?? '—'],
          ['Evidence records', summary?.evidence?.count ?? '—']
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-mono font-bold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</div>
            <div className="mt-1 text-[9px] font-semibold text-amber-300">NOT VERIFIED unless qualifying evidence exists</div>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-slate-300">Public crypto market observations</h3>
          <span className="text-[9px] text-amber-300 font-semibold">MARKET VALUE ≠ REVENUE</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {symbols.map((symbol) => {
            const quote = quotes.find((item) => item.symbol === symbol);
            return (
              <div key={symbol} className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{symbol}</span>
                  <span className="text-[9px] text-amber-300">NOT VERIFIED</span>
                </div>
                <div className="mt-2 text-lg font-mono text-white">{quote ? quote.price.toLocaleString(undefined, { maximumFractionDigits: 8 }) : '—'}</div>
                <div className="mt-1 text-[9px] text-slate-500">Public source: Binance</div>
              </div>
            );
          })}
        </div>
      </div>

      {error && <div className="text-xs text-amber-300">{error}</div>}
    </section>
  );
};
