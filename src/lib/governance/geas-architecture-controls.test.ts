import { strict as assert } from 'node:assert';
import { buildEvidenceRecord, canonicalActionHash, evaluateVerificationState, problemDetails } from './geas-architecture-controls';

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
