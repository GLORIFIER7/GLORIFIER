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
  assert.ok(response, 'Expected the Autopilot route to handle this path.');
  const body = await response.json() as {
    ok?: boolean;
    control?: { mode?: string; available?: boolean; durable?: boolean; scheduledTriggerEnabled?: boolean; scheduledTriggerCron?: string };
    orchestration?: { enabled?: boolean; inferenceAuthorized?: boolean; freeOnlyConfigurationPresent?: boolean; neuralRuntimeReadinessRequired?: boolean; reason?: string; autoMerge?: boolean; autoDeploy?: boolean; selectedProvider?: string; workersPlan?: string; workersPlanVerified?: boolean };
  };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.control?.mode, 'cloudflare-hyperdrive');
  assert.equal(body.control?.available, true);
  assert.equal(body.control?.durable, true);
  assert.equal(body.orchestration?.enabled, false);
  assert.equal(body.orchestration?.inferenceAuthorized, false);
  assert.equal(body.orchestration?.freeOnlyConfigurationPresent, false);
  assert.equal(body.orchestration?.neuralRuntimeReadinessRequired, true);
  assert.equal(body.control?.scheduledTriggerEnabled, true);
  assert.equal(body.control?.scheduledTriggerCron, '*/5 * * * *');
  assert.equal(body.orchestration?.reason, 'workers-free-plan-not-verified');
  assert.equal(body.orchestration?.selectedProvider, 'cloudflare_workers_ai');
  assert.equal(body.orchestration?.workersPlan, 'unverified');
  assert.equal(body.orchestration?.workersPlanVerified, false);
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
  assert.ok(response, 'Expected the Autopilot route to handle this path.');
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
  assert.ok(response, 'Expected the Autopilot route to handle this path.');
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
test('internal-service mission listing remains confined to its requester partition', async () => {
  const fixture = createDependencies();
  fixture.missions.push(
    {
      id: 'mission-service-001',
      requester: 'glorifier-internal-service',
      idempotencyKey: 'service-request-001',
      status: 'queued',
      title: 'Internal-service mission',
    },
    {
      id: 'mission-owner-001',
      requester: 'owner-uid',
      idempotencyKey: 'owner-request-001',
      status: 'queued',
      title: 'Owner mission',
    },
  );
  const serviceAccess = {
    requester: 'glorifier-internal-service',
    allowAll: false,
    source: 'internal-service' as const,
  };
  let capturedAccess: unknown;
  let capturedListArguments: [string | undefined, number, boolean] | null = null;
  const baseStore = fixture.dependencies.createStore();
  const serviceStore = {
    ...baseStore,
    async list(requester: string | undefined, limit: number, allowAll = false) {
      capturedListArguments = [requester, limit, allowAll];
      return allowAll
        ? [...fixture.missions]
        : fixture.missions.filter(mission => mission.requester === requester);
    },
  };
  const dependencies = {
    ...fixture.dependencies,
    authorize: async () => serviceAccess,
    createStore: (_binding: unknown, access: unknown) => {
      capturedAccess = access;
      return serviceStore;
    },
  };

  const response = await handleAutopilotWorkerRequest(
    new Request('https://glorifier.pages.dev/api/autopilot/missions'),
    '/api/autopilot/missions',
    env as never,
    dependencies as never,
  );
  assert.ok(response, 'Expected the Autopilot route to handle this path.');
  const body = await response.json() as {
    ok?: boolean;
    missions?: Array<{ id?: string; requester?: string }>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(capturedAccess, serviceAccess);
  assert.deepEqual(capturedListArguments, ['glorifier-internal-service', 50, false]);
  assert.deepEqual(body.missions?.map(mission => mission.id), ['mission-service-001']);
});

test('internal-service mission intake uses the fixed requester partition', async () => {
  const fixture = createDependencies();
  const serviceAccess = {
    requester: 'glorifier-internal-service',
    allowAll: false,
    source: 'internal-service' as const,
  };
  let capturedAccess: unknown;
  const capturedMissions: Record<string, unknown>[] = [];
  const baseStore = fixture.dependencies.createStore();
  const serviceStore = {
    ...baseStore,
    async create(mission: Record<string, unknown>) {
      capturedMissions.push(mission);
      return baseStore.create(mission);
    },
  };
  const dependencies = {
    ...fixture.dependencies,
    authorize: async () => serviceAccess,
    createStore: (_binding: unknown, access: unknown) => {
      capturedAccess = access;
      return serviceStore;
    },
  };

  const response = await handleAutopilotWorkerRequest(
    new Request('https://glorifier.pages.dev/api/autopilot/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'service-request-002' },
      body: JSON.stringify({
        requester: 'attacker-controlled-user',
        title: 'Internal service mission',
        objective: 'Verify the internal-service requester partition.',
      }),
    }),
    '/api/autopilot/missions',
    env as never,
    dependencies as never,
  );
  assert.ok(response, 'Expected the Autopilot route to handle this path.');
  const body = await response.json() as {
    accepted?: boolean;
    executionStarted?: boolean;
    mission?: { requester?: string; status?: string };
  };

  assert.equal(response.status, 201);
  assert.equal(body.accepted, true);
  assert.equal(body.executionStarted, false);
  assert.deepEqual(capturedAccess, serviceAccess);
  assert.equal(capturedMissions[0]?.requester, 'glorifier-internal-service');
  assert.equal(body.mission?.requester, 'glorifier-internal-service');
  assert.equal(body.mission?.status, 'queued');
  assert.equal(fixture.missions.length, 1);
});

test('Autopilot routes fail closed when the dedicated Hyperdrive binding is absent', async () => {
  const fixture = createDependencies();
  const response = await handleAutopilotWorkerRequest(
    new Request('https://glorifier.pages.dev/api/autopilot/status'),
    '/api/autopilot/status',
    {} as never,
    fixture.dependencies as never,
  );
  assert.ok(response, 'Expected the Autopilot route to handle this path.');
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
  assert.ok(response, 'Expected the Autopilot authorization route to handle this path.');
  assert.equal(response.status, 401);
});

test('Autopilot mission intake returns a sanitized 503 when durable storage fails', async () => {
  const fixture = createDependencies();
  const store = fixture.dependencies.createStore();
  const failingStore = {
    ...store,
    async create() {
      throw new Error('sensitive database permission and credential details');
    },
  };
  const dependencies = {
    ...fixture.dependencies,
    createStore: () => failingStore,
  };
  const response = await handleAutopilotWorkerRequest(
    new Request('https://glorifier.pages.dev/api/autopilot/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'request-db-failure' },
      body: JSON.stringify({
        title: 'Store failure regression',
        objective: 'Confirm persistence failures are not returned as validation errors.',
      }),
    }),
    '/api/autopilot/missions',
    env as never,
    dependencies as never,
  );
  assert.ok(response, 'Expected the Autopilot mission intake route to handle this path.');
  const body = await response.json() as { code?: string; error?: string };

  assert.equal(response.status, 503);
  assert.equal(body.code, 'AUTOPILOT_MISSION_STORE_UNAVAILABLE');
  assert.equal(body.error, 'The Cloudflare Autopilot mission store could not be reached.');
  assert.doesNotMatch(JSON.stringify(body), /sensitive database permission|credential details/i);
});
