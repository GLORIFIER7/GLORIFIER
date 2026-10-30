import React, { useMemo, useState } from 'react';
import {
  buildTokenBrandingInspection,
  type BrandingProvider,
  type TokenBrandingRecord
} from '../lib/token-branding-bridge';

const CANDIDATE_LOGO_URI = 'ipfs://bafybeige7flx4sbd4nbw5vlwgqdvbcethz3tucu6r3ij47vfrl6l34g6vrq';

const tokens: TokenBrandingRecord[] = [
  {
    assetId: 'glr-ethereum',
    network: 'Ethereum Mainnet',
    chainId: 1,
    standard: 'ERC-20',
    contractOrMint: '0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb',
    tokenSymbol: 'GLR',
    evidenceStatus: 'VERIFIED',
    logo: { uri: CANDIDATE_LOGO_URI, integrityStatus: 'PENDING' }
  },
  {
    assetId: 'glr-bnb',
    network: 'BNB Smart Chain',
    chainId: 56,
    standard: 'BEP-20',
    contractOrMint: '0x5e0B0A449232FDA7cA6Ea3419A50873b08F64804',
    tokenSymbol: 'GLR',
    evidenceStatus: 'VERIFIED',
    logo: { uri: CANDIDATE_LOGO_URI, integrityStatus: 'PENDING' }
  },
  {
    assetId: 'glr-base',
    network: 'Base Mainnet',
    chainId: 8453,
    standard: 'ERC-20',
    contractOrMint: '0x43b09fc339DA35117c966ceaCC3Ea8C8f83c11ce',
    tokenSymbol: 'GLR',
    evidenceStatus: 'NOT_VERIFIED',
    logo: { uri: CANDIDATE_LOGO_URI, integrityStatus: 'PENDING' }
  },
  {
    assetId: 'glr-solana-mainnet',
    network: 'Solana Mainnet Beta',
    chainId: 'solana:mainnet-beta',
    standard: 'SPL Token',
    contractOrMint: '7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9',
    tokenSymbol: 'GLR',
    evidenceStatus: 'PARTIALLY_VERIFIED',
    logo: { uri: CANDIDATE_LOGO_URI, integrityStatus: 'PENDING' }
  }
];

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
    () => buildTokenBrandingInspection(tokens, providers),
    [refreshCount]
  );

  return (
    <section className="space-y-6" aria-labelledby="token-branding-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">GLORIFIER • Multi-chain asset operations</p>
          <h2 id="token-branding-title" className="mt-2 text-2xl font-bold text-white sm:text-3xl">Token Branding Bridge</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">One owner-controlled branding reference, chain-aware validation, and separate provider publication evidence.</p>
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
          ['Registered production tokens', inspection.summary.tokenCount],
          ['Provider targets', inspection.summary.providerCount],
          ['Blocked readiness checks', inspection.summary.blockedAssessments],
          ['Explorer logos verified', inspection.summary.publishedCount]
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
              <p className="mt-2 break-all font-mono text-xs text-slate-300">{CANDIDATE_LOGO_URI}</p>
              <p className="mt-1 text-xs text-slate-500">SHA-256 and retrieved bytes have not been reconciled.</p>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold text-white">Provider publication status</h3>
          <div className="mt-3 divide-y divide-slate-800">
            {inspection.tokens.flatMap((token) => token.providers).filter((assessment, index, all) => all.findIndex((item) => item.providerId === assessment.providerId) === index).map((assessment) => (
              <div key={assessment.providerId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="text-sm text-slate-200">{assessment.providerName}</span>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-300">{assessment.status.replaceAll('_', ' ')}</span>
                <span className="w-full text-xs text-slate-500">Publication: {assessment.publicationStatus.replaceAll('_', ' ')}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-white">Production token registry</h3>
        {inspection.tokens.map((token) => {
          const record = tokens.find((item) => item.assetId === token.assetId)!;
          return (
            <article key={token.assetId} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-white">{record.network} · {record.tokenSymbol}</h4>
                  <p className="mt-1 text-xs text-slate-500">{record.standard} · Chain {String(record.chainId)}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClass(record.evidenceStatus)}`}>{record.evidenceStatus.replaceAll('_', ' ')}</span>
              </div>
              <p className="mt-3 break-all font-mono text-xs text-slate-400">{record.contractOrMint}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded border border-amber-500/30 px-2 py-1 text-amber-200">Logo integrity: PENDING</span>
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
          );
        })}
      </div>
      <p className="text-xs text-slate-500">Inspection mode: {inspection.mode}. Last local evaluation: {inspection.generatedAt}. No provider submission or blockchain write was performed.</p>
    </section>
  );
};
