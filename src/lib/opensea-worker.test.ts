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
let capturedInit: RequestInit | undefined;
let capturedCf: unknown;
let nextResponse = new Response(JSON.stringify({ collection: 'glorifier7', name: 'GLORIFIER' }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
let fetchError: Error | null = null;

const setResponse = (response: Response): void => {
  nextResponse = response;
  fetchError = null;
};

const setFetchError = (error: Error): void => {
  fetchError = error;
};

const getCapturedRequest = (): Request => {
  assert.ok(capturedRequest, 'Expected a request to OpenSea');
  return capturedRequest;
};

const request = (path: string, init?: RequestInit): Promise<Response> =>
  worker.fetch(new Request(`https://glorifier.test${path}`, init), env);

async function expectProviderFailure(response: Response, status: number, code: string): Promise<void> {
  assert.equal(response.status, status);
  const body = await response.json() as { code?: string; error?: string };
  assert.equal(body.code, code);
  assert.ok(body.error);
  assert.equal(JSON.stringify(body).includes('test-personal-api-key'), false);
  assert.equal(JSON.stringify(body).includes('test-scoped-token'), false);
}

async function testSuccessfulPublicReads(): Promise<void> {
  capturedRequest = null;
  const health = await request('/api/opensea/health');
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
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(JSON.stringify(healthBody).includes('test-personal-api-key'), false);
  assert.equal(JSON.stringify(healthBody).includes('test-scoped-token'), false);

  const healthRequest = getCapturedRequest();
  assert.equal(healthRequest.method, 'GET');
  assert.equal(healthRequest.url, 'https://api.opensea.io/api/v2/collections/glorifier7');
  assert.equal(healthRequest.headers.get('x-api-key'), 'test-personal-api-key');
  assert.equal(healthRequest.headers.get('accept'), 'application/json');
  assert.equal(capturedInit?.redirect, 'manual', 'provider redirects must never be followed');
  assert.ok(capturedInit?.signal instanceof AbortSignal, 'provider requests must have an abort timeout signal');
  assert.equal(healthRequest.headers.get('authorization'), null, 'public reads must not send wallet authorization');
  assert.equal(capturedCf, undefined, 'health probe must bypass edge cache to observe current API-key validity');
  assert.equal(healthRequest.headers.get('x-api-key')?.includes('test-scoped-token'), false);

  setResponse(new Response(JSON.stringify({ collection: 'glorifier1', name: 'GLORIFIER' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
  const collection = await request('/api/opensea/collections/glorifier1');
  assert.equal(collection.status, 200);
  assert.equal(collection.headers.get('cache-control'), 'public, max-age=60');
  assert.equal(collection.headers.get('x-content-type-options'), 'nosniff');
  const collectionBody = await collection.json() as { ok: boolean; collectionSlug: string; data: { name: string } };
  assert.equal(collectionBody.ok, true);
  assert.equal(collectionBody.collectionSlug, 'glorifier1');
  assert.equal(collectionBody.data.name, 'GLORIFIER');
  assert.equal(getCapturedRequest().url, 'https://api.opensea.io/api/v2/collections/glorifier1');
  assert.deepEqual(capturedCf, { cacheTtl: 60, cacheEverything: true }, 'public collection metadata may use the bounded edge cache');
}

async function testConfigurationAndRouteGuards(): Promise<void> {
  capturedRequest = null;
  const missingKey = await worker.fetch(
    new Request('https://glorifier.test/api/opensea/health'),
    { ...env, OPENSEA_API_KEY: '   ' },
  );
  await expectProviderFailure(missingKey, 503, 'OPENSEA_API_KEY_NOT_CONFIGURED');
  assert.equal(capturedRequest, null, 'missing API key must fail before network access');

  capturedRequest = null;
  const unknownCollection = await request('/api/opensea/collections/other-project');
  await expectProviderFailure(unknownCollection, 404, 'OPENSEA_ROUTE_NOT_FOUND');
  assert.equal(capturedRequest, null, 'unregistered collection slugs must not reach OpenSea');

  capturedRequest = null;
  const bareNamespace = await request('/api/opensea');
  await expectProviderFailure(bareNamespace, 404, 'OPENSEA_ROUTE_NOT_FOUND');
  assert.equal(capturedRequest, null, 'the bare OpenSea namespace must remain Worker-native and fail closed');

  capturedRequest = null;
  const invalidMethod = await request('/api/opensea/health', { method: 'POST' });
  await expectProviderFailure(invalidMethod, 405, 'METHOD_NOT_ALLOWED');
  assert.equal(invalidMethod.headers.get('allow'), 'GET');
  assert.equal(invalidMethod.headers.get('cache-control'), 'no-store');
  assert.equal(invalidMethod.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(capturedRequest, null);
}

async function testProviderFailureMapping(): Promise<void> {
  setResponse(new Response('unauthorized', { status: 401 }));
  await expectProviderFailure(await request('/api/opensea/health'), 502, 'OPENSEA_API_KEY_REJECTED');

  setResponse(new Response('forbidden', { status: 403 }));
  await expectProviderFailure(await request('/api/opensea/health'), 502, 'OPENSEA_API_KEY_REJECTED');

  setResponse(new Response('rate limited', { status: 429, headers: { 'Retry-After': '7' } }));
  const rateLimited = await request('/api/opensea/health');
  await expectProviderFailure(rateLimited, 503, 'OPENSEA_RATE_LIMITED');
  assert.equal(rateLimited.headers.get('retry-after'), '7');

  setResponse(new Response('missing collection', { status: 404 }));
  await expectProviderFailure(await request('/api/opensea/collections/glorifier1'), 404, 'OPENSEA_COLLECTION_NOT_FOUND');

  setResponse(new Response('<html>not json</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
  await expectProviderFailure(await request('/api/opensea/health'), 502, 'OPENSEA_INVALID_RESPONSE');

  setResponse(new Response('{invalid', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  await expectProviderFailure(await request('/api/opensea/health'), 502, 'OPENSEA_INVALID_RESPONSE');

  setResponse(new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  await expectProviderFailure(await request('/api/opensea/health'), 502, 'OPENSEA_INVALID_RESPONSE');

  setResponse(new Response('redirected', { status: 302, headers: { Location: 'https://attacker.example/collect' } }));
  await expectProviderFailure(await request('/api/opensea/health'), 502, 'OPENSEA_REDIRECT_REJECTED');

  setResponse(new Response('provider failure', { status: 500 }));
  await expectProviderFailure(await request('/api/opensea/health'), 502, 'OPENSEA_UPSTREAM_ERROR');

  setResponse(new Response('x'.repeat(1_048_577), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  await expectProviderFailure(await request('/api/opensea/health'), 502, 'OPENSEA_RESPONSE_TOO_LARGE');

  setResponse(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Length': '1048577' } }));
  await expectProviderFailure(await request('/api/opensea/health'), 502, 'OPENSEA_RESPONSE_TOO_LARGE');
}

async function testRequestTimeout(): Promise<void> {
  const timeout = new Error('simulated timeout');
  timeout.name = 'TimeoutError';
  setFetchError(timeout);
  await expectProviderFailure(await request('/api/opensea/health'), 504, 'OPENSEA_REQUEST_TIMEOUT');
}

async function run(): Promise<void> {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (fetchError) throw fetchError;
    capturedInit = init;
    capturedCf = init && 'cf' in init ? (init as RequestInit & { cf?: unknown }).cf : undefined;
    capturedRequest = input instanceof Request ? input : new Request(input, init);
    return nextResponse;
  }) as typeof fetch;

  try {
    await testSuccessfulPublicReads();
    await testConfigurationAndRouteGuards();
    await testProviderFailureMapping();
    await testRequestTimeout();
    console.log('OpenSea Worker integration tests passed.');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
