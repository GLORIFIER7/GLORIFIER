import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { validateAutopilotPlan, isAutopilotInferenceAuthorized } from './autopilot-orchestrator.ts';
import { authorizeCapability } from './capability-authorization.ts';
import { evaluateGeasPolicy } from './governance/geas-policy-engine.ts';

test('Autopilot accepts only bounded read-only plans using known capabilities', () => {
  const plan = validateAutopilotPlan(JSON.stringify({
    steps: [
      { id: 'inspect', capability: 'read.repository', objective: 'Inspect repository health.' },
      { id: 'analyze', capability: 'analyze.code', objective: 'Analyze a known code path.' },
    ],
  }));
  assert.equal(plan.length, 2);
  assert.ok(plan.every(step => step.effect === 'read-only'));
});

test('Autopilot accepts a fenced JSON response but normalizes the plan', () => {
  const plan = validateAutopilotPlan('```json\n{"steps":[{"id":"research","capability":"knowledge.search","objective":"Review available internal knowledge."}]}\n```');
  assert.equal(plan[0].capability, 'knowledge.search');
});

test('Autopilot rejects writes and capabilities without a real safe executor', () => {
  assert.throws(() => validateAutopilotPlan(JSON.stringify({
    steps: [{ id: 'deploy', capability: 'deploy.production', objective: 'Deploy production.' }],
  })), /without an enabled safe executor/);
  assert.throws(() => validateAutopilotPlan(JSON.stringify({
    steps: [{ id: 'delete', capability: 'delete.resource', objective: 'Delete a resource.' }],
  })), /without an enabled safe executor/);
});

test('Autopilot fails closed when capability authorization or GEAS requires approval', () => {
  const privileged = authorizeCapability({ capability: 'deploy.production', requestedBy: 'autopilot' });
  assert.equal(privileged.allowed, false);
  assert.equal(privileged.reason, 'human_approval_required');
  const geas = evaluateGeasPolicy({
    actorType: 'agent',
    action: 'deploy.production',
    risk: 'critical',
    externallyIrreversible: true,
    evidenceVerified: false,
  });
  assert.equal(geas.decision, 'require_approval');
});

test('Autopilot rejects malformed and oversized plans', () => {
  assert.throws(() => validateAutopilotPlan('not-json'));
  assert.throws(() => validateAutopilotPlan(JSON.stringify({ steps: [] })), /between 1 and 12/);
  assert.throws(() => validateAutopilotPlan(JSON.stringify({
    steps: Array.from({ length: 13 }, (_, i) => ({
      id: `step-${i}`, capability: 'analyze.code', objective: 'Analyze.',
    })),
  })), /between 1 and 12/);
});

test('Autopilot inference remains disabled unless every owner authorization gate is explicitly true', () => {
  assert.equal(isAutopilotInferenceAuthorized({}), false);
  assert.equal(isAutopilotInferenceAuthorized({
    GLORIFIER_ENABLE_INFERENCE: 'true',
    GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'true',
  }), false);
  assert.equal(isAutopilotInferenceAuthorized({
    GLORIFIER_ENABLE_INFERENCE: 'true',
    GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'true',
    GLORIFIER_PAID_INFERENCE_AUTHORIZED: 'false',
  }), false);
  assert.equal(isAutopilotInferenceAuthorized({
    GLORIFIER_ENABLE_INFERENCE: 'true',
    GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'true',
    GLORIFIER_PAID_INFERENCE_AUTHORIZED: 'true',
  }), true);
});
