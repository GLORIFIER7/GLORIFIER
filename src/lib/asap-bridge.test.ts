import assert from 'node:assert/strict';
import { prepareAsapHandoff } from './asap-bridge';
import test from 'node:test';

test("ASAP handoff bridge policy regression cases", () => {
  const base = {
    taskId: 'task-1',
    correlationId: 'trace-1',
    requesterAgentId: 'glorifier-ceo',
    targetAgentId: 'research-agent',
    capability: 'research',
    objective: 'Summarize public protocol documentation',
    risk: 'low' as const,
  };
  
  const envEnabled = process.env.GLORIFIER_ASAP_ENABLED;
  process.env.GLORIFIER_ASAP_ENABLED = 'true';
  
  try {
    const disabled = prepareAsapHandoff(base, {
      featureEnabled: false, authenticated: true, geasAuthorized: true,
    });
    assert.ok(!disabled.allowed && disabled.status === 'DISABLED', 'feature-off must deny handoff');
  
    const unauthenticated = prepareAsapHandoff(base, {
      featureEnabled: true, authenticated: false, geasAuthorized: true,
    });
    assert.ok(!unauthenticated.allowed && unauthenticated.status === 'BLOCKED', 'missing identity must deny handoff');
  
    const unauthorized = prepareAsapHandoff(base, {
      featureEnabled: true, authenticated: true, geasAuthorized: false,
    });
    assert.equal(unauthorized.allowed, false, 'missing GEAS authorization must deny handoff');
  
    const missingTaskId = prepareAsapHandoff({ ...base, taskId: '  ' }, {
      featureEnabled: true, authenticated: true, geasAuthorized: true,
    });
    assert.equal(missingTaskId.allowed, false, 'missing required task fields must deny handoff');
  
    const unsafeIdentifier = prepareAsapHandoff({ ...base, targetAgentId: 'agent\nforged' }, {
      featureEnabled: true, authenticated: true, geasAuthorized: true, humanApproved: true,
    });
    assert.equal(unsafeIdentifier.allowed, false, 'control characters in identifiers must deny handoff');
  
    const secretPayload = prepareAsapHandoff({ ...base, payload: { customer: 'example', api_key: 'must-not-forward' } }, {
      featureEnabled: true, authenticated: true, geasAuthorized: true,
    });
    assert.equal(secretPayload.allowed, false, 'secret-like payload fields must be denied');
  
    const oversizedPayload = prepareAsapHandoff({ ...base, payload: { data: 'x'.repeat(16_001) } }, {
      featureEnabled: true, authenticated: true, geasAuthorized: true,
    });
    assert.equal(oversizedPayload.allowed, false, 'oversized payloads must be denied');
  
    const oversizedObjective = prepareAsapHandoff({ ...base, objective: 'x'.repeat(4_001) }, {
      featureEnabled: true, authenticated: true, geasAuthorized: true, humanApproved: true,
    });
    assert.equal(oversizedObjective.allowed, false, 'oversized objectives must deny handoff');
  
    const missingRisk = prepareAsapHandoff({ ...base, risk: undefined }, {
      featureEnabled: true, authenticated: true, geasAuthorized: true,
    });
    assert.equal(missingRisk.allowed, false, 'missing risk must require human approval');
  
    const unknownCapability = prepareAsapHandoff({ ...base, capability: 'custom-admin-action' }, {
      featureEnabled: true, authenticated: true, geasAuthorized: true,
    });
    assert.equal(unknownCapability.allowed, false, 'unknown capabilities must require human approval');
  
    const sensitive = prepareAsapHandoff({ ...base, capability: 'asset-transfer', risk: 'irreversible' }, {
      featureEnabled: true, authenticated: true, geasAuthorized: true,
    });
    assert.equal(sensitive.allowed, false, 'sensitive action must require human approval');
  
    const approvedSensitive = prepareAsapHandoff({ ...base, capability: 'asset-transfer', risk: 'irreversible' }, {
      featureEnabled: true, authenticated: true, geasAuthorized: true, humanApproved: true,
    });
    assert.ok(approvedSensitive.allowed && approvedSensitive.intent?.requiresHumanApproval, 'approved sensitive intent should be prepared but not executed');
  
    for (const unserializablePayload of [() => 'payload', Symbol('payload')]) {
      const invalidPayload = prepareAsapHandoff({ ...base, payload: unserializablePayload }, {
        featureEnabled: true, authenticated: true, geasAuthorized: true,
      });
      assert.ok(!invalidPayload.allowed && invalidPayload.status === 'BLOCKED', 'non-serializable payloads must fail closed');
    }
  
    const allowed = prepareAsapHandoff(base, {
      featureEnabled: true, authenticated: true, geasAuthorized: true,
    });
    assert.ok(allowed.allowed && allowed.intent?.conformance === 'NOT_VERIFIED', 'safe intent must preserve unverified status');
    assert.equal(allowed.intent?.status, 'READY_FOR_TRANSPORT', 'unexpected intent status');
  
    console.log('ASAP_BRIDGE_TEST_OK', JSON.stringify({ cases: 13, liveTransport: false, conformance: 'NOT_VERIFIED' }));
  } finally {
    if (envEnabled === undefined) delete process.env.GLORIFIER_ASAP_ENABLED;
    else process.env.GLORIFIER_ASAP_ENABLED = envEnabled;
  }
});
