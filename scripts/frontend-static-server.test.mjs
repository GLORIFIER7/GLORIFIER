import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createFrontendServer, isInsideRoot } from './serve-frontend.mjs';

async function startFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'glorifier-mphr-'));
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<!doctype html><html><head><script defer src="/startup-status.js"></script><script type="module" src="/assets/app-12345678.js"></script></head><body><div id="root">GLORIFIER React app</div></body></html>');
  await writeFile(path.join(root, 'startup-status.js'), 'window.booted = true;');
  await writeFile(path.join(root, 'assets', 'app-12345678.js'), 'console.log("app");');
  const server = createFrontendServer({ root });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  });
  return { root, origin: 'http://127.0.0.1:' + address.port };
}

test('serves the React app at the root and extensionless client-side routes', async (t) => {
  const { origin } = await startFixture(t);
  for (const route of ['/', '/projects', '/governance/geas']) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    assert.match(await response.text(), /GLORIFIER React app/);
  }
});

test('serves real static assets with their content type and cache policy', async (t) => {
  const { origin } = await startFixture(t);
  const response = await fetch(origin + '/assets/app-12345678.js');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /javascript/);
  assert.match(response.headers.get('cache-control') || '', /immutable/);
  assert.equal(response.headers.get('content-length'), null,
    'streamed asset responses must not advertise a potentially stale stat size');
  assert.equal(await response.text(), 'console.log("app");');
});

test('does not return the SPA shell for API, auth, MCP or agent-card routes', async (t) => {
  const { origin } = await startFixture(t);
  for (const route of ['/api/health', '/auth/session', '/mcp', '/mcp/tools/list', '/.well-known/agent-card.json']) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 503, route + ' must fail closed without a backend');
    assert.match(response.headers.get('content-type') || '', /application\/json/);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, 'BACKEND_NOT_CONFIGURED');
  }
});

test('does not pretend backend write routes are available on a static-only host', async (t) => {
  const { origin } = await startFixture(t);
  const response = await fetch(origin + '/api/health', { method: 'POST', body: JSON.stringify({ probe: true }) });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, 'BACKEND_NOT_CONFIGURED');
});

test('encoded and multiply encoded backend route prefixes fail closed before SPA routing', async (t) => {
  const { origin } = await startFixture(t);
  for (const route of ['/%61pi/health', '/api%2Fhealth', '/%2561pi/health', '/%252561pi/health', '/API/health', '/Auth/session']) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 503, route);
    assert.equal((await response.json()).code, 'BACKEND_NOT_CONFIGURED');
  }
});

test('malformed path encodings are rejected instead of falling through to the SPA', async (t) => {
  const { origin } = await startFixture(t);
  const response = await fetch(origin + '/bad%2');
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_PATH_ENCODING');
});

test('filesystem-root path containment accepts root children but blocks sibling prefixes', () => {
  assert.equal(isInsideRoot('/', '/index.html'), true);
  assert.equal(isInsideRoot('/tmp/glorifier', '/tmp/glorifier/assets/app.js'), true);
  assert.equal(isInsideRoot('/tmp/glorifier', '/tmp/glorifier-evil/assets/app.js'), false);
});

test('returns JSON 404 for missing file-like assets instead of SPA HTML', async (t) => {
  const { origin } = await startFixture(t);
  const response = await fetch(origin + '/assets/missing.js');
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.equal((await response.json()).code, 'STATIC_ASSET_NOT_FOUND');
});

test('exposes a static-server-only health endpoint with no backend readiness claim', async (t) => {
  const { origin } = await startFixture(t);
  const response = await fetch(origin + '/healthz');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    ok: true,
    service: 'glorifier-static-frontend',
    status: 'static-assets-ready',
    backend: 'not-probed',
  });
});

test('HTML responses use a same-origin script policy and restrict active content', async (t) => {
  const { origin } = await startFixture(t);
  const response = await fetch(origin + '/');
  assert.equal(response.status, 200);
  const policy = response.headers.get('content-security-policy') || '';
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /script-src 'self'/);
  assert.doesNotMatch(policy, /script-src[^;]*unsafe-inline/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'self'/);
  assert.match(policy, /frame-ancestors 'none'/);
  const html = await response.text();
  assert.ok(html.includes('<script defer src="/startup-status.js"></script>'));
  assert.ok(html.includes('<script type="module" src="/assets/app-12345678.js"></script>'));
  const scriptTags = html.match(/<script[^>]*>/gi) || [];
  const externalScriptTags = html.match(/<script[^>]*src=/gi) || [];
  assert.equal(scriptTags.length, externalScriptTags.length,
    'all script tags in the HTML response must load from same-origin assets');
});

test('serves the externalized startup status script as a same-origin asset', async (t) => {
  const { origin } = await startFixture(t);
  const response = await fetch(origin + '/startup-status.js');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(await response.text(), 'window.booted = true;');
});

test('does not SPA-fallback extensionless paths under the assets directory', async (t) => {
  const { origin } = await startFixture(t);
  const response = await fetch(origin + '/assets/missing');
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, 'STATIC_ASSET_NOT_FOUND');
});

test('does not report static readiness when the React entry document is missing', async (t) => {
  const { root, origin } = await startFixture(t);
  await rm(path.join(root, 'index.html'));
  const response = await fetch(origin + '/healthz');
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'FRONTEND_ASSETS_NOT_READY');
  assert.equal(body.backend, 'not-probed');
});

test('supports HEAD without returning a response body and rejects unsupported methods', async (t) => {
  const { origin } = await startFixture(t);
  const head = await fetch(origin + '/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.match(head.headers.get('content-security-policy') || '', /script-src 'self'/);
  assert.equal(await head.text(), '');

  const post = await fetch(origin + '/', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('rejects decoded path traversal and never serves files outside the dist root', async (t) => {
  const { root, origin } = await startFixture(t);
  const secret = path.join(path.dirname(root), 'glorifier-mphr-outside-secret.txt');
  await writeFile(secret, 'must-not-leak');
  t.after(() => rm(secret, { force: true }));
  const response = await fetch(origin + '/..%2f' + path.basename(secret));
  assert.notEqual(response.status, 200);
  assert.doesNotMatch(await response.text(), /must-not-leak/);
});
