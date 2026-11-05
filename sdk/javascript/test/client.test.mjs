import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CANONICAL_ORIGIN,
  GlorifierApiError,
  GlorifierNeuralClient,
  MAX_RESPONSE_BODY_BYTES,
} from '../index.mjs';

const fixtureUrl = new URL('../../../docs/architecture/interoperability-contract-fixtures.json', import.meta.url);
const fixtures = JSON.parse(await readFile(fixtureUrl, 'utf8'));

function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

test('enforces exact HTTPS origins and explicit loopback-only HTTP', () => {
  assert.doesNotThrow(() => new GlorifierNeuralClient());
  assert.throws(() => new GlorifierNeuralClient({ baseUrl: 'http://example.com' }), /HTTPS/);
  assert.throws(() => new GlorifierNeuralClient({ baseUrl: 'https://user:pass@example.com' }), /origin/);
  assert.throws(() => new GlorifierNeuralClient({ baseUrl: 'https://example.com/path' }), /origin/);
  assert.throws(() => new GlorifierNeuralClient({ baseUrl: 'https://example.com?token=x' }), /origin/);
  assert.throws(() => new GlorifierNeuralClient({ baseUrl: 'https://unlisted.example.com' }), /exact origin/);
  assert.doesNotThrow(() => new GlorifierNeuralClient({
    baseUrl: 'https://staging.example.com',
    allowedOrigins: ['https://staging.example.com'],
  }));
  assert.throws(() => new GlorifierNeuralClient({ baseUrl: 'http://127.0.0.1:8787' }), /HTTPS/);
  assert.doesNotThrow(() => new GlorifierNeuralClient({
    baseUrl: 'http://127.0.0.1:8787',
    allowLoopbackHttp: true,
  }));
  assert.throws(() => new GlorifierNeuralClient({
    baseUrl: 'http://192.168.1.10:8787',
    allowLoopbackHttp: true,
  }), /HTTPS/);
});

test('sends bearer tokens only to the task route and never follows redirects', async () => {
  const calls = [];
  const sdk = new GlorifierNeuralClient({
    token: 'caller-token',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response({ status: 'ok' }, 200, { 'X-Correlation-ID': 'corr-1' });
    },
  });

  await sdk.health();
  await sdk.ready();
  await sdk.submitTask({ task: 'read contract' });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].init.headers.get('Authorization'), null);
  assert.equal(calls[1].init.headers.get('Authorization'), null);
  assert.equal(calls[2].init.headers.get('Authorization'), 'Bearer caller-token');
  assert.equal(calls[2].init.redirect, 'manual');
  assert.equal(calls[2].url, CANONICAL_ORIGIN + '/api/neural/v1/tasks');
});

test('preserves readiness HTTP 503 instead of converting it into success', async () => {
  const sdk = new GlorifierNeuralClient({
    fetchImpl: async () => response({ status: 'not_ready', code: 'PROVIDER_NOT_READY' }, 503),
  });
  const result = await sdk.ready();
  assert.equal(result.status, 503);
  assert.equal(result.ok, false);
  assert.equal(result.body.code, 'PROVIDER_NOT_READY');
});

test('runs shared cross-language fixtures without numeric or null coercion', async () => {
  const byId = new Map(fixtures.cases.map(item => [item.id, item]));
  assert.equal(byId.size, 5);

  const unicode = byId.get('unicode-round-trip').payload.message;
  let submitted;
  const sdk = new GlorifierNeuralClient({
    token: 'fixture-token',
    fetchImpl: async (_url, init) => {
      submitted = JSON.parse(new TextDecoder().decode(init.body));
      return response({ accepted: true });
    },
  });
  await sdk.submitTask({ task: unicode, require_approval: true });
  assert.equal(submitted.task, unicode);
  assert.equal(submitted.require_approval, true);

  const quantity = byId.get('large-quantity-string').payload.quantity;
  assert.equal(typeof quantity, 'string');
  assert.equal(JSON.parse(JSON.stringify({ quantity })).quantity, quantity);

  const nullCase = byId.get('null-versus-absent');
  assert.equal(Object.hasOwn(nullCase.payload, 'presentNull'), true);
  assert.equal(nullCase.payload.presentNull, null);
  assert.equal(Object.hasOwn(nullCase.payload, nullCase.absentFields[0]), false);

  const nested = byId.get('nested-collections').payload;
  assert.equal(nested.items[0].count, 0);
  assert.equal(nested.items[0].enabled, true);
  assert.equal(nested.items[1].enabled, false);
  assert.equal(byId.get('stable-error-envelope').payload.code, 'REQUEST_BODY_TOO_LARGE');
});

test('rejects invalid task fields and enforces Unicode character and UTF-8 byte limits', () => {
  const sdk = new GlorifierNeuralClient({ token: 'token', fetchImpl: async () => response({ ok: true }) });
  assert.throws(() => sdk.submitTask({ task: '' }), /non-empty/);
  assert.throws(() => sdk.submitTask({ task: 'valid', unexpected: true }), /unsupported field/);
  assert.throws(() => sdk.submitTask({ task: 'valid', require_approval: 'yes' }), /boolean/);
  assert.throws(() => sdk.submitTask({ task: '😀'.repeat(20_001) }), /20,000/);
  assert.throws(() => sdk.submitTask({ task: 'valid', purpose: '' }), /purpose/);
  assert.throws(() => sdk.submitTask({ task: '🌐'.repeat(18_000) }), /65,536-byte/);
});

test('requires a raw caller token before submitting tasks', () => {
  const noToken = new GlorifierNeuralClient({ fetchImpl: async () => response({ ok: true }) });
  assert.throws(() => noToken.submitTask({ task: 'read' }), /token is required/);
  assert.throws(() => new GlorifierNeuralClient({ token: 'contains spaces' }), /without whitespace/);
});

test('bounds response bodies and rejects invalid response shapes', async () => {
  const large = new Response(new Uint8Array(MAX_RESPONSE_BODY_BYTES + 1), { status: 200 });
  const sdk = new GlorifierNeuralClient({ fetchImpl: async () => large });
  await assert.rejects(sdk.health(), GlorifierApiError);

  const arrayResponse = new GlorifierNeuralClient({
    fetchImpl: async () => new Response('[]', { status: 200 }),
  });
  await assert.rejects(arrayResponse.health(), /JSON object/);
});

test('applies a finite timeout and redacts low-level transport errors', async () => {
  const sdk = new GlorifierNeuralClient({
    timeoutMs: 25,
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('private transport detail')), { once: true });
    }),
  });
  await assert.rejects(sdk.health(), /timed out/);
});

test('propagates a correlation ID as a request header', async () => {
  let actual;
  const sdk = new GlorifierNeuralClient({
    token: 'token',
    fetchImpl: async (_url, init) => {
      actual = init.headers.get('X-Correlation-ID');
      return response({ status: 'ok' });
    },
  });
  await sdk.health({ correlationId: 'request-correlation-1' });
  assert.equal(actual, 'request-correlation-1');
});
