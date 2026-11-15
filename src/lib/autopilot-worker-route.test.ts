import assert from 'node:assert/strict';
import test from 'node:test';
import { handleAutopilotWorkerRequest } from './autopilot-worker-route';

function createDependencies() {
  const missions: Array<Record<string, unknown>> = [];
  const access = { requester: 'owner-uid', allowAll: true, source: 'owner' as const };
  const store = {
    async initialize() {},
    async create(mission: Record<string, unknown>) {
      const existing = missions.find(item => item.requester === mission.requester && item.idempotencyKey === mission.idempotencyKey);
      if (existing) return existing;
      missions.push(mission);
      return mission;
    },
    async get(id: string) { return missions.find(item => item.id === id) ?? null; },
    async list(requester: string | undefined, _limit: number, allowAll = false) {
      return allowAll ? [...missions] : missions.filter(item => item.requester === requester);
    },
    async findByIdempotencyKey(requester: string, key: string) {
      return missions.find(item => item.requester === requester && item.idempotencyKey === key) ?? null;
    },
    async save() { return null; },
    async claimNext() { return null; },
    async renewLease() { return null; },
    async recoverExpired() { return 0; },
  };
  return {
    access,
    missions,
    dependencies: {
      authorize: async () => access,
      createStore: () => store,
      now: () => '2026-11-15T10:00:00.000Z',
      createId: () => 'mission-test-id',
    },
  };
}

const binding = { connectionString: 'postgresql://worker.example.test/glorifier' };
const env = { APP_STATE_HYPERDRIVE: binding };

test('Autopilot status reports durable Worker persistence separately from disabled execution', async () => {
  const fixture = createDependencies();
  const response = await handleAutopilotWorkerRequest(
    new Request('https://glorifier.pages.dev/api/autopilot/status'),
    '/api/autopilot/status',
    env as never,
    fixture.dependencies as never,
  );
  const body = await response.json() as {
    ok?: boolean;
    control?: { mode?: string; available?: boolean; durable?: boolean };
    orchestration?: { enabled?: boolean; reason?: string; autoMerge?: boolean; autoDeploy?: boolean };
  };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.control?.mode, 'cloudflare-hyperdrive');
  assert.equal(body.control?.available, true);
  assert.equal(body.control?.durable, true);
  assert.equal(body.orchestration?.enabled, false);
  assert.equal(body.orchestration?.reason, 'cloudflare-orchestrator-runtime-not-migrated');
  assert.equal(body.orchestration?.autoMerge, false);
  assert.equal(body.orchestration?.autoDeploy, false);
});

test('Autopilot mission intake derives requester identity from verified access and never starts execution', async () => {
  const fixture = createDependencies();
  const response = await handleAutopilotWorkerRequest(
    new Request('https://glorifier.pages.dev/api/autopilot/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'request-001' },
      body: JSON.stringify({
        requester: 'attacker-controlled-user',
        title: 'Inspect release drift',
        objective: 'Inspect Cloudflare production release drift.',
      }),
    }),
    '/api/autopilot/missions',
    env as never,
    fixture.dependencies as never,
  );
  const body = await response.json() as {
    accepted?: boolean;
    executionStarted?: boolean;
    mission?: { requester?: string; status?: string; id?: string };
  };

  assert.equal(response.status, 201);
  assert.equal(body.accepted, true);
  assert.equal(body.executionStarted, false);
  assert.equal(body.mission?.requester, 'owner-uid');
  assert.equal(body.mission?.status, 'queued');
  assert.equal(body.mission?.id, 'mission-test-id');
  assert.equal(fixture.missions.length, 1);
});

test('Autopilot mission listing returns the authorized mission set and a successful response contract', async () => {
  const fixture = createDependencies();
  fixture.missions.push(
    {
      id: 'mission-owner-001',
      requester: 'owner-uid',
      idempotencyKey: 'owner-request-001',
      status: 'queued',
      title: 'Owner mission',
    },
    {
      id: 'mission-service-001',
      requester: 'glorifier-internal-service',
      idempotencyKey: 'service-request-001',
      status: 'queued',
      title: 'Internal-service mission',
    },
  );

  const response = await handleAutopilotWorkerRequest(
    new Request('https://glorifier.pages.dev/api/autopilot/missions'),
    '/api/autopilot/missions',
    env as never,
    fixture.dependencies as never,
  );
  const body = await response.json() as {
    ok?: boolean;
    missions?: Array<{ id?: string; requester?: string }>;
    control?: { mode?: string; durable?: boolean };
  };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.control?.mode, 'cloudflare-hyperdrive');
  assert.equal(body.control?.durable, true);
  assert.deepEqual(
    body.missions?.map(mission => mission.id).sort(),
    ['mission-owner-001', 'mission-service-001'],
  );
});
test('Autopilot routes fail closed when the dedicated Hyperdrive binding is absent', async () => {
  const fixture = createDependencies();
  const response = await handleAutopilotWorkerRequest(
    new Request('https://glorifier.pages.dev/api/autopilot/status'),
    '/api/autopilot/status',
    {} as never,
    fixture.dependencies as never,
  );
  const body = await response.json() as { code?: string };
  assert.equal(response.status, 503);
  assert.equal(body.code, 'AUTOPILOT_HYPERDRIVE_NOT_CONFIGURED');
});

test('Autopilot routes reject missing owner or internal-service authorization', async () => {
  const fixture = createDependencies();
  const dependencies = {
    ...fixture.dependencies,
    authorize: async () => null,
  };
  const response = await handleAutopilotWorkerRequest(
    new Request('https://glorifier.pages.dev/api/autopilot/status'),
    '/api/autopilot/status',
    env as never,
    dependencies as never,
  );
  assert.equal(response.status, 401);
});
