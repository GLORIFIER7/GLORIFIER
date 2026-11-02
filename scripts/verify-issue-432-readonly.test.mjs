import assert from 'node:assert/strict';
import test from 'node:test';

const scriptPath = new URL('./verify-issue-432-readonly.mjs', import.meta.url);

test('rejects non-HTTPS base URLs', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  await assert.rejects(
    () => run(process.execPath, [scriptPath, 'http://example.com']),
    /base URL must use the https: scheme/,
  );
});

test('rejects private and metadata targets', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  await assert.rejects(
    () => run(process.execPath, [scriptPath, 'https://169.254.169.254']),
    /must not target/,
  );
});

test('requires 2xx for core endpoints and 5xx failure for gated endpoints', async () => {
  const originalFetch = globalThis.fetch;
  const statuses = {
    '/api/health': 200,
    '/api/runtime-verification?probeAi=false': 200,
    '/api/reports/summary': 200,
    '/api/identity': 503,
    '/api/neural/health': 503,
    '/api/neural/ready': 503,
  };
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const key = new URL(url).pathname + new URL(url).search;
    return new Response(null, { status: statuses[key] });
  };
  try {
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(process.execPath, [scriptPath, 'https://example.com'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(calls.length, 6);
    assert.ok(calls.every((call) => call.init.method === 'GET'));
    assert.ok(calls.every((call) => call.init.redirect === 'manual'));
    const evidence = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
    assert.ok(evidence.every((item) => item.recordedAt && item.target === 'https://example.com'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('network failures produce nonzero exit and continue probing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('network failure');
  };
  try {
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(process.execPath, [scriptPath, 'https://example.com'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout.trim().split('\n').length, 6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
