import React, { useState } from 'react';
import { 
  Sparkles, 
  ShieldCheck, 
  Sliders, 
  X, 
  Check, 
  Zap, 
  TrendingUp, 
  Lock, 
  Scale, 
  ArrowRight, 
  Bot, 
  Cpu,
  Info
} from 'lucide-react';
import { MonetizationPolicy, RiskToleranceLevel } from '../types';

interface AiPolicyOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPolicy: MonetizationPolicy;
  onApplyOptimization: (optimizedPolicy: Partial<MonetizationPolicy>, rationale: string) => void;
  activeModel?: string;
}

interface OptimizationPreset {
  level: RiskToleranceLevel;
  title: string;
  badge: string;
  tagline: string;
  epsilon: number;
  privacyTier: string;
  privacyShieldScore: number | null;
  monthlyFloor: number;
  brokerMode: 'strict-sovereign' | 'balanced-protective' | 'autonomous-maximize';
  projectedPacing: number | null;
  allowAiPretraining: boolean;
  allowAdTargeting: boolean;
  allowAcademic: boolean;
  allowActuarial: boolean;
  rationale: string;
  mathematicalGuarantee: string;
  recommendedFor: string;
}

const OPTIMIZATION_PRESETS: Record<RiskToleranceLevel, OptimizationPreset> = {
  conservative: {
    level: 'conservative',
    title: 'Conservative Privacy Preset (Illustrative)',
    badge: 'Tier IV · Configuration target only',
    tagline: 'Illustrative privacy-policy preset; implementation and enforcement NOT VERIFIED',
    epsilon: 0.15,
    privacyTier: 'Strict policy preset · implementation NOT VERIFIED',
    privacyShieldScore: null,
    monthlyFloor: 50,
    brokerMode: 'strict-sovereign',
    projectedPacing: null,
    allowAiPretraining: false,
    allowAdTargeting: false,
    allowAcademic: true,
    allowActuarial: false,
    rationale: 'Illustrative preset only. Selecting ε = 0.15 does not prove that data is transformed, that trackers are quarantined, or that reconstruction is prevented. Runtime controls and outcomes are NOT VERIFIED.',
    mathematicalGuarantee: 'For ε = 0.15, e^ε ≈ 1.162. This is a differential-privacy ratio bound under applicable mechanism assumptions, not a measured PII reconstruction probability. Implementation NOT VERIFIED.',
    recommendedFor: 'Medical researchers, legal professionals, and privacy purists.'
  },
  balanced: {
    level: 'balanced',
    title: 'Balanced Equilibrium',
    badge: 'Tier III · Configuration target only',
    tagline: 'Illustrative balance preset; privacy enforcement and compensation are NOT VERIFIED',
    epsilon: 0.35,
    privacyTier: 'Balanced policy preset · implementation NOT VERIFIED',
    privacyShieldScore: null,
    monthlyFloor: 35,
    brokerMode: 'balanced-protective',
    projectedPacing: null,
    allowAiPretraining: true,
    allowAdTargeting: false,
    allowAcademic: true,
    allowActuarial: false,
    rationale: 'Illustrative policy settings only. ε = 0.35 does not itself prove anonymization, removal of identity vectors, provider licensing, or blocking of ad targeting and credit-risk profiling. Runtime enforcement is NOT VERIFIED.',
    mathematicalGuarantee: 'For ε = 0.35, e^ε ≈ 1.419. This is a mathematical ratio only; NIST alignment and implementation compliance have NOT been independently verified.',
    recommendedFor: 'Users evaluating a hypothetical policy preset; income and privacy risk are not guaranteed.'
  },
  'yield-focused': {
    level: 'yield-focused',
    title: 'Hypothetical Yield Scenario',
    badge: 'Tier II · Configuration target only',
    tagline: 'Illustrative revenue scenario; buyer demand and automated negotiation are NOT VERIFIED',
    epsilon: 0.55,
    privacyTier: 'Yield-focused policy preset · implementation NOT VERIFIED',
    privacyShieldScore: null,
    monthlyFloor: 20,
    brokerMode: 'autonomous-maximize',
    projectedPacing: null,
    allowAiPretraining: true,
    allowAdTargeting: false,
    allowAcademic: true,
    allowActuarial: false,
    rationale: 'The displayed monthly amount is a hypothetical projection, not a quote, offer, contract, or earned revenue. Automated counter-offers, privacy protections, and restrictions on targeting or actuarial use are NOT VERIFIED.',
    mathematicalGuarantee: 'For ε = 0.55, e^ε ≈ 1.733. This does not establish k-anonymity; no cohort-size or implementation verification is available here.',
    recommendedFor: 'Users comparing a hypothetical revenue scenario; no income or privacy outcome is guaranteed.'
  }
};

export const AiPolicyOptimizerModal: React.FC<AiPolicyOptimizerModalProps> = ({
  isOpen,
  onClose,
  currentPolicy,
  onApplyOptimization,
  activeModel = 'gpt-4o'
}) => {
  // Infer initial risk tolerance from current policy
  const initialLevel: RiskToleranceLevel = currentPolicy.riskTolerance || 
    (currentPolicy.brokerMode === 'strict-sovereign' ? 'conservative' :
     currentPolicy.brokerMode === 'autonomous-maximize' ? 'yield-focused' : 'balanced');

  const [selectedLevel, setSelectedLevel] = useState<RiskToleranceLevel>(initialLevel);

  if (!isOpen) return null;

  const preset = OPTIMIZATION_PRESETS[selectedLevel];

  // Current values
  const currentEpsilon = currentPolicy.globalEpsilon ?? 0.35;
  const currentFloor = currentPolicy.minimumMonthlyFloorUsd ?? 35;
  const currentMode = currentPolicy.brokerMode ?? 'balanced-protective';

  const handleApply = () => {
    onApplyOptimization({
        riskTolerance: preset.level,
        brokerMode: preset.brokerMode,
        globalEpsilon: preset.epsilon,
        minimumMonthlyFloorUsd: preset.monthlyFloor,
        allowAiModelPretraining: preset.allowAiPretraining,
        allowAdTargeting: preset.allowAdTargeting,
        allowAcademicResearch: preset.allowAcademic,
        allowInsuranceRiskProfiling: preset.allowActuarial,
      autoNegotiateHighBids: false
    }, preset.rationale);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Gradient Accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400" />

        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800/80 bg-slate-950/60 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Policy Preset Comparator
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-emerald-400" />
                  LOCAL PRESET · NO MODEL CALL
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Static illustrative presets for local policy preferences. No model inference, privacy calibration, or runtime enforcement is performed.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
          {/* Risk Tolerance Level Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-3">
              Step 1: Select Your Sovereign Risk Tolerance
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Conservative */}
              <button
                type="button"
                onClick={() => setSelectedLevel('conservative')}
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  selectedLevel === 'conservative'
                    ? 'bg-emerald-500/10 border-emerald-500/80 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/40'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                      <Lock className="w-4 h-4" />
                    </div>
                    {selectedLevel === 'conservative' && (
                      <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[10px] font-bold">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold text-white">Conservative</div>
                  <div className="text-[11px] text-emerald-400 font-mono mt-0.5">ε ≤ 0.15 • Citadel</div>
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                    Zero compromise. Maximum Laplacian noise. No commercial AI training.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-400">Shield:</span>
                  <span className="text-emerald-400 font-bold">98/100</span>
                </div>
              </button>

              {/* Balanced */}
              <button
                type="button"
                onClick={() => setSelectedLevel('balanced')}
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  selectedLevel === 'balanced'
                    ? 'bg-teal-500/10 border-teal-500/80 shadow-md shadow-teal-500/10 ring-1 ring-teal-500/40'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
                      <Scale className="w-4 h-4" />
                    </div>
                    {selectedLevel === 'balanced' && (
                      <span className="w-4 h-4 rounded-full bg-teal-400 text-slate-950 flex items-center justify-center text-[10px] font-bold">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold text-white">Balanced (Optimal)</div>
                  <div className="text-[11px] text-teal-400 font-mono mt-0.5">ε = 0.35 • Enclave</div>
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                    Optimal harmony. Permits vetted frontier AI licensing; blocks ad brokers.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-400">Shield:</span>
                  <span className="text-teal-400 font-bold">92/100</span>
                </div>
              </button>

              {/* Yield-Focused */}
              <button
                type="button"
                onClick={() => setSelectedLevel('yield-focused')}
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  selectedLevel === 'yield-focused'
                    ? 'bg-cyan-500/10 border-cyan-500/80 shadow-md shadow-cyan-500/10 ring-1 ring-cyan-500/40'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    {selectedLevel === 'yield-focused' && (
                      <span className="w-4 h-4 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center text-[10px] font-bold">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold text-white">Yield-Focused</div>
                  <div className="text-[11px] text-cyan-400 font-mono mt-0.5">ε = 0.55 • Bastion</div>
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                    Max payout. Auto-counters +25% on bids with high buyer reputation.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-400">Shield:</span>
                  <span className="text-cyan-400 font-bold">86/100</span>
                </div>
              </button>
            </div>
          </div>

          {/* Current vs AI-Recommended Comparison Matrix */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                Comparison Matrix: Current vs. AI Recommended
              </span>
              <span className="text-[11px] font-mono text-emerald-400">
                Target: {preset.badge}
              </span>
            </div>

            <div className="p-4 space-y-3 text-xs">
              {/* Metric 1: Privacy Epsilon */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">Differential Privacy Epsilon (ε):</span>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-slate-400 line-through">ε = {currentEpsilon}</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    ε = {preset.epsilon}
                  </span>
                </div>
              </div>

              {/* Metric 2: Privacy Shield Index */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">Illustrative policy index · not a measured protection score:</span>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-slate-400">Current</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="text-emerald-400 font-bold">
                    {preset.privacyShieldScore == null ? 'NOT MEASURED' : `${preset.privacyShieldScore}/100 · illustrative, not measured`}
                  </span>
                </div>
              </div>

              {/* Metric 3: Minimum Monthly Floor */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">Proposed policy floor (not a buyer offer):</span>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-slate-400 line-through">${currentFloor}/mo</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="text-teal-400 font-bold bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                    ${preset.monthlyFloor}/mo
                  </span>
                </div>
              </div>

              {/* Metric 4: Projected Monthly Pacing */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">Hypothetical monthly projection · revenue NOT VERIFIED:</span>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-slate-200 font-bold">
                    {preset.projectedPacing == null ? 'NOT ESTIMATED' : `~${preset.projectedPacing.toFixed(2)} / month · NOT REVENUE`}
                  </span>
                </div>
              </div>

              {/* Metric 5: AI Pretraining Stance */}
              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-400">Frontier AI Pre-Training Licensing:</span>
                <span className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded ${
                  preset.allowAiPretraining 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  {preset.allowAiPretraining ? 'POLICY SETTING: PERMITTED · enforcement NOT VERIFIED' : 'POLICY SETTING: BLOCKED · enforcement NOT VERIFIED'}
                </span>
              </div>
            </div>
          </div>

          {/* AI Broker Mathematical Rationale */}
          <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-4 relative overflow-hidden">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Illustrative Policy Rationale · not a verified model response</span>
                  <span className="text-[10px] font-mono text-emerald-400">({preset.mathematicalGuarantee})</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {preset.rationale}
                </p>
                <div className="pt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span><strong>Recommended For:</strong> {preset.recommendedFor}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Applies local policy settings only; production enforcement NOT VERIFIED</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              id="apply-optimized-policy-btn"
              onClick={handleApply}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Apply Local Preferences</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
