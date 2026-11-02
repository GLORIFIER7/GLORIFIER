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
    limit: async () => ({ success: true }),
  },
  ASSETS: {
    fetch: async () => new Response('asset'),
  },
  ...overrides,
} as CloudflareEnv);

const request = (path: string, method = 'GET') => new Request(
  `https://glorifier.glorifier.workers.dev${path}`,
  { method },
);

test('GET /api/integrations exposes a Worker-native configuration inventory without secret values', async () => {
  const response = await worker.fetch(request('/api/integrations'), createEnv());
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^application\/json/i);
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const body = await response.json() as {
    ok: boolean;
    integrations: Array<{ id: string; status: string; detail: string }>;
  };
  assert.equal(body.ok, true);
  const byId = new Map(body.integrations.map((item) => [item.id, item]));

  assert.equal(byId.get('neon')?.status, 'configured');
  assert.equal(byId.get('opensea')?.status, 'configured');
  assert.equal(byId.get('github-mcp')?.status, 'configured');
  assert.equal(byId.get('identity')?.status, 'needs-config');
  assert.equal(byId.get('neural')?.status, 'needs-config');

  assert.equal(byId.get('railway')?.status, 'disabled');
  assert.equal(byId.get('vercel')?.status, 'disabled');
  assert.equal(byId.get('netlify')?.status, 'disabled');
  assert.match(byId.get('netlify')?.detail || '', /PR preview.*separate/i);

  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes(testSecret), false);
  assert.equal(serialized.includes(testConnectionString), false);
  assert.equal(serialized.includes('private-password'), false);
});

test('GET /api/data-status never converts configuration into verification', async () => {
  const response = await worker.fetch(request('/api/data-status'), createEnv());
  assert.equal(response.status, 200);

  const body = await response.json() as {
    ok: boolean;
    policy: {
      verifiedMeansEvidenceBacked: boolean;
      configuredDoesNotMeanVerified: boolean;
      estimatedDoesNotMeanVerified: boolean;
      humanFinalAuthority: boolean;
    };
    summary: { total: number; verified: number; notVerified: number };
    data: Array<{
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
  assert.equal(body.summary.total, body.data.length);
  assert.equal(body.summary.verified, 0);
  assert.equal(body.summary.notVerified, body.data.length);
  for (const item of body.data) {
    assert.equal(item.verificationStatus, 'not-verified');
    assert.equal(item.verificationEvidence, null);
  }
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
