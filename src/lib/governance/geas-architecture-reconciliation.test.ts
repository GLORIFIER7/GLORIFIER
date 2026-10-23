import assert from 'node:assert/strict';
import { hashArchitectureSnapshot, reconcileArchitectureStates, type ArchitectureState } from './geas-architecture-reconciliation';

const now = new Date('2026-10-22T00:00:00.000Z');
const states: ArchitectureState[] = ['desired', 'declared', 'deployed', 'observed', 'verified'];
const aligned = { version: 1, region: 'test' };
const evidenceByState = Object.fromEntries(states.map((state) => [state, {
  refs: [`evidence:${state}-test-1`],
  observedAt: '2026-10-21T23:00:00.000Z',
  validUntil: '2026-10-23T00:00:00.000Z',
  snapshotHash: hashArchitectureSnapshot(aligned),
}])) as Record<ArchitectureState, { refs: string[]; observedAt: string; validUntil: string; snapshotHash: string }>;

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

assert.match(hashArchitectureSnapshot({ region: 'test', version: 1 }), /^[a-f0-9]{64}$/);
assert.equal(
  hashArchitectureSnapshot({ region: 'test', version: 1 }),
  hashArchitectureSnapshot({ version: 1, region: 'test' }),
  'snapshot hashes must be stable across object key order',
);

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
    deployed: {
      refs: ['evidence:stale'],
      observedAt: '2026-10-20T00:00:00.000Z',
      validUntil: '2026-10-21T00:00:00.000Z',
      snapshotHash: hashArchitectureSnapshot(aligned),
    },
  },
}, now);
assert.equal(stale.status, 'UNKNOWN');
assert.match(stale.reason, /SHA-256 snapshot hash matching that state/);

const futureEvidence = reconcileArchitectureStates({
  ...base,
  evidenceByState: {
    ...evidenceByState,
    observed: {
      refs: ['evidence:future'],
      observedAt: '2026-10-23T00:00:00.000Z',
      validUntil: '2026-10-24T00:00:00.000Z',
      snapshotHash: hashArchitectureSnapshot(aligned),
    },
  },
}, now);
assert.equal(futureEvidence.status, 'UNKNOWN');

const changedObserved = { version: 2, region: 'test' };
const unboundSnapshot = reconcileArchitectureStates({
  ...base,
  observed: changedObserved,
}, now);
assert.equal(unboundSnapshot.status, 'UNKNOWN', 'a changed snapshot must not reuse evidence hashed for the prior state');
assert.match(unboundSnapshot.reason, /SHA-256 snapshot hash matching that state/);

const drift = reconcileArchitectureStates({
  ...base,
  observed: changedObserved,
  evidenceByState: {
    ...evidenceByState,
    observed: {
      ...evidenceByState.observed,
      snapshotHash: hashArchitectureSnapshot(changedObserved),
    },
  },
}, now);
assert.equal(drift.status, 'DRIFT', 'mismatches may be classified as drift only when each state evidence hash matches its snapshot');
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

process.stdout.write('GEAS five-state snapshot-binding and freshness tests passed.\\n');
