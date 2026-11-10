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
const authorization = await readFile(
  new URL('./ai-fleet-authorization.sh', import.meta.url),
  'utf8',
);

test('paid inference requires the owner-authorized first manual attempt', () => {
  const dispatchStart = workflow.indexOf('  workflow_dispatch:');
  const permissionsStart = workflow.indexOf('\n\npermissions:', dispatchStart);
  assert.ok(dispatchStart >= 0 && permissionsStart > dispatchStart);
  const dispatch = workflow.slice(dispatchStart, permissionsStart);
  assert.match(dispatch, /allow_paid_inference:[\s\S]*?type:\s*boolean/);
  assert.match(dispatch, /default:\s*false/);
  assert.match(dispatch, /owner must separately verify funding or GLR acceptance outside this workflow/i);
  assert.match(dispatch, /enabling accepts provider charges/i);
  assert.match(dispatch, /does not verify funding/);
  assert.doesNotMatch(dispatch, /verified sponsor\/monetization funding or confirmed provider acceptance of GLR/);

  const authorizationStart = workflow.indexOf('      - name: Resolve paid inference authorization');
  const setupStart = workflow.indexOf('      - uses: actions/setup-node@v7', authorizationStart);
  const modelStart = workflow.indexOf('      - name: AI improvement analysis', setupStart);
  const resultStart = workflow.indexOf('      - name: Governed result', modelStart);
  assert.ok(authorizationStart >= 0 && setupStart > authorizationStart && modelStart > setupStart && resultStart > modelStart);

  const authorizationStep = workflow.slice(authorizationStart, setupStart);
  assert.match(authorizationStep, /id: authorization/);
  assert.match(authorizationStep, /EVENT_NAME:\s*\$\{\{\s*github\.event_name\s*\}\}/);
  assert.match(authorizationStep, /MANUAL_PAID_INFERENCE_AUTHORIZATION:\s*\$\{\{\s*inputs\.allow_paid_inference\s*\}\}/);
  assert.match(authorizationStep, /OWNER_ACTOR_ID:\s*\$\{\{\s*github\.actor_id\s*\}\}/);
  assert.match(authorizationStep, /RUN_ATTEMPT:\s*\$\{\{\s*github\.run_attempt\s*\}\}/);
  assert.match(authorizationStep, /source scripts\/ai-fleet-authorization\.sh/);
  assert.match(
    authorizationStep,
    /glorifier_ai_maintenance_authorized "\$EVENT_NAME" "\$MANUAL_PAID_INFERENCE_AUTHORIZATION" "\$OWNER_ACTOR_ID" "\$RUN_ATTEMPT"/,
  );

  // Reuse the shared fail-closed policy: owner actor ID, explicit opt-in, and run attempt 1.
  assert.match(authorization, /"\$actor_id" == "32674233"/);
  assert.match(authorization, /"\$run_attempt" == "1"/);
  assert.match(authorization, /"\$manual_inference_authorization" == "true"/);

  const setupAndInstall = workflow.slice(setupStart, modelStart);
  assert.match(setupAndInstall, /if:\s*steps\.authorization\.outputs\.enabled == 'true'/);
  assert.match(setupAndInstall, /npm install/);

  const modelStep = workflow.slice(modelStart, resultStart);
  assert.match(modelStep, /if:\s*steps\.authorization\.outputs\.enabled == 'true'/);
  assert.match(modelStep, /ALLOW_PAID_INFERENCE:\s*\$\{\{\s*steps\.authorization\.outputs\.enabled\s*\}\}/);
  assert.doesNotMatch(modelStep, /inputs\.allow_paid_inference/);
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
  assert.match(resultStep, /no provider request was made/);
  assert.match(resultStep, /owner-authorized/);
});
