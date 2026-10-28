import assert from 'node:assert/strict';
import { buildGeasRunProvenance } from './geas-architecture-run-provenance';

const mergeSha = '9'.repeat(40);
const headSha = 'e'.repeat(40);
const baseSha = 'c'.repeat(40);
const pullRequest = buildGeasRunProvenance({
  GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_WORKFLOW: 'GEAS Architecture Science Scan',
  GITHUB_REPOSITORY: 'GLORIFIER7/GLORIFIER',
  GITHUB_REF: 'refs/pull/508/merge',
  GITHUB_RUN_ID: '40324702513',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: mergeSha,
  GITHUB_SERVER_URL: 'https://github.com',
}, {
  pull_request: {
    number: 508,
    head: { sha: headSha, ref: 'geas/claim-registry-provenance-2026-10-26' },
    base: { sha: baseSha, ref: 'main' },
  },
});

assert.equal(pullRequest.testedCommitSha, mergeSha, 'the checked-out merge SHA must be explicit');
assert.equal(pullRequest.sourceCommitSha, headSha, 'the source head SHA must not be confused with the merge SHA');
assert.equal(pullRequest.baseCommitSha, baseSha);
assert.equal(pullRequest.pullRequestNumber, 508);
assert.equal(pullRequest.runId, '40324702513');
assert.equal(pullRequest.runAttempt, 1);
assert.equal(pullRequest.runUrl, 'https://github.com/GLORIFIER7/GLORIFIER/actions/runs/40324702513');

const push = buildGeasRunProvenance({
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REPOSITORY: 'GLORIFIER7/GLORIFIER',
  GITHUB_RUN_ID: '42',
  GITHUB_SHA: headSha,
  GITHUB_SERVER_URL: 'https://github.com',
}, {});
assert.equal(push.testedCommitSha, headSha);
assert.equal(push.sourceCommitSha, headSha);
assert.equal(push.baseCommitSha, null);
assert.equal(push.pullRequestNumber, null);

const incompletePullRequest = buildGeasRunProvenance({
  GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_SHA: mergeSha,
}, null);
assert.equal(incompletePullRequest.testedCommitSha, mergeSha);
assert.equal(incompletePullRequest.sourceCommitSha, null, 'missing PR event data must not be guessed from the merge SHA');
assert.equal(incompletePullRequest.baseCommitSha, null);
assert.equal(incompletePullRequest.runUrl, null);

const invalidSha = buildGeasRunProvenance({
  GITHUB_EVENT_NAME: 'push',
  GITHUB_SHA: 'not-a-sha',
  GITHUB_RUN_ID: '../42',
  GITHUB_RUN_ATTEMPT: '0',
}, {});
assert.equal(invalidSha.testedCommitSha, null);
assert.equal(invalidSha.runId, null);
assert.equal(invalidSha.runAttempt, null);

process.stdout.write('GEAS run-provenance tests passed.\n');
