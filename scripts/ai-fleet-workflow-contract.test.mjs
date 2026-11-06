import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/ai-coding-fleet.yml', import.meta.url), 'utf8');
const dispatchMarker = '\n  dispatch-ci:\n';
const publishMarker = '\n  publish-proposal:\n';
const codingStart = workflow.indexOf('  coding-fleet:\n');
const publishStart = workflow.indexOf(publishMarker);
const dispatchStart = workflow.indexOf(dispatchMarker);
assert.ok(codingStart >= 0 && publishStart > codingStart && dispatchStart > publishStart,
  'expected coding-fleet, publish-proposal, and dispatch-ci jobs in order');
const coding = workflow.slice(codingStart, publishStart);
const publish = workflow.slice(publishStart, dispatchStart);
const dispatch = workflow.slice(dispatchStart);
const dispatchDeclaration = workflow.slice(workflow.indexOf('  workflow_dispatch:'), workflow.indexOf('\n\npermissions:'));

test('maintenance runs every four hours and uses the Laos publication hold', () => {
  assert.match(workflow, /- cron: "17 \*\/4 \* \* \*"/);
  assert.match(workflow, /TZ=Asia\/Vientiane date \+%H%M/);
  assert.match(workflow, /current_hhmm_decimal < 831/);
});

test('scheduled and manual runs share the repository-level cost gate', () => {
  assert.equal(dispatchDeclaration.trim(), 'workflow_dispatch:');
  assert.doesNotMatch(workflow, /authorize_pull_request/);
  assert.match(workflow, /SCHEDULE_AUTHORIZATION: \$\{\{ vars\.AI_MAINTENANCE_AUTORUN \}\}/);
  assert.match(workflow, /glorifier_ai_maintenance_authorized "\$EVENT_NAME" "\$SCHEDULE_AUTHORIZATION"/);
});

test('the model-execution job has no GitHub write permissions', () => {
  assert.match(workflow, /^permissions:\n  contents: read\n  pull-requests: read/m);
  assert.doesNotMatch(coding, /(?:actions|contents|pull-requests):\s*write/);
  assert.match(coding, /uses: openai\/codex-action@/);
  assert.match(coding, /effort: medium/);
  assert.match(coding, /openai-api-key: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.doesNotMatch(coding, /env:\n\s+OPENAI_API_KEY:/);
});

test('generated changes cross the privilege boundary only as a validated patch artifact', () => {
  assert.match(coding, /git diff --cached --binary HEAD/);
  assert.match(coding, /uses: actions\/upload-artifact@v4/);
  assert.match(publish, /uses: actions\/download-artifact@v4/);
  assert.match(publish, /git apply --check/);
  assert.match(publish, /node --import tsx\/esm scripts\/validate-ai-fleet-diff\.mjs/);
  assert.match(publish, /gh pr create --draft/);
  assert.doesNotMatch(publish, /codex-action|npm run |gh pr merge|--auto/);
});

test('only the trusted publication and CI-dispatch jobs receive write permissions', () => {
  assert.match(publish, /permissions:\n      contents: write\n      pull-requests: write/);
  assert.match(publish, /needs: coding-fleet/);
  assert.match(publish, /outputs\.authorized/);
  assert.match(dispatch, /permissions:\n      actions: write\n      contents: read/);
  assert.match(dispatch, /GH_REPO: \$\{\{ github\.repository \}\}/);
  assert.match(dispatch, /needs: publish-proposal/);
});

test('automated changes remain draft PRs and are never auto-merged', () => {
  assert.match(publish, /gh pr create --draft/);
  assert.doesNotMatch(workflow, /gh pr merge|enable-pull-request-auto-merge|--auto/);
});
