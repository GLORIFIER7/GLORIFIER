import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/ai-coding-fleet.yml', import.meta.url),
  'utf8',
);
const ciWorkflow = await readFile(
  new URL('../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);
const diffPolicy = await readFile(
  new URL('./ai-fleet-diff-policy.mjs', import.meta.url),
  'utf8',
);

const dispatchStart = workflow.indexOf('  workflow_dispatch:');
const permissionsStart = workflow.indexOf('\n\npermissions:', dispatchStart);
const dispatchDeclaration = workflow.slice(dispatchStart, permissionsStart);

test('paid inference is an explicit manual input and defaults to false', () => {
  assert.ok(dispatchStart >= 0);
  assert.ok(permissionsStart > dispatchStart);
  assert.ok(dispatchDeclaration.includes('allow_paid_inference:'));
  assert.ok(dispatchDeclaration.includes('required: true'));
  assert.ok(dispatchDeclaration.includes('default: false'));
  assert.ok(dispatchDeclaration.includes('type: boolean'));
});

test('paid-inference authorization requires manual dispatch and existing maintenance authorization', () => {
  const start = workflow.indexOf('      - name: Resolve explicit paid-inference authorization');
  const end = workflow.indexOf('      - name: Enforce PR publication window', start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const step = workflow.slice(start, end);

  assert.ok(step.includes('EVENT_NAME:'));
  assert.ok(step.includes('github.event_name'));
  assert.ok(step.includes('inputs.allow_paid_inference'));
  assert.ok(step.includes('MAINTENANCE_AUTHORIZED:'));
  assert.ok(step.includes('steps.authorization.outputs.enabled'));
  assert.ok(step.includes('glorifier_ai_fleet_paid_inference_authorized'));
});

test('provider credential inspection and Codex invocation require explicit paid-inference authorization', () => {
  const providerStart = workflow.indexOf('      - name: Check OpenAI credential availability');
  const setupStart = workflow.indexOf('      - name: Setup Node.js', providerStart);
  const codexStart = workflow.indexOf('      - name: Run Codex without GitHub write permissions');
  const stageStart = workflow.indexOf('      - name: Stage AI-generated changes for review', codexStart);
  assert.ok(providerStart >= 0);
  assert.ok(setupStart > providerStart);
  assert.ok(codexStart > setupStart);
  assert.ok(stageStart > codexStart);

  const providerStep = workflow.slice(providerStart, setupStart);
  const codexStep = workflow.slice(codexStart, stageStart);
  const authorizationCondition = "steps.inference_authorization.outputs.authorized == 'true'";
  assert.ok(providerStep.includes(authorizationCondition));
  assert.ok(codexStep.includes(authorizationCondition));
});

test('unauthorized scheduled runs report no provider invocation and do not report a missing key', () => {
  assert.ok(workflow.includes('Report that paid inference is not authorized'));
  assert.ok(workflow.includes('No model was invoked'));

  const missingKeyStart = workflow.indexOf('      - name: Report missing API key');
  const capacityStart = workflow.indexOf('      - name: Report Codex capacity limitation', missingKeyStart);
  assert.ok(missingKeyStart >= 0);
  assert.ok(capacityStart > missingKeyStart);
  const missingKeyStep = workflow.slice(missingKeyStart, capacityStart);
  assert.ok(missingKeyStep.includes("steps.inference_authorization.outputs.authorized == 'true'"));
});

test('CI runs the shell and workflow-contract regression suites', () => {
  assert.ok(ciWorkflow.includes('bash scripts/ai-fleet-paid-inference-authorization.test.sh'));
  assert.ok(ciWorkflow.includes('node --test scripts/ai-fleet-paid-inference-workflow-contract.test.mjs'));
});

test('paid-inference authorization helpers and tests are protected from AI-generated diffs', () => {
  assert.ok(diffPolicy.includes('ai-fleet-authorization'));
  assert.ok(diffPolicy.includes('ai-fleet-workflow-contract'));
  assert.ok(diffPolicy.includes('ai-fleet-paid-inference-authorization'));
  assert.ok(diffPolicy.includes('ai-fleet-paid-inference-workflow-contract'));
  assert.ok(workflow.includes('scripts/ai-fleet-paid-inference-authorization.sh'));
  assert.ok(workflow.includes('scripts/ai-fleet-paid-inference-authorization.test.sh'));
  assert.ok(workflow.includes('scripts/ai-fleet-paid-inference-workflow-contract.test.mjs'));
  assert.ok(workflow.includes('paid-inference authorization helpers/tests'));
});
