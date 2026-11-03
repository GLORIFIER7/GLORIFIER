import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/intelligence-pipeline.yml', import.meta.url), 'utf8');
const concurrency = workflow.match(/concurrency:\n([\s\S]*?)(?=\n(?:jobs:|defaults:|env:|on:)|\s*$)/)?.[1] ?? '';

test('intelligence pipeline separates PR concurrency from production refreshes', () => {
  assert.ok(concurrency.trim().length > 0, 'concurrency block was not found in the workflow file');
  assert.match(concurrency, /github\.event_name == 'pull_request'/);
  assert.match(concurrency, /format\('glorifier-intelligence-pipeline-pr-\{0\}', github\.event\.pull_request\.number\)/);
  assert.match(concurrency, /'glorifier-intelligence-pipeline'/);
});

test('pull request validation never invokes the production refresh job', () => {
  assert.match(workflow, /refresh-report:\n(?:\s+name:.*\n)?\s+if: github\.event_name != 'pull_request'/);
});

test('unconfigured scheduled refreshes visibly skip and manual dispatch validates', () => {
  assert.ok(workflow.includes("name: Intelligence refresh (${{ vars.GLORIFIER_INTELLIGENCE_URL && 'configured' || 'NOT RUN - endpoint unconfigured' }})"));
  assert.match(workflow, /Validate configured intelligence endpoint\n\s+if: vars\.GLORIFIER_INTELLIGENCE_URL != '' \|\| github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /Refresh configured intelligence report\n\s+if: vars\.GLORIFIER_INTELLIGENCE_URL != ''\s*(?:\r?\n|$)/);
});
