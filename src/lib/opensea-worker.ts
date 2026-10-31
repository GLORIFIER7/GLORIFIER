const COLLECTION_ENDPOINTS: Readonly<Record<string, URL>> = Object.freeze({
  glorifier7: new URL('https://api.opensea.io/api/v2/collections/glorifier7'),
  glorifier1: new URL('https://api.opensea.io/api/v2/collections/glorifier1'),
});
const ALLOWED_COLLECTION_SLUGS = new Set(Object.keys(COLLECTION_ENDPOINTS));
const MAX_OPENSEA_RESPONSE_BYTES = 1_048_576;

class OpenSeaResponseTooLargeError extends Error {}

const readBoundedOpenSeaJson = async (response: Response): Promise<unknown> => {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) throw new Error('Invalid OpenSea content length.');
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength)) throw new Error('Invalid OpenSea content length.');
    if (parsedLength > MAX_OPENSEA_RESPONSE_BYTES) throw new OpenSeaResponseTooLargeError();
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('OpenSea response body is empty.');
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_OPENSEA_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch { /* Best-effort cancellation after enforcing the response cap. */ }
        throw new OpenSeaResponseTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
};

export type OpenSeaWorkerEnv = {
  OPENSEA_API_KEY?: string;
};

export type OpenSeaEdgeCache = {
  match(request: Request): Promise<Response | undefined | null>;
  put(request: Request, response: Response): Promise<void>;
};

const getDefaultOpenSeaCache = (): OpenSeaEdgeCache | undefined => {
  const cacheStorage = (globalThis as typeof globalThis & {
    caches?: { default?: OpenSeaEdgeCache };
  }).caches;
  return cacheStorage?.default;
};

const responseHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

const failure = (status: number, code: string, message: string, additionalHeaders: Record<string, string> = {}): Response =>
  Response.json({ ok: false, provider: 'opensea', status: 'unavailable', code, error: message }, {
    status,
    headers: { ...additionalHeaders, ...responseHeaders },
  });

const fetchCollection = async (slug: string, apiKey: string): Promise<{ status: number; data?: Record<string, unknown>; error?: Response }> => {
  let upstream: Response;
  try {
    const init: RequestInit = {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        Accept: 'application/json',
      },
      // Never follow provider redirects; inspect the response and fail closed.
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      // Always bypass fetch-level caching; only validated responses enter the Worker cache.
      cache: 'no-store',
    };
    const endpoint = COLLECTION_ENDPOINTS[slug];
    if (!endpoint) {
      return { status: 404, error: failure(404, 'OPENSEA_ROUTE_NOT_FOUND', 'Only registered GLORIFIER collection endpoints are available.') };
    }
    upstream = await fetch(endpoint, init);
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return {
      status: timedOut ? 504 : 502,
      error: failure(timedOut ? 504 : 502, timedOut ? 'OPENSEA_REQUEST_TIMEOUT' : 'OPENSEA_UPSTREAM_UNAVAILABLE',
        timedOut ? 'OpenSea did not respond within the configured timeout.' : 'OpenSea could not be reached.'),
    };
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    return { status: 502, error: failure(502, 'OPENSEA_REDIRECT_REJECTED', 'OpenSea returned a redirect; the Worker did not follow it.') };
  }
  if (upstream.status === 401 || upstream.status === 403) {
    return { status: 502, error: failure(502, 'OPENSEA_API_KEY_REJECTED', 'OpenSea rejected the configured API key.') };
  }
  if (upstream.status === 404) {
    return { status: 404, error: failure(404, 'OPENSEA_COLLECTION_NOT_FOUND', 'OpenSea did not find the requested collection.') };
  }
  if (upstream.status === 429) {
    const retryAfter = upstream.headers.get('retry-after');
    const validRetryAfter = retryAfter && (/^\d+$/.test(retryAfter) || !Number.isNaN(Date.parse(retryAfter))) ? retryAfter : undefined;
    return {
      status: 503,
      error: failure(503, 'OPENSEA_RATE_LIMITED', 'OpenSea rate-limited the request. Retry after the provider limit resets.',
        validRetryAfter ? { 'Retry-After': validRetryAfter } : {}),
    };
  }
  if (!upstream.ok) {
    return { status: 502, error: failure(502, 'OPENSEA_UPSTREAM_ERROR', `OpenSea returned HTTP ${upstream.status}.`) };
  }

  const contentType = upstream.headers.get('content-type') || '';
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(contentType)) {
    return { status: 502, error: failure(502, 'OPENSEA_INVALID_RESPONSE', 'OpenSea returned a non-JSON response.') };
  }

  let data: unknown;
  try {
    data = await readBoundedOpenSeaJson(upstream);
  } catch (error) {
    if (error instanceof OpenSeaResponseTooLargeError) {
      return { status: 502, error: failure(502, 'OPENSEA_RESPONSE_TOO_LARGE', 'OpenSea response exceeded the 1 MiB safety limit.') };
    }
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return { status: 504, error: failure(504, 'OPENSEA_REQUEST_TIMEOUT', 'OpenSea did not respond within the configured timeout.') };
    }
    return { status: 502, error: failure(502, 'OPENSEA_INVALID_RESPONSE', 'OpenSea returned an invalid or unreadable JSON response.') };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { status: 502, error: failure(502, 'OPENSEA_INVALID_RESPONSE', 'OpenSea returned an unexpected response shape.') };
  }
  return { status: upstream.status, data: data as Record<string, unknown> };
};

export const openSeaWorkerRoute = async (
  request: Request,
  pathname: string,
  env: OpenSeaWorkerEnv,
  edgeCache: OpenSeaEdgeCache | undefined = getDefaultOpenSeaCache(),
): Promise<Response> => {
  const responseForRequest = (response: Response): Response => request.method === 'HEAD'
    ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers })
    : response;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return responseForRequest(failure(405, 'METHOD_NOT_ALLOWED', 'OpenSea read-only routes accept GET and HEAD only.', { Allow: 'GET, HEAD' }));
  }

  const isHealthProbe = pathname === '/api/opensea/health';
  const collectionPrefix = '/api/opensea/collections/';
  if (pathname.startsWith(collectionPrefix)) {
    const requestedSlug = pathname.slice(collectionPrefix.length);
    if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(requestedSlug)) {
      return responseForRequest(failure(400, 'INVALID_COLLECTION_SLUG', 'Collection slugs must use lowercase letters, numbers, and hyphens.'));
    }
  }
  const match = pathname.match(/^\/api\/opensea\/collections\/([a-z0-9-]+)$/);
  const slug = isHealthProbe ? 'glorifier7' : match?.[1];
  if (!slug || !ALLOWED_COLLECTION_SLUGS.has(slug)) {
    return responseForRequest(failure(404, 'OPENSEA_ROUTE_NOT_FOUND', 'Only the registered GLORIFIER OpenSea collections are available through this route.'));
  }

  const apiKey = (env.OPENSEA_API_KEY || '').trim();
  if (!apiKey) {
    return responseForRequest(failure(503, 'OPENSEA_API_KEY_NOT_CONFIGURED', 'Configure the OPENSEA_API_KEY Worker secret to enable public collection lookups.'));
  }

  // Health probes always call OpenSea directly; public metadata may use only validated cached responses.
  const cacheKey = !isHealthProbe && request.method === 'GET'
    ? new Request(new URL(pathname, request.url), { method: 'GET' })
    : undefined;
  if (cacheKey && edgeCache) {
    try {
      const cached = await edgeCache.match(cacheKey);
      if (cached) return cached;
    } catch {
      // A cache miss/failure must not make public metadata unavailable.
    }
  }

  const result = await fetchCollection(slug, apiKey);
  if (result.error) return responseForRequest(result.error);

  if (isHealthProbe) {
    return responseForRequest(Response.json({
      ok: true,
      provider: 'opensea',
      status: 'connected',
      authentication: {
        apiKey: 'accepted',
        apiKeyHeader: 'X-API-KEY',
        walletScopedAuthorization: 'not-required-for-public-collection-read',
      },
      collectionSlug: slug,
      observedAt: new Date().toISOString(),
    }, { headers: responseHeaders }));
  }

  const collectionHeaders = {
    'Cache-Control': 'public, max-age=60',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  };
  const response = Response.json({
    ok: true,
    provider: 'opensea',
    status: 'connected',
    collectionSlug: slug,
    data: result.data,
  }, { headers: collectionHeaders });
  if (cacheKey && edgeCache) {
    try {
      // Cache only after the upstream status, content type, bounded body, and JSON shape passed validation.
      await edgeCache.put(cacheKey, response.clone());
    } catch {
      // Cache failures are non-fatal; the validated response is still returned.
    }
  }
  return responseForRequest(response);
};
