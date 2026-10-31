const ALLOWED_COLLECTION_SLUGS = new Set(['glorifier7', 'glorifier1']);

const fetchRegisteredCollection = (slug: string, init: RequestInit): Promise<Response> => {
  switch (slug) {
    case 'glorifier7':
      return fetch('https://api.opensea.io/api/v2/collections/glorifier7', init);
    case 'glorifier1':
      return fetch('https://api.opensea.io/api/v2/collections/glorifier1', init);
    default:
      throw new Error('Unregistered OpenSea collection slug.');
  }
};
const MAX_OPENSEA_RESPONSE_BYTES = 1_048_576;

class OpenSeaResponseTooLargeError extends Error {}

export type OpenSeaWorkerEnv = {
  OPENSEA_API_KEY?: string;
};

export type OpenSeaEdgeCache = {
  match(request: Request): Promise<Response | undefined | null>;
  put(request: Request, response: Response): Promise<void>;
};

type OpenSeaFetchResult = {
  status: number;
  data?: Record<string, unknown>;
  error?: Response;
};

type OpenSeaRoute = {
  slug?: string;
  isHealthProbe: boolean;
  error?: Response;
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

const getDefaultOpenSeaCache = (): OpenSeaEdgeCache | undefined => {
  const cacheStorage = (globalThis as typeof globalThis & {
    caches?: { default?: OpenSeaEdgeCache };
  }).caches;
  return cacheStorage?.default;
};

const createProviderRequestInit = (apiKey: string): RequestInit => ({
  method: 'GET',
  headers: {
    'X-API-KEY': apiKey,
    Accept: 'application/json',
  },
  redirect: 'manual',
  signal: AbortSignal.timeout(8000),
  cache: 'no-store',
});

const connectionFailure = (error: unknown): Response => {
  const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
  return failure(
    timedOut ? 504 : 502,
    timedOut ? 'OPENSEA_REQUEST_TIMEOUT' : 'OPENSEA_UPSTREAM_UNAVAILABLE',
    timedOut ? 'OpenSea did not respond within the configured timeout.' : 'OpenSea could not be reached.',
  );
};

const providerStatusFailure = (upstream: Response): Response | undefined => {
  if (upstream.status >= 300 && upstream.status < 400) {
    return failure(502, 'OPENSEA_REDIRECT_REJECTED', 'OpenSea returned a redirect; the Worker did not follow it.');
  }
  if (upstream.status === 401 || upstream.status === 403) {
    return failure(502, 'OPENSEA_API_KEY_REJECTED', 'OpenSea rejected the configured API key.');
  }
  if (upstream.status === 404) {
    return failure(404, 'OPENSEA_COLLECTION_NOT_FOUND', 'OpenSea did not find the requested collection.');
  }
  if (upstream.status === 429) {
    const retryAfter = upstream.headers.get('retry-after');
    const validRetryAfter = retryAfter && (/^\d+$/.test(retryAfter) || !Number.isNaN(Date.parse(retryAfter)))
      ? retryAfter
      : undefined;
    return failure(503, 'OPENSEA_RATE_LIMITED', 'OpenSea rate-limited the request. Retry after the provider limit resets.',
      validRetryAfter ? { 'Retry-After': validRetryAfter } : {});
  }
  if (!upstream.ok) {
    return failure(502, 'OPENSEA_UPSTREAM_ERROR', 'OpenSea returned an unsuccessful HTTP response.');
  }
  return undefined;
};

const MAX_OPENSEA_RESPONSE_CHUNKS = 16_384;

const validateOpenSeaContentLength = (response: Response): void => {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength === null) return;
  if (!/^\d+$/.exec(declaredLength)) throw new Error('Invalid OpenSea content length.');
  const parsedLength = Number(declaredLength);
  if (!Number.isSafeInteger(parsedLength)) throw new Error('Invalid OpenSea content length.');
  if (parsedLength > MAX_OPENSEA_RESPONSE_BYTES) throw new OpenSeaResponseTooLargeError();
};

const readOpenSeaChunks = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  chunks: Uint8Array[],
  totalBytes: number,
  chunkCount: number,
): Promise<number> => {
  const { done, value } = await reader.read();
  if (done) return totalBytes;
  const nextBytes = totalBytes + value.byteLength;
  if (nextBytes > MAX_OPENSEA_RESPONSE_BYTES || chunkCount >= MAX_OPENSEA_RESPONSE_CHUNKS) {
    try { await reader.cancel(); } catch { /* Best-effort cancellation after enforcing the stream limits. */ }
    throw new OpenSeaResponseTooLargeError();
  }
  chunks.push(value);
  return readOpenSeaChunks(reader, chunks, nextBytes, chunkCount + 1);
};

const concatenateOpenSeaChunks = (chunks: Uint8Array[], totalBytes: number): Uint8Array => {
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const readBoundedOpenSeaJson = async (response: Response): Promise<unknown> => {
  validateOpenSeaContentLength(response);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('OpenSea response body is empty.');
  const chunks: Uint8Array[] = [];
  let totalBytes: number;
  try {
    totalBytes = await readOpenSeaChunks(reader, chunks, 0, 0);
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(new TextDecoder().decode(concatenateOpenSeaChunks(chunks, totalBytes)));
};

const parseCollectionResponse = async (upstream: Response): Promise<OpenSeaFetchResult> => {
  const contentType = upstream.headers.get('content-type') || '';
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(contentType)) {
    const error = failure(502, 'OPENSEA_INVALID_RESPONSE', 'OpenSea returned a non-JSON response.');
    return { status: error.status, error };
  }

  let data: unknown;
  try {
    data = await readBoundedOpenSeaJson(upstream);
  } catch (error) {
    if (error instanceof OpenSeaResponseTooLargeError) {
      const response = failure(502, 'OPENSEA_RESPONSE_TOO_LARGE', 'OpenSea response exceeded the 1 MiB safety limit.');
      return { status: response.status, error: response };
    }
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      const response = failure(504, 'OPENSEA_REQUEST_TIMEOUT', 'OpenSea did not respond within the configured timeout.');
      return { status: response.status, error: response };
    }
    const response = failure(502, 'OPENSEA_INVALID_RESPONSE', 'OpenSea returned an invalid or unreadable JSON response.');
    return { status: response.status, error: response };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const error = failure(502, 'OPENSEA_INVALID_RESPONSE', 'OpenSea returned an unexpected response shape.');
    return { status: error.status, error };
  }
  return { status: upstream.status, data: data as Record<string, unknown> };
};

const fetchCollection = async (slug: string, apiKey: string): Promise<OpenSeaFetchResult> => {
  if (!ALLOWED_COLLECTION_SLUGS.has(slug)) {
    const error = failure(404, 'OPENSEA_ROUTE_NOT_FOUND', 'Only registered GLORIFIER collection endpoints are available.');
    return { status: error.status, error };
  }

  let upstream: Response;
  try {
    upstream = await fetchRegisteredCollection(slug, createProviderRequestInit(apiKey));
  } catch (error) {
    const response = connectionFailure(error);
    return { status: response.status, error: response };
  }

  const statusFailure = providerStatusFailure(upstream);
  if (statusFailure) return { status: statusFailure.status, error: statusFailure };
  return parseCollectionResponse(upstream);
};

const resolveOpenSeaRoute = (pathname: string): OpenSeaRoute => {
  const isHealthProbe = pathname === '/api/opensea/health';
  const prefix = '/api/opensea/collections/';
  if (pathname.startsWith(prefix)) {
    const requestedSlug = pathname.slice(prefix.length);
    if (!/^[a-z0-9][a-z0-9-]{0,127}$/.exec(requestedSlug)) {
      return {
        isHealthProbe: false,
        error: failure(400, 'INVALID_COLLECTION_SLUG', 'Collection slugs must use lowercase letters, numbers, and hyphens.'),
      };
    }
  }

  const match = /^\/api\/opensea\/collections\/([a-z0-9-]+)$/.exec(pathname);
  const slug = isHealthProbe ? 'glorifier7' : match?.[1];
  if (!slug || !ALLOWED_COLLECTION_SLUGS.has(slug)) {
    return {
      isHealthProbe,
      error: failure(404, 'OPENSEA_ROUTE_NOT_FOUND', 'Only the registered GLORIFIER OpenSea collections are available through this route.'),
    };
  }
  return { slug, isHealthProbe };
};

const responseForRequest = (request: Request, response: Response): Response =>
  request.method === 'HEAD'
    ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers })
    : response;

const createCollectionCacheKey = (request: Request, pathname: string, isHealthProbe: boolean): Request | undefined =>
  isHealthProbe ? undefined : new Request(new URL(pathname, request.url), { method: 'GET' });

const readCachedCollection = async (
  cache: OpenSeaEdgeCache | undefined,
  cacheKey: Request | undefined,
): Promise<Response | undefined> => {
  if (!cache || !cacheKey) return undefined;
  try {
    return (await cache.match(cacheKey)) || undefined;
  } catch {
    return undefined;
  }
};

const storeValidatedCollection = async (
  cache: OpenSeaEdgeCache | undefined,
  cacheKey: Request | undefined,
  response: Response,
  method: string,
): Promise<void> => {
  if (!cache || !cacheKey || method !== 'GET') return;
  try {
    await cache.put(cacheKey, response.clone());
  } catch {
    // Cache failures are non-fatal; the validated response is still returned.
  }
};

const createHealthResponse = (slug: string): Response => Response.json({
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
}, { headers: responseHeaders });

const createCollectionResponse = (slug: string, data: Record<string, unknown>): Response => Response.json({
  ok: true,
  provider: 'opensea',
  status: 'connected',
  collectionSlug: slug,
  data,
}, {
  headers: {
    'Cache-Control': 'public, max-age=60',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  },
});

export const openSeaWorkerRoute = async (
  request: Request,
  pathname: string,
  env: OpenSeaWorkerEnv,
  edgeCache: OpenSeaEdgeCache | undefined = getDefaultOpenSeaCache(),
): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return responseForRequest(request, failure(405, 'METHOD_NOT_ALLOWED', 'OpenSea read-only routes accept GET and HEAD only.', { Allow: 'GET, HEAD' }));
  }

  const route = resolveOpenSeaRoute(pathname);
  if (route.error) return responseForRequest(request, route.error);

  const apiKey = (env.OPENSEA_API_KEY || '').trim();
  if (!apiKey) {
    return responseForRequest(request, failure(503, 'OPENSEA_API_KEY_NOT_CONFIGURED', 'Configure the OPENSEA_API_KEY Worker secret to enable public collection lookups.'));
  }

  const cacheKey = createCollectionCacheKey(request, pathname, route.isHealthProbe);
  const cached = await readCachedCollection(edgeCache, cacheKey);
  if (cached) return responseForRequest(request, cached);

  const result = await fetchCollection(route.slug || '', apiKey);
  if (result.error) return responseForRequest(request, result.error);
  if (!result.data) {
    return responseForRequest(request, failure(502, 'OPENSEA_INVALID_RESPONSE', 'OpenSea returned an unexpected response shape.'));
  }

  const response = route.isHealthProbe
    ? createHealthResponse(route.slug || 'glorifier7')
    : createCollectionResponse(route.slug || '', result.data);
  await storeValidatedCollection(edgeCache, cacheKey, response, request.method);
  return responseForRequest(request, response);
};
