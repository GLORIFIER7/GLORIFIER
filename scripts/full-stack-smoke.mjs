const base = process.env.FRONTEND_URL || 'https://glorifier.glorifier.workers.dev';
const checks = [
  { name: 'cloudflare-frontend', url: new URL('/', base).toString(), kind: 'html' },
  { name: 'cloudflare-worker-health', url: new URL('/api/health', base).toString(), kind: 'json', validate: body => body.ok === true && body.status === 'worker-ready' && body.layer === 'cloudflare-worker' },
  { name: 'cloudflare-identity-readiness', url: new URL('/api/identity', base).toString(), kind: 'json', validate: body => body.ok === true && body.identity?.ready === true },
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
    const valid = check.kind === 'html'
      ? response.ok && contentType.includes('text/html')
      : response.ok && contentType.includes('application/json') && body !== null && check.validate(body);
    results.push({ name: check.name, url: check.url, status: response.status, ok: valid, latencyMs: Date.now() - started, body: body ?? text.slice(0, 300) });
  } catch (error) {
    results.push({ name: check.name, url: check.url, status: 0, ok: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
  }
}

for (const result of results) console.log(JSON.stringify(result));
const identity = results.find(result => result.name === 'cloudflare-identity-readiness');
if (identity && !identity.ok && identity.body?.status === 'not-ready') {
  console.error(
    'IDENTITY READINESS BLOCKER: ' +
    (identity.body.identity?.nextAction ||
      'Configure the canonical organization domain and primary email using verified values in Cloudflare Worker variables.')
  );
  console.error('Do not substitute the workers.dev hostname or claim organization identity is verified without domain control.');
}
const failures = results.filter(result => !result.ok);
if (failures.length) {
  console.error('CLOUDFLARE PRODUCTION VERIFICATION FAILED: ' + failures.map(result => result.name).join(', '));
  process.exit(1);
}
console.log('CLOUDFLARE PRODUCTION VERIFICATION PASSED');
