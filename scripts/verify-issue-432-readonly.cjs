const DEFAULT_VERIFIER_ORIGIN = 'https://glorifier.glorifier.workers.dev';
const PROBE_PATHS = [
  '/api/health',
  '/api/runtime-verification?probeAi=false',
  '/api/reports/summary',
  '/api/identity',
  '/api/neural/health',
  '/api/neural/ready',
];

function isJsonMediaType(contentType) {
  if (typeof contentType !== 'string') return false;
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  return mediaType === 'application/json' ||
    (/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType));
}

function parseBase(value) {
  let parsed;
  try { parsed = new URL(value); }
  catch { throw new TypeError('base URL must be the approved HTTPS origin.'); }
  if (parsed.protocol !== 'https:' || parsed.origin !== DEFAULT_VERIFIER_ORIGIN ||
      parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '' ||
      parsed.username !== '' || parsed.password !== '') {
    throw new TypeError('base URL must be the approved HTTPS origin.');
  }
  return parsed;
}

async function run({ base, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const target = parseBase(base);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');
  const results = await Promise.all(PROBE_PATHS.map(async (path) => {
    const recordedAt = now().toISOString();
    try {
      const response = await fetchImpl(new URL(path, target), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      const contentType = response.headers?.get?.('content-type') ?? 'unknown';
      let responseShape = 'non-json';
      if (!isJsonMediaType(contentType)) {
        // Release the unread body so the connection is not held open.
        try { await response.body?.cancel?.(); } catch { /* ignore */ }
      } else {
        try {
          await response.json();
          responseShape = 'json';
        } catch {
          responseShape = 'invalid-json';
        }
      }
      const ok = Number.isInteger(response.status) && response.status >= 200 &&
        response.status < 300 && responseShape === 'json';
      return { recordedAt, target: target.origin, path, method: 'GET', status: response.status,
        contentType, responseShape, ok };
    } catch (error) {
      return { recordedAt, target: target.origin, path, method: 'GET',
        error: error instanceof Error ? error.name : 'UnknownError', ok: false };
    }
  }));
  return { exitCode: results.every((item) => item.ok) ? 0 : 1, results };
}

async function main() {
  const base = process.argv[2];
  if (!base) {
    console.error('Usage: node scripts/verify-issue-432-readonly.cjs https://glorifier.glorifier.workers.dev');
    process.exitCode = 2;
    return;
  }
  try {
    const result = await run({ base });
    for (const item of result.results) console.log(JSON.stringify(item));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error('ERROR: ' + (error instanceof Error ? error.message : 'verification failed'));
    process.exitCode = 2;
  }
}

if (require.main === module) void main();

module.exports = {
  DEFAULT_VERIFIER_ORIGIN,
  PROBE_PATHS,
  isJsonMediaType,
  parseBase,
  run,
};
