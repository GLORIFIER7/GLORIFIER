import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/ai-coding-fleet.yml', import.meta.url), 'utf8');
const claudeWorkflow = readFileSync(new URL('../.github/workflows/claude-development.yml', import.meta.url), 'utf8');
const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const neuralCiWorkflow = readFileSync(new URL('../.github/workflows/neural-ci.yml', import.meta.url), 'utf8');
const claudeRunner = readFileSync(new URL('../scripts/run-claude-workflow.mjs', import.meta.url), 'utf8');
const dispatchMarker = '\n  dispatch-ci:\n';
const publishMarker = '\n  publish-proposal:\n';
const codingStart = workflow.indexOf('  coding-fleet:\n');
const publishStart = workflow.indexOf(publishMarker);
const dispatchStart = workflow.indexOf(dispatchMarker);
assert.ok(codingStart >= 0 && publishStart > codingStart && dispatchStart > publishStart,
  'expected coding-fleet, publish-proposal, and dispatch-ci jobs in order');
const coding = workflow.slice(codingStart, publishStart);
const codexStart = coding.indexOf('      - name: Run Codex without GitHub write permissions');
const stageStart = coding.indexOf('\n      - name: Stage AI-generated changes for review', codexStart);
assert.ok(codexStart >= 0 && stageStart > codexStart, 'expected one bounded Codex execution step');
const codex = coding.slice(codexStart, stageStart);
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
  assert.match(codex, /effort: medium/);
  assert.match(codex, /openai-api-key: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.doesNotMatch(codex, /env:\n\s+OPENAI_API_KEY:/);
});

test('generated changes cross the privilege boundary only as a validated patch artifact', () => {
  assert.match(coding, /git diff --cached --binary HEAD/);
  assert.match(coding, /uses: actions\/upload-artifact@v4/);
  assert.match(publish, /uses: actions\/download-artifact@v8/);
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

test('Claude direct runner blocks npm lifecycle-install commands', () => {
  const allowedTools = claudeRunner.match(/const ALLOWED_TOOLS = \[([\s\S]*?)\];/)?.[1];
  assert.ok(allowedTools, 'Claude CLI allowlist must be present in the direct runner');
  const forbiddenInstallTool = /Bash\(npm\s+(?:ci|install|i|add)(?:\s|\))/;
  for (const command of ['ci', 'install', 'i', 'add']) {
    assert.match(
      'Bash(npm ' + command + ')',
      forbiddenInstallTool,
      'the denylist must recognize npm ' + command + ' as an install-capable command',
    );
  }
  assert.match(
    'Bash(npm ci --ignore-scripts)',
    forbiddenInstallTool,
    'the denylist must recognize npm ci even when an alternate flag is supplied',
  );
  assert.doesNotMatch(
    allowedTools,
    forbiddenInstallTool,
    'Claude must not be able to run npm install commands that execute lifecycle scripts',
  );
  assert.match(allowedTools, /Bash\(npm run lint\)/);
  assert.match(allowedTools, /Bash\(npm run build\)/);
  assert.doesNotMatch(claudeRunner, /--dangerously-skip-permissions/);

  const dependencyInstall = claudeWorkflow.indexOf('run: npm ci --ignore-scripts');
  const claudeCli = claudeWorkflow.indexOf('run: node scripts/run-claude-workflow.mjs');
  assert.ok(
    dependencyInstall >= 0 && claudeCli > dependencyInstall,
    'trusted dependencies must be installed with lifecycle scripts disabled before Claude starts',
  );
  assert.equal(
    (claudeWorkflow.match(/run: node scripts\/run-claude-workflow\.mjs/g) || []).length,
    1,
    'the Claude workflow must invoke the direct runner exactly once',
  );
  assert.doesNotMatch(claudeWorkflow, /uses: anthropics\/claude-code-action@/);
});

test('CI runs the Claude direct CLI runner regression suite', () => {
  assert.match(
    ciWorkflow,
    /- name: Claude direct CLI runner regression tests\s+run: node --test scripts\/run-claude-workflow\.test\.mjs/,
  );
});


test('NEURAL review events scope the AI policy to relevant files and fail closed on lookup errors', () => {
  const scopeStart = neuralCiWorkflow.indexOf('  review-scope:\\n');
  const policyStart = neuralCiWorkflow.indexOf('  ai-review-policy:\\n');
  assert.ok(scopeStart >= 0 && policyStart > scopeStart,
    'NEURAL review scope must be evaluated before the AI review policy');
  const scope = neuralCiWorkflow.slice(scopeStart, policyStart);
  const policy = neuralCiWorkflow.slice(policyStart);

  assert.match(scope, /if: github\.event_name == 'pull_request_review'/);
  assert.match(scope, /gh api --paginate/);
  assert.match(scope, /services\/neural\//);
  assert.match(scope, /neural-ci\.yml/);
  assert.match(policy, /needs: \[review-scope\]/);
  assert.match(policy, /always\(\)/);
  assert.match(policy, /needs\.review-scope\.result != 'success'/);
  assert.match(policy, /needs\.review-scope\.outputs\.required == 'true'/);
  assert.match(policy, /github\.event_name == 'pull_request'/);
});