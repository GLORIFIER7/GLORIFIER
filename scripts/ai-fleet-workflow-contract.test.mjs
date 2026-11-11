import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/ai-coding-fleet.yml', import.meta.url), 'utf8');
const authorization = readFileSync(new URL('./ai-fleet-authorization.sh', import.meta.url), 'utf8');
const operatingModel = readFileSync(new URL('../docs/AUTONOMOUS_ENGINEERING_OPERATING_MODEL.md', import.meta.url), 'utf8');
const claudeWorkflow = readFileSync(new URL('../.github/workflows/claude-development.yml', import.meta.url), 'utf8');
const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const neuralCiWorkflow = readFileSync(new URL('../.github/workflows/neural-ci.yml', import.meta.url), 'utf8');
const geminiCollaboratorWorkflow = readFileSync(new URL('../.github/workflows/gemini-collaborator.yml', import.meta.url), 'utf8');
const geminiDevelopmentWorkflow = readFileSync(new URL('../.github/workflows/gemini-development.yml', import.meta.url), 'utf8');
const geminiPrReviewWorkflow = readFileSync(new URL('../.github/workflows/gemini-pr-review.yml', import.meta.url), 'utf8');
const nvidiaTriageWorkflow = readFileSync(new URL('../.github/workflows/nvidia-ci-triage.yml', import.meta.url), 'utf8');
const nvidiaMaintenanceWorkflow = readFileSync(new URL('../.github/workflows/nvidia-assisted-maintenance-pr.yml', import.meta.url), 'utf8');
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

function publisherStepBlocks(job) {
  const stepsMarker = '    steps:\n';
  const stepsStart = job.indexOf(stepsMarker);
  assert.ok(stepsStart >= 0, 'publisher job must declare steps');
  const body = job.slice(stepsStart + stepsMarker.length);
  const starts = [...body.matchAll(/^      - /gm)].map((match) => match.index);
  assert.ok(starts.length > 0, 'publisher job must contain YAML step items');
  return starts.map((start, index) => body.slice(start, starts[index + 1] ?? body.length));
}

function assertPublisherStepGateContract(job) {
  const steps = publisherStepBlocks(job);
  assert.ok(
    steps[0].startsWith('      - name: Recheck Laos publication window before checkout or any write-capable step\n'),
    'the fresh clock gate must be the first publisher step',
  );
  assert.match(steps[0], /^        id: publisher_gate$/m);
  assert.ok(steps[0].includes('TZ=Asia/Vientiane date +%H%M'));
  assert.ok(steps[0].includes('current_hhmm_decimal < 831'));
  assert.ok(steps[0].includes('allowed=false'));
  assert.ok(steps[0].includes('allowed=true'));
  assert.doesNotMatch(steps[0], /^        (?:uses|env):/m);
  for (const [index, step] of steps.slice(1).entries()) {
    assert.match(
      step,
      /^        if: \$\{\{ steps\.publisher_gate\.outputs\.allowed == 'true' \}\}$/m,
      `publisher step ${index + 2} must require the fresh clock gate`,
    );
  }
  return steps;
}

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
  assert.ok(publish.includes('uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2'));
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

test('the write-capable publisher gates every YAML step after a first-step clock check', () => {
  const steps = assertPublisherStepGateContract(publish);
  assert.ok(steps.length >= 8, 'the publisher must include the gate and all seven current work steps');
});

test('the publisher contract rejects an unnamed step inserted before the clock gate', () => {
  const gateMarker = '      - name: Recheck Laos publication window before checkout or any write-capable step';
  const mutated = publish.replace(gateMarker, '      - run: echo unguarded\n' + gateMarker);
  assert.notEqual(mutated, publish, 'the mutation fixture must insert an unnamed step');
  assert.throws(
    () => assertPublisherStepGateContract(mutated),
    /fresh clock gate must be the first publisher step/,
  );
});

test('the publisher contract rejects an unnamed step inserted after the clock gate', () => {
  const checkoutMarker = '      - name: Checkout trusted main commit';
  const mutated = publish.replace(checkoutMarker, '      - run: echo unguarded\n' + checkoutMarker);
  assert.notEqual(mutated, publish, 'the mutation fixture must insert an unnamed step');
  assert.throws(
    () => assertPublisherStepGateContract(mutated),
    /publisher step 2 must require the fresh clock gate/,
  );
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

function assertGeminiAuthorizationWorkflow(item) {
  const condition = item.source.match(/^    if:\s*\$\{\{([^\r\n]*?)\}\}\s*$/m)?.[1] ?? '';
  assert.match(condition, /github.event_name == 'workflow_dispatch'/);
  assert.match(condition, /github.ref == 'refs\/heads\/main'/);
  assert.match(condition, /vars\.GLORIFIER_GEMINI_PAID_INFERENCE_AUTHORIZED == 'true'/);
  assert.match(condition, /github.actor_id == '32674233'/);
  assert.match(condition, /github.run_attempt == 1/);
  assert.doesNotMatch(condition, /inputs\.|schedule|pull_request_target/);
  assert.ok(item.source.includes('MANUAL_PAID_INFERENCE_AUTHORIZATION: \${{ vars.GLORIFIER_GEMINI_PAID_INFERENCE_AUTHORIZED }}'));
  const authorization = item.source.indexOf('glorifier_ai_maintenance_authorized');
  assert.ok(authorization >= 0 && authorization < item.source.indexOf(item.firstSensitiveStep));
  assert.ok(authorization < item.source.indexOf(item.modelStep));
  assert.match(item.source, /sudo install -d -o root -g root -m 755 \/etc\/glorifier/);
  assert.match(item.source, /GEMINI_CLI_SYSTEM_SETTINGS_PATH: \/etc\/glorifier\/gemini-system-settings\.json/);
}

test('Gemini provider workflows require owner-initiated manual dispatch and trusted settings', () => {
  const workflows = [
    { source: geminiCollaboratorWorkflow, firstSensitiveStep: 'name: Require Gemini credential', modelStep: 'name: Run Gemini engineering collaboration' },
    { source: geminiDevelopmentWorkflow, firstSensitiveStep: 'name: Setup Node.js', modelStep: 'name: Run Gemini CLI' },
    { source: geminiPrReviewWorkflow, firstSensitiveStep: 'name: Resolve the most recently updated open pull request', modelStep: 'name: Run Gemini advisory review' },
  ];
  for (const workflow of workflows) assertGeminiAuthorizationWorkflow(workflow);
  assert.match(geminiCollaboratorWorkflow, /schedule:/);
});

test('Gemini PR review requires an explicit open main-target PR number', () => {
  assert.match(geminiPrReviewWorkflow,
    /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+pr_number:\s*\n\s+description:[^\n]*\n\s+required:\s+true\n\s+type:\s+number/);
  assert.match(geminiPrReviewWorkflow, /PR_NUMBER_INPUT: \$\{\{ inputs\.pr_number \}\}/);
  assert.match(geminiPrReviewWorkflow, /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/pulls\/\$\{PR_NUMBER\}"/);
  assert.match(geminiPrReviewWorkflow, /STATE.*open/);
  assert.match(geminiPrReviewWorkflow, /BASE_REF.*main/);
  assert.doesNotMatch(geminiPrReviewWorkflow, /gh pr list --state open --limit 1/);
});

test('NVIDIA inference workflows require explicit owner-only manual authorization before credentials or provider calls', () => {
  const workflows = [
    {
      name: 'NVIDIA CI triage',
      source: nvidiaTriageWorkflow,
      credentialStep: 'Require NVIDIA credential',
      providerStep: 'Ask NVIDIA NIM for a diagnostic',
    },
    {
      name: 'NVIDIA assisted maintenance',
      source: nvidiaMaintenanceWorkflow,
      credentialStep: 'Require NVIDIA credential',
      providerStep: 'Request a constrained patch from Nemotron',
    },
  ];

  for (const item of workflows) {
    assert.match(item.source,
      /allow_paid_inference:\s*\n\s+description:[^\n]*\n\s+required:\s+true\n\s+type:\s+boolean\n\s+default:\s+false/,
      item.name + ' must default paid inference authorization to false');
    const jobCondition = item.source.match(/^    if:\s*\$\{\{([^\r\n]*?)\}\}\s*$/m)?.[1] ?? ''
    assert.match(jobCondition, /github\.event_name == 'workflow_dispatch'/,
      item.name + ' must run only from manual dispatch');
    assert.match(jobCondition, /github\.ref == 'refs\/heads\/main'/,
      item.name + ' must run only from main');
    assert.match(jobCondition, /inputs\.allow_paid_inference == true/,
      item.name + ' must require explicit paid-inference opt-in');
    assert.match(jobCondition, /github\.actor_id == '32674233'/,
      item.name + ' must require the owner account');
    assert.match(jobCondition, /github\.run_attempt == 1/,
      item.name + ' must deny reruns');
    assert.doesNotMatch(jobCondition, /workflow_run/,
      item.name + ' must never invoke a provider from an automatic workflow_run event');

    const checkoutIndex = item.source.indexOf('name: Checkout trusted main-branch authorization policy');
    const authorizationIndex = item.source.indexOf('glorifier_ai_maintenance_authorized');
    const credentialIndex = item.source.indexOf('name: ' + item.credentialStep);
    const providerIndex = item.source.indexOf('name: ' + item.providerStep);
    assert.ok(checkoutIndex >= 0 && checkoutIndex < authorizationIndex,
      item.name + ' must load the trusted shared authorization helper first');
    assert.ok(authorizationIndex < credentialIndex && authorizationIndex < providerIndex,
      item.name + ' must authorize before reading provider credentials or making provider requests');
    assert.match(item.source, /workflow_run:/,
      item.name + ' may retain the automatic trigger only as a skipped, default-deny event');
  }
});
