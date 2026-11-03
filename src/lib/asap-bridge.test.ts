import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { prepareAsapHandoff } from './asap-bridge';

const base = {
  taskId: 'task-1',
  correlationId: 'trace-1',
  requesterAgentId: 'glorifier-ceo',
  targetAgentId: 'research-agent',
  capability: 'research',
  objective: 'Summarize public protocol documentation',
  risk: 'low' as const,
};
const allowedOptions = { featureEnabled: true, authenticated: true, geasAuthorized: true };
const previousEnv = process.env.GLORIFIER_ASAP_ENABLED;
process.env.GLORIFIER_ASAP_ENABLED = 'true';
after(() => {
  if (previousEnv === undefined) delete process.env.GLORIFIER_ASAP_ENABLED;
  else process.env.GLORIFIER_ASAP_ENABLED = previousEnv;
});

test('ASAP handoff is disabled when the feature flag is off', () => {
  const result = prepareAsapHandoff(base, { ...allowedOptions, featureEnabled: false });
  assert.equal(result.allowed, false);
  assert.equal(result.status, 'DISABLED');
});

test('ASAP handoff requires authenticated identity', () => {
  const result = prepareAsapHandoff(base, { ...allowedOptions, authenticated: false });
  assert.equal(result.allowed, false);
  assert.equal(result.status, 'BLOCKED');
});

test('ASAP handoff requires GEAS authorization', () => {
  const result = prepareAsapHandoff(base, { ...allowedOptions, geasAuthorized: false });
  assert.equal(result.allowed, false);
});

test('ASAP handoff rejects missing required task identifiers', () => {
  const result = prepareAsapHandoff({ ...base, taskId: '  ' }, allowedOptions);
  assert.equal(result.allowed, false);
});

test('ASAP handoff rejects control characters in identifiers', () => {
  const result = prepareAsapHandoff({ ...base, targetAgentId: 'agent\nforged' }, { ...allowedOptions, humanApproved: true });
  assert.equal(result.allowed, false);
});

test('ASAP handoff rejects secret-like payload fields', () => {
  const result = prepareAsapHandoff({ ...base, payload: { customer: 'example', api_key: 'must-not-forward' } }, allowedOptions);
  assert.equal(result.allowed, false);
});

test('ASAP handoff rejects oversized payloads and objectives', () => {
  const oversizedPayload = prepareAsapHandoff({ ...base, payload: { data: 'x'.repeat(16_001) } }, allowedOptions);
  assert.equal(oversizedPayload.allowed, false);
  const oversizedObjective = prepareAsapHandoff({ ...base, objective: 'x'.repeat(4_001) }, { ...allowedOptions, humanApproved: true });
  assert.equal(oversizedObjective.allowed, false);
});

test('ASAP handoff requires approval for missing risk and unknown capabilities', () => {
  const missingRisk = prepareAsapHandoff({ ...base, risk: undefined }, allowedOptions);
  assert.equal(missingRisk.allowed, false);
  const unknownCapability = prepareAsapHandoff({ ...base, capability: 'custom-admin-action' }, allowedOptions);
  assert.equal(unknownCapability.allowed, false);
});

test('ASAP handoff requires approval for irreversible sensitive actions', () => {
  const result = prepareAsapHandoff({ ...base, capability: 'asset-transfer', risk: 'irreversible' }, allowedOptions);
  assert.equal(result.allowed, false);
});

test('approved sensitive handoff is prepared but never executed', () => {
  const result = prepareAsapHandoff({ ...base, capability: 'asset-transfer', risk: 'irreversible' }, {
    ...allowedOptions, humanApproved: true,
  });
  assert.ok(result.allowed && result.intent?.requiresHumanApproval);
});

test('ASAP handoff fails closed for non-serializable payloads', () => {
  for (const payload of [() => 'payload', Symbol('payload')]) {
    const result = prepareAsapHandoff({ ...base, payload }, allowedOptions);
    assert.equal(result.allowed, false);
    assert.equal(result.status, 'BLOCKED');
  }
});

test('safe ASAP intent remains unverified until transport conformance is proven', () => {
  const result = prepareAsapHandoff(base, allowedOptions);
  assert.equal(result.allowed, true);
  assert.equal(result.intent?.conformance, 'NOT_VERIFIED');
  assert.equal(result.intent?.status, 'READY_FOR_TRANSPORT');
});
