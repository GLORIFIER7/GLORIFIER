import assert from 'node:assert/strict';
import test from 'node:test';
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

async function testSuccessfulHealthProbe(): Promise<void> {
  capturedRequest = null;
  const health = await request('/api/opensea/health');
  assert.equal(health.status, 200);
  const body = await health.json() as {
    ok: boolean;
    provider: string;
    status: string;
    authentication: { apiKey: string; apiKeyHeader: string; walletScopedAuthorization: string };
    collectionSlug: string;
  };
  assert.equal(body.ok, true);
  assert.equal(body.provider, 'opensea');
  assert.equal(body.status, 'connected');
  assert.deepEqual(body.authentication, {
    apiKey: 'accepted',
    apiKeyHeader: 'X-API-KEY',
    walletScopedAuthorization: 'not-required-for-public-collection-read',
  });
  assert.equal(body.collectionSlug, 'glorifier7');
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(JSON.stringify(body).includes('test-personal-api-key'), false);
  assert.equal(JSON.stringify(body).includes('test-scoped-token'), false);
  assertHealthProviderRequest(getCapturedRequest());
}

function assertHealthProviderRequest(providerRequest: Request): void {
  assert.equal(providerRequest.method, 'GET');
  assert.equal(providerRequest.url, 'https://api.opensea.io/api/v2/collections/glorifier7');
  assert.equal(providerRequest.headers.get('x-api-key'), 'test-personal-api-key');
  assert.equal(providerRequest.headers.get('accept'), 'application/json');
  assert.equal(providerRequest.headers.get('authorization'), null);
  assert.equal(providerRequest.headers.get('x-api-key')?.includes('test-scoped-token'), false);
  assert.equal(capturedInit?.redirect, 'manual');
  assert.ok(capturedInit?.signal instanceof AbortSignal);
  assert.equal(capturedInit?.cache, 'no-store');
  assert.equal(capturedCf, undefined);
}

async function testSuccessfulCollectionRead(): Promise<void> {
  setResponse(new Response(JSON.stringify({ collection: 'glorifier1', name: 'GLORIFIER' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
  const response = await request('/api/opensea/collections/glorifier1');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const body = await response.json() as { ok: boolean; collectionSlug: string; data: { name: string } };
  assert.equal(body.ok, true);
  assert.equal(body.collectionSlug, 'glorifier1');
  assert.equal(body.data.name, 'GLORIFIER');
  assert.equal(getCapturedRequest().url, 'https://api.opensea.io/api/v2/collections/glorifier1');
  assert.equal(capturedInit?.cache, 'no-store');
  assert.equal(capturedCf, undefined);
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

function createMemoryCache(): {
  edgeCache: OpenSeaEdgeCache;
  entries: Map<string, Response>;
  readonly matches: number;
  readonly puts: number;
} {
  const entries = new Map<string, Response>();
  let matches = 0;
  let puts = 0;
  const edgeCache: OpenSeaEdgeCache = {
    async match(key) {
      matches += 1;
      return entries.get(key.url)?.clone();
    },
    async put(key, response) {
      puts += 1;
      entries.set(key.url, response.clone());
    },
  };
  return {
    edgeCache,
    entries,
    get matches() { return matches; },
    get puts() { return puts; },
  };
}

async function testCollectionCacheHitAndHead(): Promise<void> {
  const cache = createMemoryCache();
  setResponse(new Response(JSON.stringify({ collection: 'glorifier1', name: 'GLORIFIER' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
  capturedRequest = null;
  const first = await openSeaWorkerRoute(new Request('https://glorifier.test/api/opensea/collections/glorifier1'),
    '/api/opensea/collections/glorifier1', env, cache.edgeCache);
  assert.equal(first.status, 200);
  assert.equal((await first.json() as { data: { name: string } }).data.name, 'GLORIFIER');
  assert.equal(cache.matches, 1);
  assert.equal(cache.puts, 1);
  assert.equal(getCapturedRequest().url, 'https://api.opensea.io/api/v2/collections/glorifier1');

  capturedRequest = null;
  setResponse(new Response('provider must not be reached', { status: 500 }));
  const second = await openSeaWorkerRoute(new Request('https://glorifier.test/api/opensea/collections/glorifier1'),
    '/api/opensea/collections/glorifier1', env, cache.edgeCache);
  assert.equal(second.status, 200);
  assert.equal((await second.json() as { data: { name: string } }).data.name, 'GLORIFIER');
  assert.equal(capturedRequest, null);
  assert.equal(cache.matches, 2);
  assert.equal(cache.puts, 1);

  const head = await openSeaWorkerRoute(new Request('https://glorifier.test/api/opensea/collections/glorifier1', { method: 'HEAD' }),
    '/api/opensea/collections/glorifier1', env, cache.edgeCache);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(cache.matches, 3);
  assert.equal(cache.puts, 1);
  assert.equal(capturedRequest, null);
}

async function testHeadCacheMissPopulatesGetCache(): Promise<void> {
  const cache = createMemoryCache();
  setResponse(new Response(JSON.stringify({ collection: 'glorifier1', name: 'GLORIFIER' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));

  const head = await openSeaWorkerRoute(
    new Request('https://glorifier.test/api/opensea/collections/glorifier1', { method: 'HEAD' }),
    '/api/opensea/collections/glorifier1',
    env,
    cache.edgeCache,
  );
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(cache.puts, 1, 'a validated HEAD miss should populate the shared GET cache entry');

  capturedRequest = null;
  setResponse(new Response('provider must not be reached', { status: 500 }));
  const get = await openSeaWorkerRoute(
    new Request('https://glorifier.test/api/opensea/collections/glorifier1'),
    '/api/opensea/collections/glorifier1',
    env,
    cache.edgeCache,
  );
  assert.equal(get.status, 200);
  assert.equal((await get.json() as { data: { name: string } }).data.name, 'GLORIFIER');
  assert.equal(capturedRequest, null, 'a GET after a HEAD cache miss must reuse the cached GET representation');
  assert.equal(cache.puts, 1);
}

async function testFragmentedResponseWithinByteLimitIsAccepted(): Promise<void> {
  const payload = JSON.stringify({ collection: 'glorifier7', name: 'x'.repeat(20_000) });
  const bytes = new TextEncoder().encode(payload);
  assert.ok(bytes.byteLength < 1_048_576, 'fixture must remain below the documented byte limit');
  let offset = 0;
  const fragmentedBody = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(offset, offset + 1));
      offset += 1;
    },
  });
  setResponse(new Response(fragmentedBody, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));

  const response = await request('/api/opensea/health');
  assert.equal(response.status, 200, 'valid JSON below 1 MiB must not be rejected based on stream chunk count');
  const body = await response.json() as { ok: boolean; status: string };
  assert.equal(body.ok, true);
  assert.equal(body.status, 'connected');
}

async function testProviderErrorsAreNotCached(): Promise<void> {
  const cache = createMemoryCache();
  setResponse(new Response('rate limited', { status: 429, headers: { 'Retry-After': '7' } }));
  const response = await openSeaWorkerRoute(new Request('https://glorifier.test/api/opensea/collections/glorifier7'),
    '/api/opensea/collections/glorifier7', env, cache.edgeCache);
  assert.equal(response.status, 503);
  assert.equal(cache.puts, 0);
  assert.equal(cache.entries.size, 0);
}

async function testHealthProbesBypassCache(): Promise<void> {
  const cache = createMemoryCache();
  setResponse(new Response(JSON.stringify({ collection: 'glorifier7', name: 'GLORIFIER' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
  const matchesBefore = cache.matches;
  const putsBefore = cache.puts;
  const get = await openSeaWorkerRoute(new Request('https://glorifier.test/api/opensea/health'),
    '/api/opensea/health', env, cache.edgeCache);
  assert.equal(get.status, 200);
  assert.equal((await get.json() as { status: string }).status, 'connected');
  assert.equal(get.headers.get('cache-control'), 'no-store');
  assert.equal(cache.matches, matchesBefore);
  assert.equal(cache.puts, putsBefore);

  setResponse(new Response(JSON.stringify({ collection: 'glorifier7', name: 'GLORIFIER' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
  const head = await openSeaWorkerRoute(new Request('https://glorifier.test/api/opensea/health', { method: 'HEAD' }),
    '/api/opensea/health', env, cache.edgeCache);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('cache-control'), 'no-store');
  assert.equal(cache.matches, matchesBefore);
  assert.equal(cache.puts, putsBefore);
}

async function testHeadErrorResponsesAreBodyless(): Promise<void> {
  const cache = createMemoryCache();
  setResponse(new Response('rate limited', { status: 429, headers: { 'Retry-After': '7' } }));
  const rateLimited = await openSeaWorkerRoute(new Request('https://glorifier.test/api/opensea/collections/glorifier1', { method: 'HEAD' }),
    '/api/opensea/collections/glorifier1', env, cache.edgeCache);
  assert.equal(rateLimited.status, 503);
  assert.equal(await rateLimited.text(), '');
  assert.equal(rateLimited.headers.get('retry-after'), '7');

  const missingKey = await openSeaWorkerRoute(new Request('https://glorifier.test/api/opensea/health', { method: 'HEAD' }),
    '/api/opensea/health', { ...env, OPENSEA_API_KEY: undefined }, cache.edgeCache);
  assert.equal(missingKey.status, 503);
  assert.equal(await missingKey.text(), '');
}

async function testValidatedCacheAndHeadSemantics(): Promise<void> {
  await testCollectionCacheHitAndHead();
  await testHeadCacheMissPopulatesGetCache();
  await testFragmentedResponseWithinByteLimitIsAccepted();
  await testProviderErrorsAreNotCached();
  await testHealthProbesBypassCache();
  await testHeadErrorResponsesAreBodyless();
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
    await testSuccessfulHealthProbe();
    await testSuccessfulCollectionRead();
    await testConfigurationAndRouteGuards();
    await testProviderFailureMapping();
    await testRequestTimeout();
    await testValidatedCacheAndHeadSemantics();
    console.log('OpenSea Worker integration tests passed.');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('OpenSea Worker integration', run);
