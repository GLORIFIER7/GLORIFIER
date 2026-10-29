import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let workflow;
try {
  workflow = readFileSync(new URL('../.github/workflows/intelligence-pipeline.yml', import.meta.url), 'utf8');
} catch (error) {
  throw new Error(`Could not read intelligence-pipeline.yml; verify the workflow exists at the expected path. ${error instanceof Error ? error.message : String(error)}`);
}

const concurrency = workflow.match(/concurrency:\n([\s\S]*?)(?=\n(?:jobs:|defaults:|env:|on:)|\s*$)/)?.[1] ?? '';
assert.ok(concurrency.trim().length > 0, 'concurrency block was not found in the workflow file');

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
  /refresh-report:\n(?:\s+name:.*\n)?\s+if: github\.event_name != 'pull_request'/,
  'pull request validation must never invoke the production refresh job',
);


assert.match(
  workflow,
  /name: Intelligence refresh \\(\$\\{\\{ vars\\.GLORIFIER_INTELLIGENCE_URL && 'configured' \\|\\| 'NOT RUN - endpoint unconfigured' \\}\\}\\)/,
  'the job name must make an unconfigured scheduled refresh visibly NOT RUN',
);
assert.match(
  workflow,
  /Validate configured intelligence endpoint\\n\\s+if: vars\\.GLORIFIER_INTELLIGENCE_URL != '' \\|\\| github\\.event_name == 'workflow_dispatch'/,
  'manual dispatch must validate strictly while an unconfigured scheduled run skips validation',
);
assert.match(
  workflow,
  /Refresh configured intelligence report\\n\\s+if: vars\\.GLORIFIER_INTELLIGENCE_URL != ''\\s*(?:\\r?\\n|$)/,
  'the refresh request must remain gated on a configured endpoint',
);

console.log('Intelligence pipeline PR concurrency regression tests passed');
