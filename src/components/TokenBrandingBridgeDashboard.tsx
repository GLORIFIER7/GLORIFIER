import React, { useMemo, useState } from 'react';
import {
  buildTokenBrandingInspection,
  type BrandingProvider
} from '../lib/token-branding-bridge';
import { CANDIDATE_GLORIFIER_LOGO_URI, TOKEN_BRANDING_RECORDS } from '../lib/token-branding-records';

const providers: BrandingProvider[] = [
  { id: 'etherscan', name: 'Etherscan', mode: 'manual', requirements: ['Provider-specific listing review'], feeStatus: 'UNKNOWN', enabled: true },
  { id: 'basescan', name: 'BaseScan', mode: 'manual', requirements: ['Chain-specific listing review'], feeStatus: 'UNKNOWN', enabled: true },
  { id: 'bscscan', name: 'BscScan', mode: 'manual', requirements: ['Chain-specific listing review'], feeStatus: 'UNKNOWN', enabled: true },
  { id: 'solana-metadata', name: 'Solana token metadata', mode: 'unsupported', requirements: ['On-chain metadata authority and URI inspection'], feeStatus: 'UNKNOWN', enabled: false }
];

const statusClass = (status: string) => {
  if (status === 'VERIFIED' || status === 'READY_FOR_REVIEW') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'PARTIALLY_VERIFIED' || status === 'MANUAL_ACTION_REQUIRED') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
};

export const TokenBrandingBridgeDashboard: React.FC = () => {
  const [refreshCount, setRefreshCount] = useState(0);
  const inspection = useMemo(
    () => buildTokenBrandingInspection(TOKEN_BRANDING_RECORDS, providers),
    [refreshCount]
  );

  return (
    <section className="space-y-6" aria-labelledby="token-branding-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">GLORIFIER • Multi-chain registry review</p>
          <h2 id="token-branding-title" className="mt-2 text-2xl font-bold text-white sm:text-3xl">Token Branding Bridge</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">A proposed branding candidate and locally validated token identifiers; live chain state and provider publication are not checked here.</p>
        </div>
        <button type="button" onClick={() => setRefreshCount((value) => value + 1)} className="min-h-10 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-400">
          Re-run local inspection
        </button>
      </div>

      <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100">
        <strong>Evidence notice:</strong> This screen runs local validation against recorded registry entries. It does not query explorers live, submit artwork, or prove that any explorer displays the logo.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Token registry entries', inspection.summary.tokenCount],
          ['Provider targets listed', inspection.summary.providerCount],
          ['Blocked readiness checks', inspection.summary.blockedAssessments],
          ['Explorer publications confirmed', inspection.summary.publishedCount]
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold text-white">Canonical logo candidate</h3>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-950">
              <img
                src="https://bafybeige7flx4sbd4nbw5vlwgqdvbcethz3tucu6r3ij47vfrl6l34g6vrq.ipfs.inbrowser.link"
                alt="Candidate GLORIFIER circular token logo"
                className="h-full w-full object-cover"
                loading="lazy"
                onError={(event) => { event.currentTarget.style.display = 'none'; }}
              />
              <span className="sr-only">Candidate artwork preview may be unavailable</span>
            </div>
            <div className="min-w-0">
              <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-200">CANDIDATE — NOT CANONICAL</span>
              <p className="mt-2 break-all font-mono text-xs text-slate-300">{CANDIDATE_GLORIFIER_LOGO_URI}</p>
              <p className="mt-1 text-xs text-slate-500">SHA-256 and retrieved bytes have not been reconciled.</p>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold text-white">Provider publication status</h3>
          <div className="mt-3 divide-y divide-slate-800">
            {inspection.providerSummaries.map((summary) => (
              <div key={summary.providerId} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-slate-200">{summary.providerName}</span>
                  <span className={`rounded-full border px-2 py-1 text-[11px] ${statusClass(summary.status)}`}>{summary.status.replaceAll('_', ' ')}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Publication: {summary.publicationStatus.replaceAll('_', ' ')} · {summary.tokenCount} token checks · {summary.blockedCount} blocked · {summary.manualActionCount} manual · {summary.notConfiguredCount} not configured
                </p>
                <ul className="mt-2 space-y-1 text-xs text-slate-400">
                  {summary.tokenAssessments.map((item) => (
                    <li key={item.assetId}>
                      <span className="text-slate-300">{item.network}</span>: {item.status.replaceAll('_', ' ')}
                      {item.blockers.length > 0 ? ` — ${item.blockers.join(' • ')}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {inspection.providerSummaries.length === 0 && (
              <p className="py-3 text-xs text-slate-500">No provider assessments are available.</p>
            )}
          </div>
        </article>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-white">Recorded token identifiers · NOT VERIFIED</h3>
        <p className="text-xs text-slate-500">These are locally recorded addresses and mint identifiers. This panel does not query a blockchain or explorer, verify contract code, supply, holder control, mint authorities, transaction finality, or network reachability.</p>
        {inspection.tokens.map((token) => (
            <article key={token.assetId} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-white">{token.network} · {token.tokenSymbol}</h4>
                  <p className="mt-1 text-xs text-slate-500">{token.standard} · Chain {String(token.chainId)}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClass(token.evidenceStatus)}`}>{token.evidenceStatus.replaceAll('_', ' ')}</span>
              </div>
              <p className="mt-3 break-all font-mono text-xs text-slate-400">{token.contractOrMint}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded border border-amber-500/30 px-2 py-1 text-amber-200">Logo integrity: {token.logo.integrityStatus.replaceAll('_', ' ')}</span>
                <span className="rounded border border-slate-700 px-2 py-1 text-slate-400">Explorer publication: NOT VERIFIED</span>
              </div>
              {token.validationErrors.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-rose-200">
                  {token.validationErrors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              )}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {token.providers.map((provider) => (
                  <div key={provider.providerId} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-200">{provider.providerName}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusClass(provider.status)}`}>{provider.status.replaceAll('_', ' ')}</span>
                    </div>
                    {provider.blockers.length > 0 && <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{provider.blockers.join(' • ')}</p>}
                  </div>
                ))}
              </div>
            </article>
        ))}
      </div>
      <p className="text-xs text-slate-500">Inspection mode: {inspection.mode}. Last local evaluation: {inspection.generatedAt}. No provider submission or blockchain write was performed.</p>
    </section>
  );
};
