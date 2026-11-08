import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Sparkles, 
  Code, 
  FileCode, 
  Copy, 
  Check, 
  Send, 
  RefreshCw, 
  Download, 
  CheckCircle2, 
  ShieldCheck, 
  Layers, 
  Zap, 
  Scale, 
  Lock, 
  Cpu, 
  ArrowRight, 
  Play, 
  Sliders, 
  MessageSquare, 
  ChevronRight,
  ChevronDown,
  Terminal,
  FileText,
  Activity,
  Clock,
  Power
} from 'lucide-react';
import { MonetizationPolicy, DataFootprintSource } from '../types';

export type CollaborationDomain = 
  | 'code_engineering'
  | 'monetization_strategy'
  | 'patent_ip'
  | 'compliance_clawbacks'
  | 'differential_privacy';

interface CoWorkingSession {
  id: string;
  timestamp: string;
  userGoal: string;
  domain: CollaborationDomain;
  gptContribution: string;
  geminiPeerReview: string;
  jointArtifact: string;
  consensusScore: number | null;
}

interface WorkTogetherWithGptStudioProps {
  policy: MonetizationPolicy;
  onUpdatePolicy: (newPolicy: Partial<MonetizationPolicy>) => void;
  footprints?: DataFootprintSource[];
  initialCodeContext?: string;
  initialTaskPrompt?: string;
  onOpenSentinelTab?: () => void;
}

export const WorkTogetherWithGptStudio: React.FC<WorkTogetherWithGptStudioProps> = ({
  policy,
  onUpdatePolicy,
  footprints = [],
  initialCodeContext = '',
  initialTaskPrompt = '',
  onOpenSentinelTab
}) => {
  const [domain, setDomain] = useState<CollaborationDomain>('code_engineering');
  const [userPrompt, setUserPrompt] = useState(initialTaskPrompt || '');
  const [codeContext, setCodeContext] = useState(initialCodeContext || '');
  const [showCodeEditor, setShowCodeEditor] = useState(Boolean(initialCodeContext));
  const [isLoading, setIsLoading] = useState(false);
  const [activeView, setActiveView] = useState<'joint' | 'gpt' | 'gemini'>('joint');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [applySuccessNotice, setApplySuccessNotice] = useState<string | null>(null);

  // 24/7 Autonomous Co-Working State
  const [is247Enabled, setIs247Enabled] = useState(false);
  const [cyclesCompleted, setCyclesCompleted] = useState(0);
  const [lastCycleAt, setLastCycleAt] = useState<string | null>(null);
  const [isTriggering247, setIsTriggering247] = useState(false);
  const [show247Logs, setShow247Logs] = useState(false);
  const [recent247Deliverables, setRecent247Deliverables] = useState<Array<{
    id: string;
    timestamp: string;
    domain: string;
    task: string;
    consensusScore: number | null;
    summary: string;
  }>>([]);

  // Sync 24/7 background status from server
  useEffect(() => {
    let mounted = true;
    const fetch247 = async () => {
      try {
        const res = await fetch('/api/ai/work-247-gpt');
        if (res.ok && mounted) {
          const data = await res.json();
          setIs247Enabled(Boolean(data.enabled));
          setCyclesCompleted(data.cyclesCompleted || 0);
          setLastCycleAt(data.lastCycleAt || null);
          if (Array.isArray(data.recentDeliverables) && data.recentDeliverables.length > 0) {
            setRecent247Deliverables(data.recentDeliverables);
          }
        }
      } catch (err) {
        console.warn('Could not sync 24/7 GPT co-working status:', err);
      }
    };

    fetch247();
    const timer = setInterval(fetch247, 20000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const handleToggle247 = async () => {
    try {
      const res = await fetch('/api/ai/work-247-gpt/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !is247Enabled })
      });
      if (res.ok) {
        const data = await res.json();
        setIs247Enabled(Boolean(data.enabled));
        setApplySuccessNotice(data.enabled ? 'Backend accepted the configuration request; continuous execution NOT VERIFIED.' : 'Backend accepted the disable request; runtime state NOT VERIFIED.');
      } else {
        setApplySuccessNotice('Request failed. Background execution status remains NOT VERIFIED.');
      }
    } catch (err) {
      console.warn('Failed to toggle 24/7 co-working:', err);
      setApplySuccessNotice('Request failed. Background execution status remains NOT VERIFIED.');
    }
  };

  const handleTrigger247Cycle = async () => {
    setIsTriggering247(true);
    try {
      const res = await fetch('/api/ai/work-247-gpt/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: `24/7 Immediate Verification: ${domain.replace(/_/g, ' ')}`,
          domain
        })
      });
      if (res.ok) {
        const data = await res.json();
        setCyclesCompleted(data.cyclesCompleted);
        if (data.deliverable) {
          setRecent247Deliverables(prev => [data.deliverable, ...prev.slice(0, 9)]);
        }
        setApplySuccessNotice('Backend returned a cycle result. Provider participation and check outcomes are NOT independently verified.');
      }
    } catch (err) {
      console.warn('Failed to trigger 24/7 cycle:', err);
    } finally {
      setIsTriggering247(false);
    }
  };

  // Active or completed sessions
  const [sessions, setSessions] = useState<CoWorkingSession[]>([
    {
      id: 'sample-not-verified',
      timestamp: 'SAMPLE · NOT VERIFIED',
      userGoal: 'Example placeholder — no live AI collaboration session is verified.',
      domain: 'code_engineering',
      gptContribution: 'Sample placeholder only. No live OpenAI provider response is attached.',
      geminiPeerReview: 'Sample placeholder only. No live Gemini response or cryptographic review is attached.',
      jointArtifact: 'Sample placeholder only. No joint artifact or model consensus has been verified.',
      consensusScore: null
    }
  ]);

  const currentSession = sessions[0];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
  };

  const handleDownloadArtifact = (session: CoWorkingSession) => {
    const content = `# PROVIDER COLLABORATION OUTPUT — AGREEMENT NOT MEASURED
**Date:** ${new Date().toISOString()}  
**Domain:** ${session.domain.toUpperCase()}  
**Task Goal:** ${session.userGoal}  
**Agreement Status:** ${session.consensusScore === null ? 'NOT MEASURED' : `${session.consensusScore}% backend-reported; not independently verified`}  
**Active Epsilon Budget:** ε = ${policy.globalEpsilon}  
**Active Compensation Floor:** $${policy.minimumMonthlyFloorUsd}/mo  

================================================================================
${session.jointArtifact}

================================================================================
### PROVIDER RESPONSES

---
#### 1. OpenAI provider response
${session.gptContribution}

---
#### 2. Google Gemini provider response (cryptographic review NOT VERIFIED)
${session.geminiPeerReview}
`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CoWorking_GPT_Gemini_${session.domain}_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleApplyDirectives = () => {
    onUpdatePolicy({
      globalEpsilon: 0.30,
      minimumMonthlyFloorUsd: Math.max(40, policy.minimumMonthlyFloorUsd),
      aiModel: 'consensus' as any,
      autoNegotiateHighBids: true
    });
    setApplySuccessNotice('Configured policy values updated locally. Production enforcement and provider consensus are NOT VERIFIED.');
  };

  const handleRunCoWorking = async (overridePrompt?: string, overrideCode?: string) => {
    const promptToRun = (overridePrompt || userPrompt).trim();
    if (!promptToRun || isLoading) return;
    const codeToRun = overrideCode !== undefined ? overrideCode : codeContext;

    setIsLoading(true);
    setApplySuccessNotice(null);

    try {
      const res = await fetch('/api/ai/work-together-gpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskPrompt: promptToRun,
          domain,
          codeOrContext: codeToRun || undefined
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const newSession: CoWorkingSession = {
        id: `session-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        userGoal: promptToRun,
        domain,
        gptContribution: data.gptContribution || 'NOT AVAILABLE — no OpenAI response was returned for this request.',
        geminiPeerReview: data.geminiPeerReview || 'NOT AVAILABLE — no Gemini response was returned for this request.',
        jointArtifact: data.jointArtifact || 'NOT AVAILABLE — the backend did not return a joint artifact.',
        consensusScore: typeof data.consensusScore === 'number' ? data.consensusScore : null
      };

      setSessions(prev => [newSession, ...prev]);
      setUserPrompt('');
    } catch (err) {
      console.warn('Backend co-working request failed:', err);
      setApplySuccessNotice('Co-working backend unavailable. No synthetic session was generated.');
        } finally {
      setIsLoading(false);
    }
  };

  const quickTemplates: Record<CollaborationDomain, { title: string; prompt: string; code?: string }[]> = {
    code_engineering: [
      {
        title: 'Fix 503 Circuit Breaker',
        prompt: 'Work together on a provider-neutral failover policy that routes across configured OpenAI and Google Gemini models when a provider returns 503 UNAVAILABLE.',
        code: `async function callGeminiSafe(params) {
  // Route only to an authorized, configured provider/model after a 503 response.
}`
      },
      {
        title: 'Zero-Knowledge Differential Privacy Hook',
        prompt: 'Write a custom React TypeScript hook useDifferentialPrivacy that injects client-side Laplace noise into real-time telemetry streams.',
        code: `export function useDifferentialPrivacy(epsilon: number) {
  // Laplace perturbation generator
}`
      },
      {
        title: 'Self-Healing Sentinel Auto-Patch',
        prompt: 'Collaborate to write an automated hot-patch testing suite that validates code diffs before applying them to production.',
        code: `export function validatePatchSafety(patchDiff: string): boolean {
  // Check for syntax regressions and infinite loops
}`
      }
    ],
    monetization_strategy: [
      {
        title: 'Negotiate $45/mo Pre-Training Tier',
        prompt: 'Formulate a commercial counter-offer to Anthropic & Cohere requesting a $45/mo compensation floor for de-identified developer telemetry.'
      },
      {
        title: 'Calculate 10k Query ROI',
        prompt: 'Calculate the expected monthly revenue yield for 100,000 synthetic browsing queries with differential privacy ε = 0.25.'
      },
      {
        title: 'Quarantine Shadow Ad Brokers',
        prompt: 'Draft an automated commercial boycott directive severing telemetry pipelines to Acxiom, Experian, and LiveRamp.'
      }
    ],
    patent_ip: [
      {
        title: 'Draft Claim 1 (Autonomous Brokerage)',
        prompt: 'Co-draft independent Claim 1 under 35 U.S.C. § 101/112 for autonomous personal data monetization with real-time differential privacy perturbation.'
      },
      {
        title: 'Alice / Mayo 101 Technological Defense',
        prompt: 'Formulate an unassailable Alice Step 2 technological improvement argument showing why Laplace circuit breaking is non-abstract patentable subject matter.'
      },
      {
        title: 'Defensive Trade Secret Strategy',
        prompt: 'Audit whether our synthetic digital twin generator should be preserved as a trade secret or published in a patent disclosure.'
      }
    ],
    compliance_clawbacks: [
      {
        title: 'CCPA consumer deletion-rights review',
        prompt: 'Draft an informational consumer request letter for qualified review under Cal. Civ. Code § 1798.105 and assess possible California SB 362 relevance. Identify eligibility and missing facts; do not claim a general cure deadline or enforcement outcome.'
      },
      {
        title: 'GDPR Article 35 DPIA scoping review',
        prompt: 'Assess whether the described processing may require a DPIA under GDPR Article 35. Identify missing facts, risks, mitigations, and qualified-review steps; do not certify completion or compliance.'
      },
      {
        title: 'EU AI Act risk and transparency review',
        prompt: 'Assess potentially applicable EU AI Act Article 5 prohibitions, Article 6/Annex III high-risk criteria, and Article 50 transparency duties from supplied facts. Do not pre-assign a risk class or assert that prohibited practices are absent.'
      }
    ],
    differential_privacy: [
      {
        title: 'Calibrate Laplace Scale (b = Δf / ε)',
        prompt: 'For the stated assumptions, calculate the illustrative Laplace scale b = Δf/ε. Explain why this calculation alone does not quantify reconstruction risk or verify a production privacy guarantee.'
      },
      {
        title: 'HIPAA Expert Determination (§ 164.514)',
        prompt: 'Explain why differential privacy and k-anonymity are distinct from HIPAA Expert Determination. Identify dataset-specific evidence and qualified expert analysis required under 45 CFR § 164.514(b)(1).'
      },
      {
        title: 'Privacy Budget Composition',
        prompt: 'Calculate total privacy loss under Advanced Composition Theorem for 5,000 sequential research queries.'
      }
    ]
  };

  return (
    <div className="space-y-6">
      {/* Studio Header & Partnership Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 border border-emerald-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Interactive Co-Working Studio
              </span>
              <span className="px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
                OpenAI provider request &bull; Google Gemini provider request &bull; agreement NOT MEASURED
              </span>
              <span className="px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs font-mono">
                Pair Programming &bull; Strategy &bull; Patent &bull; Privacy
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Work Together with GPT & Gemini
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Interactive co-working request UI. The backend may return provider-generated content, but actual provider participation, agreement, cryptographic cross-auditing, differential-privacy testing, and runtime safety checks are NOT independently verified.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => handleDownloadArtifact(currentSession)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-lg shadow-emerald-950/40"
              title="Download provider collaboration output in Markdown format"
            >
              <Download className="w-4 h-4" /> Download Provider Output (.MD)
            </button>
            <button
              onClick={handleApplyDirectives}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-semibold text-xs transition-colors"
              title="Apply local policy preferences; provider agreement and production enforcement are NOT VERIFIED"
            >
              <CheckCircle2 className="w-4 h-4" /> Apply Directives to Policy
            </button>
            {onOpenSentinelTab && (
              <button
                onClick={onOpenSentinelTab}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition-colors"
                title="Open 24/7 AI Code Sentinel"
              >
                <Terminal className="w-4 h-4 text-cyan-400" /> Sentinel Code Healer
              </button>
            )}
          </div>
        </div>

        {applySuccessNotice && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{applySuccessNotice}</span>
          </div>
        )}
      </div>

      {/* 24/7 Autonomous Co-Working Autopilot Bar */}
      <div className="bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-5 shadow-lg space-y-3 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${
              is247Enabled 
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' 
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}>
              <Activity className={`w-5 h-5 ${is247Enabled ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  Background co-working setting · runtime NOT VERIFIED
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 ${
                  is247Enabled 
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300' 
                    : 'bg-slate-800 border border-slate-700 text-slate-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${is247Enabled ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
                  {is247Enabled ? 'Backend reports enabled · runtime NOT VERIFIED' : 'Disabled or paused · runtime NOT VERIFIED'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                This interface can request work cycles. Continuous operation, provider activity, automatic recovery, and scheduled execution are NOT VERIFIED.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleTrigger247Cycle}
              disabled={isTriggering247}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Trigger an immediate dual-model audit cycle"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTriggering247 ? 'animate-spin text-emerald-400' : ''}`} />
              <span>Trigger Audit Now</span>
            </button>
            <button
              type="button"
              onClick={handleToggle247}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors ${
                is247Enabled 
                  ? 'bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300' 
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{is247Enabled ? 'Request pause' : 'Request enable'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShow247Logs(!show247Logs)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:text-white text-slate-400 text-xs flex items-center gap-1"
            >
              <span>Audit Feed</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${show247Logs ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* 24/7 Fleet Ticker Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-800/80 text-[11px]">
          <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/50">
            <span className="text-slate-400 block text-[10px]">Autopilot Status</span>
            <span className="font-mono font-bold text-emerald-400">
              {is247Enabled ? 'Backend reports enabled · runtime NOT VERIFIED' : 'Disabled or paused · runtime NOT VERIFIED'}
            </span>
          </div>
          <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/50">
            <span className="text-slate-400 block text-[10px]">Cycles Executed</span>
            <span className="font-mono font-bold text-white">{cyclesCompleted} Server-reported cycles · NOT independently verified</span>
          </div>
          <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/50">
            <span className="text-slate-400 block text-[10px]">Cadence & Heartbeat</span>
            <span className="font-mono font-bold text-cyan-400">Schedule / heartbeat: NOT VERIFIED</span>
          </div>
          <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/50">
            <span className="text-slate-400 block text-[10px]">Agreement Status</span>
            <span className="font-mono font-bold text-amber-400">Agreement: NOT MEASURED</span>
          </div>
        </div>

        {/* Collapsible 24/7 Deliverables Feed */}
        {show247Logs && (
          <div className="mt-2 space-y-2 pt-2 border-t border-slate-800 animate-in fade-in">
            <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Server-reported deliverables · provider participation NOT independently verified:</span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {recent247Deliverables.map((d, i) => (
                <div key={d.id || i} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-semibold">{d.task}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase font-mono">
                        {d.domain}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{d.summary}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[10px] text-slate-400 block font-mono">{d.timestamp}</span>
                    <span className="text-[10px] text-amber-400 font-bold font-mono">Concordance: NOT VERIFIED</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 5 Domain Selector Pills */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-emerald-400" /> Select Co-Working Domain:
          </span>
          <span className="text-[11px] text-slate-400">
            Active Mode: <span className="text-emerald-400 font-mono font-bold">{domain.replace(/_/g, ' ').toUpperCase()}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {[
            {
              id: 'code_engineering' as CollaborationDomain,
              title: 'Pair Programming & Code',
              desc: 'TypeScript, Circuit Breakers, Hot-patches',
              icon: Code,
              color: 'emerald'
            },
            {
              id: 'monetization_strategy' as CollaborationDomain,
              title: 'Yield Strategy & Bids',
              desc: 'Valuation, Counter-Offers, $40/mo Floor',
              icon: Zap,
              color: 'cyan'
            },
            {
              id: 'patent_ip' as CollaborationDomain,
              title: 'Defensive Patent & IP',
              desc: 'Claims 1–20, Alice 101, Prior Art',
              icon: Scale,
              color: 'amber'
            },
            {
              id: 'compliance_clawbacks' as CollaborationDomain,
              title: 'Statutory Compliance',
              desc: 'GDPR rights, CCPA/CPRA, EU AI Act risk and transparency review',
              icon: ShieldCheck,
              color: 'rose'
            },
            {
              id: 'differential_privacy' as CollaborationDomain,
              title: 'Differential Privacy Math',
              desc: 'Laplace Scale b = Δf / ε, HIPAA Bounds',
              icon: Lock,
              color: 'purple'
            }
          ].map((d) => {
            const Icon = d.icon;
            const isSelected = domain === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setDomain(d.id)}
                className={`text-left p-3 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-emerald-950/50 border-emerald-500 shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500/50'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                    {d.title}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  {d.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Co-Working Input Studio */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-emerald-950/40">
              <Bot className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Co-Working Task & Prompt
              </h3>
              <p className="text-xs text-slate-400">
                Type what you want to build, fix, draft, or analyze together with GPT and Gemini.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowCodeEditor(!showCodeEditor)}
            className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors ${
              showCodeEditor 
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' 
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>{showCodeEditor ? 'Hide Code Context' : '+ Attach Code/Data Context'}</span>
          </button>
        </div>

        {/* Optional Collapsible Code Context Editor */}
        {showCodeEditor && (
          <div className="space-y-1.5 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-mono text-emerald-400">Code / Schema / System Context (Passed to GPT & Gemini):</span>
              <button
                type="button"
                onClick={() => setCodeContext('')}
                className="text-[10px] text-rose-400 hover:underline"
              >
                Clear Context
              </button>
            </div>
            <textarea
              value={codeContext}
              onChange={(e) => setCodeContext(e.target.value)}
              placeholder="// Paste TypeScript, JSON schema, or log trace here for GPT & Gemini to inspect..."
              rows={4}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-emerald-500 resize-y"
            />
          </div>
        )}

        {/* Quick Template Chips for current domain */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-emerald-400" />
            <span>Quick Co-Working Starters for {domain.replace(/_/g, ' ').toUpperCase()}:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickTemplates[domain]?.map((tpl, i) => (
              <div
                key={i}
                className="group inline-flex items-center rounded-lg bg-slate-950 border border-slate-800 hover:border-emerald-500/40 transition-colors overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => {
                    setUserPrompt(tpl.prompt);
                    if (tpl.code) {
                      setCodeContext(tpl.code);
                      setShowCodeEditor(true);
                    }
                  }}
                  className="text-[11px] px-2.5 py-1.5 text-slate-300 hover:text-white text-left flex items-center gap-1.5 transition-colors"
                  title="Load into prompt editor"
                >
                  <ChevronRight className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  <span className="font-semibold text-white">{tpl.title}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserPrompt(tpl.prompt);
                    if (tpl.code) {
                      setCodeContext(tpl.code);
                      setShowCodeEditor(true);
                    }
                    handleRunCoWorking(tpl.prompt, tpl.code);
                  }}
                  disabled={isLoading}
                  className="px-2 py-1.5 bg-emerald-950/80 hover:bg-emerald-600 text-emerald-300 hover:text-white text-[10px] font-bold border-l border-slate-800 transition-colors flex items-center gap-1 disabled:opacity-50"
                  title="Run this co-working session instantly with GPT & Gemini"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  <span>Run</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Textarea Prompt & Run Button */}
        <div className="space-y-3">
          <textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder={`Describe what you want to work on with GPT in ${domain.replace(/_/g, ' ')}... (e.g. "Work together with GPT to implement a zero-downtime failover circuit breaker and optimize our data monetization floor")`}
            rows={3}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-500"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1 text-emerald-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Provider pairing configured · live execution NOT VERIFIED
              </span>
              <span>&bull;</span>
              <span>Agreement: NOT MEASURED</span>
            </div>

            <button
              onClick={() => handleRunCoWorking()}
              disabled={isLoading || !userPrompt.trim()}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center gap-2 transition-all shadow-lg shadow-emerald-950/50"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Working Together with GPT & Gemini...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Execute Co-Working Session</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Co-Working Output Workspace */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        
        {/* Workspace Controls & View Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>{currentSession.id === 'sample-not-verified' ? 'Sample Session Placeholder' : 'Session Output · Provenance Not Independently Verified'}</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono">
                Agreement score: {currentSession.consensusScore === null ? 'NOT MEASURED' : `${currentSession.consensusScore}% backend-reported; not independently verified`}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Task: <span className="text-slate-200 font-medium">&ldquo;{currentSession.userGoal}&rdquo;</span>
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveView('joint')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                activeView === 'joint'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🤝 Combined provider output
            </button>
            <button
              onClick={() => setActiveView('gpt')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                activeView === 'gpt'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🟢 OpenAI provider
            </button>
            <button
              onClick={() => setActiveView('gemini')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                activeView === 'gemini'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🔵 Google Gemini
            </button>
          </div>
        </div>

        {/* View Content Display */}
        <div className="space-y-4">
          {activeView === 'joint' && (
            <div className="bg-slate-950 rounded-xl p-5 border border-slate-800/90 shadow-inner relative space-y-4 font-sans">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-emerald-400">{currentSession.id === 'sample-not-verified' ? 'Sample Artifact · NOT VERIFIED' : 'Backend-Returned Output · Agreement NOT MEASURED'}</span>
                  <span className="font-mono text-[11px] text-slate-500">{currentSession.id === 'sample-not-verified' ? 'No verified model authorship' : 'Provider authorship not independently verified'}</span>
                </div>
                <button
                  onClick={() => handleCopy(currentSession.jointArtifact, 'joint')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 transition-colors"
                >
                  {copiedId === 'joint' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedId === 'joint' ? 'Copied' : 'Copy Artifact'}</span>
                </button>
              </div>

              <div className="whitespace-pre-line text-xs sm:text-sm text-slate-200 leading-relaxed font-mono">
                {currentSession.jointArtifact}
              </div>
            </div>
          )}

          {activeView === 'gpt' && (
            <div className="bg-slate-950 rounded-xl p-5 border border-emerald-500/20 shadow-inner space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                  <span className="font-bold text-emerald-300">OpenAI provider response</span>
                </div>
                <button
                  onClick={() => handleCopy(currentSession.gptContribution, 'gpt')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 transition-colors"
                >
                  {copiedId === 'gpt' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedId === 'gpt' ? 'Copied' : 'Copy OpenAI Response'}</span>
                </button>
              </div>

              <div className="whitespace-pre-line text-xs sm:text-sm text-slate-200 leading-relaxed font-mono">
                {currentSession.gptContribution}
              </div>
            </div>
          )}

          {activeView === 'gemini' && (
            <div className="bg-slate-950 rounded-xl p-5 border border-cyan-500/20 shadow-inner space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
                  <span className="font-bold text-cyan-300">Google Gemini provider response · cryptographic review NOT VERIFIED</span>
                </div>
                <button
                  onClick={() => handleCopy(currentSession.geminiPeerReview, 'gemini')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 transition-colors"
                >
                  {copiedId === 'gemini' ? <Check className="w-3 h-3 text-cyan-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedId === 'gemini' ? 'Copied' : 'Copy Gemini Response'}</span>
                </button>
              </div>

              <div className="whitespace-pre-line text-xs sm:text-sm text-slate-200 leading-relaxed font-mono">
                {currentSession.geminiPeerReview}
              </div>
            </div>
          )}
        </div>

        {/* Action Directives & Co-Worker Summary Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/80 border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Provider response comparison</div>
              <div className="text-[11px] text-slate-400">
                Provider outputs are advisory text. No code patch, valuation, or statutory notice is co-signed, executed, or legally approved.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleApplyDirectives}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-md shadow-emerald-950/40"
            >
              Apply Directives ($40/mo Floor, ε = 0.30)
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
