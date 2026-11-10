import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/continuous-improvement.yml', import.meta.url),
  'utf8',
);
const agent = await readFile(
  new URL('./continuous-improvement-agent.mjs', import.meta.url),
  'utf8',
);

test('scheduled improvement runs do not invoke paid inference by default', () => {
  const dispatchStart = workflow.indexOf('  workflow_dispatch:');
  const permissionsStart = workflow.indexOf('\n\npermissions:', dispatchStart);
  assert.ok(dispatchStart >= 0 && permissionsStart > dispatchStart);
  const dispatch = workflow.slice(dispatchStart, permissionsStart);
  assert.match(dispatch, /allow_paid_inference:[\s\S]*?type:\s*boolean/);
  assert.match(dispatch, /default:\s*false/);

  const modelStart = workflow.indexOf('      - name: AI improvement analysis');
  const resultStart = workflow.indexOf('      - name: Governed result', modelStart);
  assert.ok(modelStart >= 0 && resultStart > modelStart);
  const modelStep = workflow.slice(modelStart, resultStart);
  assert.match(
    modelStep,
    /if:\s*github\.event_name == 'workflow_dispatch' && inputs\.allow_paid_inference == true/,
  );
  assert.match(modelStep, /ALLOW_PAID_INFERENCE:\s*\$\{\{\s*inputs\.allow_paid_inference\s*\}\}/);
});

test('the improvement agent fails closed before provider discovery without explicit authorization', () => {
  const guard = "process.env.ALLOW_PAID_INFERENCE !== 'true'";
  const guardIndex = agent.indexOf(guard);
  const providerIndex = agent.indexOf('const candidates=availableProviders()');
  assert.ok(guardIndex >= 0, 'agent must require explicit paid-inference authorization');
  assert.ok(providerIndex > guardIndex, 'authorization must be checked before provider discovery');
});

test('unauthorized scheduled runs report that no provider request was made', () => {
  const resultStart = workflow.indexOf('      - name: Governed result');
  assert.ok(resultStart >= 0);
  const resultStep = workflow.slice(resultStart);
  assert.match(resultStep, /steps\.improve\.outcome/);
  assert.match(resultStep, /Paid inference was not authorized; no provider request was made\./);
});
