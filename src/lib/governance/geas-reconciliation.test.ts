import { strict as assert } from 'node:assert';
import {
  attenuateAuthority,
  createTelemetryEnvelope,
  evaluateAuthorityChain,
  getGeasArchitectureManifest,
  getGeasDegradedModeContracts,
  reconcileGeasArchitecture,
  validateGeasArchitectureManifest
} from './geas-reconciliation';

const manifest = getGeasArchitectureManifest();
const validation = validateGeasArchitectureManifest(manifest);
assert.equal(validation.valid, true);
assert.ok(validation.nodeCount > 0);

const parent = {
  delegationId: 'parent',
  contextId: 'ctx-1',
  delegator: 'human-owner',
  principal: 'ai-ceo',
  capabilities: ['architecture:review', 'architecture:recommend'],
  resourceScopes: ['geas'],
  dataScopes: ['architecture'],
  maxRisk: 'high' as const,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  revocable: true,
  humanApprovalRequired: false
};
const child = attenuateAuthority(parent, {
  contextId: 'ctx-1',
  delegator: 'ai-ceo',
  principal: 'geas',
  capabilities: ['architecture:review', 'architecture:recommend', 'deployment:write'],
  resourceScopes: ['geas', 'production'],
  dataScopes: ['architecture', 'secrets'],
  maxRisk: 'critical',
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
  revocable: true,
  humanApprovalRequired: false
});
assert.deepEqual(child.capabilities, ['architecture:review', 'architecture:recommend']);
assert.equal(child.maxRisk, 'high');
assert.equal(child.revocable, true);

const denied = evaluateAuthorityChain(child, {
  capability: 'deployment:write',
  resourceScope: 'production',
  risk: 'critical',
  irreversible: true
});
assert.equal(denied.allowed, false);
assert.equal(denied.requiresHumanApproval, true);

const telemetry = createTelemetryEnvelope({
  contextId: 'ctx-1',
  actorId: 'geas',
  startedAt: new Date().toISOString(),
  attributes: { 'geas.operation': 'reconcile', 'geas.read_only': true }
});
assert.equal(telemetry.schemaVersion, 'GEAS-OTEL-1.0');

const deployed = new Map<string, Record<string, unknown>>([['human-authority', { version: undefined }]]);
const observed = new Map<string, Record<string, unknown>>([['human-authority', { version: undefined }]]);
const result = reconcileGeasArchitecture(manifest, deployed, observed);
assert.equal(result.state, 'unknown');
assert.equal(result.findings.find(f => f.subjectId === 'human-authority')?.state, 'aligned');
assert.ok(result.findings.some(f => f.state === 'unknown'));
assert.ok(getGeasDegradedModeContracts().length >= 3);

console.log('GEAS reconciliation tests passed');
