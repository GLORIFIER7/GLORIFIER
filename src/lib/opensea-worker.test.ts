import assert from 'node:assert/strict';
import worker from '../worker.ts';
import type { CloudflareEnv } from '../worker.ts';
import { openSeaWorkerRoute, type OpenSeaEdgeCache } from './opensea-worker';

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
  assert.equal(capturedInit?.cache, 'no-store', 'health probes must bypass the Fetch cache so key changes are observed immediately');
  assert.equal(capturedCf, undefined, 'health probes must not opt into Cloudflare edge caching');
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
  assert.equal(capturedInit?.cache, 'no-store', 'provider responses must not be cached before validation');
  assert.equal(capturedCf, undefined, 'validated metadata is cached by the Worker only after JSON validation');
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
  assert.equal(invalidMethod.headers.get('allow'), 'GET, HEAD');
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

  setResponse(new Response(new ReadableStream({
    pull() {
      const bodyTimeout = new Error('simulated response-body timeout');
      bodyTimeout.name = 'TimeoutError';
      throw bodyTimeout;
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  await expectProviderFailure(
    await request('/api/opensea/health'),
    504,
    'OPENSEA_REQUEST_TIMEOUT',
  );
}

async function testValidatedCacheAndHeadSemantics(): Promise<void> {
  const entries = new Map<string, Response>();
  let cacheMatches = 0;
  let cachePuts = 0;
  const edgeCache: OpenSeaEdgeCache = {
    async match(key) {
      cacheMatches += 1;
      return entries.get(key.url)?.clone();
    },
    async put(key, response) {
      cachePuts += 1;
      entries.set(key.url, response.clone());
    },
  };

  setResponse(new Response(JSON.stringify({ collection: 'glorifier1', name: 'GLORIFIER' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
  capturedRequest = null;
  const first = await openSeaWorkerRoute(
    new Request('https://glorifier.test/api/opensea/collections/glorifier1'),
    '/api/opensea/collections/glorifier1',
    env,
    edgeCache,
  );
  assert.equal(first.status, 200);
  assert.equal((await first.json() as { data: { name: string } }).data.name, 'GLORIFIER');
  assert.equal(cacheMatches, 1);
  assert.equal(cachePuts, 1, 'only a fully validated successful collection response is cached');
  assert.equal(getCapturedRequest().url, 'https://api.opensea.io/api/v2/collections/glorifier1');

  capturedRequest = null;
  setResponse(new Response('upstream should not be reached', { status: 500 }));
  const second = await openSeaWorkerRoute(
    new Request('https://glorifier.test/api/opensea/collections/glorifier1'),
    '/api/opensea/collections/glorifier1',
    env,
    edgeCache,
  );
  assert.equal(second.status, 200);
  assert.equal((await second.json() as { data: { name: string } }).data.name, 'GLORIFIER');
  assert.equal(capturedRequest, null, 'validated collection metadata is served from the short-lived edge cache');
  assert.equal(cacheMatches, 2);
  assert.equal(cachePuts, 1);

  entries.clear();
  cachePuts = 0;
  capturedRequest = null;
  setResponse(new Response('rate limited', { status: 429, headers: { 'Retry-After': '7' } }));
  const rateLimited = await openSeaWorkerRoute(
    new Request('https://glorifier.test/api/opensea/collections/glorifier7'),
    '/api/opensea/collections/glorifier7',
    env,
    edgeCache,
  );
  assert.equal(rateLimited.status, 503);
  assert.equal(cachePuts, 0, 'provider failures must never be cached');
  assert.equal(entries.size, 0);

  const matchesBeforeHealth = cacheMatches;
  const putsBeforeHealth = cachePuts;
  setResponse(new Response(JSON.stringify({ collection: 'glorifier7', name: 'GLORIFIER' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
  const healthGet = await openSeaWorkerRoute(
    new Request('https://glorifier.test/api/opensea/health'),
    '/api/opensea/health',
    env,
    edgeCache,
  );
  assert.equal(healthGet.status, 200);
  assert.equal((await healthGet.json() as { status: string }).status, 'connected');
  assert.equal(healthGet.headers.get('cache-control'), 'no-store');
  assert.equal(cacheMatches, matchesBeforeHealth, 'GET health probes must bypass the metadata cache');
  assert.equal(cachePuts, putsBeforeHealth, 'GET health probes must never populate the metadata cache');

  const healthHead = await openSeaWorkerRoute(
    new Request('https://glorifier.test/api/opensea/health', { method: 'HEAD' }),
    '/api/opensea/health',
    env,
    edgeCache,
  );
  assert.equal(healthHead.status, 200);
  assert.equal(await healthHead.text(), '', 'HEAD health responses must never include a body');
  assert.equal(healthHead.headers.get('cache-control'), 'no-store');
  assert.equal(cacheMatches, matchesBeforeHealth, 'health probes must bypass the metadata cache');
  assert.equal(cachePuts, putsBeforeHealth, 'health probes must never populate the metadata cache');

  setResponse(new Response('rate limited', { status: 429, headers: { 'Retry-After': '7' } }));
  const errorHead = await openSeaWorkerRoute(
    new Request('https://glorifier.test/api/opensea/collections/glorifier1', { method: 'HEAD' }),
    '/api/opensea/collections/glorifier1',
    env,
    edgeCache,
  );
  assert.equal(errorHead.status, 503);
  assert.equal(await errorHead.text(), '', 'HEAD error responses must never include a body');
  assert.equal(errorHead.headers.get('retry-after'), '7');

  const missingKeyHead = await openSeaWorkerRoute(
    new Request('https://glorifier.test/api/opensea/health', { method: 'HEAD' }),
    '/api/opensea/health',
    { ...env, OPENSEA_API_KEY: undefined },
    edgeCache,
  );
  assert.equal(missingKeyHead.status, 503);
  assert.equal(await missingKeyHead.text(), '', 'HEAD configuration errors must never include a body');
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
    await testValidatedCacheAndHeadSemantics();
    console.log('OpenSea Worker integration tests passed.');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
