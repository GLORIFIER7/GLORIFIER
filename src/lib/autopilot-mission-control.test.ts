import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  createAutopilotMission,
  claimNextAutopilotMission,
  recordAutopilotMissionPlan,
  claimAutopilotMissionStep,
  completeAutopilotMissionStep,
  recoverAutopilotMissions,
  recoverAutopilotMissionsWithSafeRetry,
  renewAutopilotMissionLease,
  recordAutopilotMissionFailure,
  getAutopilotMission,
  listAutopilotMissions,
  type AutopilotMission,
  type AutopilotMissionStore,
} from './autopilot-mission-control.ts';

class MemoryMissionStore implements AutopilotMissionStore {
  readonly records = new Map<string, AutopilotMission>();

  async initialize() {}
  async create(mission: AutopilotMission) {
    const existing = [...this.records.values()].find(
      (item) => item.requester === mission.requester && item.idempotencyKey === mission.idempotencyKey,
    );
    if (existing) return structuredClone(existing);
    this.records.set(mission.id, structuredClone(mission));
    return structuredClone(mission);
  }
  async get(id: string) {
    const value = this.records.get(id);
    return value ? structuredClone(value) : null;
  }
  async list(requester: string | undefined, limit: number, allowAll = false) {
    return [...this.records.values()]
      .filter((item) => allowAll || item.requester === requester)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }
  async save(mission: AutopilotMission, expectedVersion: number) {
    const current = this.records.get(mission.id);
    if (!current || current.version !== expectedVersion) return null;
    const next = { ...structuredClone(mission), version: expectedVersion + 1 };
    this.records.set(next.id, next);
    return structuredClone(next);
  }
  async claimNext(workerId: string, leaseMs: number, now: string) {
    const next = [...this.records.values()]
      .filter((item) => item.status === 'queued' && (!item.nextRunAt || Date.parse(item.nextRunAt) <= Date.parse(now)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!next) return null;
    const claimed = {
      ...next,
      status: next.steps.length > 0 ? 'executing' as const : 'planning' as const,
      leaseOwner: workerId,
      leaseExpiresAt: new Date(Date.parse(now) + leaseMs).toISOString(),
      updatedAt: now,
      version: next.version + 1,
    };
    this.records.set(claimed.id, claimed);
    return structuredClone(claimed);
  }
  async renewLease(id: string, workerId: string, leaseMs: number, now: string) {
    const current = this.records.get(id);
    if (!current || current.leaseOwner !== workerId || !current.leaseExpiresAt || Date.parse(current.leaseExpiresAt) <= Date.parse(now) || !['planning', 'executing'].includes(current.status)) return null;
    const next = { ...current, leaseExpiresAt: new Date(Date.parse(now) + leaseMs).toISOString(), updatedAt: now, version: current.version + 1 };
    this.records.set(id, next);
    return structuredClone(next);
  }
  async recoverExpired(now: string) {
    let recovered = 0;
    for (const current of this.records.values()) {
      if (!['planning', 'executing'].includes(current.status)) continue;
      if (!current.leaseExpiresAt || Date.parse(current.leaseExpiresAt) > Date.parse(now)) continue;
      const next = {
        ...current,
        status: 'reconciliation-required' as const,
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
        version: current.version + 1,
        steps: current.steps.map((step) => step.status === 'running'
          ? { ...step, status: 'reconciliation-required' as const }
          : step),
        lastError: 'Expired execution lease; external side effects must be reconciled before any retry.',
      };
      this.records.set(next.id, next);
      recovered += 1;
    }
    return recovered;
  }
}

test('Autopilot mission creation is idempotent and requester-scoped', async () => {
  const store = new MemoryMissionStore();
  const first = await createAutopilotMission(store, {
    requester: 'owner-1',
    idempotencyKey: 'request-001',
    objective: 'Continuously maintain the approved engineering backlog.',
    now: '2026-11-13T08:00:00.000Z',
  });
  const duplicate = await createAutopilotMission(store, {
    requester: 'owner-1',
    idempotencyKey: 'request-001',
    objective: 'A duplicate request must not create a second mission.',
    now: '2026-11-13T08:01:00.000Z',
  });
  const otherRequester = await createAutopilotMission(store, {
    requester: 'owner-2',
    idempotencyKey: 'request-001',
    objective: 'A different principal has an independent idempotency scope.',
    now: '2026-11-13T08:02:00.000Z',
  });

  assert.equal(first.id, duplicate.id);
  assert.notEqual(first.id, otherRequester.id);
  assert.equal((await listAutopilotMissions(store, 'owner-1')).length, 1);
  assert.equal((await listAutopilotMissions(store, 'owner-2')).length, 1);
  assert.deepEqual(await listAutopilotMissions(store, undefined), []);
});

test('Autopilot mission creation rejects invalid identity, idempotency and objective input', async () => {
  const store = new MemoryMissionStore();
  await assert.rejects(() => createAutopilotMission(store, {
    requester: ' ',
    idempotencyKey: 'request-002',
    objective: 'Valid objective',
  }), /requester must be a non-empty string/);
  await assert.rejects(() => createAutopilotMission(store, {
    requester: 'owner',
    idempotencyKey: ' ',
    objective: 'Valid objective',
  }), /idempotencyKey must be a non-empty string/);
  await assert.rejects(() => createAutopilotMission(store, {
    requester: 'owner',
    idempotencyKey: 'request-003',
    objective: '   ',
  }), /objective must be a non-empty string/);
});

test('Autopilot mission claims use bounded leases and a durable planning transition', async () => {
  const store = new MemoryMissionStore();
  const created = await createAutopilotMission(store, {
    requester: 'owner',
    idempotencyKey: 'claim-001',
    objective: 'Audit the engineering fleet.',
    now: '2026-11-13T08:00:00.000Z',
  });
  const claimed = await claimNextAutopilotMission(store, 'worker-1', 120_000, '2026-11-13T08:05:00.000Z');
  assert.equal(claimed?.id, created.id);
  assert.equal(claimed?.status, 'planning');
  assert.equal(claimed?.leaseOwner, 'worker-1');
  assert.equal(claimed?.leaseExpiresAt, '2026-11-13T08:07:00.000Z');
  assert.equal(await claimNextAutopilotMission(store, 'worker-2', 120_000, '2026-11-13T08:05:01.000Z'), null);
  await assert.rejects(
    () => claimNextAutopilotMission(store, 'worker-1', 1, '2026-11-13T08:05:00.000Z'),
    /leaseMs must be between/,
  );
});

test('Autopilot planning requires unique, bounded steps and enters execution only after persistence', async () => {
  const store = new MemoryMissionStore();
  await createAutopilotMission(store, {
    requester: 'owner',
    idempotencyKey: 'plan-001',
    objective: 'Repair a failing CI workflow safely.',
    now: '2026-11-13T08:00:00.000Z',
  });
  const claimed = await claimNextAutopilotMission(store, 'planner-1', 300_000, '2026-11-13T08:01:00.000Z');
  assert.ok(claimed);
  const plan = [
    { id: 'inspect', capability: 'engineering', objective: 'Inspect the failed workflow.', effect: 'read-only' as const },
    { id: 'repair', capability: 'engineering', objective: 'Prepare a branch-based repair.', effect: 'reversible' as const },
  ];
  await assert.rejects(
    () => recordAutopilotMissionPlan(store, claimed!.id, claimed!.version, 'intruder-worker', plan, '2026-11-13T08:02:00.000Z'),
    /worker does not hold an active mission lease/,
  );
  const planned = await recordAutopilotMissionPlan(store, claimed!.id, claimed!.version, 'planner-1', plan, '2026-11-13T08:02:00.000Z');
  assert.equal(planned.status, 'executing');
  assert.equal(planned.steps.length, 2);
  await assert.rejects(
    () => recordAutopilotMissionPlan(store, claimed!.id, planned.version, 'planner-1', [
      { id: 'same', capability: 'engineering', objective: 'First step.', effect: 'read-only' },
      { id: 'same', capability: 'engineering', objective: 'Duplicate step.', effect: 'read-only' },
    ], '2026-11-13T08:03:00.000Z'),
    /step identifiers must be unique/,
  );
});

test('Autopilot blocks irreversible steps unless an explicit human approval is recorded', async () => {
  const store = new MemoryMissionStore();
  const created = await createAutopilotMission(store, {
    requester: 'owner',
    idempotencyKey: 'approval-001',
    objective: 'Deploy a production release.',
    now: '2026-11-13T08:00:00.000Z',
  });
  const claimed = await claimNextAutopilotMission(store, 'worker-1', 300_000, '2026-11-13T08:01:00.000Z');
  const planned = await recordAutopilotMissionPlan(store, claimed!.id, claimed!.version, 'worker-1', [
    { id: 'deploy', capability: 'deploy.production', objective: 'Deploy approved production release.', effect: 'irreversible' },
  ], '2026-11-13T08:02:00.000Z');
  const denied = await claimAutopilotMissionStep(store, planned.id, 'deploy', 'worker-1', undefined, '2026-11-13T08:03:00.000Z');
  assert.equal(denied.claimed, false);
  assert.equal(denied.reason, 'human-approval-required');
  assert.equal((await getAutopilotMission(store, created.id, 'owner'))?.steps[0].status, 'pending');
  const allowed = await claimAutopilotMissionStep(store, planned.id, 'deploy', 'worker-1', { approvedBy: 'owner-1', approvedAt: '2026-11-13T08:03:00.000Z' }, '2026-11-13T08:03:00.000Z');
  assert.equal(allowed.claimed, true);
  assert.equal(allowed.mission.steps[0].status, 'running');
});

test('Autopilot only completes steps with evidence and closes a mission after every step is verified', async () => {
  const store = new MemoryMissionStore();
  await createAutopilotMission(store, {
    requester: 'owner',
    idempotencyKey: 'evidence-001',
    objective: 'Verify and document an engineering repair.',
    now: '2026-11-13T08:00:00.000Z',
  });
  const claimed = await claimNextAutopilotMission(store, 'worker-1', 300_000, '2026-11-13T08:01:00.000Z');
  const planned = await recordAutopilotMissionPlan(store, claimed!.id, claimed!.version, 'worker-1', [
    { id: 'inspect', capability: 'engineering', objective: 'Inspect the repository.', effect: 'read-only' },
  ], '2026-11-13T08:02:00.000Z');
  const started = await claimAutopilotMissionStep(store, planned.id, 'inspect', 'worker-1', undefined, '2026-11-13T08:03:00.000Z');
  await assert.rejects(
    () => completeAutopilotMissionStep(store, started.mission.id, 'inspect', started.mission.version, 'worker-1', [], '2026-11-13T08:03:00.000Z'),
    /at least one evidence reference/,
  );
  await assert.rejects(
    () => completeAutopilotMissionStep(
      store,
      started.mission.id,
      'inspect',
      started.mission.version,
      'intruder-worker',
      ['github://GLORIFIER7/GLORIFIER/commit/forged'],
      '2026-11-13T08:03:00.000Z',
    ),
    /worker does not hold an active mission lease/,
  );
  const completed = await completeAutopilotMissionStep(
    store,
    started.mission.id,
    'inspect',
    started.mission.version,
    'worker-1',
    ['github://GLORIFIER7/GLORIFIER/commit/abc123'],
    '2026-11-13T08:04:00.000Z',
  );
  assert.equal(completed.steps[0].status, 'completed');
  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.evidenceRefs, ['github://GLORIFIER7/GLORIFIER/commit/abc123']);
});

test('Autopilot recovery quarantines expired in-flight work instead of replaying side effects', async () => {
  const store = new MemoryMissionStore();
  await createAutopilotMission(store, {
    requester: 'owner',
    idempotencyKey: 'recovery-001',
    objective: 'Reconcile a potentially interrupted maintenance run.',
    now: '2026-11-13T08:00:00.000Z',
  });
  const claimed = await claimNextAutopilotMission(store, 'worker-1', 300_000, '2026-11-13T08:01:00.000Z');
  const planned = await recordAutopilotMissionPlan(store, claimed!.id, claimed!.version, 'worker-1', [
    { id: 'inspect', capability: 'engineering', objective: 'Inspect state.', effect: 'read-only' },
    { id: 'write', capability: 'engineering', objective: 'Write a reversible change.', effect: 'reversible' },
  ], '2026-11-13T08:02:00.000Z');
  const started = await claimAutopilotMissionStep(store, planned.id, 'write', 'worker-1', undefined, '2026-11-13T08:03:00.000Z');
  assert.equal(started.mission.steps[1].status, 'running');

  const recovered = await recoverAutopilotMissions(store, '2026-11-13T08:10:00.000Z');
  assert.equal(recovered, 1);
  const mission = await getAutopilotMission(store, planned.id, 'owner');
  assert.equal(mission?.status, 'reconciliation-required');
  assert.equal(mission?.steps[1].status, 'reconciliation-required');
  assert.match(mission?.lastError || '', /must be reconciled/);
  assert.equal(await claimNextAutopilotMission(store, 'worker-2', 60_000, '2026-11-13T08:11:00.000Z'), null);
});

test('Autopilot mission updates reject stale versions instead of overwriting concurrent state', async () => {
  const store = new MemoryMissionStore();
  const mission = await createAutopilotMission(store, {
    requester: 'owner',
    idempotencyKey: 'cas-001',
    objective: 'Preserve concurrent mission updates.',
  });
  const claimed = await claimNextAutopilotMission(store, 'worker-1', 120_000);
  assert.ok(claimed);
  await assert.rejects(
    () => recordAutopilotMissionPlan(store, mission.id, mission.version, 'worker-1', [
      { id: 'step', capability: 'engineering', objective: 'A stale plan.', effect: 'read-only' },
    ]),
    /changed concurrently/,
  );
});


test('Autopilot stores independent verification before marking a read-only mission verified', async () => {
  const store = new MemoryMissionStore();
  await createAutopilotMission(store, {
    requester: 'owner',
    idempotencyKey: 'independent-verification-001',
    objective: 'Verify the public repository identity.',
    now: '2026-11-13T08:00:00.000Z',
  });
  const claimed = await claimNextAutopilotMission(store, 'worker-1', 300_000, '2026-11-13T08:01:00.000Z');
  const planned = await recordAutopilotMissionPlan(store, claimed!.id, claimed!.version, 'worker-1', [
    { id: 'repo', capability: 'github.get_repository', objective: 'Read repository identity.', effect: 'read-only', toolArguments: {} },
  ], '2026-11-13T08:02:00.000Z');
  const started = await claimAutopilotMissionStep(store, planned.id, 'repo', 'worker-1', undefined, '2026-11-13T08:03:00.000Z');
  assert.equal(started.mission.steps[0].attemptCount, 1);
  const proof = {
    status: 'verified' as const,
    verifierId: 'github-rest-independent-read-v1',
    sourceUrl: 'https://api.github.com/repos/GLORIFIER7/GLORIFIER',
    verifiedAt: '2026-11-13T08:04:00.000Z',
    sourceSha256: 'a'.repeat(64),
    executionSha256: 'a'.repeat(64),
  };
  const completed = await completeAutopilotMissionStep(
    store,
    started.mission.id,
    'repo',
    started.mission.version,
    'worker-1',
    ['github-adapter://github_get_repository/' + proof.executionSha256],
    '2026-11-13T08:04:00.000Z',
    proof,
  );
  assert.equal(completed.status, 'completed');
  assert.equal(completed.verificationState, 'verified');
  assert.equal(completed.steps[0].verification?.verifierId, proof.verifierId);
});

test('Autopilot retries only known read-only steps once after lease reconciliation', async () => {
  const store = new MemoryMissionStore();
  await createAutopilotMission(store, {
    requester: 'owner',
    idempotencyKey: 'safe-recovery-001',
    objective: 'Read the current public repository metadata.',
    now: '2026-11-13T08:00:00.000Z',
  });
  const claimed = await claimNextAutopilotMission(store, 'worker-1', 300_000, '2026-11-13T08:01:00.000Z');
  const planned = await recordAutopilotMissionPlan(store, claimed!.id, claimed!.version, 'worker-1', [
    { id: 'repo', capability: 'github.get_repository', objective: 'Read repo metadata.', effect: 'read-only', toolArguments: {} },
  ], '2026-11-13T08:02:00.000Z');
  const started = await claimAutopilotMissionStep(store, planned.id, 'repo', 'worker-1', undefined, '2026-11-13T08:03:00.000Z');
  assert.equal(started.mission.steps[0].attemptCount, 1);

  const recovered = await recoverAutopilotMissionsWithSafeRetry(store, '2026-11-13T08:10:00.000Z');
  assert.deepEqual(recovered, { quarantined: 1, requeued: 1 });
  const queued = await getAutopilotMission(store, planned.id, 'owner');
  assert.equal(queued?.status, 'queued');
  assert.equal(queued?.steps[0].status, 'pending');
  assert.equal(queued?.steps[0].attemptCount, 1);

  const resumed = await claimNextAutopilotMission(store, 'worker-2', 300_000, '2026-11-13T08:11:00.000Z');
  assert.equal(resumed?.status, 'executing');
  const secondAttempt = await claimAutopilotMissionStep(store, resumed!.id, 'repo', 'worker-2', undefined, '2026-11-13T08:12:00.000Z');
  assert.equal(secondAttempt.mission.steps[0].attemptCount, 2);

  const exhausted = await recoverAutopilotMissionsWithSafeRetry(store, '2026-11-13T08:20:00.000Z');
  assert.deepEqual(exhausted, { quarantined: 1, requeued: 0 });
  const quarantined = await getAutopilotMission(store, planned.id, 'owner');
  assert.equal(quarantined?.status, 'reconciliation-required');
  assert.equal(quarantined?.steps[0].status, 'reconciliation-required');
});


test('Autopilot renews only an active lease owned by the worker', async () => {
  const store = new MemoryMissionStore();
  const created = await createAutopilotMission(store, {
    requester: 'owner',
    idempotencyKey: 'renew-001',
    objective: 'Keep a long-running planning operation leased.',
    now: '2026-11-13T08:00:00.000Z',
  });
  const claimed = await claimNextAutopilotMission(store, 'worker-1', 120_000, '2026-11-13T08:01:00.000Z');
  const renewed = await renewAutopilotMissionLease(store, created.id, 'worker-1', 120_000, '2026-11-13T08:02:00.000Z');
  assert.equal(renewed?.version, claimed!.version + 1);
  assert.equal(renewed?.leaseExpiresAt, '2026-11-13T08:04:00.000Z');
  assert.equal(await renewAutopilotMissionLease(store, created.id, 'intruder', 120_000, '2026-11-13T08:02:30.000Z'), null);
  assert.equal(await renewAutopilotMissionLease(store, created.id, 'worker-1', 120_000, '2026-11-13T08:05:00.000Z'), null);
});

test('Autopilot records planning failures with one bounded retry and quarantines execution failures', async () => {
  const store = new MemoryMissionStore();
  const created = await createAutopilotMission(store, {
    requester: 'owner',
    idempotencyKey: 'planning-failure-001',
    objective: 'Plan a bounded public repository inspection.',
    now: '2026-11-13T08:00:00.000Z',
  });
  const firstClaim = await claimNextAutopilotMission(store, 'worker-1', 120_000, '2026-11-13T08:01:00.000Z');
  const firstFailure = await recordAutopilotMissionFailure(store, created.id, 'worker-1', new Error('provider transient failure'), '2026-11-13T08:01:30.000Z');
  assert.equal(firstFailure?.status, 'queued');
  assert.equal(firstFailure?.planningAttempts, 1);
  assert.equal(firstFailure?.leaseOwner, undefined);
  const secondClaim = await claimNextAutopilotMission(store, 'worker-2', 120_000, firstFailure!.nextRunAt!);
  assert.equal(secondClaim?.status, 'planning');
  const secondFailure = await recordAutopilotMissionFailure(store, created.id, 'worker-2', new Error('provider still unavailable'), '2026-11-13T08:04:00.000Z');
  assert.equal(secondFailure?.status, 'blocked');
  assert.equal(secondFailure?.planningAttempts, 2);
});
