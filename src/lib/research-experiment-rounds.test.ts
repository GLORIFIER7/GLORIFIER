import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { selectNextResearchRound, type ResearchExperimentResult } from './research-experiment-rounds.ts';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);

function observation(id: string, score = 0.5): ResearchExperimentResult {
  return {
    id,
    producerId: `research-agent-${id}`,
    status: 'completed',
    effect: 'read-only',
    score,
    inputSha256: SHA_A,
    outputSha256: SHA_B,
    sourceRefs: [`https://example.org/research/${id}`],
    methodRef: `experiment-protocol-${id}`,
    paidCostUsd: 0,
    review: {
      reviewerId: 'independent-evidence-verifier',
      evidenceRef: `review-${id}`,
      outputSha256: SHA_B,
    },
  };
}

const trustedVerifier = () => true;

test('retains the highest independently reviewed, reproducible candidates with stable ties', () => {
  const results = selectNextResearchRound([
    observation('beta', 0.8),
    observation('gamma', 0.9),
    observation('alpha', 0.8),
  ], { maxAdvance: 2, authenticateReview: trustedVerifier });

  assert.deepEqual(results.selected.map((item) => item.id), ['gamma', 'alpha']);
  assert.deepEqual(results.notSelected.map((item) => item.id), ['beta']);
  assert.equal(results.notSelected[0].reason, 'bounded-round-capacity');
});

test('fails closed on missing or false independent review', () => {
  const one = selectNextResearchRound([observation('candidate')], {
    authenticateReview: () => false,
  });
  assert.deepEqual(one.selected, []);
  assert.equal(one.notSelected[0].reason, 'review-not-authenticated');

  const noCallback = selectNextResearchRound([observation('candidate')]);
  assert.deepEqual(noCallback.selected, []);
  assert.equal(noCallback.notSelected[0].reason, 'review-not-authenticated');
});

test('rejects self-review and a review that does not bind to the result hash', () => {
  const selfReviewed = observation('self');
  selfReviewed.review!.reviewerId = selfReviewed.producerId;
  const mismatched = observation('mismatch');
  mismatched.review!.outputSha256 = SHA_C;

  const result = selectNextResearchRound([selfReviewed, mismatched], {
    authenticateReview: trustedVerifier,
  });
  assert.deepEqual(result.selected, []);
  assert.deepEqual(result.notSelected.map((item) => item.reason), [
    'review-not-independent',
    'review-not-bound-to-output',
  ]);
});

test('rejects paid work, mutation, missing provenance, and unfinished work', () => {
  const paid = observation('paid');
  paid.paidCostUsd = 0.01;
  const mutation = observation('mutation');
  mutation.effect = 'reversible';
  const evidenceFree = observation('evidence-free');
  evidenceFree.sourceRefs = [];
  const unfinished = observation('unfinished');
  unfinished.status = 'pending';

  const result = selectNextResearchRound([paid, mutation, evidenceFree, unfinished], {
    authenticateReview: trustedVerifier,
  });
  assert.deepEqual(result.selected, []);
  assert.deepEqual(result.notSelected.map((item) => item.reason), [
    'paid-cost-not-allowed',
    'not-read-only',
    'insufficient-provenance',
    'not-completed',
  ]);
});

test('rejects NaN, infinity, out-of-range scores and invalid digests', () => {
  const badScore = observation('nan', Number.NaN);
  const infScore = observation('inf', Number.POSITIVE_INFINITY);
  const tooHigh = observation('high', 1.1);
  const badHash = observation('bad-hash');
  badHash.inputSha256 = 'not a hash';
  const result = selectNextResearchRound([badScore, infScore, tooHigh, badHash], {
    authenticateReview: trustedVerifier,
  });
  assert.deepEqual(result.selected, []);
  assert.deepEqual(result.notSelected.map((item) => item.reason), [
    'invalid-score', 'invalid-score', 'invalid-score', 'insufficient-provenance',
  ]);
});

test('enforces the six-task graph limit, unique IDs and bounded next round', () => {
  assert.throws(() => selectNextResearchRound(Array.from({ length: 7 }, (_, index) => observation(`experiment-${index}`))), /between 1 and 6/);
  assert.throws(() => selectNextResearchRound([observation('same'), observation('same')]), /duplicate experiment id/);
  assert.throws(() => selectNextResearchRound([observation('valid')], { maxAdvance: 0 }), /maxAdvance must be between 1 and 6/);
  assert.throws(() => selectNextResearchRound([observation('valid')], { maxAdvance: 7 }), /maxAdvance must be between 1 and 6/);
});

test('rejects a nonboolean asynchronous verifier instead of mistaking a Promise for approval', () => {
  const result = selectNextResearchRound([observation('async')], {
    authenticateReview: (() => Promise.resolve(true)) as unknown as () => boolean,
  });
  assert.deepEqual(result.selected, []);
  assert.equal(result.notSelected[0].reason, 'review-not-authenticated');
});

test('does not promote results when the authenticating verifier throws', () => {
  const result = selectNextResearchRound([observation('verifier-error')], {
    authenticateReview: () => { throw new Error('review service unavailable'); },
  });
  assert.deepEqual(result.selected, []);
  assert.equal(result.notSelected[0].reason, 'review-not-authenticated');
});
