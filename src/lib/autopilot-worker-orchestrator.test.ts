import assert from 'node:assert/strict';
import test from 'node:test';
import { runCloudflareAutopilotCycle } from './autopilot-worker-orchestrator';
import type { AutopilotMission } from './autopilot-mission-control';

const freeEnvironment = {
  GLORIFIER_PROVIDER: 'cloudflare_workers_ai',
  GLORIFIER_WORKERS_AI_MODEL: '@cf/google/gemma-4-26b-a4b-it',
  GLORIFIER_WORKERS_PLAN: 'free',
  GLORIFIER_WORKERS_PLAN_VERIFIED: 'true',
  GLORIFIER_WORKERS_AI_FREE_ONLY: 'true',
  GLORIFIER_ENABLE_INFERENCE: 'true',
  GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'false',
  GLORIFIER_PAID_INFERENCE_AUTHORIZED: 'false',
  GLORIFIER_API_TOKEN: 'test-neural-api-token',
  APP_STATE_HYPERDRIVE: { connectionString: 'postgresql://worker.example.test/glorifier' },
  GLORIFIER_NEURAL: { fetch: async (_request: Request) => new Response('{}') },
};

function missionFixture(): AutopilotMission {
  return {
    id: 'mission-001',
    requester: 'glorifier-internal-service',
    idempotencyKey: 'request-001',
    title: 'Inspect release readiness',
    objective: 'Inspect the current release readiness using read-only evidence.',
    status: 'queued' as const,
    verificationState: 'not-started' as const,
    version: 1,
    steps: [],
    evidenceRefs: [],
    createdAt: '2026-11-17T00:00:00.000Z',
    updatedAt: '2026-11-17T00:01:00.000Z',
    leaseOwner: undefined,
    leaseExpiresAt: undefined,
  };
}

function storeFixture(mission: AutopilotMission = missionFixture()) {
  const state: { mission: AutopilotMission; initialized: number; recovered: number; claimed: number; saved: Array<{ mission: AutopilotMission; expectedVersion: number }> } = { mission, initialized: 0, recovered: 0, claimed: 0, saved: [] };
  return {
    state,
    store: {
      async initialize() { state.initialized += 1; },
      async create() { throw new Error('not used'); },
      async get() { return state.mission; },
      async list() { return []; },
      async save(next: any, expectedVersion: number) {
        state.saved.push({ mission: next, expectedVersion });
        state.mission = { ...next, version: expectedVersion + 1 };
        return state.mission;
      },
      async claimNext(workerId: string, leaseMs: number, observedAt: string) {
        state.claimed += 1;
        assert.equal(workerId, 'glorifier-cloudflare-autopilot');
        assert.equal(leaseMs, 10 * 60_000);
        assert.ok(Number.isFinite(Date.parse(observedAt)));
        if (state.mission.status !== 'queued') return null;
        state.mission = {
          ...state.mission,
          status: state.mission.steps.length > 0 ? 'executing' : 'planning',
          version: state.mission.version + 1,
          leaseOwner: workerId,
          leaseExpiresAt: new Date(Date.parse(observedAt) + leaseMs).toISOString(),
          updatedAt: observedAt,
        };
        return state.mission;
      },
      async renewLease() { return state.mission; },
      async recoverExpired() { state.recovered += 1; return 0; },
    },
  };
}

test('Autopilot scheduler stays fail-closed and does not touch Neon while Workers Free is unverified', async () => {
  let storeCreated = false;
  let neuralCalls = 0;
  const result = await runCloudflareAutopilotCycle({
    ...freeEnvironment,
    GLORIFIER_WORKERS_PLAN: 'unverified',
  } as never, {
    createStore: () => { storeCreated = true; throw new Error('must not be called'); },
    fetchNeural: async () => { neuralCalls += 1; return new Response('{}'); },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'workers-free-plan-not-verified');
  assert.equal(storeCreated, false);
  assert.equal(neuralCalls, 0);
});

test('Autopilot scheduler requires NEURAL to independently attest the same free-only provider configuration', async () => {
  const fixture = storeFixture();
  const result = await runCloudflareAutopilotCycle(freeEnvironment as never, {
    createStore: () => fixture.store as never,
    fetchNeural: async (request) => {
      assert.equal(request.method, 'GET');
      return Response.json({
        eligible: false,
        reason: 'workers-ai-provider-not-configured',
        provider: 'cloudflare_workers_ai',
      });
    },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'neural-free-provider-not-ready');
  assert.equal(fixture.state.initialized, 0);
  assert.equal(fixture.state.claimed, 0);
});

test('Autopilot executes one bounded read-only analysis and persists it as pending external verification', async () => {
  const fixture = storeFixture();
  const requests: Request[] = [];
  const result = await runCloudflareAutopilotCycle(freeEnvironment as never, {
    createStore: () => fixture.store as never,
    fetchNeural: async (request) => {
      requests.push(request);
      if (request.method === 'GET') {
        return Response.json({
          eligible: true,
          provider: 'cloudflare_workers_ai',
          model: '@cf/google/gemma-4-26b-a4b-it',
          workersPlan: 'free',
          workersPlanVerified: true,
          freeOnly: true,
          inferenceEnabled: true,
          externalDataEgress: false,
          paidInferenceAuthorized: false,
        });
      }
      return Response.json({
        status: 'VERIFIED',
        provider: 'cloudflare_workers_ai',
        result: 'Read-only result: inspect CI, mission persistence, and current deployment provenance.',
        evidence: ['provider:cloudflare_workers_ai:response-received', 'execution:inference'],
        message: 'Provider returned a result; factual correctness is not independently verified.',
      });
    },
  });

  assert.equal(result.status, 'planned');
  assert.equal(result.missionId, 'mission-001');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[1].method, 'POST');
  assert.equal(requests[1].headers.get('authorization'), 'Bearer test-neural-api-token');
  assert.equal(requests[1].headers.get('cf-connecting-ip'), null);
  const task = await requests[1].json() as Record<string, unknown>;
  assert.equal(task.action_class, 'read_only');
  assert.equal(task.require_approval, false);
  assert.equal(typeof task.task, 'string');
  assert.match(String(task.task), /untrusted/i);
  assert.equal(fixture.state.initialized, 1);
  assert.equal(fixture.state.recovered, 1);
  assert.equal(fixture.state.claimed, 1);
  assert.equal(fixture.state.saved.length, 1);
  const saved = fixture.state.saved[0];
  assert.equal(saved.expectedVersion, 2);
  assert.equal(saved.mission.status, 'blocked');
  assert.equal(saved.mission.verificationState, 'pending-external-evidence');
  assert.equal(saved.mission.steps.length, 1);
  assert.equal(saved.mission.steps[0].effect, 'read-only');
  assert.equal(saved.mission.steps[0].status, 'completed');
  assert.match(saved.mission.steps[0].objective, /Read-only result/);
  assert.equal(saved.mission.leaseOwner, undefined);
  assert.equal(saved.mission.leaseExpiresAt, undefined);
});

test('Autopilot does not send mission content containing credential-like values to NEURAL', async () => {
  const fixture = storeFixture({
    ...missionFixture(),
    objective: 'Review this config: OPENAI_API_KEY=sk-test-secret-value',
  });
  let taskRequests = 0;
  const result = await runCloudflareAutopilotCycle(freeEnvironment as never, {
    createStore: () => fixture.store as never,
    fetchNeural: async (request) => {
      if (request.method === 'GET') {
        return Response.json({ eligible: true, provider: 'cloudflare_workers_ai', model: '@cf/google/gemma-4-26b-a4b-it', workersPlan: 'free', workersPlanVerified: true, freeOnly: true, inferenceEnabled: true, externalDataEgress: false, paidInferenceAuthorized: false });
      }
      taskRequests += 1;
      return Response.json({});
    },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'mission-content-sensitive');
  assert.equal(taskRequests, 0);
  assert.equal(fixture.state.claimed, 1);
  assert.equal(fixture.state.saved.length, 1);
  assert.equal(fixture.state.saved[0].mission.status, 'blocked');
});

test('Autopilot rejects provider responses that do not match the verified free provider', async () => {
  const fixture = storeFixture();
  const result = await runCloudflareAutopilotCycle(freeEnvironment as never, {
    createStore: () => fixture.store as never,
    fetchNeural: async (request) => request.method === 'GET'
      ? Response.json({ eligible: true, provider: 'cloudflare_workers_ai', model: '@cf/google/gemma-4-26b-a4b-it', workersPlan: 'free', workersPlanVerified: true, freeOnly: true, inferenceEnabled: true, externalDataEgress: false, paidInferenceAuthorized: false })
      : Response.json({ status: 'VERIFIED', provider: 'openai', result: 'Unexpected provider result.', evidence: ['execution:inference'] }),
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'unexpected-provider-response');
  assert.equal(fixture.state.saved.length, 1);
  assert.equal(fixture.state.saved[0].mission.status, 'failed');
  assert.equal(fixture.state.saved[0].mission.verificationState, 'not-started');
});

test('Autopilot does not treat the Workers Free plan label as proof without a separate attestation', async () => {
  let storeCreated = false;
  const result = await runCloudflareAutopilotCycle({
    ...freeEnvironment,
    GLORIFIER_WORKERS_PLAN_VERIFIED: 'false',
  } as never, {
    createStore: () => { storeCreated = true; throw new Error('must not be called'); },
    fetchNeural: async () => new Response('{}'),
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'workers-free-plan-attestation-not-verified');
  assert.equal(storeCreated, false);
});

test('Autopilot does not send a credential-like mission title to NEURAL', async () => {
  const fixture = storeFixture({ ...missionFixture(), title: 'OPENAI_API_KEY=sk-test-secret-value' });
  let taskRequests = 0;
  const result = await runCloudflareAutopilotCycle(freeEnvironment as never, {
    createStore: () => fixture.store as never,
    fetchNeural: async (request) => request.method === 'GET'
      ? Response.json({ eligible: true, provider: 'cloudflare_workers_ai', model: '@cf/google/gemma-4-26b-a4b-it', workersPlan: 'free', workersPlanVerified: true, freeOnly: true, inferenceEnabled: true, externalDataEgress: false, paidInferenceAuthorized: false })
      : (taskRequests += 1, Response.json({ status: 'VERIFIED', provider: 'cloudflare_workers_ai', result: 'Read-only result.', evidence: ['provider:cloudflare_workers_ai:response-received', 'execution:inference'] })),
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'mission-content-sensitive');
  assert.equal(taskRequests, 0);
  assert.equal(fixture.state.saved.length, 1);
});
test('Autopilot readiness Service Binding is bounded by an outer timeout', async () => {
  const pending = runCloudflareAutopilotCycle(freeEnvironment as never, {
    fetchNeural: async () => new Promise<Response>(() => undefined),
    readinessTimeoutMs: 10,
  } as never);
  const outcome = await Promise.race([
    pending,
    new Promise<'watchdog-expired'>(resolve => setTimeout(() => resolve('watchdog-expired'), 100)),
  ]);
  if (outcome === 'watchdog-expired') assert.fail('NEURAL readiness timeout did not settle.');
  assert.equal(outcome.status, 'blocked');
  assert.equal(outcome.reason, 'neural-readiness-probe-failed');
});

test('Autopilot task Service Binding timeout saves terminal failure and releases its lease', async () => {
  const fixture = storeFixture();
  const pending = runCloudflareAutopilotCycle(freeEnvironment as never, {
    createStore: () => fixture.store as never,
    taskTimeoutMs: 10,
    fetchNeural: async (request: Request) => request.method === 'GET'
      ? Response.json({ eligible: true, provider: 'cloudflare_workers_ai', model: '@cf/google/gemma-4-26b-a4b-it', workersPlan: 'free', workersPlanVerified: true, freeOnly: true, inferenceEnabled: true, externalDataEgress: false, paidInferenceAuthorized: false })
      : new Promise<Response>(() => undefined),
  } as never);
  const outcome = await Promise.race([
    pending,
    new Promise<'watchdog-expired'>(resolve => setTimeout(() => resolve('watchdog-expired'), 100)),
  ]);
  if (outcome === 'watchdog-expired') assert.fail('NEURAL task timeout did not settle.');
  assert.equal(outcome.status, 'blocked');
  assert.equal(outcome.reason, 'neural-task-unavailable');
  assert.equal(fixture.state.saved.length, 1);
  assert.equal(fixture.state.saved[0].mission.status, 'failed');
  assert.equal(fixture.state.saved[0].mission.leaseOwner, undefined);
});

test('Autopilot rejects JSON null and releases the claimed mission', async () => {
  const fixture = storeFixture();
  const result = await runCloudflareAutopilotCycle(freeEnvironment as never, {
    createStore: () => fixture.store as never,
    fetchNeural: async (request) => request.method === 'GET'
      ? Response.json({ eligible: true, provider: 'cloudflare_workers_ai', model: '@cf/google/gemma-4-26b-a4b-it', workersPlan: 'free', workersPlanVerified: true, freeOnly: true, inferenceEnabled: true, externalDataEgress: false, paidInferenceAuthorized: false })
      : Response.json(null),
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'neural-response-invalid');
  assert.equal(fixture.state.saved.length, 1);
  assert.equal(fixture.state.saved[0].mission.status, 'failed');
  assert.equal(fixture.state.saved[0].mission.leaseOwner, undefined);
});
test('Autopilot scheduler uses requester-scoped internal-service access, never cross-requester access', async () => {
  let receivedAccess: { requester: string; allowAll?: boolean; source?: string } | null = null;
  const fixture = storeFixture();
  await runCloudflareAutopilotCycle(freeEnvironment as never, {
    createStore: (_binding, access) => {
      receivedAccess = access;
      return fixture.store as never;
    },
    fetchNeural: async (request) => request.method === 'GET'
      ? Response.json({
          eligible: true,
          provider: 'cloudflare_workers_ai',
          model: '@cf/google/gemma-4-26b-a4b-it',
          workersPlan: 'free',
          workersPlanVerified: true,
          freeOnly: true,
          inferenceEnabled: true,
          externalDataEgress: false,
          paidInferenceAuthorized: false,
        })
      : Response.json({
          status: 'VERIFIED',
          provider: 'cloudflare_workers_ai',
          result: 'Read-only result.',
          evidence: ['provider:cloudflare_workers_ai:response-received', 'execution:inference'],
        }),
  });

  assert.deepEqual(receivedAccess, {
    requester: 'glorifier-internal-service',
    allowAll: false,
    source: 'internal-service',
  });
});
