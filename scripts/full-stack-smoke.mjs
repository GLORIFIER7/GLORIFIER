const base = process.env.FRONTEND_URL || 'https://glorifier.glorifier.workers.dev';
const checks = [
  { name: 'cloudflare-frontend', url: new URL('/', base).toString(), kind: 'html' },
  { name: 'cloudflare-worker-health', url: new URL('/api/health', base).toString(), kind: 'json', validate: body => body.ok === true && body.status === 'worker-ready' && body.layer === 'cloudflare-worker' },
  // Unauthenticated app-state requests must never be treated as successful.
  // A configured upstream may return either 401 or 403; with no backend, the
  // Worker must reject the request locally with 401.
  { name: 'cloudflare-app-state-auth-boundary', url: new URL('/api/app-state', base).toString(), kind: 'protected' },
  // Domain identity is intentionally deferred until funding; validate the explicit
  // not-ready contract without pretending the organization identity is ready.
  { name: 'cloudflare-identity-readiness', url: new URL('/api/identity', base).toString(), kind: 'json', validate: body =>
    (body.ok === true && body.status === 'ready' && body.identity?.ready === true) ||
    (body.ok === false && body.status === 'not-ready' && body.identity?.ready === false &&
      body.identity?.domainConfigured === false && body.identity?.domainStatus === 'not-configured') },
  { name: 'cloudflare-operational-reports', url: new URL('/api/reports/summary', base).toString(), kind: 'json', validate: body => body.ok === true && body.status === 'operational-data-observed' && body.evidence?.exactRowCounts === true },
  { name: 'cloudflare-runtime-verification', url: new URL('/api/runtime-verification', base).toString(), kind: 'json', validate: body => body.ok === true && body.status === 'verified-for-probed-dependencies' && body.checks?.database?.ok === true }
];

const results = [];
for (const check of checks) {
  const started = Date.now();
  try {
    const response = await fetch(check.url, { redirect: 'follow', headers: { accept: 'application/json,text/html' }, signal: AbortSignal.timeout(10000) });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    let body = null;
    if (contentType.includes('json')) {
      try { body = JSON.parse(text); } catch {}
    }
    // Only the explicitly documented, deferred identity state may use HTTP 503.
    // Every other ordinary check requires a successful HTTP response. Protected
    // app-state is the exception: it must reject an unauthenticated request.
    const deferredIdentity503 =
      check.name === 'cloudflare-identity-readiness' &&
      response.status === 503 &&
      body?.ok === false &&
      body?.status === 'not-ready' &&
      body?.identity?.ready === false &&
      body?.identity?.domainConfigured === false &&
      body?.identity?.domainStatus === 'not-configured';
    const valid = check.kind === 'html'
      ? response.ok && contentType.includes('text/html')
      : check.kind === 'protected'
        ? response.status === 401 || response.status === 403
        : contentType.includes('application/json') &&
          body !== null &&
          check.validate(body) &&
          (response.ok || deferredIdentity503);
    results.push({ name: check.name, url: check.url, status: response.status, ok: valid, latencyMs: Date.now() - started, body: body ?? text.slice(0, 300) });
  } catch (error) {
    results.push({ name: check.name, url: check.url, status: 0, ok: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
  }
}

for (const result of results) console.log(JSON.stringify(result));
const identity = results.find(result => result.name === 'cloudflare-identity-readiness');
const identityBody = identity?.body && typeof identity.body === 'object' ? identity.body : null;
if (identityBody?.status === 'not-ready' &&
    identityBody.identity?.domainConfigured === false &&
    identityBody.identity?.domainStatus === 'not-configured' && identity?.ok) {
  console.warn('IDENTITY READINESS DEFERRED: canonical domain is intentionally unconfigured pending funding; the endpoint remains not-ready.');
} else if (identity && !identity.ok) {
  const reason = identityBody?.identity?.nextAction ||
    'The identity endpoint did not return a valid identity JSON contract; inspect its HTTP status and response body.';
  console.error('IDENTITY READINESS BLOCKER: ' + reason);
  console.error('Do not substitute the workers.dev hostname or claim organization identity is verified without domain control.');
}
const failures = results.filter(result => !result.ok);
if (failures.length) {
  console.error('CLOUDFLARE PRODUCTION VERIFICATION FAILED: ' + failures.map(result => result.name).join(', '));
  process.exit(1);
}
console.log('CLOUDFLARE PRODUCTION VERIFICATION PASSED');
