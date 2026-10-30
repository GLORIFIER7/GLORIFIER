import assert from 'node:assert/strict';
import worker from '../worker.ts';
import type { CloudflareEnv } from '../worker.ts';

const originalFetch = globalThis.fetch;
const env: CloudflareEnv = {
  OPENSEA_API_KEY: 'test-personal-api-key',
  OPENSEA_SCOPED_TOKEN: 'test-scoped-token-must-not-be-used-for-public-read',
  ASSETS: { async fetch() { return new Response('assets'); } },
};

let capturedRequest: Request | null = null;
let nextResponse = new Response(JSON.stringify({ collection: 'glorifier7', name: 'GLORIFIER' }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
let fetchError: Error | null = null;
let capturedCf: unknown;

const getCapturedRequest = (): Request => {
  assert.ok(capturedRequest, 'Expected a request to OpenSea');
  return capturedRequest;
};

async function run(): Promise<void> {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (fetchError) throw fetchError;
    capturedCf = init && 'cf' in init ? (init as RequestInit & { cf?: unknown }).cf : undefined;
    capturedRequest = input instanceof Request ? input : new Request(input, init);
    return nextResponse;
  }) as typeof fetch;

  try {
    capturedRequest = null;
    const health = await worker.fetch(new Request('https://glorifier.test/api/opensea/health'), env);
    assert.equal(health.status, 200);
    const healthBody = await health.json() as {
      ok: boolean;
      provider: string;
      status: string;
      authentication: { apiKey: string; apiKeyHeader: string; walletScopedAuthorization: string };
      collectionSlug: string;
    };
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.provider, 'opensea');
    assert.equal(healthBody.status, 'connected');
    assert.deepEqual(healthBody.authentication, {
      apiKey: 'accepted',
      apiKeyHeader: 'X-API-KEY',
      walletScopedAuthorization: 'not-required-for-public-collection-read',
    });
    assert.equal(healthBody.collectionSlug, 'glorifier7');
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.equal(healthBody && JSON.stringify(healthBody).includes('test-personal-api-key'), false);
    assert.equal(healthBody && JSON.stringify(healthBody).includes('test-scoped-token'), false);

    const outbound = getCapturedRequest();
    assert.equal(outbound.method, 'GET');
    assert.equal(outbound.url, 'https://api.opensea.io/api/v2/collections/glorifier7');
    assert.equal(outbound.headers.get('x-api-key'), 'test-personal-api-key');
    assert.equal(outbound.headers.get('accept'), 'application/json');
    assert.equal(outbound.headers.get('authorization'), null, 'public collection reads must not send wallet authorization');
    assert.equal(capturedCf, undefined, 'health probe must bypass edge cache to observe current API-key validity');
    assert.equal(outbound.headers.get('x-api-key')?.includes('test-scoped-token'), false);

    capturedRequest = null;
    nextResponse = new Response(JSON.stringify({ collection: 'glorifier1', name: 'GLORIFIER' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const collection = await worker.fetch(new Request('https://glorifier.test/api/opensea/collections/glorifier1'), env);
    assert.equal(collection.status, 200);
    assert.equal(collection.headers.get('cache-control'), 'public, max-age=60');
    const collectionBody = await collection.json() as { ok: boolean; collectionSlug: string; data: { name: string } };
    assert.equal(collectionBody.ok, true);
    assert.equal(collectionBody.collectionSlug, 'glorifier1');
    assert.equal(collectionBody.data.name, 'GLORIFIER');
    assert.equal(getCapturedRequest().url, 'https://api.opensea.io/api/v2/collections/glorifier1');
    assert.deepEqual(capturedCf, { cacheTtl: 60, cacheEverything: true }, 'public collection metadata may use the bounded edge cache');

    capturedRequest = null;
    const missingKey = await worker.fetch(
      new Request('https://glorifier.test/api/opensea/health'),
      { ...env, OPENSEA_API_KEY: '   ' },
    );
    assert.equal(missingKey.status, 503);
    assert.equal((await missingKey.json()).code, 'OPENSEA_API_KEY_NOT_CONFIGURED');
    assert.equal(capturedRequest, null, 'missing API key must fail before network access');

    capturedRequest = null;
    const unknownCollection = await worker.fetch(
      new Request('https://glorifier.test/api/opensea/collections/other-project'),
      env,
    );
    assert.equal(unknownCollection.status, 404);
    assert.equal((await unknownCollection.json()).code, 'OPENSEA_ROUTE_NOT_FOUND');
    assert.equal(capturedRequest, null, 'unregistered collection slugs must not reach OpenSea');

    capturedRequest = null;
    const bareNamespace = await worker.fetch(new Request('https://glorifier.test/api/opensea'), env);
    assert.equal(bareNamespace.status, 404);
    assert.equal((await bareNamespace.json()).code, 'OPENSEA_ROUTE_NOT_FOUND');
    assert.equal(capturedRequest, null, 'the bare OpenSea namespace must remain Worker-native and fail closed');

    capturedRequest = null;
    const invalidMethod = await worker.fetch(
      new Request('https://glorifier.test/api/opensea/health', { method: 'POST' }),
      env,
    );
    assert.equal(invalidMethod.status, 405);
    assert.equal((await invalidMethod.json()).code, 'METHOD_NOT_ALLOWED');
    assert.equal(capturedRequest, null);

    nextResponse = new Response('unauthorized', { status: 401 });
    const rejectedKey = await worker.fetch(new Request('https://glorifier.test/api/opensea/health'), env);
    assert.equal(rejectedKey.status, 502);
    assert.equal((await rejectedKey.json()).code, 'OPENSEA_API_KEY_REJECTED');

    nextResponse = new Response('rate limited', { status: 429 });
    const rateLimited = await worker.fetch(new Request('https://glorifier.test/api/opensea/health'), env);
    assert.equal(rateLimited.status, 503);
    assert.equal((await rateLimited.json()).code, 'OPENSEA_RATE_LIMITED');

    nextResponse = new Response('<html>not json</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    const invalidContentType = await worker.fetch(new Request('https://glorifier.test/api/opensea/health'), env);
    assert.equal(invalidContentType.status, 502);
    assert.equal((await invalidContentType.json()).code, 'OPENSEA_INVALID_RESPONSE');

    nextResponse = new Response('{invalid', { status: 200, headers: { 'Content-Type': 'application/json' } });
    const invalidJson = await worker.fetch(new Request('https://glorifier.test/api/opensea/health'), env);
    assert.equal(invalidJson.status, 502);
    assert.equal((await invalidJson.json()).code, 'OPENSEA_INVALID_RESPONSE');

    fetchError = new Error('simulated timeout');
    fetchError.name = 'TimeoutError';
    const timeout = await worker.fetch(new Request('https://glorifier.test/api/opensea/health'), env);
    assert.equal(timeout.status, 504);
    assert.equal((await timeout.json()).code, 'OPENSEA_REQUEST_TIMEOUT');
    fetchError = null;

    console.log('OpenSea Worker integration tests passed.');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
