import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('intelligence-pipeline-workflow regression suite', async () => {
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


assert.ok(
  workflow.includes("name: Intelligence refresh (${{ vars.GLORIFIER_INTELLIGENCE_URL && 'configured' || 'NOT RUN - endpoint unconfigured' }})"),
  'the job name must make an unconfigured scheduled refresh visibly NOT RUN',
);
assert.match(
  workflow,
  /Validate configured intelligence endpoint\n\s+if: vars\.GLORIFIER_INTELLIGENCE_URL != '' \|\| github\.event_name == 'workflow_dispatch'/,
  'manual dispatch must validate strictly while an unconfigured scheduled run skips validation',
);
assert.match(
  workflow,
  /Refresh configured intelligence report\n\s+if: vars\.GLORIFIER_INTELLIGENCE_URL != ''\s*(?:\r?\n|$)/,
  'the refresh request must remain gated on a configured endpoint',
);

const refreshStep = workflow.match(/- name: Refresh configured intelligence report([\s\S]*?)(?=\n      - name:|\s*$)/)?.[1] ?? '';
const keyedBranch = refreshStep.match(/if \[ -n "\$\{INTELLIGENCE_KEY\}" \]; then([\s\S]*?)\n\s*else\s*\n/)?.[1];
const unkeyedBranch = refreshStep.match(/\n\s*else\s*\n([\s\S]*?)\n\s*fi(?:\s|$)/)?.[1];
assert.ok(keyedBranch && unkeyedBranch, 'the refresh script must retain separate keyed and unkeyed branches');
assert.match(keyedBranch, /\bcurl\b[^\n]*-X POST\b/, 'the authenticated refresh must use POST');
assert.match(unkeyedBranch, /\bcurl\b[^\n]*-X POST\b/, 'the no-key refresh must also use POST');

console.log('Intelligence pipeline PR concurrency regression tests passed');
});
