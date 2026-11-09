import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { routePagesRequest } from '../functions/_shared/proxy.mjs';

const response = (status = 200, body = 'worker-response') => new Response(body, {
  status,
  headers: { 'Content-Type': 'text/plain', 'X-Worker-Test': 'preserved' },
});

test('forwards API, auth, MCP and Agent Card requests through the private Worker binding', async () => {
  const paths = [
    '/api/health?probe=1',
    '/api',
    '/auth/callback',
    '/mcp',
    '/.well-known/agent-card.json',
  ];
  for (const path of paths) {
    let forwarded;
    const request = new Request(`https://glorifier.pages.dev${path}`, { method: 'GET' });
    const result = await routePagesRequest({
      request,
      env: { GLORIFIER_WORKER: { fetch: async (value) => { forwarded = value; return response(); } } },
      next: async () => new Response('static'),
    });
    assert.equal(forwarded, request, `${path} must be passed through without URL or header rewriting`);
    assert.equal(await result.text(), 'worker-response');
    assert.equal(result.headers.get('x-worker-test'), 'preserved');
  }
});

test('serves static and client-side routes from Pages instead of the Worker', async () => {
  let workerCalls = 0;
  const result = await routePagesRequest({
    request: new Request('https://glorifier.pages.dev/docs/architecture'),
    env: { GLORIFIER_WORKER: { fetch: async () => { workerCalls += 1; return response(); } } },
    next: async () => new Response('pages-static-shell', { status: 200 }),
  });
  assert.equal(workerCalls, 0);
  assert.equal(await result.text(), 'pages-static-shell');
});

test('fails closed with a no-store JSON 503 when the private Worker binding is missing', async () => {
  const result = await routePagesRequest({
    request: new Request('https://glorifier.pages.dev/api/health'),
    env: {},
    next: async () => new Response('must-not-fall-through', { status: 200 }),
  });
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await result.json(), {
    ok: false,
    status: 'unavailable',
    code: 'GLORIFIER_WORKER_BINDING_NOT_CONFIGURED',
    error: 'The internal GLORIFIER Worker service is not configured.',
  });
});

test('converts service-binding exceptions to a bounded 502 without leaking exception details', async () => {
  const result = await routePagesRequest({
    request: new Request('https://glorifier.pages.dev/api/health'),
    env: { GLORIFIER_WORKER: { fetch: async () => { throw new Error('sensitive internal detail'); } } },
    next: async () => new Response('must-not-fall-through'),
  });
  assert.equal(result.status, 502);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await result.json(), {
    ok: false,
    status: 'unavailable',
    code: 'GLORIFIER_WORKER_UNREACHABLE',
    error: 'The internal GLORIFIER service could not complete this request.',
  });
});

test('does not proxy unrelated routes or similarly prefixed path traversal strings', async () => {
  let workerCalls = 0;
  const paths = ['/apiary', '/authentic', '/mcpx', '/admin'];
  for (const path of paths) {
    const result = await routePagesRequest({
      request: new Request(`https://glorifier.pages.dev${path}`),
      env: { GLORIFIER_WORKER: { fetch: async () => { workerCalls += 1; return response(); } } },
      next: async () => new Response('pages-static-shell'),
    });
    assert.equal(await result.text(), 'pages-static-shell');
  }
  assert.equal(workerCalls, 0);
});


test('Pages Functions are invoked only for the explicit backend route allowlist', () => {
  const routes = JSON.parse(readFileSync(new URL('../public/_routes.json', import.meta.url), 'utf8'));

  assert.deepEqual(routes, {
    version: 1,
    include: [
      '/api',
      '/api/*',
      '/auth',
      '/auth/*',
      '/mcp',
      '/.well-known/agent-card.json',
    ],
    exclude: [],
  });
});


test('adds narrow CORS for Capacitor origins and handles preflight at the Pages boundary', async () => {
  for (const origin of ['https://localhost', 'capacitor://localhost']) {
    let workerCalls = 0;
    const actual = await routePagesRequest({
      request: new Request('https://glorifier.pages.dev/api/health', {
        headers: { Origin: origin },
      }),
      env: { GLORIFIER_WORKER: { fetch: async () => { workerCalls += 1; return response(); } } },
      next: async () => new Response('static'),
    });
    assert.equal(actual.status, 200);
    assert.equal(actual.headers.get('access-control-allow-origin'), origin);
    assert.equal(actual.headers.get('vary'), 'Origin');
    assert.equal(await actual.text(), 'worker-response');

    const preflight = await routePagesRequest({
      request: new Request('https://glorifier.pages.dev/api/auth/session', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type,a2a-version',
        },
      }),
      env: { GLORIFIER_WORKER: { fetch: async () => { workerCalls += 1; return response(); } } },
      next: async () => new Response('static'),
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
    assert.equal(preflight.headers.get('access-control-allow-headers'), 'Content-Type, Authorization, X-Requested-With, A2A-Version');
    assert.equal(preflight.headers.get('access-control-max-age'), '600');
    assert.equal(workerCalls, 1, 'preflight must be answered without invoking the Worker');
  }
});

test('does not grant CORS to unapproved browser origins', async () => {
  const origin = 'https://attacker.example';
  let workerCalls = 0;
  const preflight = await routePagesRequest({
    request: new Request('https://glorifier.pages.dev/api/health', {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
    }),
    env: { GLORIFIER_WORKER: { fetch: async () => { workerCalls += 1; return response(); } } },
    next: async () => new Response('static'),
  });
  assert.equal(preflight.status, 403);
  assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  assert.equal(workerCalls, 0);

  const actual = await routePagesRequest({
    request: new Request('https://glorifier.pages.dev/api/health', {
      headers: { Origin: origin },
    }),
    env: { GLORIFIER_WORKER: { fetch: async () => { workerCalls += 1; return response(); } } },
    next: async () => new Response('static'),
  });
  assert.equal(actual.status, 200);
  assert.equal(actual.headers.get('access-control-allow-origin'), null);
  assert.equal(workerCalls, 1);
});


test('preserves Worker cache policy on native responses while keeping preflight no-store', async () => {
  const origin = 'https://localhost';
  const actual = await routePagesRequest({
    request: new Request('https://glorifier.pages.dev/api/health', {
      headers: { Origin: origin },
    }),
    env: {
      GLORIFIER_WORKER: {
        fetch: async () => new Response('cacheable-worker-response', {
          status: 200,
          headers: { 'Cache-Control': 'public, max-age=60', Vary: 'Accept-Encoding' },
        }),
      },
    },
    next: async () => new Response('static'),
  });
  assert.equal(actual.headers.get('cache-control'), 'public, max-age=60');
  assert.equal(actual.headers.get('vary'), 'Accept-Encoding, Origin');

  const preflight = await routePagesRequest({
    request: new Request('https://glorifier.pages.dev/api/health', {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET',
      },
    }),
    env: { GLORIFIER_WORKER: { fetch: async () => { throw new Error('preflight must not invoke Worker'); } } },
    next: async () => new Response('static'),
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('cache-control'), 'no-store');
});
