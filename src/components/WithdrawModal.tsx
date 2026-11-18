import React, { useState, useEffect } from 'react';
import { 
  X, 
  Wallet, 
  CheckCircle2, 
  Landmark, 
  CreditCard, 
  Coins, 
  ShieldCheck, 
  RefreshCw, 
  Copy, 
  Check, 
  Zap, 
  Plus, 
  Trash2, 
  Shield, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { SovereignStats, MonetizationPolicy } from '../types';
import { authenticatedFetch } from '../lib/firebase';

interface WithdrawModalProps {
  stats: SovereignStats;
  policy: MonetizationPolicy;
  onClose: () => void;
  onWithdrawSuccess: (amount: number, method: string, txHash: string) => void;
  onUpdatePolicy?: (newPolicy: Partial<MonetizationPolicy>) => void;
  userReference?: string;
}

export type CryptoChain = 'ETH' | 'SOL' | 'BTC';
export type StablecoinType = 'USDC' | 'USDT' | 'DAI' | 'PYUSD';
export type CryptoNetwork = 'Base' | 'Solana' | 'Polygon' | 'Arbitrum' | 'Ethereum' | 'Bitcoin';

export interface VerifiedWallet {
  id: string;
  chain: CryptoChain;
  name: string;
  address: string;
  isVerified: boolean;
  verificationMethod: string;
  addedAt: string;
}

interface SupportedToken {
  symbol: StablecoinType;
  name: string;
  peg: string;
  iconBg: string;
  badgeColor: string;
}

const SUPPORTED_STABLECOINS: SupportedToken[] = [
  { symbol: 'USDC', name: 'USD Coin (Circle)', peg: '1:1 USD', iconBg: 'bg-blue-500/20 text-blue-400', badgeColor: 'text-blue-400 border-blue-500/30' },
  { symbol: 'USDT', name: 'Tether USD', peg: '1:1 USD', iconBg: 'bg-emerald-500/20 text-emerald-400', badgeColor: 'text-emerald-400 border-emerald-500/30' },
  { symbol: 'DAI', name: 'Dai / USDS (Sky)', peg: '1:1 USD', iconBg: 'bg-amber-500/20 text-amber-400', badgeColor: 'text-amber-400 border-amber-500/30' },
  { symbol: 'PYUSD', name: 'PayPal USD', peg: '1:1 USD', iconBg: 'bg-cyan-500/20 text-cyan-400', badgeColor: 'text-cyan-400 border-cyan-500/30' }
];

const NETWORKS: { id: CryptoNetwork; name: string; speed: string; gasSubsidy: string; chain: CryptoChain }[] = [
  { id: 'Base', name: 'Base L2', speed: '~1 sec', gasSubsidy: 'Provider-dependent fee', chain: 'ETH' },
  { id: 'Solana', name: 'Solana SPL', speed: '~400 ms', gasSubsidy: 'Provider-dependent fee', chain: 'SOL' },
  { id: 'Polygon', name: 'Polygon PoS', speed: '~2 sec', gasSubsidy: 'Provider-dependent fee', chain: 'ETH' },
  { id: 'Arbitrum', name: 'Arbitrum One', speed: '~1 sec', gasSubsidy: 'Provider-dependent fee', chain: 'ETH' },
  { id: 'Ethereum', name: 'Ethereum Mainnet', speed: '~12 sec', gasSubsidy: 'Standard Relay', chain: 'ETH' },
  { id: 'Bitcoin', name: 'BTC Lightning Relay', speed: '~2 sec', gasSubsidy: 'Provider-dependent fee', chain: 'BTC' }
];

const DEFAULT_VERIFIED_WALLETS: VerifiedWallet[] = [];


export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  policy,
  onClose,
  onWithdrawSuccess,
  onUpdatePolicy,
  userReference = 'anonymous'
}) => {
  const [amount, setAmount] = useState<number>(0);
  const [verifiedAvailableUsd, setVerifiedAvailableUsd] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  type PayoutMethod = 'crypto' | 'gcash' | 'binance' | 'fiat';
  const [payoutCategory, setPayoutCategory] = useState<PayoutMethod>('crypto');
  const [gcashAccount, setGcashAccount] = useState('');
  const [binanceAccount, setBinanceAccount] = useState('');

  // Payout destinations are session state only until a provider-backed
  // wallet registry and ownership attestation are available.
  const [connectedWallets, setConnectedWallets] = useState<VerifiedWallet[]>(DEFAULT_VERIFIED_WALLETS);

  const [walletFilter, setWalletFilter] = useState<'ALL' | CryptoChain>('ALL');
  const [showAddWalletForm, setShowAddWalletForm] = useState(false);

  // New Wallet Form State
  const [newWalletChain, setNewWalletChain] = useState<CryptoChain>('ETH');
  const [newWalletName, setNewWalletName] = useState('');
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [addWalletError, setAddWalletError] = useState<string | null>(null);
  const [isVerifyingNewWallet, setIsVerifyingNewWallet] = useState(false);

  // Crypto Configuration
  const [selectedToken, setSelectedToken] = useState<StablecoinType>('USDC');
  const [selectedNetwork, setSelectedNetwork] = useState<CryptoNetwork>('Base');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [connectedWalletName, setConnectedWalletName] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fiat Configuration
  const [fiatMethod, setFiatMethod] = useState<'stripe_connect' | 'direct_ach'>('stripe_connect');
  const [fiatAccount, setFiatAccount] = useState<string>('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [copiedTx, setCopiedTx] = useState(false);
  const [settledReceipt, setSettledReceipt] = useState<{
    txHash: string;
    amountUsd: number;
    tokenSymbol: string;
    network: string;
    destination: string;
    timestamp: string;
    isCrypto: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPayoutError(null);
    if (!userReference || userReference === 'anonymous') {
      setVerifiedAvailableUsd(null);
      setAmount(0);
      setBalanceLoading(false);
      return;
    }
    setBalanceLoading(true);
    authenticatedFetch('/api/payouts?userReference=' + encodeURIComponent(userReference), { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.ok !== true || !data?.balance || !Number.isFinite(Number(data.balance.availableUsd))) {
          throw new Error(data?.error || 'Verified payout balance is unavailable.');
        }
        if (cancelled) return;
        const available = Math.max(0, Number(data.balance.availableUsd));
        setPayoutError(null);
        setVerifiedAvailableUsd(available);
        setAmount(available);
      })
      .catch((error) => {
        if (cancelled) return;
        setVerifiedAvailableUsd(null);
        setAmount(0);
        setPayoutError(error instanceof Error ? error.message : 'Verified payout balance is unavailable.');
      })
      .finally(() => { if (!cancelled) setBalanceLoading(false); });
    return () => { cancelled = true; };
  }, [userReference]);

  // Address validation per chain
  const validateAddress = (addr: string, chain: CryptoChain): boolean => {
    const trimmed = addr.trim();
    if (!trimmed) return false;
    if (chain === 'ETH') {
      return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
    }
    if (chain === 'SOL') {
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);
    }
    if (chain === 'BTC') {
      // SegWit (bc1q/bc1p), Legacy (1), or P2SH (3)
      return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(trimmed);
    }
    return false;
  };

  // Determine active chain based on active wallet address
  const getActiveAddressChain = (): CryptoChain => {
    const matched = connectedWallets.find(w => w.address.toLowerCase() === walletAddress.toLowerCase());
    if (matched) return matched.chain;
    if (walletAddress.startsWith('0x')) return 'ETH';
    if (walletAddress.startsWith('bc1') || walletAddress.startsWith('1') || walletAddress.startsWith('3')) return 'BTC';
    return 'SOL';
  };

  const isCurrentAddressValid = () => {
    if (payoutCategory === 'gcash') return /^09\\d{9}$/.test(gcashAccount.replace(/\\s|-/g, ''));
    if (payoutCategory === 'binance') return binanceAccount.trim().length >= 4;
    if (payoutCategory === 'fiat') return fiatAccount.trim().length > 3;
    if (!walletAddress.trim()) return false;
    const chain = getActiveAddressChain();
    return validateAddress(walletAddress, chain);
  };

  // Selecting a wallet from the list
  const handleSelectWallet = (wallet: VerifiedWallet) => {
    setWalletAddress(wallet.address);
    setConnectedWalletName(wallet.name);

    // Auto-adjust default network
    if (wallet.chain === 'ETH') {
      if (selectedNetwork === 'Solana' || selectedNetwork === 'Bitcoin') {
        setSelectedNetwork('Base');
      }
    } else if (wallet.chain === 'SOL') {
      setSelectedNetwork('Solana');
    } else if (wallet.chain === 'BTC') {
      setSelectedNetwork('Bitcoin');
    }
  };

  // Removing a wallet from the list
  const handleRemoveWallet = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = connectedWallets.find(w => w.id === id);
    if (!target) return;

    const remaining = connectedWallets.filter(w => w.id !== id);
    setConnectedWallets(remaining);

    // If active wallet was removed, fallback to first available or empty
    if (walletAddress.toLowerCase() === target.address.toLowerCase()) {
      if (remaining.length > 0) {
        handleSelectWallet(remaining[0]);
      } else {
        setWalletAddress('');
        setConnectedWalletName(null);
      }
    }
  };

  // Adding a new verified wallet
  const handleAddWallet = () => {
    setAddWalletError(null);
    if (!newWalletName.trim()) {
      setAddWalletError('Please enter a wallet label or account name.');
      return;
    }
    if (!validateAddress(newWalletAddress, newWalletChain)) {
      if (newWalletChain === 'ETH') {
        setAddWalletError('Invalid ETH address format. Must begin with 0x followed by 40 hex characters.');
      } else if (newWalletChain === 'SOL') {
        setAddWalletError('Invalid SOL address format. Must be 32-44 base58 characters.');
      } else {
        setAddWalletError('Invalid BTC address format. Must be a valid SegWit (bc1), Legacy (1), or Script (3) address.');
      }
      return;
    }

    // Check duplicate
    const exists = connectedWallets.some(
      w => w.address.toLowerCase() === newWalletAddress.trim().toLowerCase()
    );
    if (exists) {
      setAddWalletError('This wallet address is already in your saved destinations; ownership is NOT VERIFIED.');
      return;
    }

    // Address format was checked locally; no ownership attestation is performed.

    // Wallet destinations remain session-scoped until real provider ownership attestation exists.
    // Adding an address is not cryptographic ownership verification.
    // Keep it unverified until a real provider/wallet attestation is implemented.
    const created: VerifiedWallet = {
      id: `w-${newWalletChain.toLowerCase()}-${Date.now()}`,
      chain: newWalletChain,
      name: newWalletName.trim(),
      address: newWalletAddress.trim(),
      isVerified: false,
      verificationMethod: 'Pending real ownership attestation',
      addedAt: new Date().toISOString()
    };

    setConnectedWallets(prev => [created, ...prev]);
    setNewWalletName('');
    setNewWalletAddress('');
    setIsVerifyingNewWallet(false);
    setShowAddWalletForm(false);
    setAddWalletError(null);
  };

  const handleCopyAddress = (id: string, addr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(addr).then(() => {
      setCopiedId(id);
    }).catch((error) => console.warn('Clipboard write failed:', error));
  };

  const handleWithdraw = async () => {
    if (verifiedAvailableUsd == null || !Number.isFinite(amount) || amount <= 0 || amount > verifiedAvailableUsd) {
      setPayoutError('A server-confirmed available payout balance is required. Enter an amount within that balance.');
      return;
    }
    if (!isCurrentAddressValid()) {
      setPayoutError(
        payoutCategory === 'crypto'
          ? 'Select or enter a valid destination address.'
          : payoutCategory === 'gcash'
            ? 'Enter a valid GCash mobile number (09XXXXXXXXX).'
            : payoutCategory === 'binance'
              ? 'Enter a valid Binance Pay ID, Binance UID, or approved account identifier.'
              : 'Enter a valid payout account or provider destination.'
      );
      return;
    }

    setIsProcessing(true);
    setPayoutError(null);
    try {
      const method = payoutCategory === 'crypto'
        ? `stablecoin_${selectedToken.toLowerCase()}_${selectedNetwork.toLowerCase()}`
        : payoutCategory === 'gcash'
          ? 'gcash'
          : payoutCategory === 'binance'
            ? 'binance'
            : fiatMethod;
      const destination = payoutCategory === 'crypto'
        ? walletAddress
        : payoutCategory === 'gcash'
          ? gcashAccount.replace(/\\s|-/g, '')
          : payoutCategory === 'binance'
            ? binanceAccount.trim()
            : fiatAccount;
      const res = await authenticatedFetch('/api/payouts/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, method, destination, userReference, actor: 'human-owner' })
      });
      const data = await res.json().catch(() => ({}));
      const payout = data?.payout;
      if (!res.ok || data?.ok !== true || !payout?.payoutRequestId || payout.status !== 'pending') {
        throw new Error(data?.error || payout?.note || `Payout request was not accepted (HTTP ${res.status}).`);
      }

      setSettledReceipt({
        txHash: payout.payoutRequestId,
        amountUsd: amount,
        tokenSymbol: payoutCategory === 'crypto' ? selectedToken : 'USD',
        network: payoutCategory === 'crypto'
          ? selectedNetwork
          : payoutCategory === 'gcash'
            ? 'GCash'
            : payoutCategory === 'binance'
              ? 'Binance'
              : (fiatMethod === 'stripe_connect' ? 'Stripe Connect' : 'ACH'),
        destination,
        timestamp: new Date().toLocaleString(),
        isCrypto: payoutCategory === 'crypto'
      });
      onWithdrawSuccess(amount, method, payout.payoutRequestId);
    } catch (error) {
      setPayoutError(error instanceof Error ? error.message : 'Payout request failed.');
      console.error('Payout request failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyTx = () => {
    if (!settledReceipt) return;
    void navigator.clipboard.writeText(settledReceipt.txHash).then(() => {
      setCopiedTx(true);
    }).catch((error) => console.warn('Clipboard write failed:', error));
  };

  const filteredWallets = connectedWallets.filter(w => {
    if (walletFilter === 'ALL') return true;
    return w.chain === walletFilter;
  });

  const getChainBadge = (chain: CryptoChain) => {
    switch (chain) {
      case 'ETH':
        return {
          label: 'ETH',
          badgeClass: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
        };
      case 'SOL':
        return {
          label: 'SOL',
          badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30'
        };
      case 'BTC':
        return {
          label: 'BTC',
          badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30'
        };
    }
  };

  const activeChain = getActiveAddressChain();

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Request Payout from Verified Balance
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Governed Request
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">Request a payout from your verified balance.</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {!settledReceipt ? (
          <div className="p-5 space-y-4 overflow-y-auto grow">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Server-confirmed available balance</div>
              <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                {verifiedAvailableUsd == null ? 'NOT VERIFIED' : '$' + verifiedAvailableUsd.toFixed(2) + ' USD'}
              </div>
            </div>

            <div>
              <label htmlFor="withdraw-amount" className="text-xs font-semibold text-slate-300 block mb-1.5">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-mono">$</span>
                <input
                  id="withdraw-amount"
                  type="number"
                  min="0.01"
                  max={verifiedAvailableUsd ?? 0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-20 py-3 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
                  placeholder="0.00"
                />
                <button
                  type="button"
                  onClick={() => setAmount(verifiedAvailableUsd ?? 0)}
                  className="absolute right-2 top-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold"
                >
                  MAX
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-300 block mb-1.5">Payout Method</div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['crypto', 'Crypto', 'USDC / USDT / DAI / PYUSD'],
                  ['gcash', 'GCash', 'Philippines mobile payout'],
                  ['binance', 'Binance', 'Binance Pay / UID'],
                  ['fiat', 'Bank / Fiat', 'Bank / payment provider']
                ] as const).map(([id, label, description]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPayoutCategory(id)}
                    className={`p-3 rounded-xl border text-left transition-colors ${payoutCategory === id ? 'bg-emerald-500/10 border-emerald-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                  >
                    <div className="text-xs font-bold">{label}</div>
                    <div className="text-[10px] mt-1 text-slate-500">{description}</div>
                  </button>
                ))}
              </div>
            </div>

            {payoutCategory === 'crypto' ? (
              <div className="space-y-3">
                <div>
                  <label htmlFor="saved-wallet-destination" className="text-xs font-semibold text-slate-300 block mb-1.5">Saved Wallet Destination · ownership NOT VERIFIED</label>
                  <select id="saved-wallet-destination"
                    value={walletAddress}
                    onChange={(e) => {
                      const value=e.target.value;
                      setWalletAddress(value);
                      const matched=connectedWallets.find(w=>w.address===value);
                      setConnectedWalletName(matched?.name || 'Custom Address');
                      if (matched) {
                        setSelectedNetwork(matched.chain === 'SOL' ? 'Solana' : matched.chain === 'BTC' ? 'Bitcoin' : 'Base');
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    {connectedWallets.filter(w => w.isVerified).map(w => (
                      <option key={w.id} value={w.address}>{w.name} • {w.chain}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="payout-token" className="text-xs font-semibold text-slate-300 block mb-1.5">Token</label>
                    <select id="payout-token"
                      value={selectedToken}
                      onChange={(e) => setSelectedToken(e.target.value as StablecoinType)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-xs text-white"
                    >
                      {SUPPORTED_STABLECOINS.map(t => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="payout-network" className="text-xs font-semibold text-slate-300 block mb-1.5">Network</label>
                    <select id="payout-network"
                      value={selectedNetwork}
                      onChange={(e) => setSelectedNetwork(e.target.value as CryptoNetwork)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-xs text-white"
                    >
                      {NETWORKS.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                  </div>
                </div>

                <label htmlFor="custom-wallet-address" className="sr-only">Custom wallet address</label>
                <input
                  id="custom-wallet-address"
                  type="text"
                  value={walletAddress}
                  onChange={(e) => {
                    setWalletAddress(e.target.value);
                    const matched=connectedWallets.find(w=>w.address.toLowerCase()===e.target.value.trim().toLowerCase());
                    setConnectedWalletName(matched?.name || 'Custom Address');
                  }}
                  placeholder="Wallet address"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            ) : payoutCategory === 'gcash' ? (
              <div>
                <label htmlFor="gcash-number" className="text-xs font-semibold text-slate-300 block mb-1.5">GCash Number</label>
                <input id="gcash-number"
                  type="tel"
                  inputMode="numeric"
                  value={gcashAccount}
                  onChange={(e) => setGcashAccount(e.target.value)}
                  placeholder="09XXXXXXXXX"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-1.5">Request only. Provider confirmation is required before Neon can record settlement.</p>
              </div>
            ) : payoutCategory === 'binance' ? (
              <div>
                <label htmlFor="binance-pay-id" className="text-xs font-semibold text-slate-300 block mb-1.5">Binance Pay ID / UID</label>
                <input id="binance-pay-id"
                  type="text"
                  value={binanceAccount}
                  onChange={(e) => setBinanceAccount(e.target.value)}
                  placeholder="Enter Binance Pay ID or UID"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-1.5">Request only. Provider confirmation is required before Neon can record settlement.</p>
              </div>
            ) : (
              <div>
                <label htmlFor="payout-account" className="text-xs font-semibold text-slate-300 block mb-1.5">Payout Account</label>
                <input id="payout-account"
                  type="text"
                  value={fiatAccount}
                  onChange={(e) => setFiatAccount(e.target.value)}
                  placeholder="Bank or payment account"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}

            {payoutError && (
              <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
                {payoutError}
              </div>
            )}

            <button
              onClick={handleWithdraw}
              disabled={isProcessing || balanceLoading || verifiedAvailableUsd == null || amount <= 0 || amount > verifiedAvailableUsd || !isCurrentAddressValid()}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition-all"
            >
              {isProcessing ? 'Submitting…' : `Request Payout • $${amount.toFixed(2)} USD`}
            </button>
          </div>
        ) : (
          /* Receipt Screen */
          <div className="p-6 space-y-4 text-center overflow-y-auto">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white">Payout Request Submitted</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {settledReceipt.isCrypto
                  ? `Request submitted. Provider settlement has not been confirmed.`
                  : 'Request submitted. Provider settlement has not been confirmed.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-left text-xs font-mono space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Requested Amount:</span>
                <span className="text-emerald-400 font-bold text-sm">
                  {settledReceipt.amountUsd.toFixed(2)} {settledReceipt.tokenSymbol}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Channel / Network:</span>
                <span className="text-slate-200">{settledReceipt.network}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Recipient:</span>
                <span className="text-slate-300 truncate max-w-[210px]">{settledReceipt.destination}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Payout Request ID:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-cyan-400 truncate max-w-[160px]">{settledReceipt.txHash}</span>
                  <button
                    onClick={handleCopyTx}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                    title="Copy Payout Request ID"
                  >
                    {copiedTx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Provider Status:</span>
                <span className="text-emerald-400">PENDING — settlement not confirmed</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Requested At:</span>
                <span className="text-slate-400">{settledReceipt.timestamp}</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs border border-slate-700 transition-colors"
            >
              Done & Return to Vault
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
