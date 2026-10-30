/**
 * Claim-level evidence admission for GEAS.
 *
 * Source availability, keyword matches, and model-generated summaries are not
 * claim verification. A supported review must bind to the exact source snapshot
 * and excerpt. This deterministic gate checks integrity and structure; it does
 * not authenticate reviewer identity or decide semantic truth.
 */
import { createHash } from 'node:crypto';

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

function normalizeSourceResource(value: URL): string {
  const pathname = value.pathname.length > 1 ? value.pathname.replace(/\/+$/, '') : value.pathname;
  return value.origin + pathname + value.search;
}

function normalizeExcerpt(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Parse the supported RFC 3339 timestamp subset used by evidence records.
 * An explicit UTC offset is required; loose Date.parse formats are not evidence timestamps.
 * Leap-second notation is intentionally rejected because JavaScript Date cannot represent it.
 */
function parseRfc3339Timestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
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

/** Deterministic integrity and source-registry gate; reviewer authentication and semantic truth are external. */
export function validateClaimReview(
  record: Partial<ClaimReviewRecord>,
  registry: ClaimSourceRegistry,
  nowMs: number = Date.now(),
): ClaimReviewResult {
  const failures: string[] = [];
  if (!Number.isFinite(nowMs)) failures.push('validation clock must be a finite timestamp');
  const required: Array<keyof ClaimReviewRecord> = [
    'claimId', 'claim', 'claimType', 'sourceId', 'sourceRegistryVersion', 'canonicalSourceUrl', 'observedSourceUrl',
    'observedAt', 'sourceSnapshot', 'sourceContentHash', 'supportingExcerpt', 'reviewer', 'decision', 'rationale',
  ];
  for (const key of required) {
    if (typeof record[key] !== 'string' || !(record[key] as string).trim()) {
      failures.push(`missing required field: ${key}`);
    }
  }

  const safeHttps = (value: unknown): URL | null => {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url : null;
    } catch {
      return null;
    }
  };
  const canonical = safeHttps(record.canonicalSourceUrl);
  const observed = safeHttps(record.observedSourceUrl);
  if (!canonical) failures.push('canonicalSourceUrl must be HTTPS without credentials');
  if (!observed) failures.push('observedSourceUrl must be HTTPS without credentials');
  if (canonical && observed && canonical.hostname !== observed.hostname) {
    failures.push('observed source host differs from the curated canonical source host');
  }
  // Same-host URLs can still identify different documents. Bind the observed
  // resource to the registry path and query; ignore fragments and harmless trailing slashes.
  if (canonical && observed && canonical.hostname === observed.hostname
      && normalizeSourceResource(canonical) !== normalizeSourceResource(observed)) {
    failures.push('observedSourceUrl does not match the curated canonical source resource');
  }

  let sourcePolicyDigest: string | null = null;

  // Registry membership and claim scope are prerequisites for admission, not proof of truth.
  if (!registry || typeof registry.version !== 'string' || !registry.version.trim() || !Array.isArray(registry.sources)) {
    failures.push('trusted source registry with version and sources is required');
  } else {
    if (typeof record.sourceRegistryVersion === 'string' && record.sourceRegistryVersion !== registry.version) {
      failures.push('sourceRegistryVersion does not match the trusted source registry');
    }
    const matches = registry.sources.filter((source) => source && source.id === record.sourceId);
    if (matches.length !== 1) {
      failures.push('sourceId must resolve to exactly one trusted source registry entry');
    } else {
      const trustedSource = matches[0];
      // Bind the evidence reference to the exact source-specific policy used for admission.
      sourcePolicyDigest = createHash('sha256').update(JSON.stringify({
        id: trustedSource.id,
        url: trustedSource.url,
        claimsAllowed: Array.isArray(trustedSource.claimsAllowed)
          ? [...trustedSource.claimsAllowed].sort((left, right) => left.localeCompare(right, 'en'))
          : trustedSource.claimsAllowed,
        reviewCadenceDays: trustedSource.reviewCadenceDays,
      })).digest('hex');
      const trustedCanonical = safeHttps(trustedSource.url);
      if (!trustedCanonical) {
        failures.push('trusted source registry URL must be valid HTTPS without credentials');
      } else if (canonical && trustedCanonical.href !== canonical.href) {
        failures.push('canonicalSourceUrl does not match the trusted source registry');
      }
      if (!Array.isArray(trustedSource.claimsAllowed) || trustedSource.claimsAllowed.length === 0
          || !trustedSource.claimsAllowed.every((claimType: unknown) => typeof claimType === 'string' && claimType.trim().length > 0)) {
        failures.push('trusted source claimsAllowed must be a non-empty string array');
      } else if (typeof record.claimType === 'string' && !trustedSource.claimsAllowed.includes(record.claimType)) {
        failures.push(`claimType ${record.claimType} is not allowed by the trusted source registry`);
      }
      if (!Number.isInteger(trustedSource.reviewCadenceDays) || trustedSource.reviewCadenceDays < 1) {
        failures.push('trusted source reviewCadenceDays must be a positive integer');
      } else if (typeof record.observedAt === 'string') {
        const observedAtMs = parseRfc3339Timestamp(record.observedAt);
        if (observedAtMs !== null && Number.isFinite(nowMs)) {
          if (observedAtMs > nowMs) {
            failures.push('observedAt cannot be in the future');
          } else if (nowMs - observedAtMs > trustedSource.reviewCadenceDays * 86_400_000) {
            failures.push('source observation is older than the trusted source review cadence');
          }
        }
      }
    }
  }

  if (typeof record.observedAt === 'string' && parseRfc3339Timestamp(record.observedAt) === null) {
    failures.push('observedAt must be a supported RFC 3339 timestamp with an explicit UTC offset (seconds 00–59)');
  }
  if (typeof record.sourceContentHash === 'string' && !/^[a-f0-9]{64}$/i.test(record.sourceContentHash)) {
    failures.push('sourceContentHash must be a SHA-256 hex digest');
  }
  if (typeof record.sourceSnapshot === 'string' && typeof record.sourceContentHash === 'string'
      && /^[a-f0-9]{64}$/i.test(record.sourceContentHash)) {
    const actualHash = createHash('sha256').update(record.sourceSnapshot, 'utf8').digest('hex');
    if (actualHash.toLowerCase() !== record.sourceContentHash.toLowerCase()) {
      failures.push('sourceContentHash does not match sourceSnapshot');
    }
  }
  if (typeof record.sourceSnapshot === 'string' && typeof record.supportingExcerpt === 'string'
      && record.supportingExcerpt.trim()
      && !normalizeExcerpt(record.sourceSnapshot).includes(normalizeExcerpt(record.supportingExcerpt))) {
    failures.push('supportingExcerpt is not present in sourceSnapshot after whitespace normalization');
  }
  if (record.decision !== 'supported' && record.decision !== 'contradicted' && record.decision !== 'insufficient') {
    failures.push('decision must be an explicit reviewer decision');
  }
  if (typeof record.supportingExcerpt === 'string' && record.supportingExcerpt.length > 12000) {
    failures.push('supportingExcerpt exceeds the 12,000 character review limit');
  }
  if (typeof record.sourceSnapshot === 'string' && record.sourceSnapshot.length > 2_000_000) {
    failures.push('sourceSnapshot exceeds the 2,000,000 character admission limit');
  }

  const admissible = failures.length === 0 && record.decision === 'supported';
  const evidenceRef = admissible
    ? 'claim-review-' + createHash('sha256').update(JSON.stringify({
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
      })).digest('hex').slice(0, 24)
    : null;

  return {
    admissible,
    decision: failures.length ? 'unknown' : record.decision!,
    evidenceRef,
    failures,
  };
}
