import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  handleWorkerAppStateRequest,
  type WorkerAppStateRouteDependencies,
} from './worker-app-state-route';
import type { WorkerAppState } from './app-state-worker';
import type { WorkerIdentity } from './auth/worker-auth';

const identity: WorkerIdentity = {
  uid: 'authenticated-user-123',
  provider: 'auth0',
  email: 'person@example.test',
  emailVerified: true,
  firebaseSignInProvider: null,
  claims: {},
};

const state: WorkerAppState = {
  policy: { mode: 'strict' },
  offers: [{ id: 'offer-1' }],
  grants: [],
  telemetryEvents: [],
  transactions: [],
  footprints: [],
  exposures: [],
  stats: { totalEarnedUsd: 0, pendingSettlementUsd: 0 },
};

const env = {
  AUTH0_ISSUER_BASE_URL: 'https://tenant.example.test/',
  AUTH0_AUDIENCE: 'https://api.example.test',
  APP_STATE_HYPERDRIVE: { connectionString: 'postgresql://worker:credential@neon.example/glorifier' },
};

function dependencies(
  overrides: Partial<WorkerAppStateRouteDependencies> = {},
): WorkerAppStateRouteDependencies {
  return {
    verify: async () => identity,
    isOwner: () => false,
    read: async (_binding, uid) => {
      assert.equal(uid, identity.uid);
      return state;
    },
    write: async (_binding, uid, payload) => {
      assert.equal(uid, identity.uid, 'the authenticated identity must select the database partition');
      assert.deepEqual(payload, { policy: { mode: 'strict' } });
      return state;
    },
    session: async () => ({
      connected: true,
      databaseName: 'glorifier',
      databaseRole: 'glorifier_worker_app_rw',
      serverTime: '2026-11-08T00:00:00.000Z',
      readCapabilityVerified: true,
      writeCapabilityVerified: true,
    }),
    ...overrides,
  };
}

const bearerRequest = (path: string, init: RequestInit = {}) => new Request(
  `https://glorifier.pages.dev${path}`,
  {
    ...init,
    headers: {
      Authorization: 'Bearer signed-test-token',
      ...(init.headers || {}),
    },
  },
);

test('app-state route rejects missing bearer authentication before database access', async () => {
  let databaseCalls = 0;
  const response = await handleWorkerAppStateRequest(
    new Request('https://glorifier.pages.dev/api/app-state'),
    '/api/app-state',
    env,
    dependencies({ read: async () => { databaseCalls += 1; return state; } }),
  );

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('www-authenticate'), 'Bearer realm="GLORIFIER"');
  assert.equal((await response.json() as { code: string }).code, 'AUTHENTICATION_REQUIRED');
  assert.equal(databaseCalls, 0);
});

test('app-state route reports missing identity-provider configuration without accepting a token', async () => {
  const response = await handleWorkerAppStateRequest(
    bearerRequest('/api/app-state'),
    '/api/app-state',
    {},
    dependencies({ verify: async () => null }),
  );

  assert.equal(response.status, 503);
  assert.equal((await response.json() as { code: string }).code, 'WORKER_AUTH_NOT_CONFIGURED');
});

test('app-state route rejects invalid bearer credentials', async () => {
  const response = await handleWorkerAppStateRequest(
    bearerRequest('/api/app-state'),
    '/api/app-state',
    env,
    dependencies({ verify: async () => null }),
  );

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('www-authenticate'), 'Bearer realm="GLORIFIER"');
  assert.equal((await response.json() as { code: string }).code, 'AUTHENTICATION_REQUIRED');
});

test('app-state route fails closed when its dedicated Neon Hyperdrive binding is absent', async () => {
  let readCalls = 0;
  const response = await handleWorkerAppStateRequest(
    bearerRequest('/api/app-state'),
    '/api/app-state',
    { ...env, APP_STATE_HYPERDRIVE: undefined },
    dependencies({ read: async () => { readCalls += 1; return state; } }),
  );

  assert.equal(response.status, 503);
  assert.equal((await response.json() as { code: string }).code, 'APP_STATE_HYPERDRIVE_NOT_CONFIGURED');
  assert.equal(readCalls, 0);
});

test('GET app-state returns only the authenticated user partition', async () => {
  let observedUid = '';
  const response = await handleWorkerAppStateRequest(
    bearerRequest('/api/app-state'),
    '/api/app-state',
    env,
    dependencies({
      read: async (_binding, uid) => {
        observedUid = uid;
        return state;
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    state,
    identity: { uid: identity.uid },
  });
  assert.equal(observedUid, identity.uid);
});

test('PUT app-state rejects unsupported media types before writing', async () => {
  let writeCalls = 0;
  const response = await handleWorkerAppStateRequest(
    bearerRequest('/api/app-state', {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    }),
    '/api/app-state',
    env,
    dependencies({ write: async () => { writeCalls += 1; return state; } }),
  );

  assert.equal(response.status, 415);
  assert.equal((await response.json() as { code: string }).code, 'UNSUPPORTED_MEDIA_TYPE');
  assert.equal(writeCalls, 0);
});

test('PUT app-state rejects oversized request bodies before writing', async () => {
  let writeCalls = 0;
  const oversizedState = JSON.stringify({ state: { policy: 'x'.repeat(1_048_576) } });
  const response = await handleWorkerAppStateRequest(
    bearerRequest('/api/app-state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: oversizedState,
    }),
    '/api/app-state',
    env,
    dependencies({ write: async () => { writeCalls += 1; return state; } }),
  );

  assert.equal(response.status, 413);
  assert.equal((await response.json() as { code: string }).code, 'REQUEST_BODY_TOO_LARGE');
  assert.equal(writeCalls, 0);
});

test('PUT app-state writes the supplied state using the verified UID and ignores top-level user references', async () => {
  let observedUid = '';
  let observedPayload: unknown;
  const response = await handleWorkerAppStateRequest(
    bearerRequest('/api/app-state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userReference: 'attacker-selected-user',
        state: { policy: { mode: 'strict' } },
      }),
    }),
    '/api/app-state',
    env,
    dependencies({
      write: async (_binding, uid, payload) => {
        observedUid = uid;
        observedPayload = payload;
        return state;
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    state,
    identity: { uid: identity.uid },
  });
  assert.equal(observedUid, identity.uid);
  assert.deepEqual(observedPayload, { policy: { mode: 'strict' } });
});

test('authenticated session reports Neon role and owner status separately', async () => {
  const response = await handleWorkerAppStateRequest(
    bearerRequest('/api/auth/session'),
    '/api/auth/session',
    env,
    dependencies({ isOwner: () => true }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    authenticated: true,
    identity: {
      uid: identity.uid,
      email: identity.email,
      emailVerified: true,
      provider: 'auth0',
    },
    database: {
      connected: true,
      databaseName: 'glorifier',
      databaseRole: 'glorifier_worker_app_rw',
      serverTime: '2026-11-08T00:00:00.000Z',
      readCapabilityVerified: true,
      writeCapabilityVerified: true,
      authority: 'Neon/PostgreSQL',
    },
    authorization: {
      owner: true,
      authenticationAndAuthorizationSeparate: true,
      humanFinalAuthority: true,
    },
  });
});

test('app-state routes reject methods outside GET and PUT', async () => {
  const response = await handleWorkerAppStateRequest(
    bearerRequest('/api/app-state', { method: 'DELETE' }),
    '/api/app-state',
    env,
    dependencies(),
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, PUT');
  assert.equal((await response.json() as { code: string }).code, 'METHOD_NOT_ALLOWED');
});
