const WORKER_PATH_PREFIXES = ['/api', '/auth'];
const WORKER_EXACT_PATHS = new Set(['/mcp', '/.well-known/agent-card.json']);

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

  const worker = env?.GLORIFIER_WORKER;
  if (!worker || typeof worker.fetch !== 'function') {
    return unavailableResponse(
      503,
      'GLORIFIER_WORKER_BINDING_NOT_CONFIGURED',
      'The internal GLORIFIER Worker service is not configured.',
    );
  }

  try {
    // Keep the original request intact: method, body, credentials, query and protocol headers.
    return await worker.fetch(request);
  } catch {
    // Do not expose platform exception details to public callers.
    return unavailableResponse(
      502,
      'GLORIFIER_WORKER_UNREACHABLE',
      'The internal GLORIFIER service could not complete this request.',
    );
  }
}
