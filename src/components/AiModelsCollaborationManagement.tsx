import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Bot, 
  Cpu, 
  Sparkles, 
  ShieldCheck, 
  Scale, 
  Layers, 
  RefreshCw, 
  CheckCircle2, 
  ArrowRight, 
  Sliders, 
  SlidersHorizontal,
  Zap, 
  Activity, 
  ChevronRight,
  TrendingUp,
  Lock,
  Flame,
  AlertCircle,
  Play
} from 'lucide-react';
import { MonetizationPolicy, DataFootprintSource, CouncilConsensusResult, ModelCollaborationParticipant } from '../types';
import { WorkTogetherWithGptStudio } from './WorkTogetherWithGptStudio';
import { getIdToken } from '../lib/firebase';
import { discoverConfiguredModelCouncilParticipants, formatModelCouncilFailures, ModelCouncilClientError, submitAuthenticatedModelCouncilRequest } from '../lib/ai/model-council-client';

interface AiModelsCollaborationManagementProps {
  policy: MonetizationPolicy;
  onUpdatePolicy: (updates: Partial<MonetizationPolicy>) => void;
  footprints: DataFootprintSource[];
  onOpenBrokerTab?: () => void;
  initialTabSection?: 'orchestration' | 'council_session' | 'rules' | 'work_with_gpt';
}

export interface ModelNodeConfig {
  id: string;
  providerId?: string;
  name: string;
  provider: string;
  role: string;
  specialization: string;
  badge: string;
  weight: number; // 0 to 100% influence in consensus
  enabled: boolean;
  status: 'not-verified';
  latencyMs: number | null;
  color: 'emerald' | 'teal' | 'cyan' | 'purple' | 'amber';
  privacyBoundary: 'Zero-Knowledge Enclave' | 'Statutory PII Redaction' | 'Cryptographic Perturbation' | 'Sovereign Core Arbitrator';
}

const INITIAL_NODES: ModelNodeConfig[] = [
  {
    id: 'gpt-4o',
    providerId: 'openai',
    name: 'OpenAI GPT-4o',
    provider: 'OpenAI Frontier',
    role: 'Commercial Valuation & Market Licensing',
    specialization: 'High-stakes contract negotiations, data buyer valuation curves, +25% counter-offer strategies',
    badge: 'OpenAI Flagship',
    weight: 35,
    enabled: true,
    status: 'not-verified',
    latencyMs: null,
    color: 'emerald',
    privacyBoundary: 'Zero-Knowledge Enclave'
  },
  {
    id: 'claude',
    providerId: 'anthropic',
    name: 'Anthropic Claude',
    provider: 'Anthropic',
    role: 'Independent Engineering Review & Synthesis',
    specialization: 'Independent architecture review, code-quality analysis, failure analysis, and synthesis of verified evidence',
    badge: 'Claude',
    weight: 35,
    enabled: true,
    status: 'not-verified',
    latencyMs: null,
    color: 'purple',
    privacyBoundary: 'Sovereign Core Arbitrator'
  },
  {
    id: 'gemini-3.8-flash',
    providerId: 'gemini',
    name: 'Google Gemini 3.8 Flash',
    provider: 'Google DeepMind',
    role: 'Differential Privacy & Mathematical Integrity',
    specialization: 'Laplace & Gaussian perturbation bounding, epsilon (ε) leakage audit, quasi-identifier scrubbing',
    badge: 'DeepMind Core',
    weight: 35,
    enabled: true,
    status: 'not-verified',
    latencyMs: null,
    color: 'teal',
    privacyBoundary: 'Cryptographic Perturbation'
  },
  {
    id: 'llama-3.3',
    providerId: 'meta',
    name: 'Meta LLaMA 3.3',
    provider: 'Meta AI / Sovereign Enclave',
    role: 'Decentralized Sovereignty & Anti-Monopoly Audit',
    specialization: 'Shadow broker quarantine, CCPA/GDPR statutory erasure mandates, open-weights verifiable inference',
    badge: 'Open Weights',
    weight: 20,
    enabled: true,
    status: 'not-verified',
    latencyMs: null,
    color: 'cyan',
    privacyBoundary: 'Statutory PII Redaction'
  },
  {
    id: 'patent-attorney-scientist',
    name: 'AI Patent Research Assistant (not a lawyer)',
    provider: 'Local AI research role · provider/credentials NOT VERIFIED',
    role: 'Patent Prosecution, Claim Engineering & Scientific Enablement',
    specialization: 'Patent-draft research support only; legal accuracy and patentability NOT VERIFIED',
    badge: 'USPTO / AI Scientist',
    weight: 20,
    enabled: true,
    status: 'not-verified',
    latencyMs: null,
    color: 'purple',
    privacyBoundary: 'Zero-Knowledge Enclave'
  },
  {
    id: 'compliance-scientist',
    name: 'A.I. Bot Compliance Scientist',
    provider: 'EU GDPR & FTC Regulatory Core',
    role: 'Regulatory Compliance & Statistical Privacy Science',
    specialization: 'GDPR Articles 17/25/35 DPIA, CCPA § 1798.105 automated clawbacks, EU AI Act conformity & HIPAA Expert Determination bounds',
    badge: 'CIPP / Privacy Ph.D.',
    weight: 20,
    enabled: true,
    status: 'not-verified',
    latencyMs: null,
    color: 'amber',
    privacyBoundary: 'Statutory PII Redaction'
  },
  {
    id: 'arbitrator-core',
    name: 'Sovereign Arbitrator Core',
    provider: 'DataSovereign Local Protocol',
    role: 'Dispute Resolution & Consensus Synthesis',
    specialization: 'Weighted voting synthesis, threshold reconciliation, automated policy enactment',
    badge: 'Autonomous Protocol',
    weight: 10,
    enabled: true,
    status: 'not-verified',
    latencyMs: null,
    color: 'emerald',
    privacyBoundary: 'Sovereign Core Arbitrator'
  }
];

export const AiModelsCollaborationManagement: React.FC<AiModelsCollaborationManagementProps> = ({
  policy,
  onUpdatePolicy,
  footprints,
  onOpenBrokerTab,
  initialTabSection
}) => {
  const [nodes, setNodes] = useState<ModelNodeConfig[]>(INITIAL_NODES);
  const [consensusThreshold, setConsensusThreshold] = useState<number>(85); // Display-only target; server-side quorum enforcement is not implemented.
  const [collaborationMode, setCollaborationMode] = useState<'council-weighted' | 'strict-unanimous' | 'peer-debate'>('council-weighted');
  const [activeTabSection, setActiveTabSection] = useState<'orchestration' | 'council_session' | 'rules' | 'work_with_gpt'>(initialTabSection || 'work_with_gpt');
  
  // Council Execution State
  const [selectedTopic, setSelectedTopic] = useState<string>('Holistic Digital Sovereignty & Data Monetization Strategy');
  const [customAgenda, setCustomAgenda] = useState<string>('');
  const [isRunningCouncil, setIsRunningCouncil] = useState<boolean>(false);
  const [councilResult, setCouncilResult] = useState<CouncilConsensusResult | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Toggle model node enablement
  const handleToggleNode = (nodeId: string) => {
    setNodes(prev => {
      const activeCount = prev.filter(n => n.enabled).length;
      return prev.map(n => {
        if (n.id === nodeId) {
          if (n.enabled && activeCount <= 1) {
            // Prevent disabling all models
            return n;
          }
          return { ...n, enabled: !n.enabled };
        }
        return n;
      });
    });
  };

  // Adjust model voting weight
  const handleWeightChange = (nodeId: string, newWeight: number) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, weight: newWeight } : n));
  };

  // Run the exact configured model selected for each enabled provider node.
  const handleConveneCouncil = async () => {
    const agendaToRun = customAgenda.trim() || selectedTopic;
    setCouncilResult(null);
    setStatusFeedback(null);
    const selectedProviderNodes = nodes.filter(
      (node): node is ModelNodeConfig & { providerId: string } => node.enabled && Boolean(node.providerId)
    );

    if (selectedProviderNodes.length === 0) {
      setStatusFeedback('Enable at least one provider-backed model (GPT, Claude, Gemini, Meta, or another configured provider) before convening the council.');
      return;
    }

    setIsRunningCouncil(true);
    try {
      const configuredParticipants = await discoverConfiguredModelCouncilParticipants();
      const participantsByProvider = new Map<string, (typeof configuredParticipants)[number]>();
      for (const participant of configuredParticipants) {
        if (!participantsByProvider.has(participant.providerId)) {
          participantsByProvider.set(participant.providerId, participant);
        }
      }
      const unavailableProviders: string[] = [];
      const participants = selectedProviderNodes.flatMap((node) => {
        const selected = participantsByProvider.get(node.providerId);
        if (!selected) {
          unavailableProviders.push(node.providerId);
          return [];
        }
        return [selected];
      });

      if (participants.length === 0) {
        throw new Error('None of the enabled provider nodes currently exposes a configured model. Configure provider credentials and model IDs first.');
      }

      const data = await submitAuthenticatedModelCouncilRequest({
        agenda: agendaToRun,
        participants,
        currentPolicy: policy,
        footprints: footprints.map(f => ({ name: f.name, category: f.category, isMonetized: f.isMonetized })),
        getToken: getIdToken,
      });
      const failures = data.failures;
      setCouncilResult(data);
      const responseCount = data.participantCount;
      const providerCount = data.providerDiversity;
      const omittedSummary = unavailableProviders.length
        ? ` Not configured and omitted: ${unavailableProviders.join(', ')}.`
        : '';
      const failureSummary = formatModelCouncilFailures(failures);
      const failureNotice = failureSummary ? ` Provider failures: ${failureSummary}.` : '';
      setStatusFeedback(`Received ${responseCount} response(s) from ${providerCount} distinct provider(s), using explicitly selected registry model IDs.${omittedSummary}${failureNotice} Numeric consensus and policy directives remain unverified.`);
    } catch (err) {
      console.warn('AI provider council request failed:', err);
      setCouncilResult(null);
      if (err instanceof ModelCouncilClientError) {
        const failureSummary = err.failures.map(f => `${f.providerId}${f.modelId ? `/${f.modelId}` : ''} (${f.code})`).join(', ');
        setStatusFeedback([err.message, failureSummary ? `Provider failures: ${failureSummary}.` : ''].filter(Boolean).join(' '));
      } else {
        setStatusFeedback('Council execution failed. No provider fallback or synthetic response was substituted.');
      }
    } finally {
      setIsRunningCouncil(false);
    }
  };

  // Apply council recommendations only when both numeric values are present and valid.
  // A missing recommendation must never silently overwrite the current policy.
  const handleApplyCouncilDirectives = () => {
    if (!councilResult) {
      setStatusFeedback('No council result is available. No policy changes were applied.');
      return;
    }

    const epsilon = councilResult.recommendedEpsilon;
    const monthlyFloorUsd = councilResult.recommendedFloorUsd;
    if (
      typeof epsilon !== 'number' ||
      !Number.isFinite(epsilon) ||
      epsilon <= 0 ||
      typeof monthlyFloorUsd !== 'number' ||
      !Number.isFinite(monthlyFloorUsd) ||
      monthlyFloorUsd < 0
    ) {
      setStatusFeedback('Council recommendations are missing or invalid (epsilon must be greater than 0 and the monthly floor must be 0 or greater). No policy changes were applied.');
      return;
    }

    onUpdatePolicy({
      globalEpsilon: epsilon,
      minimumMonthlyFloorUsd: monthlyFloorUsd,
      aiModel: 'all-models',
      autoNegotiateHighBids: true
    });
    setStatusFeedback(`Policy update requested from backend-returned council values: ε = ${epsilon}, floor = ${monthlyFloorUsd}/mo. Persistence and enforcement are NOT VERIFIED.`);
  };

  const activeNodeCount = nodes.filter(n => n.enabled).length;
  const activeProviderNodeCount = nodes.filter(n => n.enabled && Boolean(n.providerId)).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Overview */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800 p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500/20 via-teal-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner shrink-0 mt-0.5">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold tracking-tight text-white">
                  Artificial Intelligence All-Models Collaboration Management
                </h2>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  COUNCIL CONFIGURATION · LIVE STATUS NOT VERIFIED
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
                Configure provider roles and voting weights. The council resolves the exact configured model IDs from the server registry at request time; local-only research roles are not sent as provider participants. Live inference and consensus remain NOT VERIFIED.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
              <div className="text-[11px] text-slate-400 font-mono uppercase">Enabled Configurations</div>
              <div className="text-lg font-bold text-emerald-400 font-mono">{activeNodeCount} / {nodes.length}</div>
            </div>
            <div className="px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
              <div className="text-[11px] text-slate-400 font-mono uppercase">Provider-backed Nodes</div>
              <div className="text-lg font-bold text-teal-400 font-mono">{activeProviderNodeCount}</div>
            </div>
            <div className="px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
              <div className="text-[11px] text-slate-400 font-mono uppercase">Quorum Target · Unverified</div>
              <div className="text-lg font-bold text-teal-400 font-mono">{consensusThreshold}%</div>
            </div>
          </div>
        </div>

        {/* Sub-Navigation Tabs within Management */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTabSection('work_with_gpt')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTabSection === 'work_with_gpt'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold shadow-md ring-1 ring-emerald-400'
                : 'text-emerald-400 hover:text-white hover:bg-slate-800/60 border border-emerald-500/30'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>🤝 Work Together with GPT Studio</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-950/70 text-emerald-300 font-mono">PAIR</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabSection('orchestration')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTabSection === 'orchestration'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Model Configurations ({activeNodeCount} Enabled)
          </button>

          <button
            type="button"
            onClick={() => setActiveTabSection('council_session')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTabSection === 'council_session'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Convene All-AI Council
          </button>

          <button
            type="button"
            onClick={() => setActiveTabSection('rules')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTabSection === 'rules'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            Quorum & Privacy Rules
          </button>
        </div>
      </div>

      {statusFeedback && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusFeedback}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setStatusFeedback(null)} 
            className="text-[11px] text-emerald-400 underline hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* SECTION 1: ORCHESTRATION & NODE FLEET */}
      {activeTabSection === 'orchestration' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                Frontier AI Model Collaboration Matrix
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Enable or disable provider-backed nodes and local research roles. Provider-backed nodes execute the exact model advertised by their configured provider; voting weights remain display-only.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setNodes(prev => prev.map(n => ({ ...n, enabled: true })));
                  setStatusFeedback('All model configurations enabled for future requests; live provider activity is NOT VERIFIED.');
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              >
                Enable All Models
              </button>
              <button
                type="button"
                onClick={() => {
                  setNodes(INITIAL_NODES);
                  setStatusFeedback('Model weights reset to default equilibrium.');
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              >
                Reset Weights
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {nodes.map((node) => {
              const isEnabled = node.enabled;
              return (
                <div
                  key={node.id}
                  className={`rounded-2xl border transition-all p-5 flex flex-col justify-between ${
                    isEnabled
                      ? 'bg-slate-900/90 border-slate-800 shadow-md'
                      : 'bg-slate-950/60 border-slate-900 opacity-60'
                  }`}
                >
                  <div>
                    {/* Top Row: Name, Provider & Toggle */}
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-inner ${
                          node.id === 'gpt-4o' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          node.id === 'gemini-3.8-flash' ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30' :
                          node.id === 'llama-3.3' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                          'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        }`}>
                          <Bot className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white">{node.name}</h4>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {node.badge}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 font-mono block mt-0.5">{node.provider}</span>
                        </div>
                      </div>

                      {/* Enable Toggle Switch */}
                      <button
                        type="button"
                        onClick={() => handleToggleNode(node.id)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isEnabled ? 'bg-emerald-500' : 'bg-slate-800'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            isEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Role & Specialization */}
                    <div className="mt-3.5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">Council Role:</span>
                        <span className="text-slate-200 font-semibold text-right">{node.role}</span>
                      </div>

                      <div className="flex items-start justify-between text-xs gap-3">
                        <span className="text-slate-400 font-medium shrink-0">Specialization:</span>
                        <span className="text-slate-300 text-right leading-relaxed">{node.specialization}</span>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-slate-400 font-medium">Privacy Boundary:</span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-emerald-300">
                          {node.privacyBoundary}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Weight Slider */}
                  <div className="mt-4 pt-3.5 border-t border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">Consensus Voting Weight:</span>
                      <span className="text-emerald-400 font-bold">{node.weight}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      step="5"
                      disabled={!isEnabled}
                      value={node.weight}
                      onChange={(e) => handleWeightChange(node.id, parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-30"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>Advisory (5%)</span>
                      <span>Balanced (30%)</span>
                      <span>Dominant (60%)</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: CONVENE DELIBERATION SESSION */}
      {activeTabSection === 'council_session' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  Initiate Multi-Model Deliberation Council
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Submit an agenda with {activeProviderNodeCount} enabled provider-backed nodes to the backend. Actual provider participation and agreement are NOT VERIFIED until responses are recorded.
                </p>
              </div>

              <button
                type="button"
                onClick={handleConveneCouncil}
                disabled={isRunningCouncil}
                className="px-5 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-slate-950 hover:opacity-90 transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer shrink-0"
              >
                {isRunningCouncil ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deliberating Across Models...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Convene Council Now</span>
                  </>
                )}
              </button>
            </div>

            {/* Presets Grid */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                Select Standard Governance Agenda:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  {
                    title: 'Comprehensive Sovereign Footprint & Yield Audit',
                    desc: 'All models evaluate your active streams, valuation ceiling, and tracker quarantine.'
                  },
                  {
                    title: 'Frontier AI Pre-Training Licensing & Zero-PII Enclave',
                    desc: 'Determine safe terms, tokenization limits, and indemnification for AI lab buyers.'
                  },
                  {
                    title: 'Statutory Broker Clawback & Shadow Tracker Eradication',
                    desc: 'Harmonize CCPA, GDPR, and California Delete Act enforcement against data brokers.'
                  },
                  {
                    title: 'Maximized Monthly Pacing vs. Differential Privacy Equilibrium',
                    desc: 'Calculate the mathematical equilibrium between Laplacian noise (ε) and passive yield.'
                  }
                ].map(item => (
                  <div
                    key={item.title}
                    onClick={() => {
                      setSelectedTopic(item.title);
                      setCustomAgenda('');
                    }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedTopic === item.title && !customAgenda
                        ? 'bg-emerald-950/20 border-emerald-500/50 text-white shadow-sm'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold">{item.title}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Query Input */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                Or Enter Custom Multi-Model Agenda Directive:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Audit my developer telemetry licensing for OpenAI and Anthropic research labs with zero-identifiability guarantees"
                  value={customAgenda}
                  onChange={(e) => setCustomAgenda(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Results Display */}
          {councilResult && (
            <div className="space-y-5 animate-in fade-in duration-300">
              {/* Individual Model Contributions */}
              <div>
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  Individual AI Model Specialized Outputs
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {councilResult.participants.map(p => (
                    <div
                      key={p.modelId}
                      className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 flex flex-col justify-between space-y-3"
                    >
                      <div>
                        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                          <div>
                            <span className="text-xs font-bold text-white block">{p.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{p.provider}</span>
                          </div>
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-300 border border-slate-700">
                            {p.badge}
                          </span>
                        </div>

                        <div className="text-[10px] text-slate-400 font-mono mt-2 mb-1.5">
                          Domain: <span className="text-slate-200">{p.role}</span>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed">
                          {p.output}
                        </p>
                      </div>

                      {p.keyRecommendation && (
                        <div className="pt-2 border-t border-slate-800">
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Key Directive:</span>
                          <span className="text-xs text-emerald-400 font-medium block mt-0.5">{p.keyRecommendation}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Binding Consensus Directives Box */}
              <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-emerald-500/40 p-6 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                      <Scale className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                        Backend-returned Council Result · NOT independently verified
                      </h4>
                      <p className="text-xs text-slate-400 font-mono">
                        Backend-reported score: <span className="text-amber-400 font-bold">{typeof councilResult.consensusScore === 'number' ? `${councilResult.consensusScore}% · NOT independently verified` : 'NOT MEASURED'}</span>
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!councilResult || typeof councilResult.recommendedEpsilon !== 'number' || typeof councilResult.recommendedFloorUsd !== 'number'}
                    onClick={handleApplyCouncilDirectives}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-colors flex items-center gap-2 shadow-md cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Enact Directives to Live Policy</span>
                  </button>
                </div>

                <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  {councilResult.unifiedConsensus}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {councilResult.actionDirectives.map((directive, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 text-xs text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{directive}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: RULES & QUORUM CONFIGURATION */}
      {activeTabSection === 'rules' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              Consensus Protocol Architecture
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Configure how multiple AI perspectives are intended to be reconciled. Immutability and execution are NOT VERIFIED.
            </p>

            <div className="space-y-3 pt-2">
              {[
                {
                  id: 'council-weighted',
                  name: 'Weighted Council Synthesis (Recommended)',
                  desc: 'Intended role mapping: GPT for pricing, Gemini for privacy analysis, and LLaMA for provider-neutrality review. Actual voting and participation are NOT VERIFIED.'
                },
                {
                  id: 'strict-unanimous',
                  name: 'Unanimity Threshold (100%; configuration only)',
                  desc: 'Intended to require agreement from all configured participants. Provider participation, quorum enforcement, and blocking of policy changes are NOT VERIFIED.'
                },
                {
                  id: 'peer-debate',
                  name: 'Dialectical Peer Debate & Red-Teaming',
                  desc: 'Intended to prompt participating models to challenge risk assumptions. Whether this interaction occurs is NOT VERIFIED.'
                }
              ].map(mode => (
                <div
                  key={mode.id}
                  onClick={() => setCollaborationMode(mode.id as any)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    collaborationMode === mode.id
                      ? 'bg-emerald-950/20 border-emerald-500/50 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold">{mode.name}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{mode.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-teal-400" />
              Quorum & Boundary Controls
            </h4>

            {/* Quorum Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Requested quorum (not enforced):</span>
                <span className="text-teal-400 font-bold">{consensusThreshold}%</span>
              </div>
              <input
                type="range"
                min="60"
                max="100"
                step="5"
                value={consensusThreshold}
                onChange={(e) => setConsensusThreshold(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>Supermajority (66%)</span>
                <span>Robust (85%)</span>
                <span>Unanimity target (100%; enforcement NOT VERIFIED)</span>
              </div>
            </div>

            {/* Differential Privacy Guardrails */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                Configured Council Guardrails · Runtime enforcement NOT VERIFIED:
              </span>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Policy intent: do not send unhashed raw PII or plaintext email identifiers. Actual provider payloads and enforcement are NOT VERIFIED.</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Lock className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Cross-model inferences operate within zero-knowledge enclave parameters.</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Commercial ad retargeters and shadow data mills remain strictly quarantined.</span>
                </div>
              </div>
            </div>

            {/* Quick Action */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  if (onOpenBrokerTab) onOpenBrokerTab();
                }}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Open Autonomous AI Broker Console</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. WORK TOGETHER WITH GPT & GEMINI INTERACTIVE STUDIO */}
      {activeTabSection === 'work_with_gpt' && (
        <WorkTogetherWithGptStudio
          policy={policy}
          onUpdatePolicy={onUpdatePolicy}
          footprints={footprints}
        />
      )}
    </div>
  );
};
