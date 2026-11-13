import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './worker';
import type { CloudflareEnv } from './worker';

type Fixture = {
  env: CloudflareEnv;
  getCapturedRequest: () => Request | null;
};

function fixture(overrides: Partial<CloudflareEnv> = {}): Fixture {
  let captured: Request | null = null;
  const env = {
    GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test',
    GLORIFIER_NEURAL_ALLOWED_HOSTS: 'neural.example.test',
    GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'true',
    GLORIFIER_ENABLE_INFERENCE: 'false',
    GLORIFIER_PAID_INFERENCE_AUTHORIZED: 'false',
    GLORIFIER_INTERNAL_SERVICE_TOKEN: 'test-internal-service-token',
    GLORIFIER_API_TOKEN: 'test-neural-api-token',
    GLORIFIER_NEURAL: {
      fetch: async (request: Request) => {
        captured = request;
        return Response.json({
          status: 'NOT VERIFIED',
          message: 'Human approval is required before execution.',
          evidence: ['policy:approval-required', 'inference:disabled', 'execution:none'],
        });
      },
    },
    ...overrides,
  } as CloudflareEnv;

  return { env, getCapturedRequest: () => captured };
}

const safeTaskBody = JSON.stringify({
  task: 'Verify the authenticated GLORIFIER-to-NEURAL task boundary.',
  purpose: 'connectivity_verification',
  require_approval: true,
  action_class: 'read_only',
});

const request = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });

test('internal approved read-only task reaches NEURAL while inference and paid authorization remain disabled', async () => {
  const testFixture = fixture();
  const response = await worker.fetch(request(safeTaskBody, {
    'X-Glorifier-Internal-Token': 'test-internal-service-token',
    Authorization: 'Bearer unrelated-caller-token',
  }), testFixture.env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'NOT VERIFIED',
    message: 'Human approval is required before execution.',
    evidence: ['policy:approval-required', 'inference:disabled', 'execution:none'],
  });

  const upstream = testFixture.getCapturedRequest();
  assert.ok(upstream, 'the authenticated internal diagnostic must reach the NEURAL service binding');
  assert.equal(new URL(upstream.url).pathname, '/v1/tasks');
  assert.equal(upstream.headers.get('authorization'), 'Bearer test-neural-api-token',
    'the downstream NEURAL API credential must be used instead of the ingress token or caller bearer');
  assert.equal(upstream.headers.get('x-glorifier-internal-token'), null);
  assert.deepEqual(await upstream.json(), JSON.parse(safeTaskBody));
});

test('approval-only allowance is unavailable to tasks that can execute or have elevated action classes', async (t) => {
  const cases = [
    {
      name: 'approval not required',
      body: JSON.stringify({ task: 'must remain gated', require_approval: false, action_class: 'read_only' }),
      expectedCode: 'NEURAL_INFERENCE_DISABLED',
    },
    {
      name: 'non-read-only action',
      body: JSON.stringify({ task: 'financial action', require_approval: true, action_class: 'financial' }),
      expectedCode: 'NEURAL_INFERENCE_DISABLED',
    },
    {
      name: 'approval omitted rather than explicitly required',
      body: JSON.stringify({ task: 'must explicitly require approval', action_class: 'read_only' }),
      expectedCode: 'NEURAL_INFERENCE_DISABLED',
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const testFixture = fixture();
      const response = await worker.fetch(request(item.body, {
        'X-Glorifier-Internal-Token': 'test-internal-service-token',
      }), testFixture.env);

      assert.equal(response.status, 403);
      assert.equal((await response.json() as { code?: string }).code, item.expectedCode);
      assert.equal(testFixture.getCapturedRequest(), null, 'blocked task must not reach NEURAL');
    });
  }
});

test('public bearer callers cannot use the internal approval-only allowance', async () => {
  const testFixture = fixture({ GLORIFIER_INTERNAL_SERVICE_TOKEN: undefined });
  const response = await worker.fetch(request(safeTaskBody, {
    Authorization: 'Bearer test-neural-api-token',
  }), testFixture.env);

  assert.equal(response.status, 403);
  assert.equal((await response.json() as { code?: string }).code, 'NEURAL_INFERENCE_DISABLED');
  assert.equal(testFixture.getCapturedRequest(), null);
});

test('approval-only internal task still requires explicitly enabled service egress', async () => {
  const testFixture = fixture({ GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'false' });
  const response = await worker.fetch(request(safeTaskBody, {
    'X-Glorifier-Internal-Token': 'test-internal-service-token',
  }), testFixture.env);

  assert.equal(response.status, 503);
  assert.equal((await response.json() as { code?: string }).code, 'NEURAL_EXTERNAL_EGRESS_DISABLED');
  assert.equal(testFixture.getCapturedRequest(), null);
});

test('ordinary internal inference still requires paid-inference authorization', async () => {
  const testFixture = fixture({
    GLORIFIER_ENABLE_INFERENCE: 'true',
    GLORIFIER_PAID_INFERENCE_AUTHORIZED: 'false',
  });
  const body = JSON.stringify({
    task: 'ordinary inference request',
    require_approval: false,
    action_class: 'read_only',
  });
  const response = await worker.fetch(request(body, {
    'X-Glorifier-Internal-Token': 'test-internal-service-token',
  }), testFixture.env);

  assert.equal(response.status, 403);
  assert.equal((await response.json() as { code?: string }).code, 'NEURAL_PAID_INFERENCE_NOT_AUTHORIZED');
  assert.equal(testFixture.getCapturedRequest(), null);
});
