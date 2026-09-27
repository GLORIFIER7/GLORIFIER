import React, { useState } from 'react';
import { 
  Globe, 
  Key, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  RefreshCw, 
  Star, 
  ExternalLink, 
  Check, 
  X, 
  Layers, 
  Zap, 
  Coins, 
  Wallet, 
  Smartphone, 
  Mail, 
  Github, 
  Twitter, 
  ShieldAlert,
  ArrowUpRight,
  Database,
  Fingerprint
} from 'lucide-react';
import { InternetAccount, InternetAccountCategory } from '../types';

interface InternetAccountsFederationProps {
  accounts: InternetAccount[];
  onUpdateAccount: (updatedAccount: InternetAccount) => void;
  onAuthenticateAll: () => void;
}

export const InternetAccountsFederation: React.FC<InternetAccountsFederationProps> = ({
  accounts,
  onUpdateAccount,
  onAuthenticateAll,
}) => {
  const [selectedAccount, setSelectedAccount] = useState<InternetAccount | null>(accounts[0] || null);
  const [actionState, setActionState] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleToggleGatekeeper = (acc: InternetAccount) => {
    const updated: InternetAccount = { ...acc, isApprovalGatekeeper: !acc.isApprovalGatekeeper };
    onUpdateAccount(updated);
    if (selectedAccount?.id === acc.id) setSelectedAccount(updated);
  };

  const handleTogglePrivacyShield = (acc: InternetAccount) => {
    const updated: InternetAccount = { ...acc, privacyShieldActive: !acc.privacyShieldActive };
    onUpdateAccount(updated);
    if (selectedAccount?.id === acc.id) setSelectedAccount(updated);
  };

  const handleToggleAutoSync = (acc: InternetAccount) => {
    const updated: InternetAccount = { ...acc, autoSyncEnabled: !acc.autoSyncEnabled };
    onUpdateAccount(updated);
    if (selectedAccount?.id === acc.id) setSelectedAccount(updated);
  };

  const handleWeightChange = (acc: InternetAccount, weight: number) => {
    const updated: InternetAccount = { ...acc, approvalWeight: weight };
    onUpdateAccount(updated);
    if (selectedAccount?.id === acc.id) setSelectedAccount(updated);
  };

  const filteredAccounts = accounts.filter(acc => {
    if (filterCategory !== 'all' && acc.category !== filterCategory) return false;
    if (searchQuery && !acc.provider.toLowerCase().includes(searchQuery.toLowerCase()) && !acc.accountIdentifier.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const totalDataPoints = accounts.reduce((acc, curr) => acc + curr.dataItemsGoverned, 0);
  const gatekeeperCount = accounts.filter(a => a.isApprovalGatekeeper).length;
  const authenticatedCount = accounts.filter(a => a.status === 'authenticated').length;

  const getCategoryBadge = (category: InternetAccountCategory) => {
    switch (category) {
      case 'google':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">GOOGLE WORKSPACE</span>;
      case 'financial':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">FINANCIAL PAYOUT</span>;
      case 'developer':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">DEVELOPER & CODE</span>;
      case 'social':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">SOCIAL GRAPH</span>;
      case 'commerce':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">COMMERCE & SHOPPING</span>;
      case 'cloud':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">CLOUD IDENTITY</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">INTERNET ACCOUNT</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Global Internet Accounts Federation */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-indigo-950/40 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        {actionState && <div className="text-xs text-slate-400 mb-3" role="status">{actionState}</div>}
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner">
                <Globe className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white tracking-tight">Internet Accounts & Sovereign Data Hub</h2>
      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                    ACCOUNT REGISTRY
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400">
                  Every account across the internet is unified for biometric authentication, multi-sig approval gatekeeping, and differential privacy data monetization.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics & Global Controls */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center gap-3">
              <Database className="w-5 h-5 text-indigo-400" />
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Governed Data Points</div>
                <div className="text-lg font-bold text-indigo-400 font-mono">{totalDataPoints.toLocaleString()}</div>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center gap-3">
              <Key className="w-5 h-5 text-emerald-400" />
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Approval Gatekeepers</div>
                <div className="text-lg font-bold text-emerald-300 font-mono">{gatekeeperCount} / {accounts.length}</div>
              </div>
            </div>

            <button
              onClick={onAuthenticateAll}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-500 hover:bg-indigo-400 text-white shadow-md shadow-indigo-500/20 transition-all"
            >
              <Fingerprint className="w-4 h-4" />
              <span>Authenticate All Accounts</span>
            </button>
          </div>
        </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Account Directory (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">All Internet User Accounts</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                {filteredAccounts.length}
              </span>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2 text-xs">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Categories</option>
                <option value="google">Google Workspace</option>
                <option value="financial">Financial & Crypto</option>
                <option value="developer">Developer & Code</option>
                <option value="social">Social Graph</option>
                <option value="commerce">Commerce & Shopping</option>
                <option value="cloud">Cloud Identity</option>
              </select>
            </div>
          </div>

          {/* Account Cards */}
          <div className="space-y-3">
            {filteredAccounts.map((acc) => {
              const isSelected = selectedAccount?.id === acc.id;
              return (
                <div
                  key={acc.id}
                  onClick={() => setSelectedAccount(acc)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${
                    isSelected
                      ? 'bg-slate-850 border-indigo-500/60 shadow-lg shadow-indigo-950/20'
                      : 'bg-slate-900 hover:bg-slate-850/70 border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getCategoryBadge(acc.category)}
                        <h4 className="font-bold text-sm text-white">{acc.provider}</h4>
                        <span className="font-mono text-xs text-indigo-300">{acc.accountIdentifier}</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {acc.governedDataTypes.join(' • ')}
                      </div>
                    </div>

                    <div className="text-right space-y-1">
                      {acc.status === 'authenticated' ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Authenticated
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-300 text-xs font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" /> Pending Auth
                        </span>
                      )}
                      <div className="text-[10px] text-slate-400">{acc.authMethod}</div>
                    </div>
                  </div>

                  {/* Badges & Gatekeeper Status */}
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                      <span>{acc.dataItemsGoverned.toLocaleString()} items</span>
                      <span>•</span>
                      <span className={acc.privacyShieldActive ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                        {acc.privacyShieldActive ? 'ε-Shielded' : 'Unshielded'}
                      </span>
                      <span>•</span>
                      <span>Weight: {'★'.repeat(acc.approvalWeight)}</span>
                      <span>•</span>
                      <span className="text-emerald-400 font-mono font-semibold">${acc.monthlyEstValueUsd}/mo</span>
                    </div>

                    {/* Quick Gatekeeper Switch */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleToggleGatekeeper(acc)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold border flex items-center gap-1 transition-colors ${
                          acc.isApprovalGatekeeper
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        <Key className="w-3 h-3" />
                        <span>{acc.isApprovalGatekeeper ? 'Gatekeeper Active' : 'Enable Gatekeeper'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Account Deep Config & Gatekeeper Multi-Sig Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {selectedAccount ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5 sticky top-20 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white">{selectedAccount.provider}</h3>
                  <div className="text-xs font-mono text-indigo-300">{selectedAccount.accountIdentifier}</div>
                </div>
                {getCategoryBadge(selectedAccount.category)}
              </div>

              {/* Authentication & Attestation Card */}
              <div className="space-y-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Authentication Protocol:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{selectedAccount.authMethod}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Connection State:</span>
                  <span className="text-slate-200">{selectedAccount.status} ({selectedAccount.apiHealth})</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Last Cryptographic Sync:</span>
                  <span className="text-slate-200">{selectedAccount.lastSync}</span>
                </div>


              </div>

              {/* Data Rights & Privacy Controls */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-300">Data Stream Rights & Shielding</div>
                
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                  <div className="space-y-0.5">
                    <div className="text-white font-medium">Differential Privacy Shield (ε-Noise)</div>
                    <div className="text-[11px] text-slate-400">Laplacian perturbation eliminates re-identification</div>
                  </div>
                  <button
                    onClick={() => handleTogglePrivacyShield(selectedAccount)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                      selectedAccount.privacyShieldActive
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {selectedAccount.privacyShieldActive ? 'SHIELDED' : 'EXPOSED'}
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                  <div className="space-y-0.5">
                    <div className="text-white font-medium">Continuous Telemetry Sync</div>
                    <div className="text-[11px] text-slate-400">Auto-index records for AI pre-training licensing</div>
                  </div>
                  <button
                    onClick={() => handleToggleAutoSync(selectedAccount)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                      selectedAccount.autoSyncEnabled
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {selectedAccount.autoSyncEnabled ? 'ACTIVE' : 'PAUSED'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
              <Globe className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs">Select an internet account to manage authentication, approvals, and data rights.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
