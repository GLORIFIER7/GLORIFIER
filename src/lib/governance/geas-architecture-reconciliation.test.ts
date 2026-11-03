import assert from 'node:assert/strict';
import { hashArchitectureSnapshot, reconcileArchitectureStates, type ArchitectureState } from './geas-architecture-reconciliation';
import test from 'node:test';

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

test('architecture snapshot hashes are canonical and reject unsupported values', () => {
  assert.match(hashArchitectureSnapshot({ region: 'test', version: 1 }), /^[a-f0-9]{64}$/);
  assert.equal(hashArchitectureSnapshot({ region: 'test', version: 1 }), hashArchitectureSnapshot({ version: 1, region: 'test' }));
  assert.equal(hashArchitectureSnapshot({ z: 3, 'ä': 1, a: 2 }), '9e76ee4b7c5c599d3ad63e42369b1796848ad455c5bae3030af345c5ea2aecb0');
  const nulSuffix = String.fromCharCode(0);
  const zeroWidth = String.fromCharCode(0x200b);
  const combiningAcute = String.fromCharCode(0x0301);
  const first = { a: 1, [`a${nulSuffix}`]: 2, [`a${zeroWidth}`]: 3, ['é']: 4, [`e${combiningAcute}`]: 5 };
  const reordered = { [`e${combiningAcute}`]: 5, ['é']: 4, [`a${zeroWidth}`]: 3, [`a${nulSuffix}`]: 2, a: 1 };
  assert.equal(hashArchitectureSnapshot(first), hashArchitectureSnapshot(reordered));
  assert.throws(() => hashArchitectureSnapshot({ value: undefined }), /JSON-compatible values/);
  assert.throws(() => hashArchitectureSnapshot({ value: Number.NaN }), /finite JSON numbers/);
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.throws(() => hashArchitectureSnapshot(circular), /circular references/);
  assert.throws(() => hashArchitectureSnapshot({ value: () => 'not-json' }), /JSON-compatible values/);
});

test('all five aligned architecture states require matching state evidence', () => {
  assert.equal(reconcileArchitectureStates(base, now).status, 'ALIGNED');
  assert.equal(reconcileArchitectureStates({ ...base, observed: undefined }, now).status, 'UNKNOWN');
  assert.equal(reconcileArchitectureStates({ ...base, evidenceRefs: [], evidenceByState: undefined }, now).status, 'UNKNOWN');
  assert.equal(reconcileArchitectureStates({ ...base, evidenceByState: { ...evidenceByState, observed: undefined } }, now).status, 'UNKNOWN');
});

test('nested undefined and circular snapshots fail closed without throwing', () => {
  const nestedUndefined = reconcileArchitectureStates({ ...base, observed: { version: undefined } }, now);
  assert.equal(nestedUndefined.status, 'UNKNOWN');
  const nestedCircular: Record<string, unknown> = {};
  nestedCircular.self = nestedCircular;
  const circularResult = reconcileArchitectureStates({ ...base, observed: nestedCircular }, now);
  assert.equal(circularResult.status, 'UNKNOWN');
});

test('stale, future and unbound architecture evidence cannot establish alignment', () => {
  const stale = reconcileArchitectureStates({
    ...base,
    evidenceByState: { ...evidenceByState, deployed: {
      refs: ['evidence:stale'], observedAt: '2026-10-20T00:00:00.000Z',
      validUntil: '2026-10-21T00:00:00.000Z', snapshotHash: hashArchitectureSnapshot(aligned),
    } },
  }, now);
  assert.equal(stale.status, 'UNKNOWN');
  assert.match(stale.reason, /SHA-256 snapshot hash matching that state/);
  const future = reconcileArchitectureStates({
    ...base,
    evidenceByState: { ...evidenceByState, observed: {
      refs: ['evidence:future'], observedAt: '2026-10-23T00:00:00.000Z',
      validUntil: '2026-10-24T00:00:00.000Z', snapshotHash: hashArchitectureSnapshot(aligned),
    } },
  }, now);
  assert.equal(future.status, 'UNKNOWN');
  const changed = { version: 2, region: 'test' };
  const unbound = reconcileArchitectureStates({ ...base, observed: changed }, now);
  assert.equal(unbound.status, 'UNKNOWN');
  assert.match(unbound.reason, /SHA-256 snapshot hash matching that state/);
});

test('drift is reported only when per-state evidence hashes match their snapshots', () => {
  const changed = { version: 2, region: 'test' };
  const drift = reconcileArchitectureStates({
    ...base, observed: changed,
    evidenceByState: { ...evidenceByState, observed: {
      ...evidenceByState.observed, snapshotHash: hashArchitectureSnapshot(changed),
    } },
  }, now);
  assert.equal(drift.status, 'DRIFT');
  assert.ok(drift.mismatches.some((mismatch) => mismatch.expectedState === 'deployed' && mismatch.actualState === 'observed' && mismatch.keys.includes('version')));
});

test('malformed evidence refs do not leak and key-order differences stay aligned', () => {
  const malformedEvidence = { ...evidenceByState, observed: { ...evidenceByState.observed, refs: 7 } } as unknown as typeof evidenceByState;
  const malformed = reconcileArchitectureStates({ ...base, evidenceByState: malformedEvidence }, now);
  assert.equal(malformed.status, 'UNKNOWN');
  assert.ok(!malformed.evidenceRefs.includes(7 as unknown as string));
  const keyOrder = reconcileArchitectureStates({
    ...base, desired: { region: 'test', version: 1 }, declared: { version: 1, region: 'test' },
    deployed: { region: 'test', version: 1 }, observed: { version: 1, region: 'test' }, verified: { region: 'test', version: 1 },
  }, now);
  assert.equal(keyOrder.status, 'ALIGNED');
});

test('invalid evidence timestamps fail closed', () => {
  const invalidValues = [
    '2026-10-21T23:00:00', '10/21/2026 23:00:00', '2026-10-21 23:00:00Z',
    '2026-02-30T23:00:00Z', '2026-10-21T23:00:00+24:00', '2026-10-21T23:00:00-00:00',
    '2026-10-21t23:00:00Z', '2026-10-21T23:00:00z',
  ];
  for (const observedAt of invalidValues) {
    const result = reconcileArchitectureStates({
      ...base,
      evidenceByState: { ...evidenceByState, observed: { ...evidenceByState.observed, observedAt } },
    }, now);
    assert.equal(result.status, 'UNKNOWN', `invalid timestamp must fail closed: ${observedAt}`);
  }
});

test('valid numeric UTC offsets and sub-millisecond validity are handled precisely', () => {
  const offset = reconcileArchitectureStates({
    ...base,
    evidenceByState: { ...evidenceByState, observed: {
      ...evidenceByState.observed, observedAt: '2026-10-21T23:00:00+05:30', validUntil: '2026-10-23T00:00:00+05:30',
    } },
  }, now);
  assert.equal(offset.status, 'ALIGNED');
  const futureObservation = reconcileArchitectureStates({
    ...base,
    evidenceByState: { ...evidenceByState, observed: { ...evidenceByState.observed, observedAt: '2026-10-22T00:00:00.0001Z' } },
  }, now);
  assert.equal(futureObservation.status, 'UNKNOWN');
  const validityPrecision = reconcileArchitectureStates({
    ...base,
    evidenceByState: { ...evidenceByState, observed: { ...evidenceByState.observed, validUntil: '2026-10-22T00:00:00.0001Z' } },
  }, now);
  assert.equal(validityPrecision.status, 'ALIGNED');
});
