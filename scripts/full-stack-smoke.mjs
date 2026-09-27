const checks = [
  { name: 'frontend', url: process.env.FRONTEND_URL || 'https://glorifier-glorifier.vercel.app/' },
  { name: 'frontend-health-rewrite', url: process.env.FRONTEND_HEALTH_URL || 'https://glorifier-glorifier.vercel.app/api/health/ready' },
  { name: 'railway-health', url: process.env.RAILWAY_URL + '/api/health' },
  { name: 'railway-ready', url: process.env.RAILWAY_URL + '/api/health/ready' },
  { name: 'railway-runtime-verification', url: process.env.RAILWAY_URL + '/api/runtime-verification' },
  { name: 'railway-binance-health', url: process.env.RAILWAY_URL + '/api/binance/health' },
  { name: 'unauthenticated-app-state', url: process.env.RAILWAY_URL + '/api/app-state', expectAuth: true },
  { name: 'unauthenticated-connections', url: process.env.RAILWAY_URL + '/api/connections', expectAuth: true }
];

if (!process.env.RAILWAY_URL) throw new Error('RAILWAY_URL is required');

const results = [];
for (const check of checks) {
  const started = Date.now();
  try {
    const response = await fetch(check.url, { redirect: 'follow', headers: { accept: 'application/json,text/html' } });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    let body = null;
    if (contentType.includes('json')) {
      try { body = JSON.parse(text); } catch {}
    }
    const ok = check.expectAuth
      ? response.status === 401 || response.status === 403
      : response.ok;
    results.push({ ...check, status: response.status, ok, latencyMs: Date.now() - started, body: body ?? text.slice(0, 300) });
  } catch (error) {
    results.push({ ...check, status: 0, ok: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
  }
}

for (const result of results) console.log(JSON.stringify(result));

const degraded = results.filter(result =>
  result.name === 'railway-binance-health' &&
  result.status === 503 &&
  result.body?.verification?.authenticationError?.includes('restricted location')
);
for (const result of degraded) {
  result.ok = true;
  result.verificationState = 'DEGRADED';
  console.warn(JSON.stringify({ name: result.name, verificationState: 'DEGRADED', reason: result.body.verification.authenticationError }));
}

const failures = results.filter(result => !result.ok);
if (failures.length) {
  console.error('FULL-STACK SMOKE FAILED: ' + failures.map(result => result.name).join(', '));
  process.exit(1);
}
console.log(degraded.length ? 'FULL-STACK SMOKE PASSED WITH DEGRADED OPTIONAL INTEGRATIONS' : 'FULL-STACK SMOKE PASSED');
