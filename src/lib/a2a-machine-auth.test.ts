import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import {
  A2A_MACHINE_TOKEN_TTL_SECONDS,
  createA2AMachineAuthRouter,
  createA2AMachineIdentityResolver,
  createMemoryA2AMachineClientStore,
  deriveA2AMachineTokenKey,
  issueA2AMachineAccessToken,
  verifyA2AMachineAccessToken,
  type A2AMachineAuthDependencies,
} from './a2a-machine-auth';

const ORIGIN = 'https://glorifier.example';
const SECRET = 's'.repeat(48);
const CLIENT = 'a2a-client-123e4567-e89b-42d3-a456-426614174000';

function setup(overrides: Partial<A2AMachineAuthDependencies> = {}) {
  let now = Date.UTC(2026, 10, 27, 0, 0, 0);
  const store = createMemoryA2AMachineClientStore();
  const deps: A2AMachineAuthDependencies = {
    getStore: () => store,
    getSigningSecret: () => SECRET,
    getPublicBaseUrl: () => ORIGIN,
    requireOwner: (req, res, next) => (req.get('x-test-owner') === 'yes' ? next() : res.status(403).json({ ok: false })),
    nowMs: () => now,
    ...overrides,
  };
  return { deps, store, advance: (ms: number) => { now += ms; } };
}

async function withServer(deps: A2AMachineAuthDependencies, run: (origin: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use(createA2AMachineAuthRouter(deps));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const register = (base: string, body: unknown = { client_name: 'Partner agent' }) =>
  fetch(`${base}/api/a2a/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const tokenRequest = (base: string, form: Record<string, string>, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/a2a/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(form).toString() });
const basic = (id: string, secret: string) => 'Basic ' + Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString('base64');

test('an agent self-registers, obtains a token and is resolved to a requester identity with no human step', async () => {
  const { deps, advance } = setup();
  const resolve = createA2AMachineIdentityResolver(deps);
  await withServer(deps, async (base) => {
    const metadata = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
    assert.equal(metadata.issuer, ORIGIN);
    assert.equal(metadata.registration_endpoint, `${ORIGIN}/api/a2a/oauth/register`);
    assert.deepEqual(metadata.grant_types_supported, ['client_credentials']);

    const registered = await register(base);
    assert.equal(registered.status, 201);
    assert.equal(registered.headers.get('cache-control'), 'no-store');
    const client = await registered.json();
    assert.match(client.client_id, /^a2a-client-/);
    assert.match(client.client_secret, /^a2as_/);
    assert.equal(client.client_secret_expires_at, 0);
    assert.equal(client.scope, 'a2a:tasks');

    for (const request of [
      () => tokenRequest(base, { grant_type: 'client_credentials' }, { Authorization: basic(client.client_id, client.client_secret) }),
      () => tokenRequest(base, { grant_type: 'client_credentials', scope: 'a2a:tasks', client_id: client.client_id, client_secret: client.client_secret }),
    ]) {
      const response = await request();
      assert.equal(response.status, 200);
      const token = await response.json();
      assert.equal(token.token_type, 'Bearer');
      assert.equal(token.expires_in, A2A_MACHINE_TOKEN_TTL_SECONDS);
      assert.equal(await resolve(`Bearer ${token.access_token}`), `a2a-client:${client.client_id}`);
      advance(A2A_MACHINE_TOKEN_TTL_SECONDS * 1000);
      assert.equal(await resolve(`Bearer ${token.access_token}`), null, 'expired tokens are rejected');
    }
  });
});

test('registration rejects unsupported metadata and fails closed when unconfigured', async () => {
  const { deps } = setup();
  await withServer(deps, async (base) => {
    for (const body of [
      { grant_types: ['authorization_code'] },
      { grant_types: ['client_credentials', 'refresh_token'] },
      { response_types: ['code'] },
      { token_endpoint_auth_method: 'none' },
      { scope: 'admin' },
      { client_name: '' },
      { client_name: 'x'.repeat(101) },
      { client_name: 'bad\nname' },
      [],
    ]) {
      const response = await register(base, body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal((await response.json()).error, 'invalid_client_metadata');
    }
  });
  for (const override of [{ getStore: () => null }, { getSigningSecret: () => 'short' }, { getPublicBaseUrl: () => 'http://glorifier.example' }]) {
    const { deps: unconfigured } = setup(override);
    await withServer(unconfigured, async (base) => {
      assert.equal((await register(base)).status, 503);
      assert.equal((await tokenRequest(base, { grant_type: 'client_credentials' })).status, 503);
    });
  }
});

test('token endpoint enforces grant, scope and exactly one valid client authentication', async () => {
  const { deps } = setup();
  await withServer(deps, async (base) => {
    const client = await (await register(base)).json();
    const auth = { Authorization: basic(client.client_id, client.client_secret) };
    const cases: Array<[Record<string, string>, Record<string, string>, number, string]> = [
      [{ grant_type: 'password' }, auth, 400, 'unsupported_grant_type'],
      [{ grant_type: 'client_credentials', scope: 'admin' }, auth, 400, 'invalid_scope'],
      [{ grant_type: 'client_credentials' }, { Authorization: basic(client.client_id, 'a2as_' + 'x'.repeat(43)) }, 401, 'invalid_client'],
      [{ grant_type: 'client_credentials', client_id: client.client_id }, auth, 401, 'invalid_client'],
      [{ grant_type: 'client_credentials' }, { Authorization: 'Basic !!!' }, 401, 'invalid_client'],
      [{ grant_type: 'client_credentials' }, {}, 401, 'invalid_client'],
      [{ grant_type: 'client_credentials', client_id: CLIENT, client_secret: client.client_secret }, {}, 401, 'invalid_client'],
    ];
    for (const [form, headers, status, error] of cases) {
      const response = await tokenRequest(base, form, headers);
      assert.equal(response.status, status, JSON.stringify(form));
      assert.equal((await response.json()).error, error);
    }
    const json = await fetch(`${base}/api/a2a/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ grant_type: 'client_credentials' }) });
    assert.equal(json.status, 400);
  });
});

test('owner revocation disables new tokens and already issued tokens', async () => {
  const { deps } = setup();
  const resolve = createA2AMachineIdentityResolver(deps);
  await withServer(deps, async (base) => {
    const client = await (await register(base)).json();
    const auth = { Authorization: basic(client.client_id, client.client_secret) };
    const token = (await (await tokenRequest(base, { grant_type: 'client_credentials' }, auth)).json()).access_token;
    const revokeUrl = `${base}/api/a2a/oauth/clients/${client.client_id}/revoke`;
    assert.equal((await fetch(revokeUrl, { method: 'POST' })).status, 403, 'revocation is owner-only');
    assert.equal((await fetch(revokeUrl, { method: 'POST', headers: { 'x-test-owner': 'yes' } })).status, 200);
    assert.equal((await fetch(revokeUrl, { method: 'POST', headers: { 'x-test-owner': 'yes' } })).status, 404);
    assert.equal(await resolve(`Bearer ${token}`), null);
    assert.equal((await tokenRequest(base, { grant_type: 'client_credentials' }, auth)).status, 401);
  });
});

test('token verification rejects tampering, wrong key, wrong audience and malformed tokens', () => {
  const key = deriveA2AMachineTokenKey(SECRET)!;
  const now = 1_800_000_000;
  const token = issueA2AMachineAccessToken(key, ORIGIN, CLIENT, now);
  assert.equal(verifyA2AMachineAccessToken(key, ORIGIN, token, now), CLIENT);
  const [h, p, s] = token.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  const forged = Buffer.from(JSON.stringify({ ...payload, client_id: 'a2a-client-00000000-0000-4000-8000-000000000000' })).toString('base64url');
  const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'at+jwt' })).toString('base64url');
  for (const candidate of [`${h}.${forged}.${s}`, `${none}.${p}.`, `${none}.${p}.${s}`, `${h}.${p}`, `${h}.${p}.${s}x`, '', 'a.b.c']) {
    assert.equal(verifyA2AMachineAccessToken(key, ORIGIN, candidate, now), null, candidate);
  }
  assert.equal(verifyA2AMachineAccessToken(deriveA2AMachineTokenKey('t'.repeat(48))!, ORIGIN, token, now), null);
  assert.equal(verifyA2AMachineAccessToken(key, 'https://other.example', token, now), null);
  assert.equal(verifyA2AMachineAccessToken(key, ORIGIN, token, now - 120), null, 'tokens from the future are rejected');
  assert.equal(deriveA2AMachineTokenKey('short'), null);
});

test('identity resolver ignores non-machine credentials and unknown clients', async () => {
  const { deps } = setup();
  const resolve = createA2AMachineIdentityResolver(deps);
  const key = deriveA2AMachineTokenKey(SECRET)!;
  const unknown = issueA2AMachineAccessToken(key, ORIGIN, CLIENT, Math.floor(Date.UTC(2026, 10, 27) / 1000));
  for (const header of [undefined, '', 'Basic abc', 'Bearer ', `Bearer ${unknown}`, 'Bearer firebase-id-token']) {
    assert.equal(await resolve(header), null, String(header));
  }
});
