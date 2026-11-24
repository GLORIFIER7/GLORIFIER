import { strict as assert } from 'node:assert';
import {
  initializeArchitectureCore,
  listCapabilities,
  authorizeCapability,
  registerProvider,
  registerSpecialistPlugin,
  getArchitectureConsolidationSnapshot,
  setVerification,
} from './architecture-core';
import { before, test } from 'node:test';
import { GLORIFIER_ARCHITECTURE_MODEL } from './glorifier-architecture';

let assertionsCompleted = false;

before(async () => {
initializeArchitectureCore();
assert.ok(listCapabilities().some((c) => c.id === 'model-inference'));
assert.ok(listCapabilities().some((c) => c.id === 'repository-merge' && c.requiresHumanApproval));

const granted = new Set(['repository-merge']);
const blocked = authorizeCapability({ capabilityId: 'repository-merge', grantedCapabilities: granted });
assert.equal(blocked.allowed, false);
assert.equal(blocked.requiresHumanApproval, true);

const approved = authorizeCapability({
  capabilityId: 'repository-merge',
  grantedCapabilities: granted,
  humanApproval: {
    approved: true,
    approvedBy: 'human',
    approvedAt: new Date().toISOString(),
    capabilityId: 'repository-merge',
  },
});
assert.equal(approved.allowed, true);

const missingCapability = authorizeCapability({
  capabilityId: 'production-deploy',
  grantedCapabilities: new Set(),
  humanApproval: {
    approved: true,
    approvedBy: 'human',
    approvedAt: new Date().toISOString(),
    capabilityId: 'production-deploy',
  },
});
assert.equal(missingCapability.allowed, false);
assert.equal(missingCapability.requiresHumanApproval, false);

registerProvider({
  id: 'test-provider',
  name: 'Test Provider',
  capabilities: ['model-inference'],
  status: 'available',
  authenticated: true,
});
registerSpecialistPlugin({
  id: 'test-specialist',
  title: 'Test Specialist',
  capabilities: ['specialist-analysis'],
  enabled: true,
  providerNeutral: true,
  version: '1.0.0',
});

const verification = setVerification({
  subject: 'architecture-core',
  status: 'VERIFIED',
  checks: ['authorization', 'plugin registration'],
  evidence: ['unit-test'],
});
assert.equal(verification.status, 'VERIFIED');

const snapshot = getArchitectureConsolidationSnapshot();
assert.equal(snapshot.version, 'GLORIFIER-ARCH-4.0');
assert.equal(snapshot.humanAuthority.finalAuthority, true);
assert.equal(snapshot.kernel.capabilityRegistry, 'active');
assert.equal(snapshot.kernel.selfHealingCICD, 'governed CI/CD');

console.log('Architecture consolidation tests: PASS');
  assertionsCompleted = true;
});

test('existing assertions completed in setup hook', () => {
  assert.ok(assertionsCompleted, 'existing assertions completed before the test case');
});


test('institutional model is an advisory reference using existing planes, not a second authority', () => {
  const institution = GLORIFIER_ARCHITECTURE_MODEL.institutional;
  assert.equal(institution.organs.length, 6);
  assert.equal(institution.authority.humanAuthorityFinal, true);
  assert.equal(institution.authority.geasCanonical, true);
  assert.equal(institution.authority.providerVotingConfersAuthority, false);
  assert.equal(institution.authority.externalLegalAuthority, false);
  assert.equal(institution.authority.unAffiliationClaimed, false);
  assert.equal(institution.authority.permitsAutonomousExternalExecution, false);
  const planes = new Set<string>(GLORIFIER_ARCHITECTURE_MODEL.glorifier.planes);
  for (const organ of institution.organs) for (const plane of organ.planes) assert.ok(planes.has(plane), plane);
  const goals = institution.missionDomains.flatMap(domain => [...domain.sdgs]).sort((a,b) => a-b);
  assert.deepEqual(goals, Array.from({length:17}, (_,i) => i+1));
  assert.equal(getArchitectureConsolidationSnapshot().institutionalReference, institution);
});
