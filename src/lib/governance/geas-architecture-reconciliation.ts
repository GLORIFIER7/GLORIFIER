import { createHash } from 'node:crypto';

export type ArchitectureState = 'desired' | 'declared' | 'deployed' | 'observed' | 'verified';
export type ReconciliationStatus = 'ALIGNED' | 'PARTIALLY_VERIFIED' | 'DRIFT' | 'UNKNOWN';

export interface StateEvidence {
  refs: string[];
  observedAt: string;
  validUntil: string;
  /** SHA-256 of the canonicalized state snapshot this evidence is intended to support. */
  snapshotHash: string;
}

export interface ReconciliationInput {
  resourceId: string;
  desired?: Record<string, unknown> | null;
  declared?: Record<string, unknown> | null;
  deployed?: Record<string, unknown> | null;
  observed?: Record<string, unknown> | null;
  verified?: Record<string, unknown> | null;
  /** Legacy aggregate references are retained for traceability but never satisfy per-state evidence. */
  evidenceRefs?: string[];
  evidenceByState?: Partial<Record<ArchitectureState, StateEvidence>>;
}

export interface ReconciliationResult {
  resourceId: string;
  status: ReconciliationStatus;
  comparedStates: ArchitectureState[];
  mismatches: Array<{ expectedState: ArchitectureState; actualState: ArchitectureState; keys: string[] }>;
  evidenceRefs: string[];
  reason: string;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return '{' + Object.keys(object).sort().map((key) => JSON.stringify(key) + ':' + canonical(object[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'undefined';
}

/** Stable SHA-256 binding for JSON-like architecture state snapshots; not a signature or proof of truth. */
export function hashArchitectureSnapshot(snapshot: Record<string, unknown>): string {
  return createHash('sha256').update(canonical(snapshot), 'utf8').digest('hex');
}

function sharedMismatchedKeys(left: Record<string, unknown>, right: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
    .filter((key) => !(key in left) || !(key in right) || canonical(left[key]) !== canonical(right[key]));
}

function isFreshStateEvidence(
  evidence: StateEvidence | undefined,
  snapshot: Record<string, unknown> | null | undefined,
  nowMs: number,
): evidence is StateEvidence {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  if (!evidence || !Array.isArray(evidence.refs) || evidence.refs.length === 0
      || evidence.refs.some((ref) => typeof ref !== 'string' || !ref.trim())) return false;
  if (typeof evidence.snapshotHash !== 'string' || !/^[a-f0-9]{64}$/i.test(evidence.snapshotHash)) return false;
  if (hashArchitectureSnapshot(snapshot) !== evidence.snapshotHash.toLowerCase()) return false;
  const observedAt = Date.parse(evidence.observedAt);
  const validUntil = Date.parse(evidence.validUntil);
  return Number.isFinite(observedAt) && Number.isFinite(validUntil)
    && observedAt <= nowMs && validUntil > nowMs && validUntil >= observedAt;
}

/**
 * Reconciles explicit snapshots only. Every state needs its own fresh evidence.
 * This gate validates evidence metadata, not the external evidence's semantic truth.
 */
export function reconcileArchitectureStates(input: ReconciliationInput, now: Date = new Date()): ReconciliationResult {
  const states: ArchitectureState[] = ['desired', 'declared', 'deployed', 'observed', 'verified'];
  const supplied = states.filter((state) => {
    const value = input[state];
    return !!value && typeof value === 'object' && !Array.isArray(value);
  });
  const stateEvidence = states.map((state) => ({ state, evidence: input.evidenceByState?.[state], snapshot: input[state] }));
  const allStateEvidenceFresh = stateEvidence.every(({ evidence, snapshot }) =>
    isFreshStateEvidence(evidence, snapshot, now.getTime()));
  const evidenceRefs = [...new Set([
    ...(input.evidenceRefs ?? []).filter((ref) => typeof ref === 'string' && ref.trim()),
    ...stateEvidence.flatMap(({ evidence }) => evidence?.refs ?? []),
  ])];
  const mismatches: ReconciliationResult['mismatches'] = [];

  for (let i = 1; i < states.length; i++) {
    const expectedState = states[i - 1];
    const actualState = states[i];
    const left = input[expectedState];
    const right = input[actualState];
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) || Array.isArray(right)) continue;
    const keys = sharedMismatchedKeys(left, right);
    if (keys.length) mismatches.push({ expectedState, actualState, keys });
  }

  let status: ReconciliationStatus;
  let reason: string;
  if (supplied.length < states.length) {
    status = 'UNKNOWN';
    reason = 'One or more architecture states are missing; no alignment or drift is inferred.';
  } else if (!allStateEvidenceFresh) {
    status = 'UNKNOWN';
    reason = 'Each architecture state requires fresh timestamped evidence references and a SHA-256 snapshot hash matching that state.';
  } else if (mismatches.length) {
    status = 'DRIFT';
    reason = 'Adjacent architecture states differ and each state has fresh evidence metadata; validate evidence content before acting.';
  } else {
    status = 'ALIGNED';
    reason = 'All five supplied states match and each state has fresh evidence metadata; external verification must still validate evidence content.';
  }

  return { resourceId: input.resourceId, status, comparedStates: supplied, mismatches, evidenceRefs, reason };
}
