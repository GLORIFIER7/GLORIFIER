import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/free-tier-governance.yml', import.meta.url),
  'utf8',
);

test('free-tier governance can run manually, daily, and on its own PR changes', () => {
  assert.match(workflow, /^on:\n/m);
  assert.match(workflow, /^  workflow_dispatch:\s*$/m);
  assert.match(workflow, /^  schedule:\s*$/m);
  assert.match(workflow, /^    - cron: "41 2 \* \* \*"\s*$/m);
  assert.match(workflow, /^  pull_request:\s*$/m);
  assert.match(workflow, /^      - '\.github\/workflows\/free-tier-governance\.yml'$/m);
  assert.match(workflow, /^      - 'scripts\/free-tier-governance\.test\.mjs'$/m);
});

test('free-tier governance uses only standard public Linux runners with a strict timeout', () => {
  const runners = [...workflow.matchAll(/^\s+runs-on:\s*(.+)\s*$/gm)].map((match) => match[1].trim());
  assert.deepEqual(runners, ['ubuntu-latest']);
  assert.match(workflow, /^    timeout-minutes: 10$/m);
  assert.doesNotMatch(workflow, /self-hosted|ubuntu-\d+-\d+-core|larger-runner|macos-latest|windows-latest/i);
  assert.match(workflow, /^    if: \$\{\{ github\.event\.repository\.private == false \}\}$/m);
});

test('free-tier governance is read-only and cannot expose provider credentials', () => {
  assert.match(workflow, /^permissions:\n  contents: read\s*$/m);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\.|(?:contents|actions|issues|pull-requests): write/i);
  assert.match(workflow, /^          persist-credentials: false$/m);
  assert.doesNotMatch(workflow, /\b(?:deploy|publish|gh pr merge|auto.merge|npm publish)\b/i);
});

test('free-tier governance runs local GEAS and provider authorization regression checks', () => {
  assert.match(workflow, /node --test \\/);
  for (const filename of [
    'free-tier-governance.test.mjs',
    'ai-fleet-diff-policy.test.mjs',
    'ai-fleet-workflow-contract.test.mjs',
    'continuous-improvement-workflow-contract.test.mjs',
    'intelligence-pipeline-workflow.test.mjs',
    'github-actions-governance.test.mjs',
  ]) {
    assert.ok(workflow.includes('scripts/' + filename), 'Missing offline test: ' + filename);
  }
  assert.doesNotMatch(workflow, /\b(?:npm ci|npx|curl|wget)\b/i);
});

test('free-tier governance avoids overlapping scheduled runs', () => {
  assert.match(workflow, /^concurrency:\n  group: glorifier-free-tier-governance-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true$/m);
});
