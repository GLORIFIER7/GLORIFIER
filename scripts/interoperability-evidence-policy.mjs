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

function normalizeEnvironment(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function matchesTargetEnvironment(evidenceEnvironment, targetEnvironments) {
  if (typeof evidenceEnvironment !== 'string' || !evidenceEnvironment.trim()) return false;
  if (!Array.isArray(targetEnvironments) || targetEnvironments.length === 0) return false;
  const evidence = normalizeEnvironment(evidenceEnvironment);
  if (!evidence) return false;
  return targetEnvironments.some((target) => {
    if (typeof target !== 'string' || !target.trim()) return false;
    const declared = normalizeEnvironment(target);
    return declared.length > 0 && (evidence.includes(declared) || declared.includes(evidence));
  });
}
