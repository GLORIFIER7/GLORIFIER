import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isJsonMediaType,
  parseBase,
  PROBE_PATHS,
  run,
} from './verify-issue-432-readonly.js';

const APPROVED_ORIGIN = 'https://glorifier.glorifier.workers.dev';
const RECORDED_AT = '2026-11-02T05:00:00.000Z';

function response(status = 200, body = JSON.stringify({ ok: true }), contentType = 'application/json') {
  return new Response(body, {
    status,
    headers: { 'Content-Type': contentType },
  });
}

test('accepts only the exact HTTPS production Worker origin', () => {
  assert.equal(parseBase(APPROVED_ORIGIN).origin, APPROVED_ORIGIN);

  for (const rejected of [
    'http://glorifier.glorifier.workers.dev',
    'https://localhost',
    'https://127.0.0.1',
    'https://10.0.0.2',
    'https://169.254.169.254',
    'https://[::1]',
    'https://[fc00::1]',
    'https://[fe80::1]',
    'https://[::ffff:127.0.0.1]',
    'https://external.example',
    'https://glorifier.glorifier.workers.dev.evil.example',
    'https://user:pass@glorifier.glorifier.workers.dev',
    'https://glorifier.glorifier.workers.dev:444',
    'https://glorifier.glorifier.workers.dev/private',
    'https://glorifier.glorifier.workers.dev/?redirect=https://localhost',
  ]) {
    assert.throws(() => parseBase(rejected), /approved HTTPS origin/);
  }
});

test('runs all six probes with injected fetch and requires HTTP 2xx', async () => {
  const calls = [];
  const result = await run({
    base: APPROVED_ORIGIN,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return response(200);
    },
    now: () => new Date(RECORDED_AT),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.results.length, PROBE_PATHS.length);
  assert.equal(calls.length, PROBE_PATHS.length);
  assert.ok(calls.every(({ init }) => init.method === 'GET'));
  assert.ok(calls.every(({ init }) => init.redirect === 'manual'));
  assert.ok(calls.every(({ init }) => init.signal instanceof AbortSignal));
  assert.deepEqual(
    calls.map(({ url }) => new URL(url).pathname + new URL(url).search),
    PROBE_PATHS,
  );
  assert.ok(result.results.every((item) => item.recordedAt === RECORDED_AT));
  assert.ok(result.results.every((item) => item.target === APPROVED_ORIGIN));
  assert.ok(result.results.every((item) => item.ok === true));
});

test('treats unexpected 4xx and 5xx responses as verification failures', async () => {
  const statuses = [200, 200, 200, 404, 429, 503];
  assert.equal(statuses.length, PROBE_PATHS.length, 'status fixtures must cover every probe');
  const result = await run({
    base: APPROVED_ORIGIN,
    fetchImpl: async () => response(statuses.shift()),
    now: () => new Date(RECORDED_AT),
  });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.results.map((item) => item.ok), [
    true, true, true, false, false, false,
  ]);
});

test('rejects successful HTTP responses that do not contain valid JSON', async () => {
  const responses = [
    response(200, '<html>unexpected login page</html>', 'text/html'),
    response(200, 'not-json'),
    ...PROBE_PATHS.slice(2).map(() => response(200)),
  ];
  const result = await run({
    base: APPROVED_ORIGIN,
    fetchImpl: async () => responses.shift(),
    now: () => new Date(RECORDED_AT),
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.results[0].responseShape, 'non-json');
  assert.equal(result.results[1].responseShape, 'invalid-json');
  assert.ok(result.results.slice(2).every((item) => item.ok === true));
});

test('continues every probe after network failures and returns a nonzero result', async () => {
  let attempts = 0;
  const result = await run({
    base: APPROVED_ORIGIN,
    fetchImpl: async () => {
      attempts += 1;
      throw new Error('simulated network failure');
    },
    now: () => new Date(RECORDED_AT),
  });

  assert.equal(attempts, PROBE_PATHS.length);
  assert.equal(result.exitCode, 1);
  assert.equal(result.results.length, PROBE_PATHS.length);
  assert.ok(result.results.every((item) => item.ok === false));
  assert.ok(result.results.every((item) => item.error === 'Error'));
});

test('matches JSON media types exactly and case-insensitively', () => {
  for (const accepted of [
    'application/json',
    'application/json; charset=utf-8',
    'Application/JSON',
    'application/problem+json',
  ]) {
    assert.equal(isJsonMediaType(accepted), true, accepted);
  }
  for (const rejected of [
    'text/html',
    'text/plain; note=application/json',
    'text/html; profile=+json',
    'unknown',
    undefined,
  ]) {
    assert.equal(isJsonMediaType(rejected), false, String(rejected));
  }
});

test('treats redirects as verification failures', async () => {
  const result = await run({
    base: APPROVED_ORIGIN,
    fetchImpl: async () => new Response(null, {
      status: 302,
      headers: { Location: 'https://external.example/' },
    }),
    now: () => new Date(RECORDED_AT),
  });

  assert.equal(result.exitCode, 1);
  assert.ok(result.results.every((item) => item.ok === false && item.status === 302));
});
