import React, { useEffect, useState } from 'react';
import {
  BadgeDollarSign, ExternalLink, Image as ImageIcon, LockKeyhole, WalletCards,
  ShieldCheck, CircleDollarSign, Info
} from 'lucide-react';

const BINANCE_NFT_URL = 'https://www.binance.com/en/nft/my-nfts/created/glorifier-a6421c3d3ef91a3ad3b740e80c3e1eb6';

export const BinanceNftDashboard: React.FC = () => {
  const [verification, setVerification] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const checkConnection = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/binance/health', { cache: 'no-store' });
      const data = await response.json();
      setVerification(data?.verification ?? { authentication: 'failed', authenticationError: 'Invalid verification response' });
      setLastChecked(new Date().toISOString());
    } catch {
      setVerification({ authentication: 'failed', authenticationError: 'Verification service unavailable' });
      setLastChecked(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void checkConnection(); }, []);

  const errorText = String(verification?.authenticationError || '');
  const restricted = errorText.toLowerCase().includes('restricted location') || errorText.toLowerCase().includes('eligibility');
  const authenticated = verification?.authentication === 'verified';
  const readEnabled = authenticated && verification?.permissions?.reading === true;
  const accountStatus = loading ? 'Checking…' : authenticated ? (verification.accountStatus || 'Verified') : restricted ? 'DEGRADED — jurisdiction restricted' : 'NOT VERIFIED — authentication failed';
  const readPermissions = loading ? 'Checking…' : authenticated ? (readEnabled ? 'Enabled' : 'Disabled') : restricted ? 'DEGRADED — jurisdiction restricted' : 'NOT VERIFIED — authentication failed';
  const connectionMode = loading ? 'Verification in progress' : authenticated && verification?.safeForReadOnly ? 'VERIFIED — read-only' : restricted ? 'DEGRADED — restricted' : 'NOT VERIFIED';
  const dataState = authenticated && readEnabled ? 'Available' : restricted ? 'Unavailable — provider restricted' : 'Unavailable — verification required';
  const evidenceState = authenticated ? 'Authenticated evidence available' : restricted ? 'Provider restriction recorded' : 'No qualifying private-account evidence';
  const permissionRows = verification?.permissions ? [
    ['Reading', verification.permissions.reading],
    ['Withdrawals', verification.permissions.withdrawals],
    ['Internal transfer', verification.permissions.internalTransfer],
    ['Universal transfer', verification.permissions.universalTransfer],
    ['Margin', verification.permissions.margin],
    ['Futures', verification.permissions.futures],
    ['Options', verification.permissions.options],
    ['Spot & margin trading', verification.permissions.spotAndMarginTrading],
    ['Portfolio margin', verification.permissions.portfolioMarginTrading],
    ['API trading', verification.permissions.apiTrade],
  ] : [];
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
              A dedicated view for Binance assets and the Glorifier NFT collection. Private Binance data is displayed only
              after authenticated read-only verification; provider restrictions remain visible as evidence.
            </p>
          </div>
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
            <div className="text-xs text-slate-400">Connection mode</div>
            <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-yellow-300">
              <LockKeyhole className="w-4 h-4" /> {connectionMode}
            </div>
            <button type="button" onClick={() => void checkConnection()} className="mt-2 text-[11px] text-slate-400 hover:text-white">
              {loading ? 'Checking…' : 'Refresh verification'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Binance account</span>
            <WalletCards className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="mt-2 text-lg font-bold text-white">{authenticated && verification?.safeForReadOnly ? 'VERIFIED' : restricted ? 'DEGRADED' : 'NOT VERIFIED'}</div>
          <p className="mt-1 text-xs text-slate-500">{restricted ? 'Binance provider access is restricted; no bypass is attempted.' : authenticated ? 'Authenticated server-side; credentials remain protected.' : 'No API credentials are exposed in the app.'}</p>
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
            <span className="text-xs text-slate-400">Verification state</span>
            <CircleDollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-lg font-bold text-white">{evidenceState}</div>
          <p className="mt-1 text-xs text-slate-500">Crypto assets are never counted as verified cash revenue automatically.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex items-center gap-2 text-white font-semibold"><ShieldCheck className="w-5 h-5 text-yellow-400" /> Binance Verification Evidence</div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="text-xs text-slate-400">Account status</div><div className="mt-2 text-sm font-semibold text-white">{accountStatus}</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="text-xs text-slate-400">Read permissions</div><div className="mt-2 text-sm font-semibold text-white">{readPermissions}</div></div>
        </div>
        {verification?.authenticationError && <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-xs text-yellow-200">{verification.authenticationError}</div>}
        {lastChecked && <div className="mt-3 text-[11px] text-slate-600">Last checked: {new Date(lastChecked).toLocaleString()}</div>}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-white font-semibold"><ShieldCheck className="w-5 h-5 text-yellow-400" /> Live verification data</div>
          <span className="text-[11px] text-slate-500">{verification?.checkedAt ? new Date(verification.checkedAt).toLocaleString() : 'Pending'}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="text-xs text-slate-500">Configured</div><div className="mt-1 text-sm font-semibold text-white">{verification?.configured ? 'Yes' : 'No'}</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="text-xs text-slate-500">Read-only flag</div><div className="mt-1 text-sm font-semibold text-white">{verification?.configuredReadOnlyFlag ? 'Yes' : 'No'}</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="text-xs text-slate-500">Credentials exposed</div><div className="mt-1 text-sm font-semibold text-white">No</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="text-xs text-slate-500">Safe read-only</div><div className="mt-1 text-sm font-semibold text-white">{verification?.safeForReadOnly ? 'Yes' : 'No'}</div></div>
        </div>
        {permissionRows.length > 0 && <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">{permissionRows.map(([label, enabled]) => <div key={label as string} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"><div className="text-[11px] text-slate-500">{label as string}</div><div className="mt-1 text-xs font-semibold text-white">{enabled ? 'Enabled' : 'Disabled / unavailable'}</div></div>)}</div>}
      </div>

      {authenticated && readEnabled && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-white font-semibold">
              <WalletCards className="w-5 h-5 text-yellow-400" /> Authenticated Spot Account
            </div>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[10px] font-bold text-emerald-300">
              VERIFIED — READ DATA
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-xs text-slate-500">Account type</div>
              <div className="mt-1 text-sm font-semibold text-white">{verification?.spotAccount?.accountType || 'Unknown'}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-xs text-slate-500">Can trade</div>
              <div className="mt-1 text-sm font-semibold text-white">{verification?.spotAccount?.canTrade ? 'Enabled' : 'Disabled'}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-xs text-slate-500">Can withdraw</div>
              <div className="mt-1 text-sm font-semibold text-white">{verification?.spotAccount?.canWithdraw ? 'Enabled' : 'Disabled'}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-xs text-slate-500">Can deposit</div>
              <div className="mt-1 text-sm font-semibold text-white">{verification?.spotAccount?.canDeposit ? 'Enabled' : 'Disabled'}</div>
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Spot balances</div>
            {Array.isArray(verification?.balances) && verification.balances.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-500">
                    <tr><th className="px-4 py-3">Asset</th><th className="px-4 py-3">Free</th><th className="px-4 py-3">Locked</th><th className="px-4 py-3">Total</th></tr>
                  </thead>
                  <tbody>
                    {verification.balances.map((item: any) => (
                      <tr key={item.asset} className="border-t border-slate-800">
                        <td className="px-4 py-3 font-semibold text-white">{item.asset}</td>
                        <td className="px-4 py-3 text-slate-300">{item.free}</td>
                        <td className="px-4 py-3 text-slate-400">{item.locked}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-300">{item.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-500">No non-zero spot balances returned.</div>
            )}
          </div>
          <div className="mt-3 text-[11px] text-slate-600">
            Source: authenticated Binance USER_DATA account endpoint. Credentials and secrets remain server-side.
          </div>
        </div>
      )}

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
                <span className="text-[11px] text-slate-600">{dataState}</span>
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
