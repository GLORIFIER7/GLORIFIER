import React, { useEffect, useState } from 'react';
import {
  BadgeDollarSign, ExternalLink, Image as ImageIcon, LockKeyhole, WalletCards,
  ShieldCheck, CircleDollarSign, Info
} from 'lucide-react';

const BINANCE_NFT_URL = 'https://www.binance.com/en/nft/my-nfts/created/glorifier-a6421c3d3ef91a3ad3b740e80c3e1eb6';

export const BinanceNftDashboard: React.FC = () => {
  const [verification, setVerification] = useState<any>(null);
  useEffect(() => {
    fetch('/api/binance/health').then(r => r.json()).then(d => setVerification(d.verification)).catch(() => setVerification({ authentication: 'failed', authenticationError: 'Verification service unavailable' }));
  }, []);
  const restricted = verification?.authentication === 'failed' && String(verification?.authenticationError || '').toLowerCase().includes('restricted location');
  const accountStatus = verification?.authentication === 'verified' ? (verification.accountStatus || 'Verified') : restricted ? 'Unavailable — jurisdiction restricted' : verification?.authentication === 'failed' ? 'Unavailable — authentication failed' : 'Checking…';
  const readPermissions = verification?.authentication === 'verified' ? (verification.permissions?.reading ? 'Enabled' : 'Disabled') : restricted ? 'Unavailable — jurisdiction restricted' : verification?.authentication === 'failed' ? 'Unavailable — authentication failed' : 'Checking…';
  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-yellow-400 text-xs font-bold uppercase tracking-widest">
              <WalletCards className="w-4 h-4" /> Binance & NFT Dashboard
            </div>
            <h2 className="mt-2 text-2xl font-bold text-white">Crypto Asset Command Center</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              A dedicated view for Binance assets and the Glorifier NFT collection. Account balances remain unavailable
              until a read-only Binance API connection is explicitly configured.
            </p>
          </div>
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
            <div className="text-xs text-slate-400">Connection mode</div>
            <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-yellow-300">
              <LockKeyhole className="w-4 h-4" /> Read-only ready
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Binance account</span>
            <WalletCards className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="mt-2 text-lg font-bold text-white">{verification?.authentication === 'verified' ? 'Connected' : 'Not verified'}</div>
          <p className="mt-1 text-xs text-slate-500">{restricted ? 'Provider access is restricted for this request location.' : 'No API credentials are exposed in the app.'}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">NFT collection</span>
            <ImageIcon className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-lg font-bold text-white">Glorifier</div>
          <p className="mt-1 text-xs text-slate-500">Binance NFT creator page linked below.</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Revenue status</span>
            <CircleDollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-lg font-bold text-white">Ledger separate</div>
          <p className="mt-1 text-xs text-slate-500">Crypto assets are not counted as verified cash revenue automatically.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex items-center gap-2 text-white font-semibold"><ShieldCheck className="w-5 h-5 text-yellow-400" /> Binance Verification Evidence</div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="text-xs text-slate-400">Account status</div><div className="mt-2 text-sm font-semibold text-white">{accountStatus}</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="text-xs text-slate-400">Read permissions</div><div className="mt-2 text-sm font-semibold text-white">{readPermissions}</div></div>
        </div>
        {verification?.authenticationError && <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-xs text-yellow-200">{verification.authenticationError}</div>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center gap-2 text-white font-semibold">
            <WalletCards className="w-5 h-5 text-yellow-400" />
            Binance Asset Rail
          </div>

          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-white">Read-only first</div>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  The integration should use API permissions for balances and transaction history only.
                  Withdrawal and transfer permissions should remain disabled.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {['Spot balances', 'Deposit history', 'Withdrawals', 'Trade history'].map((item) => (
              <div key={item} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-3 text-xs text-slate-400">
                <span className="block text-slate-300 font-medium">{item}</span>
                <span className="text-[11px] text-slate-600">Awaiting read-only API</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center gap-2 text-white font-semibold">
            <ImageIcon className="w-5 h-5 text-cyan-400" />
            Glorifier NFT
          </div>

          <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-cyan-400">Binance creator page</div>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Open the Glorifier NFT page on Binance to view the collection and creator assets.
            </p>
            <a
              href={BINANCE_NFT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
            >
              <ExternalLink className="w-4 h-4" /> Open Glorifier NFTs
            </a>
          </div>

          <div className="mt-4 flex items-start gap-2 text-xs text-slate-500">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>NFT ownership, sales and current marketplace status are not treated as verified revenue until supported by a verified transaction source.</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-xs text-yellow-200">
        Security rule: never place a Binance password, seed phrase, 2FA code, or API secret in the frontend.
        If an API integration is added, keep credentials server-side and disable withdrawals.
      </div>
    </section>
  );
};
