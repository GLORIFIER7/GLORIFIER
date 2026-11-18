import React, { useRef, useState } from 'react';
import { 
  Scale, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Sparkles, 
  ShieldCheck, 
  Clock, 
  DollarSign, 
  Building2, 
  BadgeAlert,
  ArrowUpRight,
  Filter,
  Check,
  RefreshCw
} from 'lucide-react';
import { BuyerOffer, MonetizationPolicy } from '../types';

type OfferAssessment = { score: number; verdict: 'RECOMMEND' | 'CAUTION' | 'REJECT'; reasoning: string };

const isValidAssessment = (value: unknown): value is OfferAssessment => {
  if (typeof value !== 'object' || value === null) return false;
  const assessment = value as Record<string, unknown>;
  return typeof assessment.score === 'number' && Number.isFinite(assessment.score) && assessment.score >= 0 && assessment.score <= 100
    && (assessment.verdict === 'RECOMMEND' || assessment.verdict === 'CAUTION' || assessment.verdict === 'REJECT')
    && typeof assessment.reasoning === 'string' && assessment.reasoning.trim().length > 0;
};

interface MarketplaceOffersProps {
  offers: BuyerOffer[];
  onAcceptOffer: (id: string) => void;
  onRejectOffer: (id: string) => void;
  onCounterOffer: (id: string, counterAmount: number) => void;
  policy: MonetizationPolicy;
}

export const MarketplaceOffers: React.FC<MarketplaceOffersProps> = ({
  offers,
  onAcceptOffer,
  onRejectOffer,
  onCounterOffer,
  policy
}) => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  const [counteringOfferId, setCounteringOfferId] = useState<string | null>(null);
  const [counterPrice, setCounterPrice] = useState<number>(0);
  const [evaluatingIds, setEvaluatingIds] = useState<Record<string, boolean>>({});
  const [evaluationResults, setEvaluationResults] = useState<Record<string, { key: string; assessment: OfferAssessment }>>({});
  const [evaluationErrors, setEvaluationErrors] = useState<Record<string, { key: string; message: string }>>({});
  const evaluationRequestIds = useRef<Record<string, number>>({});
  const currentEvaluationKeys = useRef<Record<string, string>>({});

  offers.forEach(offer => {
    currentEvaluationKeys.current[offer.id] = JSON.stringify({ offer, policy });
  });

  const filteredOffers = offers.filter(o => {
    if (filter === 'all') return true;
    if (filter === 'pending') return o.status === 'PENDING' || o.status === 'COUNTERED';
    if (filter === 'accepted') return o.status === 'ACCEPTED';
    if (filter === 'rejected') return o.status === 'REJECTED';
    return true;
  });

  const handleStartCounter = (offer: BuyerOffer) => {
    setCounteringOfferId(offer.id);
    const suggested = Math.round(offer.offeredCompUsd * 1.25);
    setCounterPrice(suggested);
  };

  const handleRunAiEvaluation = async (offer: BuyerOffer) => {
    const evaluationKey = JSON.stringify({ offer, policy });
    const requestId = (evaluationRequestIds.current[offer.id] || 0) + 1;
    evaluationRequestIds.current[offer.id] = requestId;
    setEvaluatingIds(previous => ({ ...previous, [offer.id]: true }));
    try {
      const res = await fetch('/api/ai/evaluate-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer, userPolicy: policy })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      if (!isValidAssessment(data)) throw new Error('AI evaluation response was incomplete or invalid.');
      if (evaluationRequestIds.current[offer.id] !== requestId || currentEvaluationKeys.current[offer.id] !== evaluationKey) return;
      setEvaluationResults(previous => ({ ...previous, [offer.id]: { key: evaluationKey, assessment: data } }));
      setEvaluationErrors(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== offer.id)));
    } catch (e) {
      if (evaluationRequestIds.current[offer.id] !== requestId || currentEvaluationKeys.current[offer.id] !== evaluationKey) return;
      console.error('Offer evaluation unavailable; no recommendation was inferred:', e);
      setEvaluationResults(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== offer.id)));
      setEvaluationErrors(previous => ({ ...previous, [offer.id]: { key: evaluationKey, message: e instanceof Error ? e.message : 'AI evaluation unavailable.' } }));
    } finally {
      if (evaluationRequestIds.current[offer.id] === requestId && currentEvaluationKeys.current[offer.id] === evaluationKey) {
        setEvaluatingIds(previous => ({ ...previous, [offer.id]: false }));
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Scale className="w-5 h-5 text-emerald-400" />
              Buyer Offer Review (live marketplace status not verified)
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              This panel displays offers only when returned by the configured backend. Buyer identity, bid authenticity, privacy enforcement, and settlement must be verified independently before any license or data transfer.
            </p>
          </div>

          <div role="note" className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-100">
        Offer status, buyer-verification flags, scores, and proposed compensation are stored claims only. Accepting or countering here changes a local record; it does not create a verified contract, transfer data, or confirm payment.
      </div>

      {/* Filter tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
            {(['all', 'pending', 'accepted', 'rejected'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs font-semibold rounded-md capitalize transition-colors ${
                  filter === f
                    ? 'bg-slate-800 text-emerald-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Offer Cards */}
      <div className="grid grid-cols-1 gap-4">
        {filteredOffers.map((offer) => {
          const isPending = offer.status === 'PENDING';
          const isAccepted = offer.status === 'ACCEPTED';
          const isRejected = offer.status === 'REJECTED';
          const isCountered = offer.status === 'COUNTERED';
          const evaluationKey = currentEvaluationKeys.current[offer.id];
          const isEvaluating = evaluatingIds[offer.id] === true;
          const persistedAssessment = { score: offer.aiBrokerScore, verdict: offer.aiVerdict, reasoning: offer.aiBrokerReasoning };
          const storedResult = evaluationResults[offer.id];
          const storedError = evaluationErrors[offer.id];
          const evaluationError = storedError?.key === evaluationKey ? storedError.message : undefined;
          let assessment: OfferAssessment | null = null;
          if (!evaluationError) {
            if (storedResult?.key === evaluationKey) {
              assessment = storedResult.assessment;
            } else if (isValidAssessment(persistedAssessment)) {
              assessment = persistedAssessment;
            }
          }

          const getVerdictBadge = () => {
            if (evaluationError) {
              return <span role="status" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-amber-200 border border-amber-500/30">NOT VERIFIED · evaluation unavailable</span>;
            }
            if (!assessment) {
              return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">Not evaluated</span>;
            }
            if (assessment.verdict === 'RECOMMEND') {
              return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Stored verdict: RECOMMEND · score {assessment.score}/100 · NOT VERIFIED
                </span>
              );
            }
            if (assessment.verdict === 'CAUTION') {
              return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Stored verdict: CAUTION · score {assessment.score}/100 · NOT VERIFIED
                </span>
              );
            }
            return (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                <XCircle className="w-3.5 h-3.5" />
                Stored verdict: REJECT · score {assessment.score}/100 · NOT VERIFIED
              </span>
            );
          };

          return (
            <div
              key={offer.id}
              id={`offer-card-${offer.id}`}
              className={`rounded-xl border p-5 transition-all ${
                isAccepted
                  ? 'bg-slate-900/90 border-emerald-500/40 shadow-sm'
                  : isRejected
                  ? 'bg-slate-950/50 border-slate-850 opacity-70'
                  : 'bg-slate-900/95 border-slate-800 hover:border-slate-700 shadow-md'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                {/* Left: Buyer info & specs */}
                <div className="space-y-2 max-w-2xl">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-sm font-bold text-white">{offer.buyerName}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                      {offer.buyerCategory}
                    </span>
                    {offer.buyerVerified && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30 font-semibold flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Verification claim (not independently checked)
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-slate-400">
                      Stored reputation claim: {offer.reputationScore}/100 · NOT VERIFIED
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {offer.purposeSummary}
                  </p>

                  {/* Badges / Constraints */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <div className="text-[11px] font-medium text-slate-400">
                      Streams Needed:
                    </div>
                    {offer.dataCategoriesNeeded.map((c) => (
                      <span key={c} className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {c}
                      </span>
                    ))}
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800 font-mono">
                      Retention: {offer.retentionWindowDays} days max
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 text-emerald-400 border border-slate-800 font-mono">
                      Required ε ≤ {offer.maxEpsilonAllowed}
                    </span>
                  </div>

                  {/* Prohibited clauses */}
                  {offer.prohibitedPurposes.length > 0 && (
                    <div className="text-[10px] text-slate-400 flex items-center gap-2 pt-1">
                      <span className="font-semibold text-slate-500">Strict Prohibitions:</span>
                      {offer.prohibitedPurposes.map((p, i) => (
                        <span key={i} className="text-slate-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: Compensation & Verdict */}
                <div className="flex flex-col items-end gap-3 self-start lg:self-auto shrink-0">
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Offered Compensation</div>
                    <div className="text-xl font-extrabold font-mono text-emerald-400">
                      ${offer.offeredCompUsd.toFixed(2)}{' '}
                      <span className="text-xs font-normal text-slate-400">/{offer.pricingCadence}</span>
                    </div>
                    {isCountered && (
                      <div className="text-[10px] font-mono text-amber-400 mt-0.5">
                        Counter-offer recorded locally (not sent): ${offer.counterOfferAmount?.toFixed(2)}/mo
                      </div>
                    )}
                  </div>

                  <div>{getVerdictBadge()}</div>
                </div>
              </div>

              {/* AI Broker Evaluation Note */}
              <div className="mt-3.5 p-3 rounded-lg bg-slate-950/70 border border-slate-800/90 text-xs flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-bold text-slate-200">AI Broker Assessment</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono font-semibold uppercase">
                      {policy.aiModel || 'Server default model (reported as GPT-4o; not independently verified)'}
                    </span>
                  </div>
                  <span className="text-slate-300">{evaluationError || assessment?.reasoning || 'No verified AI assessment is available. Run an evaluation; failed requests will not produce a score or recommendation.'}</span>
                </div>
                <button
                  onClick={() => handleRunAiEvaluation(offer)}
                  disabled={isEvaluating}
                  className="text-[11px] text-slate-400 hover:text-emerald-300 font-medium shrink-0 flex items-center gap-1"
                >
                  {isEvaluating ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                  Re-evaluate
                </button>
              </div>

              {/* Counter-Offer Drawer / Box */}
              {counteringOfferId === offer.id && (
                <div className="mt-3 p-3.5 rounded-lg bg-slate-950 border border-amber-500/30 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-300">
                      AI-Assisted Counter-Proposal to {offer.buyerName}
                    </span>
                    <button
                      onClick={() => setCounteringOfferId(null)}
                      className="text-slate-400 hover:text-white text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-400 block mb-1">
                        Proposed Compensation Rate ($/month)
                      </label>
                      <input
                        type="number"
                        value={counterPrice}
                        onChange={(e) => setCounterPrice(Number.parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <button
                      onClick={() => {
                        onCounterOffer(offer.id, counterPrice);
                        setCounteringOfferId(null);
                      }}
                      className="mt-4 px-4 py-2 text-xs font-bold rounded bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
                    >
                      Save Counter-Offer Draft
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    This local counter-offer draft does not transmit a contract or enforce retention limits. Proposed compensation (not verified): ${counterPrice}/mo.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <div className="text-[11px] text-slate-400">
                  Status: <strong className="text-white font-mono uppercase">{offer.status}</strong>
                  <span className="ml-2 text-slate-500">{offer.timestamp}</span>
                </div>

                <div className="flex items-center gap-2">
                  {isPending && (
                    <>
                      <button
                        onClick={() => handleStartCounter(offer)}
                        id={`counter-btn-${offer.id}`}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                      >
                        Draft Counter-Offer
                      </button>
                      <button
                        onClick={() => onRejectOffer(offer.id)}
                        id={`reject-btn-${offer.id}`}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition-colors"
                      >
                        Record Rejection (Local Only)
                      </button>
                      <button
                        onClick={() => onAcceptOffer(offer.id)}
                        id={`accept-btn-${offer.id}`}
                        className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20 transition-colors flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Record Acceptance (Local Only)
                      </button>
                    </>
                  )}

                  {isCountered && (
                    <span className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Counter-offer recorded locally (not sent)
                    </span>
                  )}

                  {isAccepted && (
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Accepted offer record (local only)
                    </span>
                  )}

                  {isRejected && (
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> Rejection recorded locally
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
