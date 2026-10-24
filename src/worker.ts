import { getBusinessModel } from './lib/business-model-contract';

type CloudflareEnv = {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  GLORIFIER_CANONICAL_DOMAIN?: string;
  GLORIFIER_ORG_EMAIL?: string;
  GLORIFIER_EMAIL_MODE?: string;
  GLORIFIER_EMAIL_FORWARDING_TARGET?: string;
  GLORIFIER_DOMAIN_STATUS?: string;
  GLORIFIER_PUBLIC_URL?: string;
  GLORIFIER_BACKEND_ORIGIN?: string;
  GLORIFIER_SUPABASE_URL?: string;
  GLORIFIER_SUPABASE_SERVICE_ROLE_KEY?: string;
};

// Proxying is permitted only to an explicitly configured, reviewed HTTPS origin.
// Never silently fall back to Railway or another provider when configuration is absent.
const resolveBackendOrigin = (value?: string): string | null => {
  const candidate = configured(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
};

const configured = (value: string | undefined): string => (value || '').trim();
const identityResponse = (env: CloudflareEnv): Response => {
  const canonicalDomain = configured(env.GLORIFIER_CANONICAL_DOMAIN).toLowerCase();
  const primaryEmail = configured(env.GLORIFIER_ORG_EMAIL).toLowerCase();
  const emailMode = configured(env.GLORIFIER_EMAIL_MODE || 'forwarding').toLowerCase();
  const emailForwardingTargetConfigured = Boolean(configured(env.GLORIFIER_EMAIL_FORWARDING_TARGET));
  const domainStatus = configured(env.GLORIFIER_DOMAIN_STATUS || 'not-configured').toLowerCase();
  const website = configured(env.GLORIFIER_PUBLIC_URL);
  const domainConfigured = Boolean(canonicalDomain);
  const emailConfigured = Boolean(primaryEmail);
  const domainOwnedOrVerified = ['owned', 'verified', 'active'].includes(domainStatus);
  const identity = {
    organization: 'GLORIFIER',
    canonicalDomain,
    primaryEmail,
    emailMode,
    emailForwardingTargetConfigured,
    domainStatus,
    website,
    principles: [
      'Domain identity is independent from hosting/provider identity.',
      'Email routing is separate from application authentication.',
      'No paid mailbox is required for the architecture to operate.',
      'A domain must be controlled before an @domain address can be authoritative.',
      'Provider replacement must not change GLORIFIER organizational identity.',
      'Human owner remains final authority for consequential actions.',
    ],
    ready: domainConfigured && emailConfigured && domainOwnedOrVerified,
    domainConfigured,
    emailConfigured,
    domainOwnedOrVerified,
    nextAction: !domainConfigured
      ? 'Set GLORIFIER_CANONICAL_DOMAIN after the organization controls its domain.'
      : !domainOwnedOrVerified
        ? 'Verify domain ownership/control before treating the domain as authoritative.'
        : !emailConfigured
          ? 'Configure GLORIFIER_ORG_EMAIL after an @domain mailbox or forwarding address exists.'
          : 'Identity configuration is ready.',
  };
  return Response.json({ ok: identity.ready, status: identity.ready ? 'ready' : 'not-ready', identity }, {
    status: identity.ready ? 200 : 503,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
};

const healthResponse = (method: string, env: CloudflareEnv): Response => {
  if (method !== 'GET' && method !== 'HEAD') {
    return Response.json({ ok: false, error: 'Method not allowed' }, {
      status: 405,
      headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  // This is deliberately a Worker-runtime health check, not a claim that
  // provider APIs, authentication, or databases have been verified.
  const body = {
    ok: true,
    status: 'worker-ready',
    layer: 'cloudflare-worker',
    checks: {
      worker: 'ok',
      assetsBindingConfigured: Boolean(env.ASSETS),
    },
    dependencies: {
      backend: 'not-probed',
      authentication: 'not-probed',
      databases: 'not-probed',
    },
  };
  const headers = {
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  };
  if (method === 'HEAD') return new Response(null, { status: 200, headers });
  return Response.json(body, { status: 200, headers });
};


const supabaseConfig = (env: CloudflareEnv): { url: URL; key: string } | null => {
  const rawUrl = configured(env.GLORIFIER_SUPABASE_URL);
  const key = configured(env.GLORIFIER_SUPABASE_SERVICE_ROLE_KEY);
  if (!rawUrl || !key) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !url.hostname.endsWith('.supabase.co')) return null;
    url.pathname = url.pathname.replace(/\/$/, '');
    return { url, key };
  } catch {
    return null;
  }
};

const supabaseTableCount = async (config: { url: URL; key: string }, table: string): Promise<number> => {
  const endpoint = new URL(config.url.toString());
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/rest/v1/${table}`;
  endpoint.search = 'select=*&limit=0';
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Supabase query failed with HTTP ${response.status}`);
  const match = (response.headers.get('content-range') || '').match(/\/(\d+)$/);
  if (!match) throw new Error('Supabase did not return an exact row count');
  return Number(match[1]);
};

const supabaseUnavailable = (code: string, message: string, status = 503): Response =>
  Response.json({ ok: false, status: 'unavailable', error: message, code }, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

const reportsSummaryResponse = async (env: CloudflareEnv): Promise<Response> => {
  const config = supabaseConfig(env);
  if (!config) return supabaseUnavailable('SUPABASE_NOT_CONFIGURED', 'Worker-native reporting requires GLORIFIER_SUPABASE_URL and the server-side GLORIFIER_SUPABASE_SERVICE_ROLE_KEY secret.');
  const tables = ['connection_approvals', 'connection_events', 'connection_registry', 'intelligence_analyses', 'intelligence_evidence', 'intelligence_reports'] as const;
  try {
    const entries = await Promise.all(tables.map(async (table) => [table, await supabaseTableCount(config, table)] as const));
    const counts = Object.fromEntries(entries) as Record<(typeof tables)[number], number>;
    return Response.json({
      ok: true,
      status: 'operational-data-observed',
      generatedAt: new Date().toISOString(),
      summary: {
        connectionApprovals: counts.connection_approvals,
        connectionEvents: counts.connection_events,
        registeredConnections: counts.connection_registry,
        intelligenceAnalyses: counts.intelligence_analyses,
        intelligenceEvidence: counts.intelligence_evidence,
        intelligenceReports: counts.intelligence_reports,
      },
      evidence: { source: 'supabase-postgrest', exactRowCounts: true, revenue: 'not-observable-from-operational-tables', legacyEconomicSummary: 'not-ported' },
    }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return supabaseUnavailable('SUPABASE_REPORTS_QUERY_FAILED', 'Supabase operational reporting could not be verified.', 502);
  }
};

const runtimeVerificationResponse = async (request: Request, env: CloudflareEnv): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  const config = supabaseConfig(env);
  const checks: Record<string, unknown> = {
    worker: { ok: true, layer: 'cloudflare-worker' },
    assets: { ok: Boolean(env.ASSETS) },
    authentication: { ok: null, status: 'not-probed', reason: 'No public authentication probe is configured.' },
    ai: { ok: null, executed: false, status: 'not-probed', reason: 'AI provider calls are excluded from this infrastructure probe.' },
  };
  if (!config) {
    checks.database = { ok: false, status: 'not-configured', code: 'SUPABASE_NOT_CONFIGURED' };
    const body = { ok: false, status: 'degraded', generatedAt: new Date().toISOString(), checks };
    return request.method === 'HEAD' ? new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }) : Response.json(body, { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  try {
    const startedAt = Date.now();
    const count = await supabaseTableCount(config, 'connection_registry');
    checks.database = { ok: true, source: 'supabase-postgrest', probe: 'exact-count-query', latencyMs: Date.now() - startedAt, connectionRegistryRows: count };
    const body = { ok: true, status: 'verified-for-probed-dependencies', generatedAt: new Date().toISOString(), checks };
    return request.method === 'HEAD' ? new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }) : Response.json(body, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    checks.database = { ok: false, status: 'unavailable', code: 'SUPABASE_PROBE_FAILED' };
    const body = { ok: false, status: 'degraded', generatedAt: new Date().toISOString(), checks };
    return request.method === 'HEAD' ? new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }) : Response.json(body, { status: 502, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
};

const isBackendPath = (pathname: string): boolean =>
  /^\/(?:api|auth)(?:\/|$)/.test(pathname);

const hasSessionCredential = (request: Request): boolean => {
  const authorization = request.headers.get('authorization')?.trim() || '';
  if (/^Bearer\s+\S+$/i.test(authorization)) return true;
  const cookie = request.headers.get('cookie') || '';
  return cookie.split(';').some((part) => {
    const separator = part.indexOf('=');
    if (separator <= 0) return false;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    const value = rawValue.startsWith('"') && rawValue.endsWith('"')
      ? rawValue.slice(1, -1).trim()
      : rawValue;
    return /^(session|auth-token|access-token)$/.test(name) && value.length > 0;
  });
};

const apiError = (message: string, code: string): Response =>
  Response.json(
    { ok: false, status: 'unavailable', error: message, code },
    {
      status: 502,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );

const isApiPath = (pathname: string): boolean =>
  /^\/api(?:\/|$)/.test(pathname);

const looksLikeStaticAsset = (pathname: string): boolean =>
  /\.(?:m?js|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|json|webmanifest)$/i.test(pathname);

const createUpstreamRequest = (request: Request, incomingUrl: URL, backendOrigin: string): Request => {
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, backendOrigin);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('host');
  requestHeaders.delete('content-length');
  requestHeaders.set('x-forwarded-host', incomingUrl.host);
  requestHeaders.set('x-forwarded-proto', incomingUrl.protocol.slice(0, -1));

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const requestInit: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: requestHeaders,
    redirect: 'manual',
  };
  if (hasBody && request.body) {
    requestInit.body = request.body;
    requestInit.duplex = 'half';
  }
  return new Request(upstreamUrl, requestInit);
};

const rewriteBackendRedirect = (headers: Headers, incomingUrl: URL, backendOrigin: string): void => {
  const location = headers.get('location');
  if (!location) return;

  try {
    const redirectUrl = new URL(location, backendOrigin);
    if (redirectUrl.origin === backendOrigin) {
      headers.set('Location', incomingUrl.origin + redirectUrl.pathname + redirectUrl.search + redirectUrl.hash);
    }
  } catch {
    // Preserve an unparseable Location header unchanged; do not invent a redirect.
  }
};

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const incomingUrl = new URL(request.url);

    // Runtime-only health check: intentionally does not imply backend, auth, or DB health.
    if (incomingUrl.pathname === '/api/health') {
      return healthResponse(request.method, env);
    }

    if (incomingUrl.pathname === '/api/reports/summary') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return supabaseUnavailable('METHOD_NOT_ALLOWED', 'Method not allowed.', 405);
      const response = await reportsSummaryResponse(env);
      return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
    }

    if (incomingUrl.pathname === '/api/runtime-verification') return runtimeVerificationResponse(request, env);

    // First Worker-native API route: identity configuration is read only from
    // Cloudflare environment bindings and never depends on the legacy backend.
    if (request.method === 'GET' && incomingUrl.pathname === '/api/identity') {
      return identityResponse(env);
    }

    // The business model is a static, evidence-labelled contract; serve it from the Worker
    // without depending on the unavailable legacy API runtime or a database connection.
    if (request.method === 'GET' && incomingUrl.pathname === '/api/business-model') {
      return Response.json({ ok: true, model: getBusinessModel() }, {
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }

    // Backend endpoints must never fall through to the SPA's index.html.
    if (!isBackendPath(incomingUrl.pathname)) {
      const assetResponse = await env.ASSETS.fetch(request);
      const contentType = assetResponse.headers.get('content-type')?.toLowerCase() || '';
      if (looksLikeStaticAsset(incomingUrl.pathname) && contentType.includes('text/html')) {
        return new Response('Static asset not found. The SPA shell was not substituted for the missing asset.', {
          status: 404,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      return assetResponse;
    }

    const configuredBackendOrigin = configured(env.GLORIFIER_BACKEND_ORIGIN);
    if (!configuredBackendOrigin) {
      // Fail closed at the authentication boundary before reporting backend availability.
      // This is not a substitute for session validation: credentialed requests still fail
      // with 502 until the route is implemented natively or a reviewed backend is configured.
      if (incomingUrl.pathname === '/api/app-state' && !hasSessionCredential(request)) {
        return Response.json(
          { ok: false, status: 'unauthenticated', error: 'Authentication is required for app state.', code: 'AUTHENTICATION_REQUIRED' },
          { status: 401, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
        );
      }
      return apiError(
        'No backend origin is configured. This route is not yet Worker-native; refusing to use a legacy provider implicitly.',
        'BACKEND_ORIGIN_NOT_CONFIGURED',
      );
    }
    const backendOrigin = resolveBackendOrigin(configuredBackendOrigin);
    if (!backendOrigin) {
      return apiError(
        'GLORIFIER_BACKEND_ORIGIN must be a valid HTTPS origin without credentials, path, query, or fragment.',
        'BACKEND_ORIGIN_INVALID',
      );
    }

    try {
      const upstreamResponse = await fetch(createUpstreamRequest(request, incomingUrl, backendOrigin));
      const upstreamContentType = upstreamResponse.headers.get('content-type')?.toLowerCase() || '';
      if (isApiPath(incomingUrl.pathname) && upstreamContentType.includes('text/html')) {
        return apiError(
          'The backend returned HTML for an API request. Routing is not valid for this endpoint; no successful API result was assumed.',
          'API_HTML_RESPONSE',
        );
      }
      const responseHeaders = new Headers(upstreamResponse.headers);
      responseHeaders.set('Cache-Control', 'no-store');
      responseHeaders.set('X-Content-Type-Options', 'nosniff');
      rewriteBackendRedirect(responseHeaders, incomingUrl, backendOrigin);

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    } catch {
      return apiError(
        'The GLORIFIER backend could not be reached from this Worker. No successful result was assumed.',
        'UPSTREAM_UNAVAILABLE',
      );
    }
  },
};
