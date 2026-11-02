import process from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_VERIFIER_ORIGIN = 'https://glorifier.glorifier.workers.dev';
export const PROBE_PATHS = [
  '/api/health',
  '/api/runtime-verification?probeAi=false',
  '/api/reports/summary',
  '/api/identity',
  '/api/neural/health',
  '/api/neural/ready',
];

export function parseBase(value) {
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

export async function run({ base, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
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
      const ok = Number.isInteger(response.status) && response.status >= 200 && response.status < 300;
      return { recordedAt, target: target.origin, path, method: 'GET', status: response.status,
        contentType, responseShape: contentType.includes('application/json') ? 'json' : 'non-json', ok };
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
    console.error('Usage: node scripts/verify-issue-432-readonly.mjs https://glorifier.glorifier.workers.dev');
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

const isDirectExecution = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectExecution) void main();
