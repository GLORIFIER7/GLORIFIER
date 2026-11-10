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
  assert.ok(dispatchStart >= 0 && permissionsStart > dispatchStart);
  assert.match(dispatchDeclaration, /allow_paid_inference:[\s\S]*?required:\s*true[\s\S]*?default:\s*false[\s\S]*?type:\s*boolean/);
});

test('paid-inference authorization requires manual dispatch and the separate maintenance authorization', () => {
  const start = workflow.indexOf('      - name: Resolve explicit paid-inference authorization');
  const end = workflow.indexOf('      - name: Enforce PR publication window', start);
  assert.ok(start >= 0 && end > start, 'expected the explicit paid-inference authorization step');
  const step = workflow.slice(start, end);

  assert.match(step, /EVENT_NAME:\s*\$\{\{\s*github\.event_name\s*\}\}/);
  assert.match(step, /ALLOW_PAID_INFERENCE:\s*\$\{\{\s*inputs\.allow_paid_inference\s*\}\}/);
  assert.match(step, /MAINTENANCE_AUTHORIZED:\s*\$\{\{\s*steps\.authorization\.outputs\.enabled\s*\}\}/);
  assert.match(step, /glorifier_ai_fleet_paid_inference_authorized "\$EVENT_NAME" "\$ALLOW_PAID_INFERENCE"/);
  assert.match(step, /if \[\[ "\$MAINTENANCE_AUTHORIZED" == "true" \]\]/);
});

test('provider credential inspection and Codex invocation require explicit paid-inference authorization', () => {
  const providerStart = workflow.indexOf('      - name: Check OpenAI credential availability');
  const setupStart = workflow.indexOf('      - name: Setup Node.js', providerStart);
  const codexStart = workflow.indexOf('      - name: Run Codex without GitHub write permissions');
  const stageStart = workflow.indexOf('      - name: Stage AI-generated changes for review', codexStart);
  assert.ok(providerStart >= 0 && setupStart > providerStart);
  assert.ok(codexStart > setupStart && stageStart > codexStart);

  const providerStep = workflow.slice(providerStart, setupStart);
  const codexStep = workflow.slice(codexStart, stageStart);
  assert.match(providerStep, /if:.*steps\.inference_authorization\.outputs\.authorized == 'true'/);
  assert.match(codexStep, /if:.*steps\.inference_authorization\.outputs\.authorized == 'true'/);
});

test('unauthorized scheduled runs report no provider invocation and do not report a missing key', () => {
  assert.match(workflow, /Report that paid inference is not authorized/);
  assert.match(workflow, /No model was invoked/);

  const missingKeyStart = workflow.indexOf('      - name: Report missing API key');
  const capacityStart = workflow.indexOf('      - name: Report Codex capacity limitation', missingKeyStart);
  assert.ok(missingKeyStart >= 0 && capacityStart > missingKeyStart);
  const missingKeyStep = workflow.slice(missingKeyStart, capacityStart);
  assert.match(missingKeyStep, /steps\.inference_authorization\.outputs\.authorized == 'true'/);
});

test('CI runs the shell and workflow-contract regression suites', () => {
  assert.match(ciWorkflow, /AI fleet paid-inference authorization regression tests[\s\S]*?bash scripts\/ai-fleet-paid-inference-authorization\.test\.sh/);
  assert.match(ciWorkflow, /AI fleet paid-inference workflow contract tests[\s\S]*?node --test scripts\/ai-fleet-paid-inference-workflow-contract\.test\.mjs/);
});


test('paid-inference authorization helpers and tests are protected from AI-generated diffs', () => {
  assert.match(diffPolicy, /ai-fleet-authorization/);
  assert.match(diffPolicy, /ai-fleet-workflow-contract/);
  assert.match(diffPolicy, /ai-fleet-paid-inference-authorization/);
  assert.match(diffPolicy, /ai-fleet-paid-inference-workflow-contract/);
  assert.match(workflow, /scripts\/ai-fleet-paid-inference-authorization\.sh/);
  assert.match(workflow, /scripts\/ai-fleet-paid-inference-authorization\.test\.sh/);
  assert.match(workflow, /scripts\/ai-fleet-paid-inference-workflow-contract\.test\.mjs/);
  assert.match(workflow, /paid-inference authorization helper\/tests/);
});
