const OPENSEA_API_BASE = 'https://api.opensea.io/api/v2';
const ALLOWED_COLLECTION_SLUGS = new Set(['glorifier7', 'glorifier1']);

export type OpenSeaWorkerEnv = {
  OPENSEA_API_KEY?: string;
};

const responseHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

const failure = (status: number, code: string, message: string, additionalHeaders: Record<string, string> = {}): Response =>
  Response.json({ ok: false, provider: 'opensea', status: 'unavailable', code, error: message }, {
    status,
    headers: { ...responseHeaders, ...additionalHeaders },
  });

const fetchCollection = async (slug: string, apiKey: string): Promise<{ status: number; data?: Record<string, unknown>; error?: Response }> => {
  let upstream: Response;
  try {
    const init: RequestInit & { cf?: { cacheTtl: number; cacheEverything: boolean } } = {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        Accept: 'application/json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      // Bound public collection requests at the Cloudflare edge to conserve API quota.
      cf: { cacheTtl: 60, cacheEverything: true },
    };
    upstream = await fetch(new URL(`${OPENSEA_API_BASE}/collections/${encodeURIComponent(slug)}`), init);
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return {
      status: timedOut ? 504 : 502,
      error: failure(timedOut ? 504 : 502, timedOut ? 'OPENSEA_REQUEST_TIMEOUT' : 'OPENSEA_UPSTREAM_UNAVAILABLE',
        timedOut ? 'OpenSea did not respond within the configured timeout.' : 'OpenSea could not be reached.'),
    };
  }

  if (upstream.status === 401 || upstream.status === 403) {
    return { status: 502, error: failure(502, 'OPENSEA_API_KEY_REJECTED', 'OpenSea rejected the configured API key.') };
  }
  if (upstream.status === 429) {
    return { status: 503, error: failure(503, 'OPENSEA_RATE_LIMITED', 'OpenSea rate-limited the request. Retry after the provider limit resets.') };
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
    data = await upstream.json();
  } catch {
    return { status: 502, error: failure(502, 'OPENSEA_INVALID_RESPONSE', 'OpenSea returned invalid JSON.') };
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
): Promise<Response> => {
  if (request.method !== 'GET') {
    return failure(405, 'METHOD_NOT_ALLOWED', 'OpenSea read-only routes accept GET only.', { Allow: 'GET' });
  }

  const isHealthProbe = pathname === '/api/opensea/health';
  const match = pathname.match(/^\/api\/opensea\/collections\/([a-z0-9-]+)$/);
  const slug = isHealthProbe ? 'glorifier7' : match?.[1];
  if (!slug || !ALLOWED_COLLECTION_SLUGS.has(slug)) {
    return failure(404, 'OPENSEA_ROUTE_NOT_FOUND', 'Only the registered GLORIFIER OpenSea collections are available through this route.');
  }

  const apiKey = (env.OPENSEA_API_KEY || '').trim();
  if (!apiKey) {
    return failure(503, 'OPENSEA_API_KEY_NOT_CONFIGURED', 'Configure the OPENSEA_API_KEY Worker secret to enable public collection lookups.');
  }

  const result = await fetchCollection(slug, apiKey);
  if (result.error) return result.error;

  if (isHealthProbe) {
    return Response.json({
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
  }

  return Response.json({
    ok: true,
    provider: 'opensea',
    status: 'connected',
    collectionSlug: slug,
    data: result.data,
  }, {
    headers: {
      'Cache-Control': 'public, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
