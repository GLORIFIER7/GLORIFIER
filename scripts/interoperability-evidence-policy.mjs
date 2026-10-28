export const LIVE_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function isEvidenceTimestampFresh(observedAt, {
  live = false,
  now = Date.now(),
  maxAgeMs = LIVE_EVIDENCE_MAX_AGE_MS,
  futureClockSkewMs = FUTURE_CLOCK_SKEW_MS,
} = {}) {
  if (typeof observedAt !== 'string' || !observedAt.trim()) return false;
  const timestamp = Date.parse(observedAt);
  if (!Number.isFinite(timestamp)) return false;
  const ageMs = now - timestamp;
  if (ageMs < -futureClockSkewMs) return false;
  return !live || ageMs <= maxAgeMs;
}

