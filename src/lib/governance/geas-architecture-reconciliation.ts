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

function canonical(value: unknown, ancestors = new WeakSet<object>()): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Architecture snapshots must contain only finite JSON numbers.');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new TypeError('Architecture snapshots must contain only JSON-compatible values; undefined, functions, symbols, and bigint are not supported.');
  }
  if (ancestors.has(value)) throw new TypeError('Architecture snapshots must not contain circular references.');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return '[' + value.map((item) => canonical(item, ancestors)).join(',') + ']';
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Architecture snapshots must contain only plain JSON objects.');
    }
    const object = value as Record<string, unknown>;
    return '{' + Object.keys(object).sort().map((key) => JSON.stringify(key) + ':' + canonical(object[key], ancestors)).join(',') + '}';
  } finally {
    ancestors.delete(value);
  }
}

/** Stable SHA-256 binding for JSON-compatible architecture state snapshots; not a signature or proof of truth. */
export function hashArchitectureSnapshot(snapshot: Record<string, unknown>): string {
  return createHash('sha256').update(canonical(snapshot), 'utf8').digest('hex');
}

function canonicalOrNull(value: unknown): string | null {
  try {
    return canonical(value);
  } catch {
    return null;
  }
}

function sharedMismatchedKeys(left: Record<string, unknown>, right: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
    .filter((key) => {
      if (!(key in left) || !(key in right)) return true;
      const leftValue = canonicalOrNull(left[key]);
      const rightValue = canonicalOrNull(right[key]);
      return leftValue === null || rightValue === null || leftValue !== rightValue;
    });
}

/**
 * Parse the supported RFC 3339 timestamp subset used by GEAS state evidence.
 * An explicit UTC offset is required; loose Date.parse formats are not evidence timestamps.
 * Leap-second notation is intentionally rejected because JavaScript Date cannot represent it.
 */
function parseRfc3339Timestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(?:\\.(\\d+))?(Z|[+-]\\d{2}:\\d{2})$/i.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const daysInMonth = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > (daysInMonth[month - 1] ?? 0)
      || hour > 23 || minute > 59 || second > 59) return null;

  const offset = match[8];
  if (offset.toUpperCase() !== 'Z') {
    const [offsetHour, offsetMinute] = offset.slice(1).split(':').map(Number);
    if (offsetHour > 23 || offsetMinute > 59) return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
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
  let computedHash: string;
  try {
    computedHash = hashArchitectureSnapshot(snapshot);
  } catch {
    return false;
  }
  if (computedHash !== evidence.snapshotHash.toLowerCase()) return false;
  const observedAt = parseRfc3339Timestamp(evidence.observedAt);
  const validUntil = parseRfc3339Timestamp(evidence.validUntil);
  return observedAt !== null && validUntil !== null
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
    ...stateEvidence.flatMap(({ evidence }) => Array.isArray(evidence?.refs)
      ? evidence.refs.filter((ref) => typeof ref === 'string' && ref.trim())
      : []),
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
