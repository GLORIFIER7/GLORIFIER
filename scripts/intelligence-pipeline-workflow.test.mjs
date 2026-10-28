import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/intelligence-pipeline.yml', import.meta.url), 'utf8');
const concurrency = workflow.match(/concurrency:\n([\s\S]*?)(?=\n(?:jobs:|defaults:|env:))/)?.[1] ?? '';

assert.match(
  concurrency,
  /github\.event_name == 'pull_request'/,
  'pull request runs must use a separate concurrency group from scheduled production refreshes',
);
assert.match(
  concurrency,
  /format\('glorifier-intelligence-pipeline-pr-\{0\}', github\.event\.pull_request\.number\)/,
  'each pull request must be isolated by its PR number',
);
assert.match(
  concurrency,
  /'glorifier-intelligence-pipeline'/,
  'scheduled and manually dispatched refreshes must retain the shared production-refresh group',
);
assert.match(
  workflow,
  /refresh-report:\n\s+if: github\.event_name != 'pull_request'/,
  'pull request validation must never invoke the production refresh job',
);

console.log('Intelligence pipeline PR concurrency regression tests passed');
