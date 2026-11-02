import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIssueSummary } from './publish-issue-summary.mjs';

const validFallbackInput = {
  inferenceOutcome: 'failure',
  response: '',
  issueNumber: '616',
  serverUrl: 'https://github.com',
  repository: 'GLORIFIER7/GLORIFIER',
};

test('publishes AI output only when inference succeeds with non-empty content', () => {
  assert.equal(
    buildIssueSummary({
      ...validFallbackInput,
      inferenceOutcome: 'success',
      response: 'Objective and blockers.',
    }),
    '## AI-generated issue summary (review before reuse)\n\nObjective and blockers.\n',
  );
});

test('publishes a deterministic issue link when inference fails', () => {
  const markdown = buildIssueSummary(validFallbackInput);
  assert.match(markdown, /^## Issue summary unavailable\n\n/);
  assert.match(markdown, /\[#616\]\(https:\/\/github\.com\/GLORIFIER7\/GLORIFIER\/issues\/616\)/);
  assert.doesNotMatch(markdown, /copied secret|private payload/i);
});

test('publishes the deterministic fallback for a successful but empty response', () => {
  const markdown = buildIssueSummary({
    ...validFallbackInput,
    inferenceOutcome: 'success',
    response: '  \n  ',
  });
  assert.match(markdown, /^## Issue summary unavailable\n\n/);
});

test('rejects a zero, empty, or non-numeric issue number before constructing a link', () => {
  for (const issueNumber of ['', '0', '12x', '2/3', null]) {
    assert.throws(
      () => buildIssueSummary({ ...validFallbackInput, issueNumber }),
      /valid positive integer issue number/,
    );
  }
});

test('rejects malformed repository identifiers and unsafe server URLs', () => {
  for (const repository of ['owner/repo/issues/1', 'owner/..', '../repository']) {
    assert.throws(
      () => buildIssueSummary({ ...validFallbackInput, repository }),
      /valid GitHub repository identifier/,
    );
  }
  for (const repository of ['owner/.github', 'owner/_config']) {
    assert.match(
      buildIssueSummary({ ...validFallbackInput, repository }),
      new RegExp(repository.replace(/[.*+?^${}()|[\]\\]/g, '\\  for (const repository of ['owner/repo/issues/1', 'owner/..', '../repository']) {
    assert.throws(
      () => buildIssueSummary({ ...validFallbackInput, repository }),
      /valid GitHub repository identifier/,
    );
  }')),
    );
  }
  assert.throws(
    () => buildIssueSummary({ ...validFallbackInput, serverUrl: 'javascript:alert(1)' }),
    /HTTPS GitHub server URL/,
  );
});
