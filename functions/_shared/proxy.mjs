const WORKER_PATH_PREFIXES = ['/api', '/auth'];
const WORKER_EXACT_PATHS = new Set(['/mcp', '/.well-known/agent-card.json']);
const NATIVE_APP_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);
const NATIVE_CORS_METHODS = 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS';
const NATIVE_CORS_HEADERS = 'Content-Type, Authorization, X-Requested-With';

const corsHeadersFor = (origin) => new Headers({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': NATIVE_CORS_METHODS,
  'Access-Control-Allow-Headers': NATIVE_CORS_HEADERS,
  'Access-Control-Max-Age': '600',
  'Cache-Control': 'no-store',
  Vary: 'Origin',
});

const withNativeCors = (request, response) => {
  const origin = request.headers.get('Origin');
  if (!NATIVE_APP_ORIGINS.has(origin)) return response;

  const headers = new Headers(response.headers);
  for (const [name, value] of corsHeadersFor(origin)) {
    if (name.toLowerCase() !== 'vary') headers.set(name, value);
  }

  const vary = headers.get('Vary');
  const varyTokens = vary ? vary.split(',').map((value) => value.trim()).filter(Boolean) : [];
  if (!varyTokens.some((value) => value.toLowerCase() === 'origin')) varyTokens.push('Origin');
  headers.set('Vary', varyTokens.join(', '));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const unavailableResponse = (status, code, error) => Response.json({
  ok: false,
  status: 'unavailable',
  code,
  error,
}, {
  status,
  headers: {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
});

const isWorkerRoute = (pathname) =>
  WORKER_EXACT_PATHS.has(pathname) ||
  WORKER_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

export async function routePagesRequest(context) {
  const { request, env, next } = context;
  const pathname = new URL(request.url).pathname;

  if (!isWorkerRoute(pathname)) return next();

  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('Origin');
    if (!origin) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    if (!NATIVE_APP_ORIGINS.has(origin)) {
      return unavailableResponse(
        403,
        'CORS_ORIGIN_NOT_ALLOWED',
        'This origin is not allowed to access the GLORIFIER native API.',
      );
    }
    return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
  }

  const worker = env?.GLORIFIER_WORKER;
  if (!worker || typeof worker.fetch !== 'function') {
    return withNativeCors(request, unavailableResponse(
      503,
      'GLORIFIER_WORKER_BINDING_NOT_CONFIGURED',
      'The internal GLORIFIER Worker service is not configured.',
    ));
  }

  try {
    // Keep the original request intact: method, body, credentials, query and protocol headers.
    const response = await worker.fetch(request);
    return withNativeCors(request, response);
  } catch {
    // Do not expose platform exception details to public callers.
    return withNativeCors(request, unavailableResponse(
      502,
      'GLORIFIER_WORKER_UNREACHABLE',
      'The internal GLORIFIER service could not complete this request.',
    ));
  }
}
