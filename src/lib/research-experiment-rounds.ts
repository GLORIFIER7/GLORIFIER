/**
 * Deterministic, read-only shortlisting for bounded research/experiment rounds.
 * No inference, execution, persistence, payment, external requests, or approval
 * is performed here. A trusted caller must authenticate each review and keep
 * source/claim verification separate from candidate scoring.
 */

export type ResearchExperimentResult = {
  id: string;
  producerId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  effect: 'read-only' | 'reversible' | 'irreversible';
  /** An externally assessed ranking signal, not a scientific confidence claim. */
  score: number;
  inputSha256: string;
  outputSha256: string;
  sourceRefs: string[];
  methodRef: string;
  paidCostUsd: number;
  review?: {
    reviewerId: string;
    evidenceRef: string;
    outputSha256: string;
  };
};

export type ResearchRejectionReason =
  | 'not-completed'
  | 'not-read-only'
  | 'paid-cost-not-allowed'
  | 'invalid-score'
  | 'insufficient-provenance'
  | 'review-not-independent'
  | 'review-not-bound-to-output'
  | 'review-not-authenticated'
  | 'bounded-round-capacity';

export type ResearchRoundSelection = {
  /** These are eligible candidates for a subsequent review/round, NOT verified claims. */
  selected: ResearchExperimentResult[];
  notSelected: Array<{ id: string; reason: ResearchRejectionReason }>;
};

export type ResearchRoundOptions = {
  maxAdvance?: number;
  /** Must authenticate the review record using trusted evidence outside this module. */
  authenticateReview?: (candidate: Readonly<ResearchExperimentResult>) => boolean;
};

const MAX_GRAPH_NODES = 6;
const SHA256 = /^[a-f0-9]{64}$/;

function nonemptyRef(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 512;
}

function rejectionReason(
  candidate: ResearchExperimentResult,
  authenticateReview: ResearchRoundOptions['authenticateReview'],
): ResearchRejectionReason | null {
  if (candidate.status !== 'completed') return 'not-completed';
  if (candidate.effect !== 'read-only') return 'not-read-only';
  if (candidate.paidCostUsd !== 0) return 'paid-cost-not-allowed';
  if (!Number.isFinite(candidate.score) || candidate.score < 0 || candidate.score > 1) return 'invalid-score';
  if (!SHA256.test(candidate.inputSha256) || !SHA256.test(candidate.outputSha256) ||
      !nonemptyRef(candidate.methodRef) ||
      !Array.isArray(candidate.sourceRefs) || candidate.sourceRefs.length < 1 ||
      candidate.sourceRefs.length > 20 || !candidate.sourceRefs.every(nonemptyRef)) {
    return 'insufficient-provenance';
  }

  if (!candidate.review || !nonemptyRef(candidate.review.reviewerId) ||
      !nonemptyRef(candidate.review.evidenceRef) ||
      !nonemptyRef(candidate.producerId) || candidate.producerId === candidate.review.reviewerId) {
    return 'review-not-independent';
  }
  if (candidate.review.outputSha256 !== candidate.outputSha256) {
    return 'review-not-bound-to-output';
  }
  // Fail closed: a missing, throwing, or async verifier is not authentication.
  try {
    if (authenticateReview?.(candidate) !== true) return 'review-not-authenticated';
  } catch {
    return 'review-not-authenticated';
  }
  return null;
}

export function selectNextResearchRound(
  candidates: readonly ResearchExperimentResult[],
  options: ResearchRoundOptions = {},
): ResearchRoundSelection {
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > MAX_GRAPH_NODES) {
    throw new Error(`Research round must contain between 1 and ${MAX_GRAPH_NODES} experiments.`);
  }
  const maxAdvance = options.maxAdvance ?? 2;
  if (!Number.isSafeInteger(maxAdvance) || maxAdvance < 1 || maxAdvance > MAX_GRAPH_NODES) {
    throw new Error(`Research maxAdvance must be between 1 and ${MAX_GRAPH_NODES}.`);
  }
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' ||
        !nonemptyRef(candidate.id) || candidate.id.length > 128 || candidate.id !== candidate.id.trim()) {
      throw new Error('Research round has an invalid experiment id.');
    }
    if (seen.has(candidate.id)) throw new Error(`Research round contains duplicate experiment id '${candidate.id}'.`);
    seen.add(candidate.id);
  }

  const eligible: ResearchExperimentResult[] = [];
  const notSelected: ResearchRoundSelection['notSelected'] = [];
  for (const candidate of candidates) {
    const reason = rejectionReason(candidate, options.authenticateReview);
    if (reason) notSelected.push({ id: candidate.id, reason });
    else eligible.push(candidate);
  }

  eligible.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const selected = eligible.slice(0, maxAdvance);
  for (const excluded of eligible.slice(maxAdvance)) {
    notSelected.push({ id: excluded.id, reason: 'bounded-round-capacity' });
  }
  return { selected, notSelected };
}
