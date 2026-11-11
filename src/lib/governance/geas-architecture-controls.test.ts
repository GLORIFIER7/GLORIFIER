import { strict as assert } from 'node:assert';
import { buildEvidenceRecord, canonicalActionHash, evaluateVerificationState, getEconomicIntegrityPolicy, problemDetails } from './geas-architecture-controls';
import { before, test } from 'node:test';

let assertionsCompleted = false;

before(async () => {
const action = {
  contextId: 'ctx-1',
  capability: 'production-deploy',
  resourceScope: 'production',
  payloadHash: 'payload-hash',
  authorityEnvelopeId: 'delegation-1',
  policyVersion: 'policy-1',
  risk: 'critical' as const,
  irreversible: true,
};
assert.equal(canonicalActionHash(action), canonicalActionHash({ ...action }));
assert.notEqual(canonicalActionHash(action), canonicalActionHash({ ...action, policyVersion: 'policy-2' }));

const evidence = buildEvidenceRecord({
  evidenceId: 'e-1',
  contextId: 'ctx-1',
  truth: 'observed',
  state: 'pass',
  source: 'test',
  observedAt: new Date().toISOString(),
  producer: 'test',
  authoritative: true,
  content: { b: 2, a: 1 },
});
const evidence2 = buildEvidenceRecord({ ...evidence, content: { a: 1, b: 2 } });
assert.equal(evidence.contentHash, evidence2.contentHash);

assert.equal(evaluateVerificationState([
  { name: 'deployment', passed: true, evidence: 'deploy:1' },
  { name: 'e2e', passed: true, evidence: 'e2e:1' },
]), 'FULLY VERIFIED');
assert.equal(evaluateVerificationState([{ name: 'deployment', passed: true }]), 'PARTIALLY VERIFIED');
assert.equal(problemDetails({ title: 'Provider unavailable', status: 503, detail: 'No eligible provider.', code: 'provider-unavailable' }).status, 503);

console.log('GEAS architecture controls tests passed');
  assertionsCompleted = true;
});

test('existing assertions completed in setup hook', () => {
  assert.ok(assertionsCompleted, 'existing assertions completed before the test case');
});


test('generic GEAS evidence admission rejects economic truth without a financial-integrity verifier', () => {
  assert.throws(() => buildEvidenceRecord({
    evidenceId: 'economic-claim-1',
    contextId: 'ctx-economic-1',
    truth: 'economically-verified',
    state: 'pass',
    source: 'caller-supplied',
    observedAt: '2026-11-11T00:00:00.000Z',
    producer: 'caller',
    authoritative: true,
    refs: ['provider-usage:1', 'provider-invoice:1'],
    content: { status: 'RECONCILED', amount: '0.00', currency: 'USD' },
  }), /GEAS financial-integrity gate/);
});


test('GEAS economic integrity policy remains closed until every source control is verified', () => {
  const policy = getEconomicIntegrityPolicy();
  assert.equal(policy.version, 'GEAS-FININT-1.0');
  assert.equal(policy.status, 'NOT VERIFIED');
  assert.equal(policy.mayClaimEconomicallyVerified, false);
  assert.equal(policy.genericEvidenceAdmission, 'BLOCKED');
  assert.ok(policy.controls.some((control) => control.id === 'focus-1-4-usage-invoice-reconciliation'
    && control.implementationStatus === 'IMPLEMENTED'
    && control.evidenceStatus === 'NOT VERIFIED'));
  assert.ok(policy.controls.some((control) => control.id === 'provider-issued-usage-authenticity'
    && control.implementationStatus === 'NOT IMPLEMENTED'));
  assert.ok(policy.controls.every((control) => control.evidenceStatus === 'NOT VERIFIED'));
});
