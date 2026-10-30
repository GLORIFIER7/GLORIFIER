import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateClaimReview, type ClaimReviewRecord, type ClaimSourceRegistry } from './geas-claim-verification';

const registry = JSON.parse(readFileSync('docs/architecture/geas-authoritative-source-registry.json', 'utf8')) as ClaimSourceRegistry;
const trustedSource = registry.sources.find((source) => source.id === 'nist-ai-rmf');
if (!trustedSource) throw new Error('The curated registry must include nist-ai-rmf for this test.');

const sourceSnapshot = 'The specification defines a versioned interface. Additional source context.';
const sourceContentHash = createHash('sha256').update(sourceSnapshot, 'utf8').digest('hex');
const valid = {
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
  decision: 'supported' as const,
  rationale: 'The cited excerpt directly supports the bounded claim.',
};

const fixedNowMs = Date.parse('2026-10-26T13:00:00.000Z');
const review = (
  record: Partial<ClaimReviewRecord>,
  sourceRegistry: ClaimSourceRegistry = registry,
  nowMs: number = fixedNowMs,
) => validateClaimReview(record, sourceRegistry, nowMs);

const supported = review(valid);
assert.equal(supported.admissible, true);

const futureDatedReview = review({
  ...valid,
  observedAt: new Date(fixedNowMs + 1).toISOString(),
});
assert.equal(futureDatedReview.admissible, false, 'future-dated source observations must not be admitted');
assert.ok(futureDatedReview.failures.some((failure) => failure.includes('cannot be in the future')));
assert.equal(futureDatedReview.evidenceRef, null);

const oneDayCadenceRegistry: ClaimSourceRegistry = {
  ...registry,
  sources: registry.sources.map((source) => source.id === trustedSource.id
    ? { ...source, reviewCadenceDays: 1 }
    : source),
};
const exactCadenceBoundary = review({
  ...valid,
  observedAt: new Date(fixedNowMs - 86_400_000).toISOString(),
}, oneDayCadenceRegistry);
assert.equal(exactCadenceBoundary.admissible, true, 'an observation exactly at its cadence boundary remains fresh');

const staleReview = review({
  ...valid,
  observedAt: new Date(fixedNowMs - 86_400_001).toISOString(),
}, oneDayCadenceRegistry);
assert.equal(staleReview.admissible, false, 'stale source observations must not be admitted');
assert.ok(staleReview.failures.some((failure) => failure.includes('older than the trusted source review cadence')));
assert.equal(staleReview.evidenceRef, null);

const invalidCadenceRegistry: ClaimSourceRegistry = {
  ...registry,
  sources: registry.sources.map((source) => source.id === trustedSource.id
    ? { ...source, reviewCadenceDays: 0 }
    : source),
};
const invalidCadenceReview = review(valid, invalidCadenceRegistry);
assert.equal(invalidCadenceReview.admissible, false, 'invalid registry cadence must fail closed');
assert.ok(invalidCadenceReview.failures.some((failure) => failure.includes('reviewCadenceDays')));
assert.equal(invalidCadenceReview.evidenceRef, null);

const invalidClockReview = validateClaimReview(valid, registry, Number.NaN);
assert.equal(invalidClockReview.admissible, false, 'invalid validation clocks must fail closed');
assert.ok(invalidClockReview.failures.some((failure) => failure.includes('validation clock')));


const ambiguousTimestamp = review({ ...valid, observedAt: '10/18/2026 12:00:00' });
assert.equal(ambiguousTimestamp.admissible, false, 'locale-dependent date strings must not be accepted as evidence timestamps');
assert.ok(ambiguousTimestamp.failures.some((failure) => failure.includes('RFC 3339')));
assert.equal(ambiguousTimestamp.evidenceRef, null);

const missingTimezone = review({ ...valid, observedAt: '2026-10-18T12:00:00' });
assert.equal(missingTimezone.admissible, false, 'timestamps without an explicit UTC offset must fail closed');
assert.ok(missingTimezone.failures.some((failure) => failure.includes('RFC 3339')));

const impossibleCalendarDate = review({ ...valid, observedAt: '2026-02-30T12:00:00Z' });
assert.equal(impossibleCalendarDate.admissible, false, 'calendar rollover must not normalize an impossible observation date');
assert.ok(impossibleCalendarDate.failures.some((failure) => failure.includes('RFC 3339')));

const equivalentOffsetTimestamp = review({ ...valid, observedAt: '2026-10-18T14:00:00+02:00' });
assert.equal(equivalentOffsetTimestamp.admissible, true, 'valid timestamps with an explicit numeric UTC offset must remain supported');

const whitespaceNormalized = review({
  ...valid,
  supportingExcerpt: 'The specification\n\tdefines   a versioned interface.',
});
assert.equal(whitespaceNormalized.admissible, true);
assert.equal(whitespaceNormalized.failures.length, 0);
assert.match(supported.evidenceRef ?? '', /^claim-review-[a-f0-9]{24}$/);

const changedClaim = review({ ...valid, claim: 'A different bounded claim.' });
assert.notEqual(changedClaim.evidenceRef, supported.evidenceRef, 'evidence references must bind to the exact claim text');


const changedCadenceRegistry: ClaimSourceRegistry = {
  ...registry,
  sources: registry.sources.map((source) => source.id === trustedSource.id
    ? { ...source, reviewCadenceDays: source.reviewCadenceDays + 1 }
    : source),
};
const changedCadenceReview = review(valid, changedCadenceRegistry);
assert.equal(changedCadenceReview.admissible, true, 'a still-fresh observation should remain admissible under the revised cadence');
assert.notEqual(changedCadenceReview.evidenceRef, supported.evidenceRef,
  'evidence references must bind to the source-specific review cadence');

const localeClaimsRegistry: ClaimSourceRegistry = {
  ...registry,
  sources: registry.sources.map((source) => source.id === trustedSource.id
    ? { ...source, claimsAllowed: [...source.claimsAllowed, 'z-extra', 'ä-extra', 'a-extra'] }
    : source),
};
const localeClaimsSource = localeClaimsRegistry.sources.find((source) => source.id === trustedSource.id)!;
const localeClaimsReview = review(valid, localeClaimsRegistry);
const expectedLocalePolicyDigest = createHash('sha256').update(JSON.stringify({
  id: localeClaimsSource.id,
  url: localeClaimsSource.url,
  claimsAllowed: [...localeClaimsSource.claimsAllowed].sort((left, right) => left.localeCompare(right, 'en')),
  reviewCadenceDays: localeClaimsSource.reviewCadenceDays,
})).digest('hex');
const expectedLocaleEvidenceRef = 'claim-review-' + createHash('sha256').update(JSON.stringify({
  claimId: valid.claimId,
  claim: valid.claim,
  claimType: valid.claimType,
  sourceId: valid.sourceId,
  sourceRegistryVersion: valid.sourceRegistryVersion,
  sourcePolicyDigest: expectedLocalePolicyDigest,
  canonicalSourceUrl: valid.canonicalSourceUrl,
  observedSourceUrl: valid.observedSourceUrl,
  observedAt: valid.observedAt,
  sourceContentHash: valid.sourceContentHash,
  supportingExcerpt: valid.supportingExcerpt,
  reviewer: valid.reviewer,
  decision: valid.decision,
  rationale: valid.rationale,
})).digest('hex').slice(0, 24);
assert.equal(localeClaimsReview.admissible, true);
assert.equal(
  localeClaimsReview.evidenceRef,
  expectedLocaleEvidenceRef,
  'source-policy digest must use explicit English collation for a stable claim allowance list',
);

const changedClaimsRegistry: ClaimSourceRegistry = {
  ...registry,
  sources: registry.sources.map((source) => source.id === trustedSource.id
    ? { ...source, claimsAllowed: [...source.claimsAllowed, 'additional-bounded-claim'] }
    : source),
};
const changedClaimsReview = review(valid, changedClaimsRegistry);
assert.equal(changedClaimsReview.admissible, true);
assert.notEqual(changedClaimsReview.evidenceRef, supported.evidenceRef,
  'evidence references must bind to the source-specific claim allowance policy');

const unregisteredSource = review({ ...valid, sourceId: 'unregistered-source' });
assert.equal(unregisteredSource.admissible, false);
assert.ok(unregisteredSource.failures.some((failure) => failure.includes('exactly one trusted source registry entry')));
assert.equal(unregisteredSource.evidenceRef, null);

const unregisteredCanonicalUrl = trustedSource.url + '/not-in-registry';
const mismatchedRegistryUrl = review({
  ...valid,
  canonicalSourceUrl: unregisteredCanonicalUrl,
  observedSourceUrl: unregisteredCanonicalUrl,
});
assert.equal(mismatchedRegistryUrl.admissible, false);
assert.ok(mismatchedRegistryUrl.failures.some((failure) => failure.includes('canonicalSourceUrl does not match the trusted source registry')));

const unsupportedClaimType = review({ ...valid, claimType: 'token-lifecycle-protection' });
assert.equal(unsupportedClaimType.admissible, false);
assert.ok(unsupportedClaimType.failures.some((failure) => failure.includes('claimType') && failure.includes('not allowed')));
assert.equal(unsupportedClaimType.evidenceRef, null);

const mismatchedRegistryVersion = review({ ...valid, sourceRegistryVersion: 'GEAS-AUTHORITY-UNKNOWN' });
assert.equal(mismatchedRegistryVersion.admissible, false);
assert.ok(mismatchedRegistryVersion.failures.some((failure) => failure.includes('sourceRegistryVersion')));
assert.equal(mismatchedRegistryVersion.evidenceRef, null);

const duplicateRegistryEntry = review(valid, {
  ...registry,
  sources: [...registry.sources, trustedSource],
});
assert.equal(duplicateRegistryEntry.admissible, false);
assert.ok(duplicateRegistryEntry.failures.some((failure) => failure.includes('exactly one trusted source registry entry')));

const missingRegistry = validateClaimReview(valid, undefined as unknown as ClaimSourceRegistry);
assert.equal(missingRegistry.admissible, false);
assert.ok(missingRegistry.failures.some((failure) => failure.includes('trusted source registry with version and sources is required')));
assert.equal(missingRegistry.evidenceRef, null);

const unreviewed = review({ ...valid, decision: undefined });
assert.equal(unreviewed.admissible, false);
assert.equal(unreviewed.decision, 'unknown');
assert.equal(unreviewed.evidenceRef, null);

const mismatchedHost = review({
  ...valid,
  observedSourceUrl: 'https://attacker.example.org/copied',
});
assert.equal(mismatchedHost.admissible, false);
assert.ok(mismatchedHost.failures.some((failure) => failure.includes('host differs')));

const sameHostDifferentPathUrl = new URL(trustedSource.url);
sameHostDifferentPathUrl.pathname = sameHostDifferentPathUrl.pathname.replace(/\/+$/, '') + '/unregistered-path';
const sameHostDifferentPath = review({ ...valid, observedSourceUrl: sameHostDifferentPathUrl.href });
assert.equal(sameHostDifferentPath.admissible, false);
assert.ok(sameHostDifferentPath.failures.some((failure) => failure.includes('does not match the curated canonical source resource')));
assert.equal(sameHostDifferentPath.evidenceRef, null);

const trailingSlashUrl = new URL(trustedSource.url);
if (!trailingSlashUrl.pathname.endsWith('/')) trailingSlashUrl.pathname += '/';
const trailingSlashObserved = review({ ...valid, observedSourceUrl: trailingSlashUrl.href });
assert.equal(trailingSlashObserved.admissible, true, 'trailing-slash-only URL normalization should remain compatible');

const badHash = review({ ...valid, sourceContentHash: 'not-a-hash' });
assert.equal(badHash.admissible, false);
assert.ok(badHash.failures.some((failure) => failure.includes('SHA-256')));

const tamperedSnapshot = review({ ...valid, sourceSnapshot: sourceSnapshot + ' tampered' });
assert.equal(tamperedSnapshot.admissible, false);
assert.ok(tamperedSnapshot.failures.some((failure) => failure.includes('does not match sourceSnapshot')));
assert.equal(tamperedSnapshot.evidenceRef, null);

const inventedExcerpt = review({ ...valid, supportingExcerpt: 'This text is not in the source.' });
assert.equal(inventedExcerpt.admissible, false);
assert.ok(inventedExcerpt.failures.some((failure) => failure.includes('not present in sourceSnapshot')));
assert.equal(inventedExcerpt.evidenceRef, null);

const missingSnapshot = review({ ...valid, sourceSnapshot: undefined });
assert.equal(missingSnapshot.admissible, false);
assert.ok(missingSnapshot.failures.some((failure) => failure.includes('sourceSnapshot')));

const insufficient = review({ ...valid, decision: 'insufficient' });
assert.equal(insufficient.admissible, false);
assert.equal(insufficient.decision, 'insufficient');
assert.equal(insufficient.evidenceRef, null);

const contradicted = review({ ...valid, decision: 'contradicted' });
assert.equal(contradicted.admissible, false);
assert.equal(contradicted.decision, 'contradicted');
assert.equal(contradicted.evidenceRef, null);

process.stdout.write('GEAS claim-review integrity tests passed; semantic truth and reviewer authentication remain external.\\n');
