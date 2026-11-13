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
  assert.match(coding, new RegExp('uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9'));
  assert.ok(publish.includes('digest-mismatch: error'));
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

  assert.match(scope, /if: github\.event_name == 'pull_request_review' \|\| github\.event_name == 'pull_request_review_comment'/);
  assert.match(scope, /gh api --paginate/);
  assert.match(scope, /previous_filename/);
  assert.match(scope, /pull-requests: read/);
  assert.doesNotMatch(scope, /contents: write|pull-requests: write/);
  assert.ok(scope.includes('fail_closed_on_api_error() {'));
  assert.ok(scope.includes('if ! changed_file_count='));
  assert.ok(scope.includes('if ! changed_paths='));
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

function neuralJobSection(source, name) {
  const heading = '\n  ' + name + ':\n';
  const start = source.indexOf(heading);
  if (start < 0) return '';
  const contentStart = start + heading.length;
  const remainder = source.slice(contentStart);
  let offset = 0;
  for (const line of remainder.split('\n')) {
    if (line.startsWith('  ') && !line.startsWith('    ') && line.trimEnd().endsWith(':')) {
      return remainder.slice(0, offset);
    }
    offset += line.length + 1;
  }
  return remainder;
}

test('NEURAL review events serialize policy without cancelling CI validation', () => {
  assert.equal(neuralCiWorkflow.split('\n').filter((line) => line === 'concurrency:').length, 0,
    'workflow-level cancellation must not let a review-only event cancel the test job');

  const testJob = neuralJobSection(neuralCiWorkflow, 'test');
  const policyJob = neuralJobSection(neuralCiWorkflow, 'ai-review-policy');
  assert.ok(testJob && policyJob, 'both NEURAL validation and review-policy jobs must exist');

  assert.ok(testJob.includes("if: github.event_name != 'pull_request_review' && github.event_name != 'pull_request_review_comment'"),
    'review-only events must not start a duplicate full validation job');
  assert.ok(testJob.includes('group: neural-test-${{ github.workflow }}-${{ github.event.pull_request.number || github.sha }}-${{ matrix.python-version }}'),
    'test runs must serialize within their own CI concurrency group');
  assert.ok(testJob.includes('cancel-in-progress: true'),
    'a newer code update may supersede an older test run');

  assert.ok(policyJob.includes('group: neural-policy-${{ github.workflow }}-${{ github.event.pull_request.number || github.sha }}'),
    'PR and review events must serialize policy evaluations in a separate group');
  assert.ok(policyJob.includes('cancel-in-progress: true'),
    'new review evidence must supersede stale policy evaluations');
});

function assertGeminiAuthorizationWorkflow(item) {
  const condition = item.source.match(/^    if:\s*\$\{\{([^\r\n]*?)\}\}\s*$/m)?.[1] ?? '';
  assert.match(condition, /github.event_name == 'workflow_dispatch'/);
  assert.match(condition, /github.ref == 'refs\/heads\/main'/);
  assert.ok(condition.includes(item.authorizationCondition));
  assert.match(condition, /github.actor_id == '32674233'/);
  assert.match(condition, /github.run_attempt == 1/);
  assert.doesNotMatch(condition, /schedule|pull_request_target/);
  assert.ok(item.source.includes(item.manualAuthorizationLine));
  const authorization = item.source.indexOf('glorifier_ai_maintenance_authorized');
  assert.ok(authorization >= 0 && authorization < item.source.indexOf(item.firstSensitiveStep));
  assert.ok(authorization < item.source.indexOf(item.modelStep));
  assert.match(item.source, /sudo install -d -o root -g root -m 755 \/etc\/glorifier/);
  assert.match(item.source, /GEMINI_CLI_SYSTEM_SETTINGS_PATH: \/etc\/glorifier\/gemini-system-settings\.json/);
}

test('Gemini provider workflows require owner-initiated manual dispatch and trusted settings', () => {
  const workflows = [
    {
      source: geminiCollaboratorWorkflow,
      firstSensitiveStep: 'name: Require Gemini credential',
      modelStep: 'name: Run Gemini engineering collaboration',
      authorizationCondition: 'inputs.allow_paid_inference == true',
      manualAuthorizationLine: 'MANUAL_PAID_INFERENCE_AUTHORIZATION: ${{ inputs.allow_paid_inference }}',
    },
    {
      source: geminiDevelopmentWorkflow,
      firstSensitiveStep: 'name: Setup Node.js',
      modelStep: 'name: Run Gemini CLI',
      authorizationCondition: 'inputs.allow_paid_inference == true',
      manualAuthorizationLine: 'MANUAL_PAID_INFERENCE_AUTHORIZATION: ${{ inputs.allow_paid_inference }}',
    },
    {
      source: geminiPrReviewWorkflow,
      firstSensitiveStep: 'name: Validate explicitly selected pull request',
      modelStep: 'name: Run Gemini free-tier advisory review',
      authorizationCondition: "vars.GLORIFIER_GEMINI_FREE_TIER_CONFIRMED == 'true'",
      manualAuthorizationLine: 'FREE_TIER_CONFIRMED: ${{ vars.GLORIFIER_GEMINI_FREE_TIER_CONFIRMED }}',
    },
  ];
  for (const workflow of workflows) assertGeminiAuthorizationWorkflow(workflow);
  assert.match(geminiCollaboratorWorkflow, /schedule:/);
});

test('Gemini PR review requires an explicit main-target PR number after owner authorization', () => {
  assert.match(
    geminiPrReviewWorkflow,
    /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+pr_number:\s*\n\s+description:.*\n\s+required: true\n\s+type: number/,
  );
  assert.match(geminiPrReviewWorkflow, /vars\.GLORIFIER_GEMINI_FREE_TIER_CONFIRMED == 'true'/);
  assert.match(geminiPrReviewWorkflow, /FREE_TIER_CONFIRMED: \$\{\{ vars\.GLORIFIER_GEMINI_FREE_TIER_CONFIRMED \}\}/);
  assert.match(geminiPrReviewWorkflow, /gemini_model: gemini-3\.8-flash/);
  assert.match(geminiPrReviewWorkflow, /gemini_cli_version: v0\.68\.0/);
  assert.match(geminiPrReviewWorkflow, /fail without switching models, providers, or billing tiers/);
  assert.doesNotMatch(geminiPrReviewWorkflow, /GLORIFIER_GEMINI_PAID_INFERENCE_AUTHORIZED/);
  assert.doesNotMatch(geminiPrReviewWorkflow, /gh pr list --state open --base main --limit 1/);
  assert.match(geminiPrReviewWorkflow, /PR_NUMBER: \$\{\{ inputs\.pr_number \}\}/);
  assert.match(geminiPrReviewWorkflow, /PR_NUMBER: \$\{\{ steps\.resolve-pr\.outputs\.number \}\}/);
  assert.match(geminiPrReviewWorkflow, /STATE.*open/);
  assert.match(geminiPrReviewWorkflow, /BASE_REF.*main/);
  assert.doesNotMatch(geminiPrReviewWorkflow, /inputs\.allow_paid_inference/);
  assert.doesNotMatch(geminiPrReviewWorkflow, /pull_request_target:/);
  assert.doesNotMatch(geminiPrReviewWorkflow, /inputs\./);
  assert.deepEqual(geminiPrReviewWorkflow.split(String.fromCharCode(10)).slice(0, 3), [
    'name: GLORIFIER Gemini PR Review',
    'on:',
    '  workflow_dispatch: {}',
  ]);
  assert.equal(geminiPrReviewWorkflow.includes('pull_request_target:'), false);
});

test('NVIDIA inference workflows require explicit owner-only manual authorization before credentials or provider calls', () => {
  const workflows = [
    {
      name: 'NVIDIA CI triage',
      source: nvidiaTriageWorkflow,
      credentialStep: 'Require NVIDIA credential',
      providerStep: 'Ask NVIDIA NIM for a diagnostic',
      collectionStep: 'Collect and redact bounded failed-step logs'
    },
    {
      name: 'NVIDIA assisted maintenance',
      source: nvidiaMaintenanceWorkflow,
      credentialStep: 'Require NVIDIA credential',
      providerStep: 'Request a constrained patch from Nemotron',
      collectionStep: 'Gather bounded failure logs and changed source'
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
    const collectionIndex = item.source.indexOf('name: ' + item.collectionStep);
    assert.ok(checkoutIndex >= 0 && checkoutIndex < authorizationIndex,
      item.name + ' must load the trusted shared authorization helper first');
    assert.ok(authorizationIndex < collectionIndex,
      item.name + ' must authorize before collecting CI logs or source context');
    assert.ok(authorizationIndex < credentialIndex && authorizationIndex < providerIndex,
      item.name + ' must authorize before reading provider credentials or making provider requests');
    assert.match(item.source, /workflow_run:/,
      item.name + ' may retain the automatic trigger only as a skipped, default-deny event');
  }
});


test('NVIDIA assisted maintenance validates generated code in a read-only job before static-only publication', () => {
  const proposalStart = nvidiaMaintenanceWorkflow.indexOf('\n  propose-fix:\n');
  const validatorStart = nvidiaMaintenanceWorkflow.indexOf('\n  validate-fix:\n');
  const publisherStart = nvidiaMaintenanceWorkflow.indexOf('\n  publish-fix:\n');
  assert.ok(proposalStart >= 0 && validatorStart > proposalStart && publisherStart > validatorStart,
    'expected proposal, validation, and publication jobs in order');
  assert.ok(proposalStart >= 0, 'expected a provider proposal job');
  assert.ok(validatorStart > proposalStart, 'expected read-only validation after proposal');
  assert.ok(publisherStart > validatorStart, 'expected publication after validation');

  const proposal = nvidiaMaintenanceWorkflow.slice(proposalStart, validatorStart);
  const validator = nvidiaMaintenanceWorkflow.slice(validatorStart, publisherStart);
  const publisher = nvidiaMaintenanceWorkflow.slice(publisherStart);

  assert.match(nvidiaMaintenanceWorkflow,
    /^permissions:\n  actions: read\n  contents: read\n  pull-requests: read$/m,
    'workflow defaults must be read-only');
  assert.match(proposal,
    /^    permissions:\n      actions: read\n      contents: read\n      pull-requests: read$/m,
    'provider job must explicitly use read-only repository permissions');
  assert.doesNotMatch(proposal, /contents:\s*write|pull-requests:\s*write|gh pr create|git push/,
    'provider execution must not receive write permissions or publish changes');
  assert.match(proposal, /sha256sum/,
    'proposal must hash the exact generated patch before handing it to downstream jobs');
  assert.match(proposal, /patch_sha256=/,
    'proposal must publish the generated patch digest as a job output');
  assert.match(proposal, /uses: actions\/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9/,
    'provider job must hand off the candidate patch as an artifact');

  assert.match(validator, /needs: propose-fix/);
  assert.match(validator, /if: \$\{\{ needs\.propose-fix\.result == 'success' && needs\.propose-fix\.outputs\.created == 'true' \}\}/,
    'validator must require a successful proposal job and a created patch');
  assert.match(validator,
    /^    permissions:\n      actions: read\n      contents: read\n      pull-requests: read$/m,
    'generated code must execute only in a read-only validation job');
  assert.match(validator, /uses: actions\/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333/);
  assert.match(validator, /npm run build/);
  assert.match(validator, /npm run test:nvidia-provider/);
  assert.match(validator, /npm run test:protected-api-paths/);
  assert.match(validator, /npm run test:harness/);
  assert.match(validator, /npm run test:architecture/);
  assert.match(validator, /npm run test:geas-claim-verification/);
  assert.match(validator, /npm run test:geas-state-reconciliation/);
  assert.match(validator, /sha256sum/);
  assert.match(validator, /patch_sha256=/,
    'validator must export the digest of the exact patch it tested');

  assert.match(publisher, /needs: \[propose-fix, validate-fix\]/);
  assert.match(publisher, /if: \$\{\{ needs\.propose-fix\.result == 'success' && needs\.propose-fix\.outputs\.created == 'true' && needs\.validate-fix\.result == 'success' \}\}/,
    'publisher must require successful proposal and validation jobs');
  assert.match(publisher, /needs\.validate-fix\.outputs\.patch_sha256/);
  assert.match(validator, /EXPECTED_PATCH_SHA256: \$\{\{ needs\.propose-fix\.outputs\.patch_sha256 \}\}/,
    'read-only validator must verify the candidate digest produced before code execution');

  assert.match(publisher, /needs: \[propose-fix, validate-fix\]/);
  assert.match(publisher, /needs\.validate-fix\.outputs\.patch_sha256/);
  assert.match(publisher,
    /^    permissions:\n      actions: read\n      contents: write\n      pull-requests: write$/m,
    'only the publisher may hold the minimum GitHub write permissions');
  assert.match(publisher, /uses: actions\/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333/);
  assert.match(publisher, /persist-credentials: false/);
  assert.match(publisher, /sha256sum/,
    'publisher must verify it received the exact patch tested by the read-only validator');
  assert.match(publisher, /git -c core\.hooksPath=\/dev\/null .* apply/);
  assert.doesNotMatch(publisher, /NVIDIA_API_KEY|secrets\.NVIDIA/);
  assert.doesNotMatch(publisher, /^\s+(?:npm (?:ci|audit|run)|node .*test|test:nvidia-provider|test:protected-api-paths)\b/m,
    'write-capable publisher must never execute model-generated code or project scripts');
  const publisherCommands = publisherStepBlocks(publisher)
    .map((step) => step.split('        run:').slice(1).join('\n'))
    .join('\n');
  assert.doesNotMatch(publisherCommands, /(?:^|[\n;&|()]\s*)npm\s+(?:ci|install|test|audit|run|exec)\b/i,
    'publisher must not execute npm commands');
  assert.doesNotMatch(publisherCommands, /(?:^|[\n;&|()]\s*)npx\s+\S+/i,
    'publisher must not execute npx commands');
  assert.doesNotMatch(publisherCommands, /(?:^|[\n;&|()]\s*)yarn\s+(?:install|test|run|exec)\b/i,
    'publisher must not execute yarn commands');
  assert.doesNotMatch(publisherCommands, /(?:^|[\n;&|()]\s*)pnpm\s+(?:install|test|run|exec)\b/i,
    'publisher must not execute pnpm commands');
  assert.doesNotMatch(publisherCommands, /(?:^|[\n;&|()]\s*)node\s+\S+/i,
    'publisher must not run Node scripts');
  assert.doesNotMatch(publisherCommands, /(?:^|[\n;&|()]\s*)python3?\s+(?:-c\b|\S+\.py\b)/i,
    'publisher must not execute dynamic Python or Python files');
  assert.doesNotMatch(publisherCommands, /(?:^|[\n;&|()]\s*)(?:bash|sh)\s+\S+/i,
    'publisher must not launch shell scripts');
  assert.doesNotMatch(publisherCommands, /test:nvidia-provider|test:protected-api-paths/i,
    'publisher must not run project test scripts');

  const createIndex = publisher.indexOf('      - name: Create review branch and pull request');
  assert.ok(createIndex >= 0, 'expected the final publication step');
  const prePublication = publisher.slice(0, createIndex);
  const publication = publisher.slice(createIndex);
  assert.doesNotMatch(prePublication, /GH_TOKEN|github\.token/,
    'patch application and static checks must run without the write token');
  assert.match(publication, /GH_TOKEN: \$\{\{ github\.token \}\}/,
    'write token must be scoped only to the final PR publication step');
  assert.ok(publication.includes('gh pr create'),
    'publisher must create only a review pull request');
  assert.doesNotMatch(nvidiaMaintenanceWorkflow, /gh pr merge|enable-pull-request-auto-merge|--auto/,
    'automation must never auto-merge');
});

test('Gemini diff retrieval, summary validation, and publication target the same resolved pull request', () => {
  const diffStart = geminiPrReviewWorkflow.indexOf('      - name: Retrieve pull request diff as untrusted data');
  const reviewStart = geminiPrReviewWorkflow.indexOf('      - name: Require a non-empty Gemini review');
  const publishStart = geminiPrReviewWorkflow.indexOf('\n  publish-review:\n');
  assert.ok(diffStart >= 0 && reviewStart > diffStart && publishStart > reviewStart,
    'expected diff retrieval, review validation, and publication steps in order');
  const diffStep = geminiPrReviewWorkflow.slice(diffStart, geminiPrReviewWorkflow.indexOf('\n      - name:', diffStart + 1));
  const reviewStep = geminiPrReviewWorkflow.slice(reviewStart, publishStart);
  const publisher = geminiPrReviewWorkflow.slice(publishStart);
  assert.ok(diffStep.includes('PR_NUMBER: ${{ steps.resolve-pr.outputs.number }}'),
    'diff retrieval must use the resolved PR number');
  assert.ok(reviewStep.includes('PR_NUMBER: ${{ steps.resolve-pr.outputs.number }}'),
    'non-empty review validation must use the same resolved PR number');
  assert.ok(publisher.includes('PR_NUMBER: ${{ needs.gemini-review.outputs.pr_number }}'),
    'publication must use the validated job output rather than another PR source');
});


test('GLORIFIER CI runs static Linux host-agent and interoperability contract suites', () => {
  assert.match(ciWorkflow, /run: npm run test:linux-host-agent-contract/);
  assert.match(ciWorkflow, /run: npm run test:interoperability-protocol-boundaries/);
  assert.match(ciWorkflow, /run: npm run test:interoperability-evidence-policy/);
  assert.match(ciWorkflow, /run: npm run test:interoperability-registry/);
  assert.match(ciWorkflow, /run: npm run test:polyglot-sdk-inventory/);
  assert.match(ciWorkflow, /run: npm run validate:interoperability-registry/);
  assert.match(ciWorkflow, /run: npm run validate:polyglot-sdk-inventory/);
});
