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

const review = (
  record: Partial<ClaimReviewRecord>,
  sourceRegistry: ClaimSourceRegistry = registry,
) => validateClaimReview(record, sourceRegistry);

const supported = review(valid);
assert.equal(supported.admissible, true);

const whitespaceNormalized = review({
  ...valid,
  supportingExcerpt: 'The specification\n\tdefines   a versioned interface.',
});
assert.equal(whitespaceNormalized.admissible, true);
assert.equal(whitespaceNormalized.failures.length, 0);
assert.match(supported.evidenceRef ?? '', /^claim-review-[a-f0-9]{24}$/);

const changedClaim = review({ ...valid, claim: 'A different bounded claim.' });
assert.notEqual(changedClaim.evidenceRef, supported.evidenceRef, 'evidence references must bind to the exact claim text');

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
