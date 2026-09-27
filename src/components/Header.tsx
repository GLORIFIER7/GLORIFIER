import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Wallet, 
  Sparkles, 
  Zap, 
  Sliders, 
  Database, 
  Scale, 
  Layers, 
  ShieldAlert,
  ArrowUpRight,
  SlidersHorizontal,
  Coins,
  Lock,
  LogIn,
  LogOut,
  User as UserIcon,
  Cloud,
  Mail,
  HardDrive,
  Users,
  Globe,
  Globe2,
  Cpu,
  Bot,
  FileText,
  BrainCircuit,
  Atom,
  Image as ImageIcon
} from 'lucide-react';
import { SovereignStats, MonetizationPolicy } from '../types';
import { User } from 'firebase/auth';
import { AuthPanel } from './AuthPanel';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  stats: SovereignStats;
  policy: MonetizationPolicy;
  onOpenWithdraw: () => void;
  pendingOffersCount: number;
  currentUser: User | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  stats,
  policy,
  onOpenWithdraw,
  pendingOffersCount,
  currentUser,
}) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Layers },
    { id: 'ai_ceo', label: 'AI CEO', icon: BrainCircuit },
    { id: 'mediator', label: 'Mediator', icon: ShieldCheck },
    { id: 'integrations', label: 'Intelligence', icon: Globe2 },
    { id: 'global_collaboration', label: 'Collaboration', icon: Users },
    { id: 'discovery', label: '24/7 Discovery', icon: Zap },
    { id: 'ai_collaboration', label: 'AI Models', icon: Sparkles },
    { id: 'sentinel', label: 'Code Sentinel', icon: Bot },
    { id: 'compute', label: 'Compute', icon: Cpu },
    { id: 'accounts', label: 'Accounts & Data', icon: Globe },
    { id: 'binance', label: 'Binance / NFT', icon: Wallet },
    { id: 'marketplace', label: 'Marketplace', icon: Scale, badge: pendingOffersCount > 0 ? pendingOffersCount : undefined },
    { id: 'compensation', label: 'Compensation', icon: Coins },
    { id: 'monetization_sprint', label: 'Monetization', icon: ArrowUpRight },
    { id: 'compliance', label: 'Compliance', icon: ShieldAlert },
    { id: 'patent', label: 'Patent / IP', icon: FileText },
    { id: 'exposures', label: 'Clawback Audit', icon: ShieldAlert },
    { id: 'revenue_verified', label: 'Verified Revenue', icon: Wallet },
    { id: 'connections', label: 'Connections', icon: Lock },
    { id: 'scientists', label: 'Scientists', icon: Atom },
    { id: 'control', label: 'Data Control', icon: ShieldCheck },
    { id: 'gmail', label: 'Gmail', icon: Mail },
    { id: 'drive', label: 'Drive', icon: HardDrive },
    { id: 'privacy_lab', label: 'Privacy Lab', icon: Lock },
    { id: 'footprints', label: 'Data Footprints', icon: Database },
    { id: 'broker', label: 'AI Broker', icon: Scale },
    { id: 'gpt_cowork', label: 'GPT Co-Work', icon: BrainCircuit },
  ];

  const handleTab = (tab: string) => { setActiveTab(tab); setMobileNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <header className="sticky top-0 z-40 bg-[#080808]/95 backdrop-blur-sm border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-16 py-2">
          {/* Logo & Platform Name */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md border border-slate-700 bg-[#111] overflow-hidden flex items-center justify-center">
              <img src={`${import.meta.env.BASE_URL}glorifier-app-icon.svg`} alt="GLORIFIER" className="h-full w-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-semibold tracking-[-0.03em] text-white flex items-center gap-1.5">
                  GLORIFIER <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-transparent text-emerald-300 border border-slate-700 font-mono">AI CONTROL PLANE</span>
                </h1>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block mt-0.5">
                Provider-Neutral Intelligence Orchestration
              </p>
            </div>
          </div>

          {/* Right: Wallet Balance & Cashout & Auth */}
          <div className="flex items-center gap-3">
            <AuthPanel currentUser={currentUser} />

          </div>
        </div>

        <div className="md:hidden border-t border-slate-900 py-2 flex justify-end"><button type="button" aria-expanded={mobileNavOpen} aria-controls="mobile-navigation" onClick={() => setMobileNavOpen(v => !v)} className="min-h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-200">{mobileNavOpen ? "Close" : "Menu"}</button></div>
        {mobileNavOpen && <div id="mobile-navigation" className="md:hidden border-t border-slate-900 py-2"><div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pb-2">{tabs.map((tab) => { const Icon = tab.icon; const isActive = activeTab === tab.id; return <button key={tab.id} onClick={() => handleTab(tab.id)} className={"flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium " + (isActive ? "border-slate-700 bg-slate-900 text-white" : "border-slate-800 bg-slate-950 text-slate-400")}><Icon className={"h-4 w-4 shrink-0 " + (isActive ? "text-emerald-400" : "text-slate-500")} /><span className="truncate">{tab.label}</span>{tab.badge ? <span className="ml-auto rounded border border-slate-800 px-1 text-[9px]">{tab.badge}</span> : null}</button>; })}</div></div>}
        {/* Navigation Tabs */}
        <nav className="hidden md:flex space-x-1 overflow-x-auto py-2 border-t border-slate-900">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-btn-${tab.id}`}
                onClick={() => handleTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 text-[11px] font-medium rounded-md whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-slate-900 text-white border border-slate-700'
                    : 'text-slate-500 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-medium bg-transparent text-slate-500 border border-slate-800">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
