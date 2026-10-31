import { getBusinessModel } from './lib/business-model-contract';
import { A2A_AGENT_CARD_PATH, A2A_JSONRPC_PATH } from './lib/a2a-v1';
import { openSeaWorkerRoute } from './lib/opensea-worker';

export type CloudflareEnv = {
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
  GLORIFIER_BACKEND_ALLOWED_HOSTS?: string;
  GLORIFIER_BACKEND_REDIRECT_ALLOWED_HOSTS?: string;
  GLORIFIER_NEURAL_ORIGIN?: string;
  GLORIFIER_NEURAL_ALLOWED_HOSTS?: string;
  GLORIFIER_SUPABASE_URL?: string;
  GLORIFIER_SUPABASE_SERVICE_ROLE_KEY?: string;
  OPENSEA_API_KEY?: string;
  // Reserved for future wallet-scoped OpenSea features; public collection reads do not use it.
  OPENSEA_SCOPED_TOKEN?: string;
};

// Proxying is permitted only to an explicitly configured, reviewed HTTPS origin.
// Never silently fall back to Railway or another provider when configuration is absent.
const resolveHttpsOrigin = (value?: string): string | null => {
  const candidate = configured(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
};

const resolveBackendOrigin = resolveHttpsOrigin;

const configured = (value: string | undefined): string => (value || '').trim();

// Host allowlists are exact-match only; wildcard suffixes and arbitrary URL prefixes
// are intentionally unsupported. An absent allowlist fails closed.
const originHostAllowlisted = (origin: string, rawAllowlist?: string): boolean => {
  const allowedHosts = configured(rawAllowlist)
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHosts.length === 0) return false;
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return allowedHosts.includes(hostname);
  } catch {
    return false;
  }
};
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
    const isCanonicalSupabaseHost = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.supabase\.co$/.test(url.hostname);
    if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !isCanonicalSupabaseHost) return null;
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


const MAX_OPENSEA_RESPONSE_BYTES = 1_048_576;
class OpenSeaResponseTooLargeError extends Error {}

const readBoundedOpenSeaResponse = async (response: Response): Promise<unknown> => {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    if (!declaredLength || !Array.from(declaredLength).every((character) => character >= '0' && character <= '9')) throw new Error('Invalid OpenSea content length');
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength)) throw new Error('Invalid OpenSea content length');
    if (parsedLength > MAX_OPENSEA_RESPONSE_BYTES) throw new OpenSeaResponseTooLargeError();
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('OpenSea response body is empty');
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
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
};

type OpenSeaReadResult = { ok: true; data: unknown } | { ok: false; response: Response };

const openSeaErrorResponse = (
  status: number,
  state: string,
  code: string,
  headers: Record<string, string>,
): Response => Response.json({ ok: false, status: state, code }, { status, headers });

const isOpenSeaTimeout = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

const isValidOpenSeaImfFixdate = (value: string): boolean => {
  const imfFixdate = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (?:0[1-9]|[12]\d|3[01]) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d GMT$/;
  if (imfFixdate.exec(value) === null) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toUTCString() === value;
};

const isValidOpenSeaRetryAfter = (value: string | null): value is string => {
  if (!value) return false;
  if (/^\d+$/.test(value)) return Number.isSafeInteger(Number(value));
  return isValidOpenSeaImfFixdate(value);
};

const openSeaUpstreamFailure = (
  upstream: Response,
  headers: Record<string, string>,
): Response | undefined => {
  if (upstream.status === 401 || upstream.status === 403) {
    return openSeaErrorResponse(502, 'unauthorized', 'OPENSEA_AUTHENTICATION_FAILED', headers);
  }
  if (upstream.status === 404) {
    return openSeaErrorResponse(404, 'not-found', 'OPENSEA_RESOURCE_NOT_FOUND', headers);
  }
  if (upstream.status === 429) {
    const retryAfter = upstream.headers.get('retry-after');
    const retryHeaders = isValidOpenSeaRetryAfter(retryAfter) ? { ...headers, 'Retry-After': retryAfter } : headers;
    return openSeaErrorResponse(429, 'rate-limited', 'OPENSEA_RATE_LIMITED', retryHeaders);
  }
  if (!upstream.ok) {
    return openSeaErrorResponse(502, 'upstream-error', 'OPENSEA_UPSTREAM_ERROR', headers);
  }
  const contentType = upstream.headers.get('content-type') || '';
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(contentType)) {
    return openSeaErrorResponse(502, 'upstream-error', 'OPENSEA_INVALID_CONTENT_TYPE', headers);
  }
  return undefined;
};

const openSeaRequestFailure = (error: unknown, headers: Record<string, string>): Response => {
  const timedOut = isOpenSeaTimeout(error);
  return openSeaErrorResponse(
    timedOut ? 504 : 502,
    timedOut ? 'timeout' : 'unavailable',
    timedOut ? 'OPENSEA_REQUEST_TIMEOUT' : 'OPENSEA_UPSTREAM_UNAVAILABLE',
    headers,
  );
};

const openSeaResponseReadFailure = (error: unknown, headers: Record<string, string>): Response => {
  if (error instanceof OpenSeaResponseTooLargeError) {
    return openSeaErrorResponse(502, 'upstream-error', 'OPENSEA_RESPONSE_TOO_LARGE', headers);
  }
  if (isOpenSeaTimeout(error)) {
    return openSeaErrorResponse(504, 'timeout', 'OPENSEA_REQUEST_TIMEOUT', headers);
  }
  return openSeaErrorResponse(502, 'upstream-error', 'OPENSEA_INVALID_RESPONSE', headers);
};

const openSeaReadJson = async (endpoint: URL, apiKey: string): Promise<OpenSeaReadResult> => {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: 'GET',
      headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(7000),
    });
  } catch (error) {
    return { ok: false, response: openSeaRequestFailure(error, headers) };
  }

  const providerFailure = openSeaUpstreamFailure(upstream, headers);
  if (providerFailure) return { ok: false, response: providerFailure };

  try {
    return { ok: true, data: await readBoundedOpenSeaResponse(upstream) };
  } catch (error) {
    return { ok: false, response: openSeaResponseReadFailure(error, headers) };
  }
};

const isOpenSeaAccountIdentifier = (identifier: string): boolean =>
  identifier.length >= 1 &&
  identifier.length <= 256 &&
  /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(identifier);

const openSeaApiKeyOrResponse = (env: CloudflareEnv): string | Response => {
  const apiKey = configured(env.OPENSEA_API_KEY);
  if (!apiKey) {
    return Response.json({ ok: false, status: 'unavailable', code: 'OPENSEA_API_KEY_NOT_CONFIGURED' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  return apiKey;
};

const openSeaResolveAccount = async (identifier: string, apiKey: string): Promise<OpenSeaReadResult> => {
  const endpoint = new URL(`https://api.opensea.io/api/v2/accounts/resolve/${encodeURIComponent(identifier)}`);
  const result = await openSeaReadJson(endpoint, apiKey);
  if (!result.ok) return result;
  const account = result.data;
  if (!account || typeof account !== 'object' || Array.isArray(account)) {
    return {
      ok: false,
      response: Response.json({ ok: false, status: 'upstream-error', code: 'OPENSEA_INVALID_ACCOUNT_RESPONSE' }, {
        status: 502,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      }),
    };
  }
  const record = account as Record<string, unknown>;
  if (typeof record.address !== 'string' || !record.address.trim() || record.address.length > 256 ||
      /[\u0000-\u0020\u007f]/.test(record.address)) {
    return {
      ok: false,
      response: Response.json({ ok: false, status: 'upstream-error', code: 'OPENSEA_INVALID_ACCOUNT_RESPONSE' }, {
        status: 502,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      }),
    };
  }
  return result;
};

const openSeaResponseForRequest = (request: Request, response: Response): Response =>
  request.method === 'HEAD'
    ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers })
    : response;

const openSeaAccountResolveResponse = async (request: Request, identifier: string, env: CloudflareEnv): Promise<Response> => {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  }
  if (!isOpenSeaAccountIdentifier(identifier)) {
    return Response.json({ ok: false, code: 'INVALID_OPENSEA_ACCOUNT_IDENTIFIER' }, { status: 400, headers });
  }
  const configuredKey = openSeaApiKeyOrResponse(env);
  if (configuredKey instanceof Response) return configuredKey;
  const result = await openSeaResolveAccount(identifier, configuredKey);
  if (!result.ok) return result.response;
  const source = result.data as Record<string, unknown>;
  const account = {
    address: source.address,
    username: typeof source.username === 'string' ? source.username : null,
    ens_name: typeof source.ens_name === 'string' ? source.ens_name : null,
  };
  return request.method === 'HEAD'
    ? new Response(null, { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } })
    : Response.json({ ok: true, source: 'opensea-api-v2', account }, { headers });
};

const openSeaAccountCollectionsResponse = async (
  request: Request,
  identifier: string,
  env: CloudflareEnv,
): Promise<Response> => {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  }
  if (!isOpenSeaAccountIdentifier(identifier)) {
    return Response.json({ ok: false, code: 'INVALID_OPENSEA_ACCOUNT_IDENTIFIER' }, { status: 400, headers });
  }
  const url = new URL(request.url);
  const limits = url.searchParams.getAll('limit');
  const cursors = url.searchParams.getAll('after');
  if (limits.length > 1 || cursors.length > 1) {
    return Response.json({ ok: false, code: 'INVALID_OPENSEA_PAGINATION' }, { status: 400, headers });
  }
  const rawLimit = limits[0] ?? '50';
  if (!/^[1-9][0-9]*$/.test(rawLimit) || Number(rawLimit) > 50) {
    return Response.json({ ok: false, code: 'INVALID_OPENSEA_PAGE_LIMIT' }, { status: 400, headers });
  }
  const after = cursors[0];
  if (after !== undefined && (!after || after.length > 1024 || /[\u0000-\u001f\u007f]/.test(after))) {
    return Response.json({ ok: false, code: 'INVALID_OPENSEA_PAGE_CURSOR' }, { status: 400, headers });
  }

  const configuredKey = openSeaApiKeyOrResponse(env);
  if (configuredKey instanceof Response) return configuredKey;
  const resolved = await openSeaResolveAccount(identifier, configuredKey);
  if (!resolved.ok) return resolved.response;
  const account = resolved.data as Record<string, unknown>;
  const resolvedUsername = typeof account.username === 'string' ? account.username : '';
  if (!resolvedUsername || resolvedUsername.toLowerCase() !== identifier.toLowerCase()) {
    return Response.json({ ok: false, status: 'identity-mismatch', code: 'OPENSEA_ACCOUNT_IDENTITY_MISMATCH' }, { status: 409, headers });
  }

  const endpoint = new URL(`https://api.opensea.io/api/v2/account/${encodeURIComponent(account.address as string)}/collections`);
  endpoint.searchParams.set('limit', rawLimit);
  if (after !== undefined) endpoint.searchParams.set('after', after);
  const collectionsResult = await openSeaReadJson(endpoint, configuredKey);
  if (!collectionsResult.ok) return collectionsResult.response;
  const collectionPayload = collectionsResult.data;
  if (!collectionPayload || typeof collectionPayload !== 'object' || Array.isArray(collectionPayload) ||
      !Array.isArray((collectionPayload as Record<string, unknown>).collections)) {
    return Response.json({ ok: false, status: 'upstream-error', code: 'OPENSEA_INVALID_COLLECTIONS_RESPONSE' }, { status: 502, headers });
  }
  const listing = collectionPayload as { collections: unknown[]; next?: unknown };
  const responseBody = {
    ok: true,
    source: 'opensea-api-v2',
    account: {
      address: account.address,
      username: resolvedUsername,
      ens_name: typeof account.ens_name === 'string' ? account.ens_name : null,
    },
    collections: listing.collections,
    next: typeof listing.next === 'string' ? listing.next : null,
  };
  return request.method === 'HEAD'
    ? new Response(null, { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } })
    : Response.json(responseBody, { headers });
};

const neuralConfigurationStatus = (env: CloudflareEnv): {
  ok: boolean | null;
  status: string;
  code?: string;
} => {
  const rawOrigin = configured(env.GLORIFIER_NEURAL_ORIGIN);
  if (!rawOrigin) {
    return { ok: false, status: 'not-configured', code: 'NEURAL_ORIGIN_NOT_CONFIGURED' };
  }

  const origin = neuralOrigin(rawOrigin);
  if (!origin) {
    return { ok: false, status: 'invalid-origin', code: 'NEURAL_ORIGIN_INVALID' };
  }

  if (!configured(env.GLORIFIER_NEURAL_ALLOWED_HOSTS)) {
    return { ok: false, status: 'allowlist-not-configured', code: 'NEURAL_EGRESS_ALLOWLIST_NOT_CONFIGURED' };
  }

  if (!originHostAllowlisted(origin, env.GLORIFIER_NEURAL_ALLOWED_HOSTS)) {
    return { ok: false, status: 'not-allowlisted', code: 'NEURAL_ORIGIN_NOT_ALLOWLISTED' };
  }

  // Configuration is not a live health/readiness observation.
  return { ok: null, status: 'configured-not-probed' };
};

const runtimeVerificationResponse = async (request: Request, env: CloudflareEnv): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  const config = supabaseConfig(env);
  const checks: Record<string, unknown> = {
    worker: { ok: true, layer: 'cloudflare-worker' },
    assets: { ok: Boolean(env.ASSETS) },
    neural: neuralConfigurationStatus(env),
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


const neuralOrigin = resolveHttpsOrigin;

const MAX_NEURAL_TASK_BODY_BYTES = 65_536;

class NeuralRequestBodyTooLargeError extends Error {}
class NeuralRequestBodyInvalidError extends Error {}

const readBoundedNeuralRequestBody = async (request: Request): Promise<ArrayBuffer> => {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) throw new NeuralRequestBodyInvalidError();
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength)) throw new NeuralRequestBodyInvalidError();
    if (parsedLength > MAX_NEURAL_TASK_BODY_BYTES) throw new NeuralRequestBodyTooLargeError();
  }

  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_NEURAL_TASK_BODY_BYTES) {
        try { await reader.cancel(); } catch { /* Best-effort cancellation after enforcing the cap. */ }
        throw new NeuralRequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
};

const isJsonContentType = (value: string): boolean => {
  const mediaType = value.split(';', 1)[0].trim().toLowerCase();
  return mediaType === 'application/json' ||
    (mediaType.startsWith('application/') && mediaType.endsWith('+json'));
};

const neuralRouteImplementation = async (request: Request, pathname: string, env: CloudflareEnv, correlationId: string): Promise<Response> => {
  const mapping: Record<string, { upstreamPath: string; methods: readonly string[] }> = {
    '/api/neural/health': { upstreamPath: '/health', methods: ['GET', 'HEAD'] },
    '/api/neural/ready': { upstreamPath: '/ready', methods: ['GET', 'HEAD'] },
    '/api/neural/v1/tasks': { upstreamPath: '/v1/tasks', methods: ['POST'] },
  };
  const route = mapping[pathname];
  if (!route) return Response.json({ ok: false, code: 'NEURAL_ROUTE_NOT_FOUND' }, { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  if (!route.methods.includes(request.method)) return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { Allow: route.methods.join(', '), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  if (pathname === '/api/neural/v1/tasks' && !/^Bearer\s+\S+$/i.test(request.headers.get('authorization')?.trim() || '')) {
    return Response.json({ ok: false, code: 'AUTHENTICATION_REQUIRED' }, { status: 401, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (pathname === '/api/neural/v1/tasks' && !isJsonContentType(request.headers.get('content-type') || '')) {
    return Response.json({ ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' }, {
      status: 415,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  const origin = neuralOrigin(env.GLORIFIER_NEURAL_ORIGIN);
  if (!origin) return Response.json({ ok: false, status: 'unavailable', code: configured(env.GLORIFIER_NEURAL_ORIGIN) ? 'NEURAL_ORIGIN_INVALID' : 'NEURAL_ORIGIN_NOT_CONFIGURED' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  if (!configured(env.GLORIFIER_NEURAL_ALLOWED_HOSTS)) {
    return Response.json({ ok: false, status: 'unavailable', code: 'NEURAL_EGRESS_ALLOWLIST_NOT_CONFIGURED' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  if (!originHostAllowlisted(origin, env.GLORIFIER_NEURAL_ALLOWED_HOSTS)) {
    return Response.json({ ok: false, status: 'unavailable', code: 'NEURAL_ORIGIN_NOT_ALLOWLISTED' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  let taskBody: ArrayBuffer | undefined;
  if (pathname === '/api/neural/v1/tasks') {
    try {
      taskBody = await readBoundedNeuralRequestBody(request);
    } catch (error) {
      if (error instanceof NeuralRequestBodyTooLargeError) {
        return Response.json({ ok: false, code: 'REQUEST_BODY_TOO_LARGE', maxBytes: MAX_NEURAL_TASK_BODY_BYTES }, {
          status: 413,
          headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
        });
      }
      return Response.json({ ok: false, code: 'INVALID_REQUEST_BODY' }, {
        status: 400,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }

    try {
      JSON.parse(new TextDecoder().decode(taskBody));
    } catch {
      return Response.json({ ok: false, code: 'INVALID_JSON_BODY' }, {
        status: 400,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }
  }

  const headers = new Headers();
  headers.set('x-correlation-id', correlationId);
  const accept = request.headers.get('accept');
  if (accept) headers.set('accept', accept);
  if (pathname === '/api/neural/v1/tasks') headers.set('content-type', request.headers.get('content-type') || 'application/json');
  const authorization = request.headers.get('authorization');
  if (authorization && pathname === '/api/neural/v1/tasks') headers.set('authorization', authorization);
  const init: RequestInit = { method: request.method, headers, redirect: 'manual', signal: AbortSignal.timeout(8000) };
  if (request.method === 'POST' && taskBody !== undefined) {
    init.body = taskBody;
  }
  try {
    const upstream = await fetch(new Request(new URL(route.upstreamPath, origin), init));
    const responseHeaders = new Headers();
    const upstreamType = upstream.headers.get('content-type');
    if (upstreamType) responseHeaders.set('content-type', upstreamType);
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ ok: false, status: 'unavailable', code: 'NEURAL_UPSTREAM_UNAVAILABLE' }, { status: 502, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
};


const CORRELATION_ID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const neuralRoute = async (request: Request, pathname: string, env: CloudflareEnv): Promise<Response> => {
  const candidate = (request.headers.get('x-correlation-id') || '').trim();
  const correlationId = CORRELATION_ID_UUID.test(candidate) ? candidate.toLowerCase() : crypto.randomUUID();
  const upstreamResponse = await neuralRouteImplementation(request, pathname, env, correlationId);
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.set('X-Correlation-ID', correlationId);
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
};

const isBackendPath = (pathname: string): boolean =>
  pathname === A2A_AGENT_CARD_PATH || /^\/(?:api|auth)(?:\/|$)/.test(pathname);

function normalizeBearerAuthorization(value: string | null): string | null {
  const header = value?.trim() || '';
  if (!header || header.length > 8192) return null;

  const separator = header.indexOf(' ');
  if (separator <= 0 || header.slice(0, separator).toLowerCase() !== 'bearer') return null;

  const token = header.slice(separator + 1).trim();
  if (!token) return null;
  for (const character of token) {
    const code = character.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f) return null;
  }
  return `Bearer ${token}`;
}

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
  if (!isBackendPath(incomingUrl.pathname) || !incomingUrl.pathname.startsWith('/') || incomingUrl.pathname.startsWith('//')) {
    throw new Error('The incoming path is not an approved backend route.');
  }
  const upstreamUrl = new URL(backendOrigin);
  upstreamUrl.pathname = incomingUrl.pathname;
  upstreamUrl.search = incomingUrl.search;
  upstreamUrl.hash = '';
  if (upstreamUrl.origin !== backendOrigin) {
    throw new Error('The upstream request target escaped the configured backend origin.');
  }
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
    signal: AbortSignal.timeout(8000),
  };
  if (hasBody && request.body) {
    requestInit.body = request.body;
    requestInit.duplex = 'half';
  }
  return new Request(upstreamUrl, requestInit);
};

const rewriteBackendRedirect = (
  headers: Headers,
  incomingUrl: URL,
  backendOrigin: string,
  rawRedirectAllowlist?: string,
): boolean => {
  const location = headers.get('location');
  if (!location) return true;

  try {
    const redirectUrl = new URL(location, backendOrigin);
    if (redirectUrl.username || redirectUrl.password) return false;

    if (redirectUrl.origin === backendOrigin) {
      // This is the only same-origin backend redirect callback currently implemented
      // in the application router. Do not bounce callers to arbitrary internal paths.
      if (redirectUrl.pathname !== '/auth/broker/callback') return false;

      const allowedQueryKeys = new Set(['state', 'code', 'error', 'error_description', 'iss', 'session_state']);
      const safeQuery = new URLSearchParams();
      const seenKeys = new Set<string>();
      for (const [key, value] of redirectUrl.searchParams) {
        if (!allowedQueryKeys.has(key)) continue;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        safeQuery.set(key, value);
      }
      const query = safeQuery.toString();
      const safeLocation = incomingUrl.origin + '/auth/broker/callback' + (query ? `?${query}` : '');
      headers.set('Location', safeLocation);
      return true;
    }

    // Provider/identity redirects are external and must be approved by exact hostname.
    // No wildcard suffixes, credentials, non-HTTPS schemes, or non-default ports.
    if (redirectUrl.protocol !== 'https:' || redirectUrl.port !== '') return false;
    const allowedHosts = configured(rawRedirectAllowlist)
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    if (!allowedHosts.includes(redirectUrl.hostname.toLowerCase())) return false;
    redirectUrl.hash = '';
    headers.set('Location', redirectUrl.toString());
    return true;
  } catch {
    return false;
  }
};

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const incomingUrl = new URL(request.url);

    if (incomingUrl.pathname.replace(/\/+$/, '') === A2A_JSONRPC_PATH) {
      // Canonicalize the accepted trailing-slash form before route matching.
      incomingUrl.pathname = A2A_JSONRPC_PATH;
      const errorResponse = (
        status: number,
        code: number,
        message: string,
        additionalHeaders: Record<string, string> = {},
      ) => Response.json({ jsonrpc: '2.0', id: null, error: { code, message } }, {
        status,
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          ...additionalHeaders,
        },
      });
      if (request.method !== 'POST') {
        return errorResponse(405, -32600, 'A2A JSON-RPC endpoint accepts POST only.', { Allow: 'POST' });
      }
      const normalizedAuthorization = normalizeBearerAuthorization(request.headers.get('authorization'));
      if (!normalizedAuthorization) {
        return errorResponse(401, -32600, 'Authentication is required.', { 'WWW-Authenticate': 'Bearer' });
      }
      if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        return errorResponse(415, -32600, 'Content-Type must be application/json.');
      }
      let body: ArrayBuffer;
      try {
        body = await readBoundedNeuralRequestBody(request.clone());
      } catch (error) {
        if (error instanceof NeuralRequestBodyTooLargeError) {
          return errorResponse(413, -32602, 'A2A request body exceeds 65,536 bytes.');
        }
        return errorResponse(400, -32600, 'Invalid A2A request body.');
      }
      try {
        JSON.parse(new TextDecoder().decode(body));
      } catch {
        return errorResponse(400, -32600, 'Invalid JSON-RPC request body.');
      }
      const headers = new Headers({
        Authorization: normalizedAuthorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Correlation-ID': crypto.randomUUID(),
      });
      const a2aVersion = request.headers.get('A2A-Version');
      if (a2aVersion) headers.set('A2A-Version', a2aVersion);
      // Forward only the auth token and protocol headers. Cookies and unrelated
      // caller headers are intentionally not carried into the backend service.
      const canonicalA2AUrl = new URL(request.url);
      canonicalA2AUrl.pathname = A2A_JSONRPC_PATH;
      request = new Request(canonicalA2AUrl, { method: 'POST', headers, body });
    }


    const openSeaAccountCollectionsMatch = incomingUrl.pathname.match(/^\/api\/opensea\/accounts\/([^/]+)\/collections$/);
    if (openSeaAccountCollectionsMatch) {
      return openSeaResponseForRequest(request, await openSeaAccountCollectionsResponse(request, openSeaAccountCollectionsMatch[1], env));
    }

    const openSeaCollectionPrefix = '/api/opensea/collections/';
    if (incomingUrl.pathname.startsWith(openSeaCollectionPrefix)) {
      const slug = incomingUrl.pathname.slice(openSeaCollectionPrefix.length);
      if (!slug || slug.includes('/')) {
        return Response.json({ ok: false, code: 'INVALID_COLLECTION_SLUG' }, { status: 400, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
      }
    }
    // Account routes must precede the collection adapter so they remain reachable.
    const openSeaAccountsPrefix = '/api/opensea/accounts/';
    if (incomingUrl.pathname.startsWith(openSeaAccountsPrefix)) {
      const segments = incomingUrl.pathname.slice(openSeaAccountsPrefix.length).split('/');
      let identifier: string;
      try {
        if (segments[0] === 'resolve' && segments.length === 2) {
          identifier = decodeURIComponent(segments[1]);
          return openSeaResponseForRequest(request, await openSeaAccountResolveResponse(request, identifier, env));
        }
        if (segments.length === 2 && segments[1] === 'collections') {
          identifier = decodeURIComponent(segments[0]);
          return openSeaResponseForRequest(request, await openSeaAccountCollectionsResponse(request, identifier, env));
        }
      } catch {
        return Response.json({ ok: false, code: 'INVALID_OPENSEA_ACCOUNT_IDENTIFIER' }, {
          status: 400,
          headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
        });
      }
      return Response.json({ ok: false, code: 'OPENSEA_ACCOUNT_ROUTE_NOT_FOUND' }, {
        status: 404,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }

    // The generic adapter owns collection reads and its health probe. Account routes
    // above are deliberately handled first so they cannot be swallowed by this matcher.
    if (incomingUrl.pathname === '/api/opensea' || incomingUrl.pathname.startsWith('/api/opensea/')) {
      return openSeaWorkerRoute(request, incomingUrl.pathname, env);
    }

    if (incomingUrl.pathname.startsWith('/api/neural/')) {
      return neuralRoute(request, incomingUrl.pathname, env);
    }

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
    if (!configured(env.GLORIFIER_BACKEND_ALLOWED_HOSTS)) {
      return apiError(
        'A reviewed exact-host allowlist must be configured before this Worker can contact the backend.',
        'BACKEND_EGRESS_ALLOWLIST_NOT_CONFIGURED',
      );
    }
    if (!originHostAllowlisted(backendOrigin, env.GLORIFIER_BACKEND_ALLOWED_HOSTS)) {
      return apiError(
        'The configured backend host is not present in GLORIFIER_BACKEND_ALLOWED_HOSTS.',
        'BACKEND_ORIGIN_NOT_ALLOWLISTED',
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
      const isRedirectResponse = [301, 302, 303, 307, 308].includes(upstreamResponse.status);
      if (isRedirectResponse && !rewriteBackendRedirect(responseHeaders, incomingUrl, backendOrigin, env.GLORIFIER_BACKEND_REDIRECT_ALLOWED_HOSTS)) {
        return apiError(
          'The backend redirect target is not approved by the Worker redirect policy.',
          'BACKEND_REDIRECT_NOT_ALLOWED',
        );
      }

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
