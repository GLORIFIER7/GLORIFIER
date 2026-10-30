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
assert.equal(
  hashArchitectureSnapshot({ z: 3, 'ä': 1, a: 2 }),
  '9e76ee4b7c5c599d3ad63e42369b1796848ad455c5bae3030af345c5ea2aecb0',
  'canonical JSON object keys must preserve locale-independent code-unit ordering',
);
const unicodeSnapshot = { a: 1, 'a\\u200B': 2, 'é': 3, 'e\\u0301': 4 };
const reorderedUnicodeSnapshot = { 'e\\u0301': 4, 'é': 3, 'a\\u200B': 2, a: 1 };
assert.equal(
  hashArchitectureSnapshot(unicodeSnapshot),
  hashArchitectureSnapshot(reorderedUnicodeSnapshot),
  'canonical snapshot hashes must be independent of insertion order even when distinct Unicode keys collate equally',
);
assert.throws(() => hashArchitectureSnapshot({ value: undefined }), /JSON-compatible values/);
assert.throws(() => hashArchitectureSnapshot({ value: Number.NaN }), /finite JSON numbers/);
const circular: Record<string, unknown> = {};
circular.self = circular;
assert.throws(() => hashArchitectureSnapshot(circular), /circular references/);
assert.throws(() => hashArchitectureSnapshot({ value: () => 'not-json' }), /JSON-compatible values/);

assert.equal(reconcileArchitectureStates(base, now).status, 'ALIGNED');
assert.equal(reconcileArchitectureStates({ ...base, observed: undefined }, now).status, 'UNKNOWN');
assert.equal(reconcileArchitectureStates({ ...base, evidenceRefs: [], evidenceByState: undefined }, now).status, 'UNKNOWN');
assert.equal(reconcileArchitectureStates({
  ...base,
  evidenceByState: { ...evidenceByState, observed: undefined },
}, now).status, 'UNKNOWN');

const nestedUndefined = reconcileArchitectureStates({
  ...base,
  observed: { version: undefined },
}, now);
assert.equal(nestedUndefined.status, 'UNKNOWN', 'nested undefined values must fail closed without throwing');

const nestedCircular: Record<string, unknown> = {};
nestedCircular.self = nestedCircular;
const circularReconciliation = reconcileArchitectureStates({
  ...base,
  observed: nestedCircular,
}, now);
assert.equal(circularReconciliation.status, 'UNKNOWN', 'circular snapshots must fail closed without throwing');

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

const malformedEvidence = {
  ...evidenceByState,
  observed: { ...evidenceByState.observed, refs: 7 },
} as unknown as typeof evidenceByState;
const malformed = reconcileArchitectureStates({ ...base, evidenceByState: malformedEvidence }, now);
assert.equal(malformed.status, 'UNKNOWN');
assert.ok(!malformed.evidenceRefs.includes(7 as unknown as string), 'malformed references must not leak into the result');

const keyOrder = reconcileArchitectureStates({
  ...base,
  desired: { region: 'test', version: 1 },
  declared: { version: 1, region: 'test' },
  deployed: { region: 'test', version: 1 },
  observed: { version: 1, region: 'test' },
  verified: { region: 'test', version: 1 },
}, now);
assert.equal(keyOrder.status, 'ALIGNED');

process.stdout.write('GEAS five-state snapshot-binding, canonicalization, and freshness tests passed.\\n');


const invalidTimestampValues = [
  '2026-10-21T23:00:00',
  '10/21/2026 23:00:00',
  '2026-10-21 23:00:00Z',
  '2026-02-30T23:00:00Z',
  '2026-10-21T23:00:00+24:00',
  '2026-10-21T23:00:00-00:00',
  '2026-10-21t23:00:00Z',
  '2026-10-21T23:00:00z',
];
for (const observedAt of invalidTimestampValues) {
  const invalidTimestamp = reconcileArchitectureStates({
    ...base,
    evidenceByState: {
      ...evidenceByState,
      observed: { ...evidenceByState.observed, observedAt },
    },
  }, now);
  assert.equal(
    invalidTimestamp.status,
    'UNKNOWN',
    `non-canonical or invalid evidence timestamp must fail closed: ${observedAt}`,
  );
}

const explicitOffsetEvidence = reconcileArchitectureStates({
  ...base,
  evidenceByState: {
    ...evidenceByState,
    observed: {
      ...evidenceByState.observed,
      observedAt: '2026-10-21T23:00:00+05:30',
      validUntil: '2026-10-23T00:00:00+05:30',
    },
  },
}, now);
assert.equal(explicitOffsetEvidence.status, 'ALIGNED', 'valid numeric UTC offsets must be accepted');

const subMillisecondFutureEvidence = reconcileArchitectureStates({
  ...base,
  evidenceByState: {
    ...evidenceByState,
    observed: {
      ...evidenceByState.observed,
      observedAt: '2026-10-22T00:00:00.0001Z',
    },
  },
}, now);
assert.equal(
  subMillisecondFutureEvidence.status,
  'UNKNOWN',
  'future evidence below Date millisecond precision must not be admitted',
);

const subMillisecondValidityEvidence = reconcileArchitectureStates({
  ...base,
  evidenceByState: {
    ...evidenceByState,
    observed: {
      ...evidenceByState.observed,
      validUntil: '2026-10-22T00:00:00.0001Z',
    },
  },
}, now);
assert.equal(
  subMillisecondValidityEvidence.status,
  'ALIGNED',
  'validity extending beyond the current millisecond must remain fresh',
);
