import assert from 'node:assert/strict';
import { buildGeasRunProvenance } from './geas-architecture-run-provenance';
import { summarizeArchitecturePatterns } from './geas-architecture-scan-summary';
import test from 'node:test';

const mergeSha = '9'.repeat(40);
const headSha = 'e'.repeat(40);
const baseSha = 'c'.repeat(40);
const testedBaseSha = 'b'.repeat(40);

void test('GEAS architecture scan summaries preserve evidence classes', () => {
  const summary = summarizeArchitecturePatterns([
    { evidenceClass: 'analysis' }, { evidenceClass: 'analysis' }, { evidenceClass: 'observed-fact' },
    { evidenceClass: 'recommendation' }, { evidenceClass: 'recommendation' }, { evidenceClass: 'future-class' },
  ]);
  assert.deepEqual(summary, {
    discoveredPatterns: 6, analysisPatterns: 2, claimSupportedPatterns: 1,
    recommendationPatterns: 2, unclassifiedPatterns: 1,
  });
});

void test('pull-request provenance separates merge, source and base commit identities', () => {
  const provenance = buildGeasRunProvenance({
    GITHUB_EVENT_NAME: 'pull_request', GITHUB_WORKFLOW: 'GEAS Architecture Science Scan',
    GITHUB_REPOSITORY: 'GLORIFIER7/GLORIFIER', GITHUB_REF: 'refs/pull/508/merge',
    GITHUB_RUN_ID: '40324702513', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: mergeSha,
    GITHUB_SERVER_URL: 'https://github.com', GEAS_TESTED_BASE_SHA: testedBaseSha,
  }, {
    pull_request: {
      number: 508,
      head: { sha: headSha, ref: 'geas/claim-registry-provenance-2026-10-26' },
      base: { sha: baseSha, ref: 'main' },
    },
  });
  assert.equal(provenance.schemaVersion, 'GEAS-RUN-PROVENANCE-2');
  assert.equal(provenance.testedCommitSha, mergeSha);
  assert.equal(provenance.sourceCommitSha, headSha);
  assert.equal(provenance.baseCommitSha, baseSha);
  assert.equal(provenance.testedBaseCommitSha, testedBaseSha);
  assert.equal(provenance.pullRequestNumber, 508);
  assert.equal(provenance.runId, '40324702513');
  assert.equal(provenance.runAttempt, 1);
  assert.equal(provenance.runUrl, 'https://github.com/GLORIFIER7/GLORIFIER/actions/runs/40324702513');
});

void test('push provenance records the tested commit without a pull request base', () => {
  const provenance = buildGeasRunProvenance({
    GITHUB_EVENT_NAME: 'push', GITHUB_REPOSITORY: 'GLORIFIER7/GLORIFIER',
    GITHUB_RUN_ID: '42', GITHUB_SHA: headSha, GITHUB_SERVER_URL: 'https://github.com',
  }, {});
  assert.equal(provenance.testedCommitSha, headSha);
  assert.equal(provenance.sourceCommitSha, headSha);
  assert.equal(provenance.baseCommitSha, null);
  assert.equal(provenance.testedBaseCommitSha, null);
  assert.equal(provenance.pullRequestNumber, null);
});

void test('incomplete pull-request data and invalid identifiers fail closed', () => {
  const incomplete = buildGeasRunProvenance({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_SHA: mergeSha }, null);
  assert.equal(incomplete.testedCommitSha, mergeSha);
  assert.equal(incomplete.sourceCommitSha, null);
  assert.equal(incomplete.baseCommitSha, null);
  assert.equal(incomplete.testedBaseCommitSha, null);
  assert.equal(incomplete.runUrl, null);
  const invalid = buildGeasRunProvenance({
    GITHUB_EVENT_NAME: 'push', GITHUB_SHA: 'not-a-sha', GITHUB_RUN_ID: '../42', GITHUB_RUN_ATTEMPT: '0',
  }, {});
  assert.equal(invalid.testedCommitSha, null);
  assert.equal(invalid.runId, null);
  assert.equal(invalid.runAttempt, null);
});
