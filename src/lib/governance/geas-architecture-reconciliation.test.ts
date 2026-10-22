import assert from 'node:assert/strict';
import { reconcileArchitectureStates, type ArchitectureState } from './geas-architecture-reconciliation';

const now = new Date('2026-10-22T00:00:00.000Z');
const states: ArchitectureState[] = ['desired', 'declared', 'deployed', 'observed', 'verified'];
const evidenceByState = Object.fromEntries(states.map((state) => [state, {
  refs: [`evidence:${state}-test-1`],
  observedAt: '2026-10-21T23:00:00.000Z',
  validUntil: '2026-10-23T00:00:00.000Z',
}])) as Record<ArchitectureState, { refs: string[]; observedAt: string; validUntil: string }>;

const aligned = { version: 1, region: 'test' };
const base = {
  resourceId: 'test-resource',
  desired: aligned,
  declared: aligned,
  deployed: aligned,
  observed: aligned,
  verified: aligned,
  evidenceRefs: ['legacy:aggregate-reference'],
  evidenceByState,
};

assert.equal(reconcileArchitectureStates(base, now).status, 'ALIGNED');
assert.equal(reconcileArchitectureStates({ ...base, observed: undefined }, now).status, 'UNKNOWN');
assert.equal(reconcileArchitectureStates({ ...base, evidenceRefs: [], evidenceByState: undefined }, now).status, 'UNKNOWN');
assert.equal(reconcileArchitectureStates({
  ...base,
  evidenceByState: { ...evidenceByState, observed: undefined },
}, now).status, 'UNKNOWN');

const stale = reconcileArchitectureStates({
  ...base,
  evidenceByState: {
    ...evidenceByState,
    deployed: { refs: ['evidence:stale'], observedAt: '2026-10-20T00:00:00.000Z', validUntil: '2026-10-21T00:00:00.000Z' },
  },
}, now);
assert.equal(stale.status, 'UNKNOWN');
assert.match(stale.reason, /fresh evidence/);

const futureEvidence = reconcileArchitectureStates({
  ...base,
  evidenceByState: {
    ...evidenceByState,
    observed: { refs: ['evidence:future'], observedAt: '2026-10-23T00:00:00.000Z', validUntil: '2026-10-24T00:00:00.000Z' },
  },
}, now);
assert.equal(futureEvidence.status, 'UNKNOWN');

const drift = reconcileArchitectureStates({
  ...base,
  observed: { version: 2, region: 'test' },
}, now);
assert.equal(drift.status, 'DRIFT');
assert.ok(drift.mismatches.some((mismatch) => mismatch.expectedState === 'deployed' && mismatch.actualState === 'observed' && mismatch.keys.includes('version')));

const keyOrder = reconcileArchitectureStates({
  ...base,
  desired: { region: 'test', version: 1 },
  declared: { version: 1, region: 'test' },
  deployed: { region: 'test', version: 1 },
  observed: { version: 1, region: 'test' },
  verified: { region: 'test', version: 1 },
}, now);
assert.equal(keyOrder.status, 'ALIGNED');

process.stdout.write('GEAS five-state evidence freshness tests passed.\\n');
