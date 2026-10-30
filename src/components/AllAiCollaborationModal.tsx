import React, { useState } from 'react';
import { 
  Users, 
  Sparkles, 
  X, 
  Bot, 
  CheckCircle2, 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  Scale, 
  RefreshCw,
  Cpu,
  Layers,
  ChevronRight,
  TrendingUp,
  Lock
} from 'lucide-react';
import { MonetizationPolicy, DataFootprintSource, CouncilConsensusResult } from '../types';
import { getIdToken } from '../lib/firebase';
import { discoverConfiguredModelCouncilParticipants, formatModelCouncilFailures, ModelCouncilClientError, type ModelCouncilProviderFailure, submitAuthenticatedModelCouncilRequest } from '../lib/ai/model-council-client';

interface AllAiCollaborationModalProps {
  isOpen: boolean;
  onClose: () => void;
  policy: MonetizationPolicy;
  footprints: DataFootprintSource[];
  onApplyDirectives: (directives: { globalEpsilon?: number; minimumMonthlyFloorUsd?: number; autoNegotiateHighBids?: boolean }, summary: string) => void;
}

const COUNCIL_AGENDAS = [
  {
    id: 'holistic',
    title: 'Comprehensive Sovereign Footprint & Yield Audit',
    description: 'All models evaluate your active streams, valuation ceiling, and tracker quarantine.'
  },
  {
    id: 'ai-training',
    title: 'Frontier AI Pre-Training Licensing & Zero-PII Enclave',
    description: 'Determine safe terms, tokenization limits, and indemnification for AI lab buyers.'
  },
  {
    id: 'clawback',
    title: 'Statutory Broker Clawback & Shadow Tracker Eradication',
    description: 'Harmonize CCPA, GDPR, and California Delete Act enforcement against data brokers.'
  },
  {
    id: 'yield-pacing',
    title: 'Maximized Monthly Pacing vs. Differential Privacy',
    description: 'Calculate the mathematical equilibrium between Laplacian noise (ε) and passive yield.'
  }
];

export const AllAiCollaborationModal: React.FC<AllAiCollaborationModalProps> = ({
  isOpen,
  onClose,
  policy,
  footprints,
  onApplyDirectives
}) => {
  const [selectedAgenda, setSelectedAgenda] = useState(COUNCIL_AGENDAS[0].title);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isConvening, setIsConvening] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(0);
  const [councilResult, setCouncilResult] = useState<CouncilConsensusResult | null>(null);
  const [providerFailures, setProviderFailures] = useState<ModelCouncilProviderFailure[]>([]);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentTopic = customPrompt.trim() || selectedAgenda;

  const handleConveneCouncil = async () => {
    setIsConvening(true);
    setCouncilResult(null);
    setProviderFailures([]);
    setStatusFeedback(null);
    setActiveStep(1);

    try {
      const participants = await discoverConfiguredModelCouncilParticipants();
      if (participants.length === 0) {
        setStatusFeedback('No configured provider model is currently available. Configure at least one provider credential and model before starting the council.');
        return;
      }

      const result = await submitAuthenticatedModelCouncilRequest({
        agenda: currentTopic,
        participants,
        currentPolicy: policy,
        footprints: footprints.map(f => ({ name: f.name, category: f.category, isMonetized: f.isMonetized })),
        getToken: getIdToken,
      });
      setProviderFailures(result.failures);
      setCouncilResult(result);
      setStatusFeedback(`Received ${result.participantCount} response(s) from ${result.providerDiversity} provider(s). Exact registry model IDs were requested; live execution is evidenced only by returned participants.`);
    } catch (err) {
      console.warn('Council endpoint unavailable; no consensus result was produced.', err);
      setCouncilResult(null);
      if (err instanceof ModelCouncilClientError) {
        setProviderFailures(err.failures);
        const failureSummary = formatModelCouncilFailures(err.failures);
        setStatusFeedback([err.message, failureSummary ? `Provider failures: ${failureSummary}.` : ''].filter(Boolean).join(' '));
      } else {
        setStatusFeedback('Council execution failed. No consensus result was produced.');
      }
    } finally {
      setIsConvening(false);
      setActiveStep(0);
    }
  };

  const handleApply = () => {
    if (
      !councilResult ||
      typeof councilResult.recommendedEpsilon !== 'number' ||
      !Number.isFinite(councilResult.recommendedEpsilon) ||
      typeof councilResult.recommendedFloorUsd !== 'number' ||
      !Number.isFinite(councilResult.recommendedFloorUsd)
    ) return;
    onApplyDirectives(
      {
        globalEpsilon: councilResult.recommendedEpsilon,
        minimumMonthlyFloorUsd: councilResult.recommendedFloorUsd,
        autoNegotiateHighBids: true
      },
      `Council response received: ε = ${councilResult.recommendedEpsilon}, Floor = ${councilResult.recommendedFloorUsd}/mo. Provider participation, consensus, and production enforcement are NOT independently verified.`
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-4xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Gradient Banner with Council Badges */}
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400" />

        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/70 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner shrink-0 mt-0.5">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  All-AI Model Collaboration Council
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  MULTI-MODEL COUNCIL REQUEST · CONSENSUS NOT VERIFIED
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                The shared council client selects configured provider/model pairs at request time. The endpoint validates them; actual participants and returned outputs are displayed after execution. No zero-knowledge enclave is claimed here.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Model Participant Banner */}
        <div className="px-5 py-2.5 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between gap-3 text-xs overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-slate-400 font-medium">Participant selection:</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px]">
              Determined by configured providers at request time
            </span>
          </div>

          <div className="text-[11px] text-slate-400 shrink-0 font-mono">
            Participant availability: {isConvening ? 'pending council response' : councilResult ? 'council response received' : 'not requested'}
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
          {/* Agenda / Topic Input Section */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              Council Agenda & Discussion Topic
            </label>

            {/* Quick Agenda Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {COUNCIL_AGENDAS.map((agenda) => (
                <button
                  key={agenda.id}
                  type="button"
                  onClick={() => {
                    setSelectedAgenda(agenda.title);
                    setCustomPrompt('');
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedAgenda === agenda.title && !customPrompt
                      ? 'bg-emerald-500/10 border-emerald-500/80 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                  }`}
                >
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>{agenda.title}</span>
                    {selectedAgenda === agenda.title && !customPrompt && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    {agenda.description}
                  </p>
                </button>
              ))}
            </div>

            {/* Custom Query Input */}
            <div className="relative mt-2">
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Or specify custom question for all AI models to debate & solve..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
              {customPrompt && (
                <button
                  type="button"
                  onClick={() => setCustomPrompt('')}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Convene Action Button */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                id="convene-council-btn"
                disabled={isConvening}
                onClick={handleConveneCouncil}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:via-teal-400 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isConvening ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Convening All AI Models...</span>
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4 fill-current" />
                    <span>Convene All AI Models ({councilResult ? 'Re-run' : 'Start Collaboration'})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Deliberation Progress State */}
          {isConvening && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 animate-pulse">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-emerald-400 flex items-center gap-2">
                  <Cpu className="w-4 h-4 animate-spin" />
                  Council endpoint request in progress
                </span>
                <span className="text-slate-400">Request pending · provider stages NOT VERIFIED</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-500" 
                  style={{ width: `${(activeStep / 3) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Request lifecycle only. Provider execution, model participation, and consensus are NOT VERIFIED.
              </p>
            </div>
          )}

          {statusFeedback && (
            <output aria-live="polite" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              {statusFeedback}
            </output>
          )}
          {providerFailures.length > 0 && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              <div className="font-semibold mb-1">Provider execution failures</div>
              <ul className="list-disc pl-5 space-y-1">
                {providerFailures.map((failure, index) => (
                  <li key={`${failure.providerId}-${failure.modelId || 'unknown'}-${index}`}>
                    {failure.providerId}{failure.modelId ? `/${failure.modelId}` : ''}: {failure.code}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Results Section */}
          {councilResult && !isConvening && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Individual Model Perspective Cards */}
              <div>
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  Multi-Model Specialized Perspectives
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {councilResult.participants.map((p) => {
                    const isGpt = p.provider === 'openai';
                    const isGemini = p.provider === 'gemini';
                    
                    const borderClass = isGpt 
                      ? 'border-emerald-500/40 bg-emerald-950/10' 
                      : isGemini 
                      ? 'border-teal-500/40 bg-teal-950/10' 
                      : 'border-cyan-500/40 bg-cyan-950/10';

                    const textClass = isGpt 
                      ? 'text-emerald-400' 
                      : isGemini 
                      ? 'text-teal-400' 
                      : 'text-cyan-400';

                    return (
                      <div 
                        key={p.modelId} 
                        className={`rounded-xl border p-4 flex flex-col justify-between ${borderClass}`}
                      >
                        <div>
                          {/* Model Header */}
                          <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800">
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs ${
                                isGpt ? 'bg-emerald-500/20 text-emerald-400' :
                                isGemini ? 'bg-teal-500/20 text-teal-400' : 'bg-cyan-500/20 text-cyan-400'
                              }`}>
                                <Bot className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <span className="text-xs font-bold text-white block leading-none">{p.name}</span>
                                <span className="text-[9px] text-slate-400 font-mono">{p.provider}</span>
                              </div>
                            </div>
                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${
                              isGpt ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
                              isGemini ? 'bg-teal-500/10 border-teal-500/30 text-teal-300' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                            }`}>
                              {p.badge}
                            </span>
                          </div>

                          <div className="text-[10px] text-slate-400 font-mono mb-2">
                            Role: <span className="text-slate-200">{p.role}</span>
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed">
                            {p.output}
                          </p>
                        </div>

                        {/* Key Recommendation */}
                        {p.keyRecommendation && (
                          <div className="mt-3 pt-2.5 border-t border-slate-800/80">
                            <span className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider">
                              Key Directive:
                            </span>
                            <span className={`text-[11px] font-medium leading-snug block mt-0.5 ${textClass}`}>
                              {p.keyRecommendation}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Council Unified Consensus Box */}
              <div className="rounded-xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-emerald-500/30 p-5 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                      <Scale className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Council Output · Human Review Required
                      </h4>
                      <p className="text-[11px] text-slate-400 font-mono">
                        Cryptographic cross-verification: NOT VERIFIED
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-400">Backend-reported consensus score (not independently verified):</span>
                    <span className="text-xs font-bold font-mono px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      {typeof councilResult.consensusScore === 'number' ? `${councilResult.consensusScore}% backend-reported · not independently verified` : 'NOT MEASURED'}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-200 mt-3 leading-relaxed">
                  {councilResult.unifiedConsensus || 'No synthesis was returned.'}
                </p>

                {/* Calibrated Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 font-mono">Recommended ε</div>
                    <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                      {typeof councilResult.recommendedEpsilon === 'number' ? `ε = ${councilResult.recommendedEpsilon}` : 'NOT RETURNED'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 font-mono">Recommended Floor</div>
                    <div className="text-sm font-bold text-teal-400 font-mono mt-0.5">
                      {typeof councilResult.recommendedFloorUsd === 'number' ? `${councilResult.recommendedFloorUsd}/mo · backend-reported` : 'NOT RETURNED'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 font-mono">Pre-Training AI</div>
                    <div className="text-sm font-bold text-cyan-400 font-mono mt-0.5">
                      NOT VERIFIED
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 font-mono">Shadow Brokers</div>
                    <div className="text-sm font-bold text-rose-400 font-mono mt-0.5">
                      NOT VERIFIED
                    </div>
                  </div>
                </div>

                {/* Action Directives List */}
                <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                    Adoptable Council Action Directives:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {councilResult.actionDirectives.map((directive, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{directive}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Provider participation, consensus, and production enforcement are NOT VERIFIED unless explicit evidence is returned.</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
            {councilResult && typeof councilResult.recommendedEpsilon === 'number' && Number.isFinite(councilResult.recommendedEpsilon) && typeof councilResult.recommendedFloorUsd === 'number' && Number.isFinite(councilResult.recommendedFloorUsd) && (
              <button
                type="button"
                id="adopt-council-consensus-btn"
                onClick={handleApply}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all active:scale-95 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Apply Proposed Policy Values</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
