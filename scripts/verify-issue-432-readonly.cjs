'use strict';

const DEFAULT_VERIFIER_ORIGIN = 'https://glorifier.glorifier.workers.dev';
const PROBE_PATHS = [
  '/api/health',
  '/api/runtime-verification?probeAi=false',
  '/api/reports/summary',
  '/api/identity',
  '/api/neural/health',
  '/api/neural/ready',
];

const hasApprovedProtocolAndHost = (url) =>
  url.protocol === 'https:' && url.origin === DEFAULT_VERIFIER_ORIGIN;

const hasRootPathWithoutQuery = (url) =>
  url.pathname === '/' && url.search === '' && url.hash === '';

const hasNoCredentials = (url) =>
  url.username === '' && url.password === '';

const isApprovedBase = (url) =>
  hasApprovedProtocolAndHost(url) &&
  hasRootPathWithoutQuery(url) &&
  hasNoCredentials(url);

const parseUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    throw new TypeError('base URL must be the approved HTTPS origin.');
  }
};

const isJsonMediaType = (contentType) => {
  if (typeof contentType !== 'string') return false;
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  return mediaType === 'application/json' ||
    /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType);
};

const parseBase = (value) => {
  const parsed = parseUrl(value);
  if (!isApprovedBase(parsed)) {
    throw new TypeError('base URL must be the approved HTTPS origin.');
  }
  return parsed;
};

const cancelUnreadBody = async (response) => {
  try {
    await response.body?.cancel?.();
  } catch {
    // Ignore cancellation errors while releasing an unread response body.
  }
};

const getResponseShape = async (response) => {
  const contentType = response.headers?.get?.('content-type') ?? 'unknown';
  if (!isJsonMediaType(contentType)) {
    await cancelUnreadBody(response);
    return { contentType, responseShape: 'non-json' };
  }
  try {
    await response.json();
    return { contentType, responseShape: 'json' };
  } catch {
    return { contentType, responseShape: 'invalid-json' };
  }
};

const isSuccessfulStatus = (status) =>
  Number.isInteger(status) && status >= 200 && status < 300;

const executeProbe = async ({ path, target, fetchImpl, now }) => {
  const recordedAt = now().toISOString();
  try {
    const response = await fetchImpl(new URL(path, target), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    const { contentType, responseShape } = await getResponseShape(response);
    return {
      recordedAt,
      target: target.origin,
      path,
      method: 'GET',
      status: response.status,
      contentType,
      responseShape,
      ok: isSuccessfulStatus(response.status) && responseShape === 'json',
    };
  } catch (error) {
    return {
      recordedAt,
      target: target.origin,
      path,
      method: 'GET',
      error: error instanceof Error ? error.name : 'UnknownError',
      ok: false,
    };
  }
};

const run = async ({ base, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) => {
  const target = parseBase(base);
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetchImpl must be a function.');
  }
  const results = await Promise.all(
    PROBE_PATHS.map((path) => executeProbe({ path, target, fetchImpl, now })),
  );
  return { exitCode: results.every((item) => item.ok) ? 0 : 1, results };
};

const main = async () => {
  const base = process.argv[2];
  if (!base) {
    process.stderr.write(
      'Usage: node scripts/verify-issue-432-readonly.cjs https://glorifier.glorifier.workers.dev\n',
    );
    process.exitCode = 2;
    return;
  }
  try {
    const result = await run({ base });
    for (const item of result.results) {
      process.stdout.write(`${JSON.stringify(item)}\n`);
    }
    process.exitCode = result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'verification failed';
    process.stderr.write(`ERROR: ${message}\n`);
    process.exitCode = 2;
  }
};

if (require.main === module) void main();

module.exports = {
  DEFAULT_VERIFIER_ORIGIN,
  PROBE_PATHS,
  isJsonMediaType,
  parseBase,
  run,
};
