import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  createAutopilotMission,
  claimNextAutopilotMission,
  recordAutopilotMissionPlan,
  type AutopilotMission,
  type AutopilotMissionStore,
} from './autopilot-mission-control.ts';

class MemoryMissionStore implements AutopilotMissionStore {
  readonly records = new Map<string, AutopilotMission>();

  async initialize() {}
  async create(mission: AutopilotMission) {
    this.records.set(mission.id, structuredClone(mission));
    return structuredClone(mission);
  }
  async get(id: string) {
    const mission = this.records.get(id);
    return mission ? structuredClone(mission) : null;
  }
  async list(requester: string | undefined, limit: number, allowAll = false) {
    return [...this.records.values()]
      .filter((mission) => allowAll || mission.requester === requester)
      .slice(0, limit)
      .map((mission) => structuredClone(mission));
  }
  async save(mission: AutopilotMission, expectedVersion: number) {
    const current = this.records.get(mission.id);
    if (!current || current.version !== expectedVersion) return null;
    const saved = { ...structuredClone(mission), version: expectedVersion + 1 };
    this.records.set(saved.id, saved);
    return structuredClone(saved);
  }
  async claimNext(workerId: string, leaseMs: number, now: string) {
    const candidate = [...this.records.values()].find((mission) => mission.status === 'queued');
    if (!candidate) return null;
    const claimed = {
      ...candidate,
      status: 'planning' as const,
      leaseOwner: workerId,
      leaseExpiresAt: new Date(Date.parse(now) + leaseMs).toISOString(),
      version: candidate.version + 1,
      updatedAt: now,
    };
    this.records.set(claimed.id, claimed);
    return structuredClone(claimed);
  }
  async renewLease(id: string, workerId: string, leaseMs: number, now: string) {
    const current = this.records.get(id);
    if (!current || current.leaseOwner !== workerId) return null;
    const renewed = {
      ...current,
      leaseExpiresAt: new Date(Date.parse(now) + leaseMs).toISOString(),
      version: current.version + 1,
      updatedAt: now,
    };
    this.records.set(id, renewed);
    return structuredClone(renewed);
  }
  async recoverExpired() { return 0; }
}

const buildTrace = (geasDecision: string = 'allow') => ({
  schemaVersion: 1,
  plannedAt: '2026-11-20T05:00:00.000Z',
  aiCeo: { provider: 'gemini', model: 'gemini-2.5-flash' },
  specialists: [{
    roleId: 'software-architect',
    provider: 'anthropic',
    model: 'claude-test-model',
    findingSha256: 'a'.repeat(64),
  }],
  stepAuthorizations: [{
    stepId: 'inspect',
    capability: 'github.get_repository',
    capabilityPolicyId: 'github.get_repository',
    risk: 'low',
    capabilityDecision: 'allow',
    geasPolicyVersion: 'GEAS-3.0',
    geasDecision,
    evaluatedAt: '2026-11-20T05:00:00.000Z',
    geasReasons: ['policy requirements satisfied'],
  }],
});

test('Autopilot persists AI CEO, specialist provenance and GEAS authorization with the mission plan', async () => {
  const store = new MemoryMissionStore();
  const created = await createAutopilotMission(store, {
    requester: 'owner',
    idempotencyKey: 'governance-trace-001',
    objective: 'Inspect the configured repository identity.',
    now: '2026-11-20T05:00:00.000Z',
  });
  const claimed = await claimNextAutopilotMission(store, 'worker-1', 120_000, '2026-11-20T05:01:00.000Z');
  assert.ok(claimed);

  const planned = await recordAutopilotMissionPlan(
    store,
    created.id,
    claimed!.version,
    'worker-1',
    [{ id: 'inspect', capability: 'github.get_repository', objective: 'Inspect repository metadata.', effect: 'read-only' }],
    '2026-11-20T05:02:00.000Z',
    buildTrace(),
  );

  assert.deepEqual(planned.executionTrace, buildTrace());
  assert.equal((await store.get(created.id))?.executionTrace?.aiCeo.provider, 'gemini');
});

test('Autopilot refuses to persist a mission plan with a non-allow GEAS decision', async () => {
  const store = new MemoryMissionStore();
  const created = await createAutopilotMission(store, {
    requester: 'owner',
    idempotencyKey: 'governance-trace-deny-001',
    objective: 'Inspect the configured repository identity.',
    now: '2026-11-20T05:00:00.000Z',
  });
  const claimed = await claimNextAutopilotMission(store, 'worker-1', 120_000, '2026-11-20T05:01:00.000Z');
  assert.ok(claimed);

  await assert.rejects(
    () => recordAutopilotMissionPlan(
      store,
      created.id,
      claimed!.version,
      'worker-1',
      [{ id: 'inspect', capability: 'github.get_repository', objective: 'Inspect repository metadata.', effect: 'read-only' }],
      '2026-11-20T05:02:00.000Z',
      buildTrace('deny'),
    ),
    /only allowed capability and GEAS decisions can be persisted/,
  );
  assert.equal((await store.get(created.id))?.steps.length, 0);
});
