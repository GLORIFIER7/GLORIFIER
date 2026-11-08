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
      content: `Welcome to the GLORIFIER broker console. This panel sends questions to a configured AI inference endpoint and displays returned text. It does not execute privacy transformations, external audits, buyer negotiations, statutory notices, data releases, cryptographic proofs, or payments. Provider availability, real data streams, privacy enforcement, commercial bids, and revenue have not been verified.

Treat every response as AI-generated analysis or draft text, not evidence that an action occurred. Verify important claims against an independent source.`,
      timestamp: 'Template — not generated at runtime',
      modelUsed: 'Starter template (not an AI result)',
      provider: 'Not verified',
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
      provider: 'Local policy preset'
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
    'Ask configured AI providers to review my data-governance strategy (participation not guaranteed)',
    'Compare local privacy presets for my stated risk tolerance (illustrative only)',
    'Ask an AI provider to propose a +25% rate for my developer telemetry (no buyer contact)',
    'Discuss a privacy-review checklist for search and browsing metadata (no data audit)',
    'Draft a preliminary data-erasure request for legal review (jurisdiction and entitlement not assumed)',
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
        const res = await fetch('/api/ai/broker-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          policyContext: {
            minimumMonthlyFloorUsd: policy.minimumMonthlyFloorUsd,
            brokerMode: policy.brokerMode,
            globalEpsilon: policy.globalEpsilon,
            allowAiModelPretraining: policy.allowAiModelPretraining
          },
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
        content: data.reply ? `${String(data.reply)}\n\nExecution boundary: this endpoint returns AI-generated text only. It does not execute an audit, privacy transformation, buyer negotiation, data release, statutory notice, cryptographic proof, or payment.` : 'The broker API returned no reply text. No action was executed.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedAction: data.suggestedAction,
        modelUsed: data.modelUsed || 'Model not reported',
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
                  <h3 className="text-sm font-bold text-white">DataSovereign AI Assistant</h3>
                  <span aria-label="Provider state not verified" className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    {selectedModel === 'auto' ? 'AUTO PREFERENCE · NOT VERIFIED' : 'MODEL PREFERENCE · NOT INFERENCE'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {selectedModel === 'auto'
                    ? 'Auto is the selected model preference; actual provider selection and inference are not verified.'
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
                <option value="auto">Auto preference (provider choice not verified)</option>
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
                  ? 'Provider discovery unavailable. Automatic routing is not verified; explicit model selection is disabled.'
                  : !hasUserSelectedModel.current && savedModelPreference.current !== 'auto' && selectedModel === 'auto'
                    ? 'Saved preference "' + savedModelPreference.current + '" is not currently discovered; Auto is selected, but provider selection and inference are not verified.'
                    : discoveredModelOptions.length
                      ? discoveredModelOptions.length + ' read-only model-list IDs discovered. Inference permission and execution are not verified.'
                      : 'No authenticated provider model IDs were discovered. No provider selection or inference is confirmed.'}
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
                        handleSendMessage(`Explain the recommended next steps for: ${msg.suggestedAction?.label}. This is a request for analysis only; do not claim that the action was executed.`);
                      }}
                      className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 underline underline-offset-2"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {`Ask about: ${msg.suggestedAction.label}`}
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
                <span className="text-[11px]">Waiting for an AI text response. No data audit or privacy proof is being executed.</span>
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
              placeholder="Ask for analysis or draft text. This chat does not audit streams, transform data, negotiate, or send notices..."
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
              Local Policy Preferences
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
                <span>Request Council Review</span>
              </button>
              <button
                type="button"
                id="ai-policy-optimizer-btn"
                onClick={() => setShowOptimizerModal(true)}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs transition-all active:scale-95 group cursor-pointer"
                title="Calibrate optimal epsilon and privacy tier settings based on risk tolerance"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 group-hover:rotate-12 transition-transform" />
                <span>Policy Presets</span>
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
                <span className="font-semibold text-white">Configured-Provider Council: </span>
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
                <span className="font-semibold text-white">Illustrative Policy Presets: </span>
                <span>Compare local ε targets and buyer-purpose preferences. No optimization or enforcement runs.</span>
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
            These controls store local policy preferences only. They are not a server-side authorization boundary: changing them does not accept, reject, counter, or block buyer bids. Runtime enforcement is NOT VERIFIED.
          </p>

          <div className="space-y-4">
            {/* Minimum Floor Slider */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-300">Preferred Monthly Compensation Floor (Configuration Only)</span>
                <span className="font-mono font-bold text-emerald-400">${policy.minimumMonthlyFloorUsd}/mo</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={policy.minimumMonthlyFloorUsd}
                onChange={(e) => onUpdatePolicy({ minimumMonthlyFloorUsd: parseInt(e.target.value) })}
                className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                <span>$0/mo (No minimum)</span>
                <span>$35/mo (Illustrative)</span>
                <span>$100/mo (Illustrative)</span>
              </div>
            </div>

            {/* Global Epsilon Slider */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-300">Configured Maximum ε Target (Not Enforcement)</span>
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
                Local configuration target only. This control does not transform data, enforce a privacy budget, or reject buyer requests; no differential-privacy mechanism is executed here.
              </p>
            </div>

            {/* Allowed Buyer Purposes Toggles */}
            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Buyer-Purpose Preferences (Local Only)
              </label>
              <p className="text-[10px] text-slate-500">These switches record application preferences only. They do not authorize or block an external data release.</p>

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
                <div className="text-[10px] text-slate-400">Local preference only. This control does not contact buyers or send a counter-offer; negotiation execution is NOT VERIFIED.</div>
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
                'AI-generated text only; no buyer negotiation or commercial offer is executed by this console.'
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
