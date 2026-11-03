import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compareCodeUnits } from '../deterministic-string-order';
import { readFileSync } from 'node:fs';
import { validateClaimReview, type ClaimReviewRecord, type ClaimSourceRegistry } from './geas-claim-verification';
import test from 'node:test';

const registry = JSON.parse(
  readFileSync(new URL('../../../docs/architecture/geas-authoritative-source-registry.json', import.meta.url), 'utf8'),
) as ClaimSourceRegistry;
const trustedSource = registry.sources.find((source) => source.id === 'nist-ai-rmf');
if (!trustedSource) throw new Error('The curated registry must include nist-ai-rmf for this test.');
const sourceSnapshot = 'The specification defines a versioned interface. Additional source context.';
const sourceContentHash = createHash('sha256').update(sourceSnapshot, 'utf8').digest('hex');
const valid: ClaimReviewRecord = {
  claimId: 'claim-example',
  claim: 'The standard defines a versioned interface.',
  claimType: 'ai-risk-governance',
  sourceId: trustedSource.id,
  sourceRegistryVersion: registry.version,
  canonicalSourceUrl: trustedSource.url,
  observedSourceUrl: trustedSource.url,
  observedAt: '2026-10-18T12:00:00.000Z',
  sourceSnapshot,
  sourceContentHash,
  supportingExcerpt: 'The specification defines a versioned interface.',
  reviewer: 'human-reviewer',
  decision: 'supported',
  rationale: 'The cited excerpt directly supports the bounded claim.',
};
const fixedNowMs = Date.parse('2026-10-26T13:00:00.000Z');
const review = (
  record: Partial<ClaimReviewRecord>,
  sourceRegistry: ClaimSourceRegistry = registry,
  nowMs: number = fixedNowMs,
) => validateClaimReview(record, sourceRegistry, nowMs);

function localeExpectedEvidenceRef(source: ClaimSourceRegistry['sources'][number], record: ClaimReviewRecord): string {
  const policyDigest = createHash('sha256').update(JSON.stringify({
    id: source.id,
    url: source.url,
    scannerStatus: source.scannerStatus,
    claimsAllowed: [...source.claimsAllowed].sort(compareCodeUnits),
    reviewCadenceDays: source.reviewCadenceDays,
  })).digest('hex');
  const claimDigest = createHash('sha256').update(JSON.stringify({
    claimId: record.claimId,
    claim: record.claim,
    claimType: record.claimType,
    sourceId: record.sourceId,
    sourceRegistryVersion: record.sourceRegistryVersion,
    sourcePolicyDigest: policyDigest,
    canonicalSourceUrl: record.canonicalSourceUrl,
    observedSourceUrl: record.observedSourceUrl,
    observedAt: record.observedAt,
    sourceContentHash: record.sourceContentHash,
    supportingExcerpt: record.supportingExcerpt,
    reviewer: record.reviewer,
    decision: record.decision,
    rationale: record.rationale,
  })).digest('hex').slice(0, 24);
  return `claim-review-${claimDigest}`;
}

test('a well-formed trusted-source review passes record-integrity admission only', () => {
  const result = review(valid);
  assert.equal('admissible' in result, false);
  assert.equal(result.recordIntegrityAdmitted, true);
  assert.equal(result.admissionScope, 'record-integrity-only');
  assert.equal(result.reviewerIdentityStatus, 'not-authenticated');
  assert.equal(result.semanticTruthStatus, 'not-verified');
  assert.match(result.evidenceRef ?? '', /^claim-review-[a-f0-9]{24}$/);
});

test('discovery-only sources cannot admit claims', () => {
  const source = registry.sources.find((entry) => entry.id === 'owasp-agentic-applications-top10');
  assert.ok(source);
  const claimType = source.claimsAllowed[0];
  assert.ok(claimType);
  const snapshot = 'OWASP agentic application risk overview for discovery.';
  const result = review({
    ...valid,
    claim: 'An agentic application risk may be identified for discovery.',
    claimType, sourceId: source.id, canonicalSourceUrl: source.url, observedSourceUrl: source.url,
    sourceSnapshot: snapshot, sourceContentHash: createHash('sha256').update(snapshot, 'utf8').digest('hex'),
    supportingExcerpt: snapshot,
  });
  assert.equal(result.recordIntegrityAdmitted, false);
  assert.equal(result.evidenceRef, null);
});

test('unknown and missing scanner status fail closed', () => {
  const unknown = { ...registry, sources: registry.sources.map((source) =>
    source.id === trustedSource.id ? { ...source, scannerStatus: 'unknown' } : source) } as unknown as ClaimSourceRegistry;
  const unknownResult = review(valid, unknown);
  assert.equal(unknownResult.recordIntegrityAdmitted, false);
  assert.equal(unknownResult.evidenceRef, null);
  const missing = { ...registry, sources: registry.sources.map((source) => {
    if (source.id !== trustedSource.id) return source;
    return Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'scannerStatus'));
  }) } as unknown as ClaimSourceRegistry;
  const missingResult = review(valid, missing);
  assert.equal(missingResult.recordIntegrityAdmitted, false);
  assert.equal(missingResult.evidenceRef, null);
});

test('future source observations and invalid review cadence are rejected', () => {
  const future = review({ ...valid, observedAt: new Date(fixedNowMs + 1).toISOString() });
  assert.equal(future.recordIntegrityAdmitted, false);
  assert.ok(future.failures.some((failure) => failure.includes('cannot be in the future')));
  assert.equal(future.evidenceRef, null);
  const invalidCadence = {
    ...registry,
    sources: registry.sources.map((source) => source.id === trustedSource.id
      ? { ...source, reviewCadenceDays: 0 } : source),
  };
  const invalid = review(valid, invalidCadence);
  assert.equal(invalid.recordIntegrityAdmitted, false);
  assert.ok(invalid.failures.some((failure) => failure.includes('reviewCadenceDays')));
  assert.equal(invalid.evidenceRef, null);
});

test('source review cadence accepts its exact freshness boundary and rejects stale evidence', () => {
  const oneDayCadence = {
    ...registry,
    sources: registry.sources.map((source) => source.id === trustedSource.id
      ? { ...source, reviewCadenceDays: 1 } : source),
  };
  const boundary = review({ ...valid, observedAt: new Date(fixedNowMs - 86_400_000).toISOString() }, oneDayCadence);
  assert.equal(boundary.recordIntegrityAdmitted, true);
  const stale = review({ ...valid, observedAt: new Date(fixedNowMs - 86_400_001).toISOString() }, oneDayCadence);
  assert.equal(stale.recordIntegrityAdmitted, false);
  assert.ok(stale.failures.some((failure) => failure.includes('older than the trusted source review cadence')));
  assert.equal(stale.evidenceRef, null);
});

test('invalid validation clocks fail closed', () => {
  const result = validateClaimReview(valid, registry, Number.NaN);
  assert.equal(result.recordIntegrityAdmitted, false);
  assert.ok(result.failures.some((failure) => failure.includes('validation clock')));
});

test('claim-review timestamps require canonical RFC 3339 time with explicit offsets', () => {
  const invalidValues = [
    '10/18/2026 12:00:00',
    '2026-10-18T12:00:00',
    '2026-02-30T12:00:00Z',
    '2026-10-18T12:00:00-00:00',
  ];
  for (const observedAt of invalidValues) {
    const result = review({ ...valid, observedAt });
    assert.equal(result.recordIntegrityAdmitted, false, `timestamp must fail closed: ${observedAt}`);
    assert.ok(result.failures.some((failure) => failure.includes('RFC 3339')));
    assert.equal(result.evidenceRef, null);
  }
  assert.equal(review({ ...valid, observedAt: '2026-10-18T14:00:00+02:00' }).recordIntegrityAdmitted, true);
});

test('supporting excerpt whitespace is normalized without weakening the source match', () => {
  const result = review({ ...valid, supportingExcerpt: 'The specification\n\tdefines   a versioned interface.' });
  assert.equal(result.recordIntegrityAdmitted, true);
  assert.equal(result.failures.length, 0);
});

test('evidence references bind to claim text and source-specific review cadence', () => {
  const supported = review(valid);
  const changedClaim = review({ ...valid, claim: 'A different bounded claim.' });
  assert.notEqual(changedClaim.evidenceRef, supported.evidenceRef);
  const changedCadence = {
    ...registry,
    sources: registry.sources.map((source) => source.id === trustedSource.id
      ? { ...source, reviewCadenceDays: source.reviewCadenceDays + 1 } : source),
  };
  const changedCadenceResult = review(valid, changedCadence);
  assert.equal(changedCadenceResult.recordIntegrityAdmitted, true);
  assert.notEqual(changedCadenceResult.evidenceRef, supported.evidenceRef);
});

test('source-policy digest uses deterministic code-unit ordering for Unicode claim types', () => {
  const zeroWidth = String.fromCharCode(0x200b);
  const combiningAcute = String.fromCharCode(0x0301);
  const localeRegistry = {
    ...registry,
    sources: registry.sources.map((source) => source.id === trustedSource.id ? {
      ...source,
      claimsAllowed: [...source.claimsAllowed, 'z-extra', 'ä-extra', 'a-extra', `a-extra${zeroWidth}`, 'é-extra', `e${combiningAcute}-extra`],
    } : source),
  };
  const source = localeRegistry.sources.find((entry) => entry.id === trustedSource.id);
  assert.ok(source);
  const result = review(valid, localeRegistry);
  const reversedRegistry = {
    ...localeRegistry,
    sources: localeRegistry.sources.map((entry) => entry.id === trustedSource.id
      ? { ...entry, claimsAllowed: [...entry.claimsAllowed].reverse() } : entry),
  };
  assert.equal(review(valid, reversedRegistry).evidenceRef, result.evidenceRef);
  assert.equal(result.recordIntegrityAdmitted, true);
  assert.equal(result.evidenceRef, localeExpectedEvidenceRef(source, valid));
});

test('expanded source claim allowances change the evidence reference', () => {
  const changed = {
    ...registry,
    sources: registry.sources.map((source) => source.id === trustedSource.id
      ? { ...source, claimsAllowed: [...source.claimsAllowed, 'additional-bounded-claim'] } : source),
  };
  const result = review(valid, changed);
  assert.equal(result.recordIntegrityAdmitted, true);
  assert.notEqual(result.evidenceRef, review(valid).evidenceRef);
});

test('unregistered, duplicate and mismatched source registry entries are rejected', () => {
  const unknownSource = review({ ...valid, sourceId: 'unregistered-source' });
  assert.equal(unknownSource.recordIntegrityAdmitted, false);
  assert.ok(unknownSource.failures.some((failure) => failure.includes('exactly one trusted source registry entry')));
  assert.equal(unknownSource.evidenceRef, null);
  const duplicate = review(valid, { ...registry, sources: [...registry.sources, trustedSource] });
  assert.equal(duplicate.recordIntegrityAdmitted, false);
  assert.ok(duplicate.failures.some((failure) => failure.includes('exactly one trusted source registry entry')));
  const mismatchedVersion = review({ ...valid, sourceRegistryVersion: 'GEAS-AUTHORITY-UNKNOWN' });
  assert.equal(mismatchedVersion.recordIntegrityAdmitted, false);
  assert.ok(mismatchedVersion.failures.some((failure) => failure.includes('sourceRegistryVersion')));
});

test('canonical source URLs and allowed claim types are checked against the trusted registry', () => {
  const unregisteredUrl = `${trustedSource.url}/not-in-registry`;
  const urlResult = review({ ...valid, canonicalSourceUrl: unregisteredUrl, observedSourceUrl: unregisteredUrl });
  assert.equal(urlResult.recordIntegrityAdmitted, false);
  assert.ok(urlResult.failures.some((failure) => failure.includes('canonicalSourceUrl does not match the trusted source registry')));
  const unsupported = review({ ...valid, claimType: 'token-lifecycle-protection' });
  assert.equal(unsupported.recordIntegrityAdmitted, false);
  assert.ok(unsupported.failures.some((failure) => failure.includes('claimType') && failure.includes('not allowed')));
  assert.equal(unsupported.evidenceRef, null);
});

test('missing registry and unsupported decision states fail closed', () => {
  const missingRegistry = validateClaimReview(valid, undefined as unknown as ClaimSourceRegistry);
  assert.equal(missingRegistry.recordIntegrityAdmitted, false);
  assert.ok(missingRegistry.failures.some((failure) => failure.includes('trusted source registry with version and sources is required')));
  assert.equal(missingRegistry.evidenceRef, null);
  const unreviewed = review({ ...valid, decision: undefined });
  assert.equal(unreviewed.recordIntegrityAdmitted, false);
  assert.equal(unreviewed.decision, 'unknown');
  assert.equal(unreviewed.evidenceRef, null);
  const insufficient = review({ ...valid, decision: 'insufficient' });
  assert.equal(insufficient.recordIntegrityAdmitted, false);
  assert.equal(insufficient.decision, 'insufficient');
  assert.equal(insufficient.evidenceRef, null);
  const contradicted = review({ ...valid, decision: 'contradicted' });
  assert.equal(contradicted.recordIntegrityAdmitted, false);
  assert.equal(contradicted.decision, 'contradicted');
  assert.equal(contradicted.evidenceRef, null);
});

test('observed source URLs must match the curated host and resource path', () => {
  const mismatchedHost = review({ ...valid, observedSourceUrl: 'https://attacker.example.org/copied' });
  assert.equal(mismatchedHost.recordIntegrityAdmitted, false);
  assert.ok(mismatchedHost.failures.some((failure) => failure.includes('host differs')));
  const samePath = new URL(trustedSource.url);
  samePath.pathname = `${samePath.pathname.replace(/\/+$/, '')}/unregistered-path`;
  const wrongResource = review({ ...valid, observedSourceUrl: samePath.href });
  assert.equal(wrongResource.recordIntegrityAdmitted, false);
  assert.ok(wrongResource.failures.some((failure) => failure.includes('does not match the curated canonical source resource')));
  assert.equal(wrongResource.evidenceRef, null);
  const trailingSlash = new URL(trustedSource.url);
  if (!trailingSlash.pathname.endsWith('/')) trailingSlash.pathname += '/';
  assert.equal(review({ ...valid, observedSourceUrl: trailingSlash.href }).recordIntegrityAdmitted, true);
});

test('source snapshot hashes and supporting excerpts are verified exactly', () => {
  const badHash = review({ ...valid, sourceContentHash: 'not-a-hash' });
  assert.equal(badHash.recordIntegrityAdmitted, false);
  assert.ok(badHash.failures.some((failure) => failure.includes('SHA-256')));
  const tampered = review({ ...valid, sourceSnapshot: `${sourceSnapshot} tampered` });
  assert.equal(tampered.recordIntegrityAdmitted, false);
  assert.ok(tampered.failures.some((failure) => failure.includes('does not match sourceSnapshot')));
  assert.equal(tampered.evidenceRef, null);
  const invented = review({ ...valid, supportingExcerpt: 'This text is not in the source.' });
  assert.equal(invented.recordIntegrityAdmitted, false);
  assert.ok(invented.failures.some((failure) => failure.includes('not present in sourceSnapshot')));
  assert.equal(invented.evidenceRef, null);
  const missing = review({ ...valid, sourceSnapshot: undefined });
  assert.equal(missing.recordIntegrityAdmitted, false);
  assert.ok(missing.failures.some((failure) => failure.includes('sourceSnapshot')));
});
