#!/usr/bin/env node
import process from 'node:process';

const REQUIRED_PATHS = new Set([
  '/api/health',
  '/api/runtime-verification?probeAi=false',
  '/api/reports/summary',
]);

const PROBE_PATHS = [
  '/api/health',
  '/api/runtime-verification?probeAi=false',
  '/api/reports/summary',
  '/api/identity',
  '/api/neural/health',
  '/api/neural/ready',
];

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

function isPrivateAddress(hostname) {
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  if (hostname === '::1' || hostname.endsWith('.local')) return true;
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [a, b] = ipv4.slice(1).map(Number);
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function parseBase(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    console.error('ERROR: base URL is invalid.');
    process.exit(2);
  }
  if (parsed.protocol !== 'https:') {
    console.error('ERROR: base URL must use the https: scheme.');
    process.exit(2);
  }
  if (isPrivateAddress(parsed.hostname)) {
    console.error('ERROR: base URL must not target localhost, private, link-local, or metadata addresses.');
    process.exit(2);
  }
  return parsed;
}

async function probe(target, path) {
  const recordedAt = new Date().toISOString();
  try {
    const response = await fetch(new URL(path, target), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    const contentType = response.headers.get('content-type') ?? 'unknown';
    const isJson = contentType.includes('application/json');
    const ok = REQUIRED_PATHS.has(path) ? response.ok : response.status < 500;
    console.log(JSON.stringify({
      recordedAt,
      target: target.origin,
      path,
      method: 'GET',
      status: response.status,
      contentType,
      responseShape: isJson ? 'json' : 'non-json',
      required: REQUIRED_PATHS.has(path),
      ok,
    }));
    return ok;
  } catch (error) {
    console.log(JSON.stringify({
      recordedAt,
      target: target.origin,
      path,
      method: 'GET',
      error: error.name,
      ok: false,
    }));
    return false;
  }
}

async function main() {
  const base = process.argv[2];
  if (!base) {
    console.error('Usage: node scripts/verify-issue-432-readonly.mjs https://example.com');
    process.exit(2);
  }

  const target = parseBase(base);
  const results = await Promise.all(PROBE_PATHS.map((path) => probe(target, path)));
  const failures = results.filter((ok) => !ok).length;
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
