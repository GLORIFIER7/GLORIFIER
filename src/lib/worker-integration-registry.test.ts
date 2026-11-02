import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker.ts';
import type { CloudflareEnv } from '../worker.ts';

const testSecret = 'test-only-secret-do-not-return';
const testConnectionString = 'postgresql://private-user:private-password@hyperdrive.example.test/glorifier';

const createEnv = (overrides: Partial<CloudflareEnv> = {}): CloudflareEnv => ({
  GLORIFIER_DATABASE_PROVIDER: 'neon',
  HYPERDRIVE: { connectionString: testConnectionString },
  OPENSEA_API_KEY: testSecret,
  MCP_RATE_LIMITER: {
    limit() {
      return Promise.resolve({ success: true });
    },
  },
  ASSETS: {
    fetch() {
      return Promise.resolve(new Response('asset'));
    },
  },
  ...overrides,
} as CloudflareEnv);

const request = (path: string, method = 'GET') => new Request(
  `https://glorifier.glorifier.workers.dev${path}`,
  { method },
);

const privateIntegrationIds = [
  'neon',
  'opensea',
  'github-mcp',
  'identity',
  'neural',
  'ai-providers',
] as const;

test('GET /api/integrations never exposes private runtime binding presence', async () => {
  const response = await worker.fetch(request('/api/integrations'), createEnv());
  assert.equal(response.status, 200);
  assert.ok((response.headers.get('content-type') || '').includes('application/json'));
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const body = await response.json() as {
    ok: boolean;
    integrations: Array<{ id: string; status: string; detail: string }>;
  };
  assert.equal(body.ok, true);
  const byId = new Map(body.integrations.map((item) => [item.id, item]));

  for (const id of privateIntegrationIds) {
    assert.equal(byId.get(id)?.status, 'not-observable');
    assert.match(byId.get(id)?.detail || '', /private runtime configuration.*not exposed/i);
  }

  assert.equal(byId.get('cloudflare-worker')?.status, 'responding');
  assert.equal(byId.get('railway')?.status, 'disabled');
  assert.equal(byId.get('vercel')?.status, 'disabled');
  assert.equal(byId.get('netlify-preview')?.status, 'configured');
  assert.match(byId.get('netlify-preview')?.detail || '', /preview-only/i);
  assert.equal(byId.get('netlify-production')?.status, 'disabled');

  const noPrivateBindings = await worker.fetch(
    request('/api/integrations'),
    createEnv({
      GLORIFIER_DATABASE_PROVIDER: undefined,
      HYPERDRIVE: undefined,
      OPENSEA_API_KEY: undefined,
      MCP_RATE_LIMITER: undefined,
    }),
  );
  const noPrivateBindingsBody = await noPrivateBindings.json() as {
    integrations: Array<{ id: string; status: string }>;
  };
  assert.deepEqual(
    noPrivateBindingsBody.integrations.map(({ id, status }) => [id, status]),
    body.integrations.map(({ id, status }) => [id, status]),
  );

  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes(testSecret), false);
  assert.equal(serialized.includes(testConnectionString), false);
  assert.equal(serialized.includes('private-password'), false);
});

test('GET /api/data-status marks private configuration not-observable and all data not-verified', async () => {
  const response = await worker.fetch(request('/api/data-status'), createEnv());
  assert.equal(response.status, 200);

  const body = await response.json() as {
    ok: boolean;
    policy: {
      verifiedMeansEvidenceBacked: boolean;
      configuredDoesNotMeanVerified: boolean;
      estimatedDoesNotMeanVerified: boolean;
      humanFinalAuthority: boolean;
      privateRuntimeConfigurationIsNotExposed: boolean;
    };
    summary: {
      total: number;
      verified: number;
      notVerified: number;
      configured: number;
      needsConfiguration: number;
      notObservable: number;
    };
    data: Array<{
      id: string;
      verificationStatus: string;
      verificationEvidence: string | null;
      configurationStatus: string;
    }>;
  };
  assert.equal(body.ok, true);
  assert.equal(body.policy.verifiedMeansEvidenceBacked, true);
  assert.equal(body.policy.configuredDoesNotMeanVerified, true);
  assert.equal(body.policy.estimatedDoesNotMeanVerified, true);
  assert.equal(body.policy.humanFinalAuthority, true);
  assert.equal(body.policy.privateRuntimeConfigurationIsNotExposed, true);
  assert.equal(body.summary.total, body.data.length);
  assert.equal(body.summary.verified, 0);
  assert.equal(body.summary.notVerified, body.data.length);
  assert.equal(body.summary.notObservable, body.data.filter((item) => item.configurationStatus === 'not-observable').length);
  assert.equal(body.summary.configured, 1);
  for (const id of privateIntegrationIds) {
    assert.equal(body.data.find((item) => item.id === id)?.configurationStatus, 'not-observable');
  }
  for (const item of body.data) {
    assert.equal(item.verificationStatus, 'not-verified');
    assert.equal(item.verificationEvidence, null);
  }
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes(testSecret), false);
  assert.equal(serialized.includes(testConnectionString), false);
});

test('integration read models accept GET and HEAD only', async () => {
  for (const path of ['/api/integrations', '/api/data-status']) {
    const head = await worker.fetch(request(path, 'HEAD'), createEnv());
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');

    const post = await worker.fetch(request(path, 'POST'), createEnv());
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET, HEAD');
  }
});
