/**
 * Claim-level evidence admission for GEAS.
 *
 * Source availability, keyword matches, and model-generated summaries are not
 * claim verification. A supported review must bind to the exact source snapshot
 * and excerpt. This deterministic gate checks integrity and structure; it does
 * not authenticate reviewer identity or decide semantic truth.
 */
import { createHash } from 'node:crypto';
import { compareCodeUnits } from '../deterministic-string-order';

export type ClaimReviewDecision = 'supported' | 'contradicted' | 'insufficient';

export interface ClaimReviewRecord {
  claimId: string;
  claim: string;
  claimType: string;
  sourceId: string;
  sourceRegistryVersion: string;
  canonicalSourceUrl: string;
  observedSourceUrl: string;
  observedAt: string;
  sourceSnapshot: string;
  sourceContentHash: string;
  supportingExcerpt: string;
  reviewer: string;
  decision: ClaimReviewDecision;
  rationale: string;
}

export interface ClaimReviewSource {
  id: string;
  url: string;
  claimsAllowed: readonly string[];
  reviewCadenceDays: number;
  scannerStatus: 'active' | 'discovery-only';
}

export interface ClaimSourceRegistry {
  version: string;
  sources: readonly ClaimReviewSource[];
}

export interface ClaimReviewResult {
  admissible: boolean;
  decision: ClaimReviewDecision | 'unknown';
  evidenceRef: string | null;
  failures: string[];
}

const REQUIRED_REVIEW_FIELDS: readonly (keyof ClaimReviewRecord)[] = [
  'claimId', 'claim', 'claimType', 'sourceId', 'sourceRegistryVersion', 'canonicalSourceUrl', 'observedSourceUrl',
  'observedAt', 'sourceSnapshot', 'sourceContentHash', 'supportingExcerpt', 'reviewer', 'decision', 'rationale',
];

const RFC3339_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/i;
const DAYS_PER_MILLISECOND = 86_400_000;

const normalizeSourceResource = (value: URL): string => {
  const pathname = value.pathname.length > 1 ? value.pathname.replace(/\/+$/, '') : value.pathname;
  return `${value.origin}${pathname}${value.search}`;
};

const normalizeExcerpt = (value: string): string => value.replace(/\s+/g, ' ').trim();

const isSafeHttpsUrl = (url: URL): boolean =>
  url.protocol === 'https:' && !url.username && !url.password;

const parseSafeHttpsUrl = (value: unknown): URL | null => {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return isSafeHttpsUrl(url) ? url : null;
  } catch {
    return null;
  }
};

const isLeapYear = (year: number): boolean => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const isValidMonth = (month: number): boolean => month >= 1 && month <= 12;

const daysInCalendarMonth = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  const daysInMonth = [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return daysInMonth[month - 1] ?? 0;
};

const isValidCalendarDate = (year: number, month: number, day: number): boolean =>
  isValidMonth(month) && day >= 1 && day <= daysInCalendarMonth(year, month);

const isValidClockTime = (hour: number, minute: number, second: number): boolean =>
  hour <= 23 && minute <= 59 && second <= 59;

const isKnownUtcOffset = (offset: string): boolean => {
  if (offset === '-00:00') return false;
  if (offset.toUpperCase() === 'Z') return true;
  const [offsetHour, offsetMinute] = offset.slice(1).split(':').map(Number);
  return offsetHour <= 23 && offsetMinute <= 59;
};

/**
 * Parse the supported RFC 3339 timestamp subset used by evidence records.
 * An explicit known UTC offset is required; loose Date.parse formats are not evidence timestamps.
 * Leap-second notation is intentionally rejected because JavaScript Date cannot represent it.
 */
const parseRfc3339TimestampParts = (value: string): RegExpExecArray | null => {
  const match = RFC3339_TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (!isValidCalendarDate(year, month, day)
      || !isValidClockTime(hour, minute, second)
      || !isKnownUtcOffset(match[8])) return null;
  return match;
};

/**
 * Parse the supported RFC 3339 timestamp subset used by evidence records.
 * An explicit known UTC offset is required; loose Date.parse formats are not evidence timestamps.
 * Leap-second notation is intentionally rejected because JavaScript Date cannot represent it.
 */
const parseRfc3339Timestamp = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  if (!parseRfc3339TimestampParts(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const isClaimReviewDecision = (value: unknown): value is ClaimReviewDecision =>
  value === 'supported' || value === 'contradicted' || value === 'insufficient';

const validateValidationClock = (nowMs: number, failures: string[]): void => {
  if (!Number.isFinite(nowMs)) failures.push('validation clock must be a finite timestamp');
};

const validateDecision = (decision: unknown, failures: string[]): void => {
  if (!isClaimReviewDecision(decision)) failures.push('decision must be an explicit reviewer decision');
};

const validateRequiredFields = (record: Partial<ClaimReviewRecord>, failures: string[]): void => {
  for (const key of REQUIRED_REVIEW_FIELDS) {
    if (typeof record[key] !== 'string' || !(record[key] as string).trim()) {
      failures.push(`missing required field: ${key}`);
    }
  }
};

const validateObservedSourceIdentity = (
  canonical: URL,
  observed: URL,
  failures: string[],
): void => {
  if (canonical.hostname !== observed.hostname) {
    failures.push('observed source host differs from the curated canonical source host');
  } else if (normalizeSourceResource(canonical) !== normalizeSourceResource(observed)) {
    // Same-host URLs can still identify different documents. Bind the observed
    // resource to the registry path and query; ignore fragments and harmless trailing slashes.
    failures.push('observedSourceUrl does not match the curated canonical source resource');
  }
};

const validateSourceUrls = (
  record: Partial<ClaimReviewRecord>,
  failures: string[],
): { canonical: URL | null; observed: URL | null } => {
  const canonical = parseSafeHttpsUrl(record.canonicalSourceUrl);
  const observed = parseSafeHttpsUrl(record.observedSourceUrl);
  if (!canonical) failures.push('canonicalSourceUrl must be HTTPS without credentials');
  if (!observed) failures.push('observedSourceUrl must be HTTPS without credentials');
  if (canonical && observed) validateObservedSourceIdentity(canonical, observed, failures);
  return { canonical, observed };
};

const isValidSourceRegistry = (registry: ClaimSourceRegistry): boolean =>
  Boolean(registry)
  && typeof registry.version === 'string'
  && registry.version.trim().length > 0
  && Array.isArray(registry.sources);

const findUniqueTrustedSource = (
  record: Partial<ClaimReviewRecord>,
  registry: ClaimSourceRegistry,
  failures: string[],
): ClaimReviewSource | null => {
  const matches = registry.sources.filter((source) => source && source.id === record.sourceId);
  if (matches.length !== 1) {
    failures.push('sourceId must resolve to exactly one trusted source registry entry');
    return null;
  }
  return matches[0];
};

const resolveTrustedSource = (
  record: Partial<ClaimReviewRecord>,
  registry: ClaimSourceRegistry,
  failures: string[],
): ClaimReviewSource | null => {
  if (!isValidSourceRegistry(registry)) {
    failures.push('trusted source registry with version and sources is required');
    return null;
  }
  if (typeof record.sourceRegistryVersion === 'string' && record.sourceRegistryVersion !== registry.version) {
    failures.push('sourceRegistryVersion does not match the trusted source registry');
  }
  return findUniqueTrustedSource(record, registry, failures);
};

const createSourcePolicyDigest = (source: ClaimReviewSource): string => createHash('sha256').update(JSON.stringify({
  id: source.id,
  url: source.url,
  scannerStatus: source.scannerStatus,
  claimsAllowed: Array.isArray(source.claimsAllowed)
    ? [...source.claimsAllowed].sort(compareCodeUnits)
    : source.claimsAllowed,
  reviewCadenceDays: source.reviewCadenceDays,
})).digest('hex');

const validateTrustedSourceUrl = (
  source: ClaimReviewSource,
  canonical: URL | null,
  failures: string[],
): void => {
  const trustedCanonical = parseSafeHttpsUrl(source.url);
  if (!trustedCanonical) {
    failures.push('trusted source registry URL must be valid HTTPS without credentials');
  } else if (canonical && trustedCanonical.href !== canonical.href) {
    failures.push('canonicalSourceUrl does not match the trusted source registry');
  }
};

const hasValidClaimAllowance = (claimsAllowed: readonly string[]): boolean =>
  Array.isArray(claimsAllowed)
  && claimsAllowed.length > 0
  && claimsAllowed.every((allowed: unknown) => typeof allowed === 'string' && allowed.trim().length > 0);

const validateTrustedClaimAllowance = (
  source: ClaimReviewSource,
  claimType: unknown,
  failures: string[],
): void => {
  if (!hasValidClaimAllowance(source.claimsAllowed)) {
    failures.push('trusted source claimsAllowed must be a non-empty string array');
    return;
  }
  if (typeof claimType === 'string' && !source.claimsAllowed.includes(claimType)) {
    failures.push(`claimType ${claimType} is not allowed by the trusted source registry`);
  }
};

const getObservationAgeMs = (observedAt: unknown, nowMs: number): number | null => {
  if (typeof observedAt !== 'string' || !Number.isFinite(nowMs)) return null;
  const observedAtMs = parseRfc3339Timestamp(observedAt);
  return observedAtMs === null ? null : nowMs - observedAtMs;
};

const validateSourceFreshness = (
  source: ClaimReviewSource,
  observedAt: unknown,
  nowMs: number,
  failures: string[],
): void => {
  if (!Number.isInteger(source.reviewCadenceDays) || source.reviewCadenceDays < 1) {
    failures.push('trusted source reviewCadenceDays must be a positive integer');
    return;
  }
  const ageMs = getObservationAgeMs(observedAt, nowMs);
  if (ageMs === null) return;
  if (ageMs < 0) {
    failures.push('observedAt cannot be in the future');
  } else if (ageMs > source.reviewCadenceDays * DAYS_PER_MILLISECOND) {
    failures.push('source observation is older than the trusted source review cadence');
  }
};

const validateTrustedSource = (
  source: ClaimReviewSource | null,
  record: Partial<ClaimReviewRecord>,
  canonical: URL | null,
  nowMs: number,
  failures: string[],
): string | null => {
  if (!source) return null;
  if (source.scannerStatus !== 'active') {
    failures.push('trusted source must have scannerStatus active; discovery-only sources cannot admit claims');
  }
  const policyDigest = createSourcePolicyDigest(source);
  validateTrustedSourceUrl(source, canonical, failures);
  validateTrustedClaimAllowance(source, record.claimType, failures);
  validateSourceFreshness(source, record.observedAt, nowMs, failures);
  return policyDigest;
};

const validateObservedTimestamp = (value: unknown, failures: string[]): void => {
  if (typeof value === 'string' && parseRfc3339Timestamp(value) === null) {
    failures.push('observedAt must be a supported RFC 3339 timestamp with an explicit known UTC offset (seconds 00–59)');
  }
};

const isSha256HexDigest = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);

const validateSourceContentHashFormat = (value: unknown, failures: string[]): void => {
  if (typeof value === 'string' && !isSha256HexDigest(value)) {
    failures.push('sourceContentHash must be a SHA-256 hex digest');
  }
};

const validateSnapshotDigest = (
  snapshot: unknown,
  contentHash: unknown,
  failures: string[],
): void => {
  if (typeof snapshot !== 'string' || !isSha256HexDigest(contentHash)) return;
  const actualHash = createHash('sha256').update(snapshot, 'utf8').digest('hex');
  if (actualHash.toLowerCase() !== contentHash.toLowerCase()) {
    failures.push('sourceContentHash does not match sourceSnapshot');
  }
};

const validateSupportingExcerpt = (snapshot: unknown, excerpt: unknown, failures: string[]): void => {
  if (typeof snapshot !== 'string' || typeof excerpt !== 'string' || !excerpt.trim()) return;
  if (!normalizeExcerpt(snapshot).includes(normalizeExcerpt(excerpt))) {
    failures.push('supportingExcerpt is not present in sourceSnapshot after whitespace normalization');
  }
};

const validateSourceSnapshot = (record: Partial<ClaimReviewRecord>, failures: string[]): void => {
  validateSourceContentHashFormat(record.sourceContentHash, failures);
  validateSnapshotDigest(record.sourceSnapshot, record.sourceContentHash, failures);
  validateSupportingExcerpt(record.sourceSnapshot, record.supportingExcerpt, failures);
};

const validateReviewLimits = (record: Partial<ClaimReviewRecord>, failures: string[]): void => {
  if (typeof record.supportingExcerpt === 'string' && record.supportingExcerpt.length > 12000) {
    failures.push('supportingExcerpt exceeds the 12,000 character review limit');
  }
  if (typeof record.sourceSnapshot === 'string' && record.sourceSnapshot.length > 2_000_000) {
    failures.push('sourceSnapshot exceeds the 2,000,000 character admission limit');
  }
};

const createEvidenceReference = (
  record: Partial<ClaimReviewRecord>,
  sourcePolicyDigest: string | null,
): string => {
  const digest = createHash('sha256').update(JSON.stringify({
    claimId: record.claimId,
    claim: record.claim,
    claimType: record.claimType,
    sourceId: record.sourceId,
    sourceRegistryVersion: record.sourceRegistryVersion,
    sourcePolicyDigest,
    canonicalSourceUrl: record.canonicalSourceUrl,
    observedSourceUrl: record.observedSourceUrl,
    observedAt: record.observedAt,
    sourceContentHash: record.sourceContentHash,
    supportingExcerpt: record.supportingExcerpt,
    reviewer: record.reviewer,
    decision: record.decision,
    rationale: record.rationale,
  })).digest('hex').slice(0, 24);
  return `claim-review-${digest}`;
};

/** Deterministic integrity and source-registry gate; reviewer authentication and semantic truth are external. */
const createClaimReviewResult = (
  record: Partial<ClaimReviewRecord>,
  sourcePolicyDigest: string | null,
  failures: string[],
): ClaimReviewResult => {
  const admissible = failures.length === 0 && record.decision === 'supported';
  const decision = failures.length === 0 && isClaimReviewDecision(record.decision)
    ? record.decision
    : 'unknown';
  return {
    admissible,
    decision,
    evidenceRef: admissible ? createEvidenceReference(record, sourcePolicyDigest) : null,
    failures,
  };
};

/** Deterministic integrity and source-registry gate; reviewer authentication and semantic truth are external. */
export const validateClaimReview = (
  record: Partial<ClaimReviewRecord>,
  registry: ClaimSourceRegistry,
  nowMs: number = Date.now(),
): ClaimReviewResult => {
  const failures: string[] = [];
  validateValidationClock(nowMs, failures);
  validateRequiredFields(record, failures);
  const { canonical } = validateSourceUrls(record, failures);
  const trustedSource = resolveTrustedSource(record, registry, failures);
  const sourcePolicyDigest = validateTrustedSource(trustedSource, record, canonical, nowMs, failures);
  validateObservedTimestamp(record.observedAt, failures);
  validateSourceSnapshot(record, failures);
  validateReviewLimits(record, failures);
  validateDecision(record.decision, failures);
  return createClaimReviewResult(record, sourcePolicyDigest, failures);
};

export const validateClaimReview = (
  record: Partial<ClaimReviewRecord>,
  registry: ClaimSourceRegistry,
  nowMs: number = Date.now(),
): ClaimReviewResult => {
  const failures: string[] = [];
  if (!Number.isFinite(nowMs)) failures.push('validation clock must be a finite timestamp');
  validateRequiredFields(record, failures);
  const { canonical } = validateSourceUrls(record, failures);
  const trustedSource = resolveTrustedSource(record, registry, failures);
  const sourcePolicyDigest = validateTrustedSource(trustedSource, record, canonical, nowMs, failures);
  validateObservedTimestamp(record.observedAt, failures);
  validateSourceSnapshot(record, failures);
  validateReviewLimits(record, failures);
  if (!isClaimReviewDecision(record.decision)) failures.push('decision must be an explicit reviewer decision');

  const admissible = failures.length === 0 && record.decision === 'supported';
  return {
    admissible,
    decision: failures.length || !isClaimReviewDecision(record.decision) ? 'unknown' : record.decision,
    evidenceRef: admissible ? createEvidenceReference(record, sourcePolicyDigest) : null,
    failures,
  };
};
