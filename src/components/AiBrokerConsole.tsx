import React, { useState, useRef, useEffect } from 'react';
import { newId } from '../lib/new-id';
import { 
  Sparkles, 
  Send, 
  Cpu, 
  ShieldCheck, 
  Sliders, 
  Scale, 
  CheckCircle2, 
  AlertCircle, 
  Bot, 
  User, 
  Zap,
  RefreshCw,
  FileCheck,
  Users
} from 'lucide-react';
import { MonetizationPolicy, DataFootprintSource, AiBrokerChatMessage } from '../types';
import { AiPolicyOptimizerModal } from './AiPolicyOptimizerModal';
import { AllAiCollaborationModal } from './AllAiCollaborationModal';
import { buildProviderModelOptions, type ProviderDiscoveryModelSource } from '../lib/ai/provider-model-catalog';
import { normalizeSavedModelPreference, reconcileDiscoveredModelPreference, resolveExecutableModelPreference } from '../lib/ai/model-selection';

interface AiBrokerConsoleProps {
  policy: MonetizationPolicy;
  onUpdatePolicy: (newPolicy: Partial<MonetizationPolicy>) => void;
  footprints: DataFootprintSource[];
  onApplySuggestedAction?: (action: any) => void;
}

export const AiBrokerConsole: React.FC<AiBrokerConsoleProps> = ({
  policy,
  onUpdatePolicy,
  footprints,
  onApplySuggestedAction
}) => {
  const savedModelPreference = useRef(normalizeSavedModelPreference(policy.aiModel));
  const hasUserSelectedModel = useRef(false);
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const selectedModelRef = useRef<string>('auto');
  const [discoveredModelOptions, setDiscoveredModelOptions] = useState<ReturnType<typeof buildProviderModelOptions>>([]);
  const [providerCatalogStatus, setProviderCatalogStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [showOptimizerModal, setShowOptimizerModal] = useState(false);
  const [showCollaborationModal, setShowCollaborationModal] = useState(false);

  const [messages, setMessages] = useState<AiBrokerChatMessage[]>([
    {
      id: 'msg-welcome',
      sender: 'ai_broker',
      content: `Welcome to the GLORIFIER broker console. This is static starter text, not a live AI response. Some panels use local sample policy values. Provider availability, real data streams, privacy enforcement, commercial bids, and revenue have not been verified. Changing a setting here does not earn, collect, or pay money.

Choose an action to request a backend response. Any returned claim must be checked against its source and evidence.`,
      timestamp: 'Template — not generated at runtime',
      modelUsed: 'Starter template (not an AI result)',
      provider: 'Not verified',
      suggestedAction: {
        label: 'Audit Active Tracker Exposure',
        type: 'run_audit'
      }
    }
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const loadProviderCatalog = async (signal?: AbortSignal) => {
    setProviderCatalogStatus('loading');
    try {
      const response = await fetch('/api/providers/discovery', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal,
      });
      if (!response.ok) throw new Error(`Provider discovery returned HTTP ${response.status}`);
      const payload = await response.json() as { ok?: boolean; providers?: unknown };
      if (payload.ok !== true || !Array.isArray(payload.providers)) {
        throw new Error('Provider discovery response did not match its contract.');
      }
      const options = buildProviderModelOptions(payload.providers as ProviderDiscoveryModelSource[]);
      const discoveredModels = options.map((option) => option.model);
      setDiscoveredModelOptions(options);
      const resolution = reconcileDiscoveredModelPreference(
        savedModelPreference.current,
        selectedModelRef.current,
        hasUserSelectedModel.current,
        discoveredModels,
      );
      selectedModelRef.current = resolution.model;
      setSelectedModel(resolution.model);
      if (resolution.persistModel) {
        // Keep the shared policy used by offer evaluation aligned with the
        // executable selection. A stale explicit model must not survive a UI Auto fallback.
        onUpdatePolicy({ aiModel: resolution.model });
      }
      setProviderCatalogStatus('ready');
    } catch {
      if (!signal?.aborted) {
        hasUserSelectedModel.current = false;
        selectedModelRef.current = 'auto';
        setSelectedModel('auto');
        // The request path now uses Auto, so shared policy must not retain a
        // stale explicit model after discovery becomes unavailable.
        onUpdatePolicy({ aiModel: 'auto' });
        setProviderCatalogStatus('unavailable');
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadProviderCatalog(controller.signal);
    return () => controller.abort();
  }, []);

  const handleModelChange = (newModel: string) => {
    const executableModel = resolveExecutableModelPreference(
      newModel,
      discoveredModelOptions.map((option) => option.model),
    );
    hasUserSelectedModel.current = true;
    savedModelPreference.current = executableModel;
    selectedModelRef.current = executableModel;
    setSelectedModel(executableModel);
    onUpdatePolicy({ aiModel: executableModel });
  };

  const handleApplyOptimization = (optimizedPolicy: Partial<MonetizationPolicy>, rationale: string) => {
    onUpdatePolicy(optimizedPolicy);

    const optimizerMsg: AiBrokerChatMessage = {
      id: newId('optimizer'),
      sender: 'ai_broker',
      content: `Local policy preferences updated from the selected optimizer proposal.\n\nProposal rationale: ${rationale}\n\n• Configured privacy target ε: ${optimizedPolicy.globalEpsilon ?? 'unchanged'}\n• Configured monthly floor: ${optimizedPolicy.minimumMonthlyFloorUsd ?? 'unchanged'}\n• Local mode setting: ${optimizedPolicy.brokerMode ?? 'unchanged'}\n• Runtime privacy enforcement, proof attestation, provider execution, and revenue impact: NOT VERIFIED.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modelUsed: selectedModel,
      provider: 'AI Policy Optimizer'
    };

    setMessages(prev => [...prev, optimizerMsg]);
  };

  const handleApplyCouncilDirectives = (directives: { globalEpsilon?: number; minimumMonthlyFloorUsd?: number; autoNegotiateHighBids?: boolean }, summary: string) => {
    onUpdatePolicy(directives);

    const councilMsg: AiBrokerChatMessage = {
      id: newId('council'),
      sender: 'ai_broker',
      content: `**POLICY PROPOSAL APPLIED LOCALLY — NOT VERIFIED**\n\n${summary}\n\n• Configured privacy target ε: ${directives.globalEpsilon ?? 'unchanged'}\n• Configured monthly floor: ${directives.minimumMonthlyFloorUsd ?? 'unchanged'}\n• Local auto-negotiation setting: ${directives.autoNegotiateHighBids ?? 'unchanged'}\n• Multi-model consensus, signatures, privacy enforcement, tracker quarantine, and external execution: NOT VERIFIED.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modelUsed: 'Council policy proposal (not a model inference result)',
      provider: 'All-AI Sovereign Collaboration Council'
    };

    setMessages(prev => [...prev, councilMsg]);
  };

  const quickPrompts = [
    'Invite all artificial intelligence models to collaborate on my data strategy',
    'Run AI Policy Optimizer to tune my epsilon and privacy tier',
    'Ask the configured AI provider to propose a +25% rate for my developer code telemetry',
    'Request a multi-provider audit of my search and browsing streams for quasi-identifiers',
    'Draft a strict CCPA / GDPR statutory clawback demand letter',
  ];

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputQuery;
    if (!textToSend.trim() || isLoading) return;

    const executableModel = resolveExecutableModelPreference(
      selectedModel,
      discoveredModelOptions.map((option) => option.model),
    );
    if (executableModel !== selectedModel) {
      selectedModelRef.current = executableModel;
      setSelectedModel(executableModel);
      onUpdatePolicy({ aiModel: executableModel });
    }

    const lower = textToSend.toLowerCase();
    if (lower.includes('optimizer') || lower.includes('tune my epsilon')) {
      setShowOptimizerModal(true);
    }

    if (lower.includes('collaborat') || lower.includes('invite all') || lower.includes('all ai') || lower.includes('all artificial') || lower.includes('council')) {
      setShowCollaborationModal(true);
    }

    const userMsg: AiBrokerChatMessage = {
      id: newId('user'),
      sender: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customText) setInputQuery('');
    setIsLoading(true);

    try {
      const activeStreams = footprints.filter(f => f.isMonetized).map(f => f.name).join(', ');
      const res = await fetch('/api/ai/broker-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          currentPolicy: { ...policy, aiModel: executableModel },
          footprintsSummary: activeStreams,
          model: executableModel
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `Broker API unavailable (HTTP ${res.status})`);
      }
      const brokerMsg: AiBrokerChatMessage = {
        id: newId('broker'),
        sender: 'ai_broker',
        content: data.reply || 'The broker API returned no reply text. No audit, privacy enforcement, or revenue outcome is verified.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedAction: data.suggestedAction,
        modelUsed: data.modelUsed || selectedModel,
        provider: data.provider || 'Provider not reported'
      };

      setMessages(prev => [...prev, brokerMsg]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        {
          id: newId('broker-err'),
          sender: 'ai_broker',
          content: 'Broker unavailable. No audit, privacy enforcement, or licensing revenue was verified. Please retry when the API is reachable.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          modelUsed: 'Not executed',
          provider: 'Not verified'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left 7 cols: Live Chat with AI Broker */}
      <div className="lg:col-span-7 flex flex-col rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg h-[680px]">
        {/* Chat Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shadow-inner">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">DataSovereign AI Broker</h3>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    {selectedModel === 'auto' ? 'AUTO ROUTING' : selectedModel.toUpperCase()}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {selectedModel === 'auto'
                    ? 'Provider-neutral routing using eligible configured provider defaults'
                    : `Model preference: ${selectedModel} · successful inference is not guaranteed by discovery`}
                </p>
              </div>
            </div>

            {/* Dynamic model catalogue from server-side provider discovery */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-lg border border-slate-800 flex-wrap">
              <label htmlFor="ai-broker-model-select" className="sr-only">AI model preference</label>
              <select
                id="ai-broker-model-select"
                aria-label="AI model preference"
                value={selectedModel}
                disabled={providerCatalogStatus !== 'ready'}
                onChange={(e) => handleModelChange(e.target.value)}
                className="max-w-[240px] bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-[10px] font-semibold text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="auto">Auto — configured provider default</option>
                {discoveredModelOptions.map((option) => (
                  <option key={option.model} value={option.model}>
                    {option.model} — {option.providers.join(', ')}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowCollaborationModal(true)}
                className="text-[10px] font-semibold px-2 py-1 rounded transition-colors text-slate-300 hover:text-white"
                title="Open the multi-provider council request. Actual participant responses are reported by the council endpoint."
              >
                Council
              </button>
              <button
                type="button"
                id="invite-all-ai-models-btn"
                onClick={() => setShowCollaborationModal(true)}
                className="text-[10px] font-semibold px-2.5 py-1 rounded transition-all flex items-center gap-1.5 cursor-pointer bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20"
                title="Request a review from configured AI providers; participation and consensus are not guaranteed."
              >
                <Users className="w-3 h-3" />
                <span>Collaborate</span>
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="mt-1 text-[9px] text-slate-500" role="status" aria-live="polite">
              {providerCatalogStatus === 'loading'
                ? 'Loading configured provider model discovery…'
                : providerCatalogStatus === 'unavailable'
                  ? 'Provider discovery unavailable. Automatic routing is active; explicit model selection is disabled.'
                  : !hasUserSelectedModel.current && savedModelPreference.current !== 'auto' && selectedModel === 'auto'
                    ? 'Saved preference "' + savedModelPreference.current + '" is not currently discovered; automatic routing is active.'
                    : discoveredModelOptions.length
                      ? discoveredModelOptions.length + ' authenticated provider model IDs discovered. Discovery does not guarantee successful inference.'
                      : 'No authenticated provider model IDs were discovered. Auto routing may use eligible provider defaults.'}
              </p>
              <button
                type="button"
                onClick={() => void loadProviderCatalog()}
                disabled={providerCatalogStatus === 'loading'}
                className="text-[9px] text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                title="Refresh the read-only provider discovery catalogue"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 text-xs leading-relaxed ${
                msg.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.sender === 'ai_broker' && (
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-xl p-3.5 ${
                  msg.sender === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-none shadow-md'
                    : 'bg-slate-950/90 text-slate-200 border border-slate-800/90 rounded-bl-none shadow-sm'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {msg.sender === 'ai_broker' && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Cpu className="w-3 h-3 text-emerald-400" />
                      <span className="font-mono text-emerald-400/90 font-semibold">
                        {msg.modelUsed || selectedModel}
                      </span>
                      {msg.provider && (
                        <span className="text-slate-500 hidden sm:inline">• {msg.provider}</span>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-500">{msg.timestamp}</span>
                  </div>
                )}

                {msg.suggestedAction && (
                  <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between">
                    <button
                      onClick={() => {
                        if (msg.suggestedAction?.type === 'maximize_yield') {
                          onUpdatePolicy({ brokerMode: 'autonomous-maximize', globalEpsilon: 0.65 });
                        } else if (msg.suggestedAction?.type === 'apply_policy') {
                          onUpdatePolicy({ globalEpsilon: 0.2 });
                        }
                        handleSendMessage(`Action applied: ${msg.suggestedAction?.label}`);
                      }}
                      className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 underline underline-offset-2"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {msg.suggestedAction.label}
                    </button>
                  </div>
                )}

                {msg.sender === 'user' && (
                  <div className="mt-1 text-[9px] text-emerald-200 text-right">
                    {msg.timestamp}
                  </div>
                )}
              </div>

              {msg.sender === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 text-xs justify-start">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              </div>
              <div className="bg-slate-950/90 text-slate-400 border border-slate-800 rounded-xl p-3 flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"></span>
                <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                <span className="text-[11px]">Evaluating data valuation & privacy proofs...</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Quick prompt suggestions */}
        <div className="p-2.5 bg-slate-950/60 border-t border-slate-800/80 overflow-x-auto flex items-center gap-2 scrollbar-none">
          {quickPrompts.map((prompt, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(prompt)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 whitespace-nowrap transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input box */}
        <div className="p-3 bg-slate-950 border-t border-slate-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              id="ai-broker-input"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask your AI broker to audit streams, counter offers, or tighten privacy..."
              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={isLoading || !inputQuery.trim()}
              id="ai-broker-send-btn"
              className="p-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Right 5 cols: Live Policy Configuration Panel */}
      <div className="lg:col-span-5 space-y-4">
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              Autonomous Policy Directives
            </h3>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                id="invite-all-ai-header-btn"
                onClick={() => {
                  setShowCollaborationModal(true);
                }}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 hover:from-emerald-400 hover:to-cyan-300 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition-all active:scale-95 group cursor-pointer"
                title="Request a multi-provider council review using the currently eligible provider registry"
              >
                <Users className="w-3.5 h-3.5 fill-slate-950 group-hover:scale-110 transition-transform" />
                <span>Invite All AI</span>
              </button>
              <button
                type="button"
                id="ai-policy-optimizer-btn"
                onClick={() => setShowOptimizerModal(true)}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs transition-all active:scale-95 group cursor-pointer"
                title="Calibrate optimal epsilon and privacy tier settings based on risk tolerance"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 group-hover:rotate-12 transition-transform" />
                <span>Optimizer</span>
              </button>
            </div>
          </div>

          {/* All-AI Collaboration Council Banner */}
          <div className="mb-3 p-3 rounded-xl bg-gradient-to-r from-emerald-950/40 via-teal-950/30 to-cyan-950/40 border border-emerald-500/30 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                <Users className="w-4 h-4" />
              </div>
              <div className="text-[11px] text-slate-300 leading-tight">
                <span className="font-semibold text-white">All-AI Collaboration Council: </span>
                <span className="text-slate-400">Request a multi-provider review; provider participation and consensus are reported only after a response.</span>
              </div>
            </div>
            <button
              type="button"
              id="banner-convene-models-btn"
              onClick={() => {
                setShowCollaborationModal(true);
              }}
              className="shrink-0 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 underline underline-offset-2 cursor-pointer"
            >
              Convene Council →
            </button>
          </div>

          {/* AI Policy Optimizer Quick Recommendation Banner */}
          <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-emerald-950/40 via-teal-950/30 to-slate-950 border border-emerald-500/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="text-[11px] text-slate-300 leading-tight">
                <span className="font-semibold text-white">Risk-Tuned Directives: </span>
                <span>Calibrate optimal ε and privacy tiers for your risk tolerance.</span>
              </div>
            </div>
            <button
              type="button"
              id="banner-launch-optimizer-btn"
              onClick={() => setShowOptimizerModal(true)}
              className="shrink-0 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 underline underline-offset-2 cursor-pointer"
            >
              Optimize →
            </button>
          </div>

          <p className="text-xs text-slate-400 mb-4">
            Your AI broker automatically applies these governing thresholds to all incoming buyer bids and data license requests.
          </p>

          <div className="space-y-4">
            {/* Minimum Floor Slider */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-300">Minimum Monthly Compensation Floor</span>
                <span className="font-mono font-bold text-emerald-400">${policy.minimumMonthlyFloorUsd}/mo</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={policy.minimumMonthlyFloorUsd}
                onChange={(e) => onUpdatePolicy({ minimumMonthlyFloorUsd: parseInt(e.target.value) })}
                className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                <span>$10/mo (Relaxed)</span>
                <span>$35/mo (Standard)</span>
                <span>$100/mo (Premium)</span>
              </div>
            </div>

            {/* Global Epsilon Slider */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-300">Global Privacy Ceiling (Max ε)</span>
                <span className="font-mono font-bold text-emerald-400">ε = {policy.globalEpsilon}</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={policy.globalEpsilon}
                onChange={(e) => onUpdatePolicy({ globalEpsilon: parseFloat(e.target.value) })}
                className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Bids requesting higher epsilon (lower privacy noise) will be auto-rejected or countered.
              </p>
            </div>

            {/* Allowed Buyer Purposes Toggles */}
            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Permitted Buyer Categories
              </label>

              {/* AI Pretraining */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div>
                  <div className="text-xs font-semibold text-white">AI Model Pre-training</div>
                  <div className="text-[10px] text-slate-400">LLM code & reasoning training sets</div>
                </div>
                <input
                  type="checkbox"
                  checked={policy.allowAiModelPretraining}
                  onChange={(e) => onUpdatePolicy({ allowAiModelPretraining: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Academic Research */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div>
                  <div className="text-xs font-semibold text-white">Academic & Medical Research</div>
                  <div className="text-[10px] text-slate-400">Non-profit biomedical studies</div>
                </div>
                <input
                  type="checkbox"
                  checked={policy.allowAcademicResearch}
                  onChange={(e) => onUpdatePolicy({ allowAcademicResearch: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Commercial Behavioral Ads (OFF by default) */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div>
                  <div className="text-xs font-semibold text-white">Targeted Behavioral Advertising</div>
                  <div className="text-[10px] text-rose-400">Adtech DSPs & clickstream retargeting</div>
                </div>
                <input
                  type="checkbox"
                  checked={policy.allowAdTargeting}
                  onChange={(e) => onUpdatePolicy({ allowAdTargeting: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Insurance Actuarial Risk Profiling */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div>
                  <div className="text-xs font-semibold text-white">Insurance / Credit Scoring</div>
                  <div className="text-[10px] text-rose-400">Actuarial rate adjustment algorithms</div>
                </div>
                <input
                  type="checkbox"
                  checked={policy.allowInsuranceRiskProfiling}
                  onChange={(e) => onUpdatePolicy({ allowInsuranceRiskProfiling: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Autonomous Counter-Offer feature */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Auto-Counter High Value Bids</div>
                <div className="text-[10px] text-slate-400">Negotiate +25% higher compensation if buyer reputation &gt; 90</div>
              </div>
              <input
                type="checkbox"
                checked={policy.autoNegotiateHighBids}
                onChange={(e) => onUpdatePolicy({ autoNegotiateHighBids: e.target.checked })}
                className="w-4 h-4 accent-emerald-500 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Cryptographic Proof Verification Card */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <FileCheck className="w-4 h-4 text-emerald-400" />
            Smart Licensing Protocol
          </div>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            This panel does not generate or verify a cryptographic proof, sign a data release, or prove that outbound data has been privacy-transformed. Smart-contract licensing, ZK attestation, and runtime epsilon enforcement are NOT VERIFIED.
          </p>
          <div className="mt-2 text-[10px] font-mono text-amber-300 flex items-center gap-2">
            <span>Protocol implementation: NOT VERIFIED</span> • <span>Provider execution: NOT VERIFIED</span>
          </div>
        </div>

        {/* AI Engine & GPT Status Card */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <Cpu className="w-4 h-4 text-emerald-400" />
              Configured AI provider preference
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {selectedModel === 'auto' ? 'Automatic provider selection' : 'Model preference (not inference verification)'}
            </span>
          </div>
          <div className="space-y-1.5 text-[11px] text-slate-400">
            <div className="flex justify-between border-b border-slate-800/60 pb-1">
              <span>Selected provider configuration:</span>
              <span className="text-slate-200 font-mono font-medium">
                {selectedModel === 'auto'
                  ? 'Automatic provider routing'
                  : `${selectedModel} · ${discoveredModelOptions.find((option) => option.model === selectedModel)?.providers.join(', ') || 'not in current discovery'}`}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-1">
              <span>Autonomous Stance:</span>
              <span className="text-emerald-400 font-mono capitalize">{policy.brokerMode}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-1">
              <span>Provider data-use / training policy:</span>
              <span className="text-amber-300 font-mono">NOT VERIFIED · check active provider terms and account settings</span>
            </div>
            <div className="flex justify-between pt-0.5">
              <span>Negotiation Capability:</span>
              <span className="text-slate-200">
                {selectedModel === 'auto' ? 'Automatic provider selection; actual provider is shown with each response' : 'Selected model preference; execution and provider availability are not guaranteed'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Policy Optimizer Modal */}
      <AiPolicyOptimizerModal
        isOpen={showOptimizerModal}
        onClose={() => setShowOptimizerModal(false)}
        currentPolicy={policy}
        onApplyOptimization={handleApplyOptimization}
        activeModel={selectedModel}
      />

      {/* All-AI Model Collaboration Council Modal */}
      <AllAiCollaborationModal
        isOpen={showCollaborationModal}
        onClose={() => setShowCollaborationModal(false)}
        policy={policy}
        footprints={footprints}
        onApplyDirectives={handleApplyCouncilDirectives}
      />
    </div>
  );
};
