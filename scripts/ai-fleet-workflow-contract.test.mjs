import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/ai-coding-fleet.yml', import.meta.url), 'utf8');
const authorization = readFileSync(new URL('./ai-fleet-authorization.sh', import.meta.url), 'utf8');
const operatingModel = readFileSync(new URL('../docs/AUTONOMOUS_ENGINEERING_OPERATING_MODEL.md', import.meta.url), 'utf8');
const claudeWorkflow = readFileSync(new URL('../.github/workflows/claude-development.yml', import.meta.url), 'utf8');
const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const neuralCiWorkflow = readFileSync(new URL('../.github/workflows/neural-ci.yml', import.meta.url), 'utf8');
const claudeRunner = readFileSync(new URL('../scripts/run-claude-workflow.mjs', import.meta.url), 'utf8');
const dispatchMarker = '\n  dispatch-ci:\n';
const publicationWindowMarker = '\n  publication-window:\n';
const publishMarker = '\n  publish-proposal:\n';
const codingStart = workflow.indexOf('  coding-fleet:\n');
const publicationWindowStart = workflow.indexOf(publicationWindowMarker);
const publishStart = workflow.indexOf(publishMarker);
const dispatchStart = workflow.indexOf(dispatchMarker);
assert.ok(codingStart >= 0 && publicationWindowStart > codingStart && publishStart > publicationWindowStart && dispatchStart > publishStart,
  'expected coding-fleet, publication-window, publish-proposal, and dispatch-ci jobs in order');
const coding = workflow.slice(codingStart, publicationWindowStart);
const publicationWindow = workflow.slice(publicationWindowStart, publishStart);
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


test('the publication window gates only the draft PR publisher, not maintenance analysis or validation', () => {
  const providerStart = coding.indexOf('      - name: Check OpenAI credential availability');
  const closedWindowStart = coding.indexOf('      - name: Report that the Laos publication window is closed');
  assert.ok(providerStart >= 0 && closedWindowStart > providerStart,
    'expected provider check before the publication-window report');
  const maintenance = coding.slice(providerStart, closedWindowStart);
  assert.ok(!maintenance.includes('steps.time_window.outputs.allowed'),
    'provider checks, model execution, staging, and validation must not depend on the PR publication window');

  assert.ok(workflow.includes('publication_allowed: ${{ steps.time_window.outputs.allowed }}'),
    'the publication-window result must be exposed as a job output');
  assert.ok(!publish.includes("needs.coding-fleet.outputs.publication_allowed == 'true'"),
    'the publisher must not trust the maintenance-start clock snapshot');
  assert.match(publicationWindow, /needs: coding-fleet/);
  assert.match(publicationWindow, /permissions:\n      contents: read/);
  assert.doesNotMatch(publicationWindow, /(?:actions|contents|pull-requests):\s*write/);
  assert.match(publicationWindow, /TZ=Asia\/Vientiane date \+%H%M/);
  assert.match(publicationWindow, /current_hhmm_decimal < 831/);
  assert.match(publicationWindow, /allowed=true/);
  assert.ok(publish.includes('needs: [coding-fleet, publication-window]'));
  assert.match(publish, /needs\.publication-window\.outputs\.allowed == 'true'/);
  const publishStepStart = publish.indexOf('      - name: Publish validated draft PR');
  const publishStep = publish.slice(publishStepStart);
  const publicationClock = publishStep.indexOf('current_hhmm="$(TZ=Asia/Vientiane date +%H%M)"');
  const remotePush = publishStep.indexOf('git -c core.hooksPath=/dev/null push');
  const createPr = publishStep.indexOf('gh pr create --draft');
  assert.ok(publicationClock >= 0 && remotePush > publicationClock && createPr > publicationClock,
    'the current clock must be rechecked before branch push and PR creation');
  assert.match(publishStep, /if \(\( current_hhmm_decimal < 831 \)\); then/);
  assert.match(publishStep, /if ! current_hhmm=/);

  const windowStart = coding.indexOf('      - name: Enforce PR publication window (Laos)');
  const boundaryStart = coding.indexOf('      - name: Verify Laos time-window boundaries', windowStart);
  const windowStep = coding.slice(windowStart, boundaryStart);
  assert.ok(!windowStep.includes('exit 1'),
    'an unavailable clock must block publication without suppressing maintenance analysis');
  // The next step validates synthetic boundary fixtures; its exit 1 is intentional and is not the runtime clock-failure path.
  const boundaryEnd = coding.indexOf('      - name: Check OpenAI credential availability', boundaryStart);
  const boundaryStep = coding.slice(boundaryStart, boundaryEnd);
  assert.ok(boundaryStep.includes('for sample in 0000 0830 0831 0917 2359;'));
  assert.ok(boundaryStep.includes('exit 1'));
  assert.ok(!boundaryStep.includes('steps.time_window.outputs.allowed'));

  assert.ok(coding.includes('publisher will recheck the current clock immediately before any remote write'),
    'the initial closed-window notice must explain that publication uses a fresh clock check');
  assert.ok(!coding.includes('No model was invoked and no PR was created because it is before 08:31'));
});

test('a skipped patch-packaging step exports an explicit false changed value', () => {
  assert.match(workflow, /changed: \$\{\{ steps\.package\.outputs\.changed == 'true' \}\}/);
  assert.ok(publish.includes("needs.coding-fleet.outputs.changed == 'true'"));
});

test('scheduled inference is disabled and manual inference requires explicit funded authorization', () => {
  assert.match(dispatchDeclaration, /allow_paid_inference:\s+description:.*\s+required: true\s+default: false\s+type: boolean/);
  assert.doesNotMatch(workflow, /AI_MAINTENANCE_AUTORUN|SCHEDULE_AUTHORIZATION/);
  assert.match(workflow, /MANUAL_PAID_INFERENCE_AUTHORIZATION: \$\{\{ inputs\.allow_paid_inference \}\}/);
  assert.match(workflow, /OWNER_ACTOR_ID: \$\{\{ github\.actor_id \}\}/);
  assert.match(workflow, /RUN_ATTEMPT: \$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /glorifier_ai_maintenance_authorized "\$EVENT_NAME" "\$MANUAL_PAID_INFERENCE_AUTHORIZATION" "\$OWNER_ACTOR_ID" "\$RUN_ATTEMPT"/);
  assert.match(authorization, /actor_id="\$\{3:-\}"/);
  assert.match(authorization, /"\$actor_id" == "32674233"/);
  assert.match(authorization, /"\$run_attempt" == "1"/);
  assert.match(workflow, /Scheduled provider inference is disabled/);
  assert.match(workflow, /confirmed provider acceptance of GLR/);
  assert.match(operatingModel, /only when the .GLORIFIER7. owner account/);
  assert.match(operatingModel, /reruns are denied/);
  assert.doesNotMatch(operatingModel, /AI_MAINTENANCE_AUTORUN=true.*enables/);
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
  assert.match(publicationWindow, /permissions:\n      contents: read/);
  assert.doesNotMatch(publicationWindow, /(?:actions|contents|pull-requests):\s*write/);
  assert.match(publish, /permissions:\n      contents: write\n      pull-requests: write/);
  assert.ok(publish.includes('needs: [coding-fleet, publication-window]'));
  assert.match(publish, /outputs\.authorized/);
  assert.match(dispatch, /permissions:\n      actions: write\n      contents: read/);
  assert.match(dispatch, /GH_REPO: \$\{\{ github\.repository \}\}/);
  assert.match(dispatch, /needs: publish-proposal/);
});

test('the write-capable publisher rechecks the Laos window before checkout or any other step', () => {
  const gateMarker = '      - name: Recheck Laos publication window before checkout or any write-capable step';
  const gateStart = publish.indexOf(gateMarker);
  const checkoutStart = publish.indexOf('      - name: Checkout trusted main commit');
  assert.ok(gateStart >= 0 && checkoutStart > gateStart,
    'the publisher clock gate must be the first step, before checkout');

  const gate = publish.slice(gateStart, checkoutStart);
  assert.ok(gate.includes('id: publisher_gate'));
  assert.ok(gate.includes('TZ=Asia/Vientiane date +%H%M'));
  assert.ok(gate.includes('current_hhmm_decimal < 831'));
  assert.ok(gate.includes('allowed=false'));
  assert.ok(gate.includes('allowed=true'));
  assert.doesNotMatch(gate, /uses:|GH_TOKEN:|npm ci|git push|gh pr create/,
    'the pre-check gate must not checkout code, install dependencies, or use write-capable commands');

  const publisherSteps = publish.slice(checkoutStart);
  const stepStarts = [...publisherSteps.matchAll(/^      - name: /gm)].map((match) => match.index);
  assert.ok(stepStarts.length >= 7, 'expected all publisher steps to be present');
  for (const [index, stepStart] of stepStarts.entries()) {
    const stepEnd = stepStarts[index + 1] ?? publisherSteps.length;
    const stepHeader = publisherSteps.slice(stepStart, stepEnd).split(String.fromCharCode(10)).slice(0, 3).join(String.fromCharCode(10));
    assert.ok(stepHeader.includes('if: ' + '$' + "{{ steps.publisher_gate.outputs.allowed == 'true' }}"),
      'every checkout, install, artifact, validation, and publish step must require the fresh publisher gate');
  }
});

test('every action in the write-capable publisher is pinned to an immutable commit SHA', () => {
  const actionRefs = publish
    .split(String.fromCharCode(10))
    .filter((line) => line.trimStart().startsWith('uses:'))
    .map((line) => line.trim().slice('uses:'.length).trim().split(' ')[0]);
  assert.equal(actionRefs.length, 3, 'the publisher should use only the three reviewed GitHub actions');
  for (const actionRef of actionRefs) {
    assert.ok(/@[0-9a-f]{40}$/.test(actionRef),
      'write-capable publisher actions must use immutable 40-character commit SHAs: ' + actionRef);
  }
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


function locateReviewJobs(source) {
  const scope = /^  review-scope:[ \t]*\r?$/m.exec(source);
  const policy = /^  ai-review-policy:[ \t]*\r?$/m.exec(source);
  return {
    scopeStart: scope?.index ?? -1,
    policyStart: policy?.index ?? -1,
  };
}

test('NEURAL review job boundaries handle LF, CRLF, and missing markers', () => {
  const lf = [
    '  review-scope:',
    '    runs-on: ubuntu-latest',
    '  ai-review-policy:',
    '    runs-on: ubuntu-latest',
  ].join('\n');
  const crlf = lf.replaceAll('\n', '\r\n');
  for (const source of [lf, crlf]) {
    const { scopeStart, policyStart } = locateReviewJobs(source);
    assert.ok(scopeStart >= 0 && policyStart > scopeStart);
  }
  assert.equal(locateReviewJobs('  ai-review-policy:\n').scopeStart, -1);
});

test('NEURAL review events scope the AI policy to relevant files and fail closed on lookup errors', () => {
  const { scopeStart, policyStart } = locateReviewJobs(neuralCiWorkflow);
  assert.ok(scopeStart >= 0 && policyStart > scopeStart,
    'NEURAL review scope must be evaluated before the AI review policy');
  const scope = neuralCiWorkflow.slice(scopeStart, policyStart);
  const policy = neuralCiWorkflow.slice(policyStart);

  assert.match(scope, /if: github\.event_name == 'pull_request_review'/);
  assert.match(scope, /gh api --paginate/);
  assert.match(scope, /previous_filename/);
  assert.match(scope, /pull-requests: read/);
  assert.doesNotMatch(scope, /contents: write|pull-requests: write/);
  assert.ok(scope.includes("changed_file_count=\"$(gh api \"repos/${GH_REPO}/pulls/${PR_NUMBER}\" --jq '.changed_files')\""));
  assert.ok(scope.includes('if [[ ! "$changed_file_count" =~ ^[0-9]+$ ]]; then'));
  assert.ok(scope.includes('if (( changed_file_count >= 3000 )); then'));
  assert.ok(scope.includes('echo "required=true" >> "$GITHUB_OUTPUT"'));
  assert.ok(scope.includes('if grep -Eq \'^services/neural/\' <<<"$changed_paths" || grep -Fqx \'.github/workflows/neural-ci.yml\' <<<"$changed_paths"; then'));
  assert.match(policy, /needs: \[review-scope\]/);
  assert.match(policy, /always\(\)/);
  assert.match(policy, /needs\.review-scope\.result != 'success'/);
  assert.match(policy, /needs\.review-scope\.outputs\.required == 'true'/);
  assert.match(policy, /github\.event_name == 'pull_request'/);
});

test('NEURAL review events use unique concurrency groups and cannot cancel their own scope evaluation', () => {
  const concurrencyStart = neuralCiWorkflow.indexOf('concurrency:');
  const permissionsStart = neuralCiWorkflow.indexOf('permissions:', concurrencyStart);
  assert.ok(concurrencyStart >= 0 && permissionsStart > concurrencyStart,
    'NEURAL workflow must define concurrency before permissions');
  const concurrency = neuralCiWorkflow.slice(concurrencyStart, permissionsStart);

  assert.ok(
    concurrency.includes("github.event_name == 'pull_request_review' && github.event.review.id"),
    'each review event must have its own concurrency key',
  );
  assert.ok(concurrency.includes("|| 'latest'"), "concurrency group must fall back to 'latest' for non-review events");
  assert.ok(concurrency.includes('cancel-in-progress: true'),
    'new branch updates may continue to supersede older branch-update runs');
});
