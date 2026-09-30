import React, { useState } from 'react';
import {
  ShieldCheck, Wallet, Sparkles, Zap, Database, Scale, Layers,
  ShieldAlert, ArrowUpRight, Coins, Lock, Users,
  Globe, Globe2, Cpu, Bot, Network, FileText, BrainCircuit, Atom, Smartphone, Menu, X
} from 'lucide-react';
import { User } from 'firebase/auth';
import { AuthPanel } from './AuthPanel';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingOffersCount: number;
  currentUser: User | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  pendingOffersCount,
  currentUser,
}) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Layers },
    { id: 'geas_architecture', label: 'Architecture', icon: BrainCircuit },
    { id: 'ai_ceo', label: 'AI CEO', icon: BrainCircuit },
    { id: 'integrations', label: 'Intelligence', icon: Globe2 },
    { id: 'agent_network', label: 'AI Agent Network', icon: Network },
    { id: 'discovery', label: '24/7 Discovery', icon: Zap },
    { id: 'sentinel', label: 'Code Sentinel', icon: Bot },
    { id: 'connections', label: 'Connections', icon: Lock },
    { id: 'mobile', label: 'Android Device', icon: Smartphone },
    { id: 'scientists', label: 'Scientists', icon: Atom },
    { id: 'agent_miner', label: 'Agent Miner', icon: Cpu },
    { id: 'compliance', label: 'Compliance', icon: ShieldAlert },
    { id: 'control', label: 'Data Control', icon: ShieldCheck },
    { id: 'footprints', label: 'Data Footprints', icon: Database },
    { id: 'broker', label: 'AI Broker', icon: Scale },
  ];

  const primaryIds = new Set(['overview', 'ai_ceo', 'integrations', 'discovery', 'sentinel']);
  const primaryTabs = tabs.filter(tab => primaryIds.has(tab.id));
  const moreTabs = tabs.filter(tab => !primaryIds.has(tab.id));

  const handleTab = (tab: string) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
    setMoreOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const TabButton = ({ tab, compact = false }: { tab: typeof tabs[number]; compact?: boolean }) => {
    const Icon = tab.icon;
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        id={`tab-btn-${tab.id}`}
        onClick={() => handleTab(tab.id)}
        className={`flex items-center gap-2 rounded-md whitespace-nowrap transition-colors ${
          compact ? 'w-full px-3 py-2.5 text-left text-xs' : 'px-3 py-2 text-[11px]'
        } ${
          isActive
            ? 'bg-slate-900 text-white border border-slate-700'
            : 'text-slate-500 hover:text-slate-200 hover:bg-slate-900'
        }`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
        <span>{tab.label}</span>
      </button>
    );
  };

  return (
    <header className="sticky top-0 z-40 bg-[#080808]/95 backdrop-blur-sm border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-16 py-2">
          <button
            type="button"
            onClick={() => handleTab('overview')}
            className="flex items-center gap-3 text-left"
            aria-label="GLORIFIER overview"
          >
            <div className="w-9 h-9 rounded-md border border-slate-700 bg-[#111] overflow-hidden flex items-center justify-center">
              <img src={`${import.meta.env.BASE_URL}glorifier-app-icon.svg`} alt="GLORIFIER" className="h-full w-full object-cover" />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold tracking-[-0.03em] text-white flex items-center gap-1.5">
                GLORIFIER
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm text-emerald-300 border border-slate-700 font-mono">
                  AI CONTROL PLANE
                </span>
              </h1>
              <p className="text-[11px] text-slate-500 hidden sm:block mt-0.5">
                Provider-Neutral Intelligence Orchestration
              </p>
            </div>
          </button>

          <AuthPanel currentUser={currentUser} />
        </div>

        <div className="md:hidden border-t border-slate-900 py-2 flex justify-end">
          <button
            type="button"
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileNavOpen(v => !v)}
            className="min-h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-200 flex items-center gap-2"
          >
            {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            {mobileNavOpen ? 'Close' : 'Menu'}
          </button>
        </div>

        {mobileNavOpen && (
          <div id="mobile-navigation" className="md:hidden border-t border-slate-900 py-2">
            <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pb-2">
              {tabs.map(tab => <TabButton key={tab.id} tab={tab} compact />)}
            </div>
          </div>
        )}

        <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-1 py-2 border-t border-slate-900">
          {primaryTabs.map(tab => <TabButton key={tab.id} tab={tab} />)}
          <div className="relative ml-auto">
            <button
              id="nav-more"
              type="button"
              aria-expanded={moreOpen}
              aria-controls="desktop-more-navigation"
              onClick={() => setMoreOpen(v => !v)}
              className="flex items-center gap-2 px-3 py-2 text-[11px] font-medium rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent"
            >
              {moreOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              Modules
            </button>
            {moreOpen && (
              <div id="desktop-more-navigation" className="absolute right-0 top-full mt-1 w-72 max-h-[70vh] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2 shadow-2xl">
                <div className="grid grid-cols-2 gap-1">
                  {moreTabs.map(tab => <TabButton key={tab.id} tab={tab} compact />)}
                </div>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
};
