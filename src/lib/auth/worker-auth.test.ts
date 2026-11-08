import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { test } from 'node:test';
import {
  isWorkerInternalService,
  isWorkerOwner,
  verifyWorkerBearerToken,
  type WorkerAuthEnvironment,
} from './worker-auth';

const nowSeconds = 1_900_000_100;
const audience = 'https://api.glorifier.test';
const issuer = 'https://glorifier-test.eu.auth0.com/';

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function makeJwt(
  payload: Record<string, unknown>,
  privateKey: KeyObject,
  kid = 'test-key',
  alg = 'RS256',
): string {
  const header = encode({ alg, typ: 'JWT', kid });
  const body = encode(payload);
  const signingInput = `${header}.${body}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

function bearer(token: string): Request {
  return new Request('https://glorifier.pages.dev/api/app-state', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

test('Cloudflare Worker Auth0 verification validates signature and required claims', async () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = {
    ...keys.publicKey.export({ format: 'jwk' }),
    kid: 'auth0-key-1',
    use: 'sig',
    alg: 'RS256',
  };
  let jwksFetches = 0;
  const fetcher: typeof fetch = async (input) => {
    jwksFetches += 1;
    assert.equal(String(input), new URL('.well-known/jwks.json', issuer).toString());
    return new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const env: WorkerAuthEnvironment = {
    AUTH0_ISSUER_BASE_URL: issuer,
    AUTH0_AUDIENCE: audience,
  };
  const payload = {
    iss: issuer,
    sub: 'auth0|user-123',
    aud: [audience, 'https://another-api.glorifier.test'],
    iat: nowSeconds - 10,
    exp: nowSeconds + 300,
    email: 'user@example.test',
    email_verified: true,
    role: 'owner',
  };
  const principal = await verifyWorkerBearerToken(
    bearer(makeJwt(payload, keys.privateKey, 'auth0-key-1')),
    env,
    { fetcher, nowSeconds },
  );
  assert.equal(principal?.uid, 'auth0|user-123');
  assert.equal(principal?.provider, 'auth0');
  assert.equal(principal?.email, 'user@example.test');
  assert.equal(principal?.emailVerified, true);
  assert.equal(isWorkerOwner(principal!, env), false,
    'Auth0 role-like claims must not be promoted to GLORIFIER owner authority');
  assert.equal(jwksFetches, 1);

  const invalidSignature = await verifyWorkerBearerToken(
    bearer(makeJwt(payload, otherKeys.privateKey, 'auth0-key-1')),
    env,
    { fetcher, nowSeconds },
  );
  assert.equal(invalidSignature, null, 'a token with an invalid RSA signature must be rejected');

  assert.equal(await verifyWorkerBearerToken(
    bearer(makeJwt({ ...payload, aud: 'https://wrong.example' }, keys.privateKey, 'auth0-key-1')),
    env,
    { fetcher, nowSeconds },
  ), null, 'a token for another API audience must be rejected');

  assert.equal(await verifyWorkerBearerToken(
    bearer(makeJwt({ ...payload, exp: nowSeconds }, keys.privateKey, 'auth0-key-1')),
    env,
    { fetcher, nowSeconds },
  ), null, 'expired tokens must be rejected');

  assert.equal(await verifyWorkerBearerToken(
    bearer(makeJwt({ ...payload, nbf: nowSeconds + 1 }, keys.privateKey, 'auth0-key-1')),
    env,
    { fetcher, nowSeconds },
  ), null, 'tokens that are not yet valid must be rejected');

  assert.equal(await verifyWorkerBearerToken(
    bearer(makeJwt(payload, keys.privateKey, 'unknown-kid')),
    env,
    { fetcher, nowSeconds },
  ), null, 'a key identifier absent from the issuer JWKS must be rejected');
});

test('Cloudflare Worker Firebase verification checks account status and token revocation', async () => {
  const projectId = 'gen-lang-client-0942094352';
  const apiKey = 'firebase-public-test-key';
  const env: WorkerAuthEnvironment = {
    FIREBASE_PROJECT_ID: projectId,
    FIREBASE_WEB_API_KEY: apiKey,
    GLORIFIER_OWNER_UID: 'firebase-owner-123',
  };
  const payload = {
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    sub: 'firebase-user-123',
    iat: nowSeconds - 40,
    auth_time: nowSeconds - 30,
    exp: nowSeconds + 300,
    email: 'owner@example.test',
    email_verified: true,
    firebase: { sign_in_provider: 'password' },
    owner: true,
  };
  const token = makeJwt(payload, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey, 'firebase-key');
  let lookupCalls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    lookupCalls += 1;
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://identitytoolkit.googleapis.com');
    assert.equal(url.pathname, '/v1/accounts:lookup');
    assert.equal(url.searchParams.get('key'), apiKey);
    assert.equal(init?.method, 'POST');
    assert.equal(JSON.parse(String(init?.body)).idToken, token);
    return new Response(JSON.stringify({
      users: [{
        localId: 'firebase-user-123',
        email: 'owner@example.test',
        emailVerified: true,
        disabled: false,
        validSince: String(nowSeconds - 60),
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const principal = await verifyWorkerBearerToken(bearer(token), env, { fetcher, nowSeconds });
  assert.equal(principal?.uid, 'firebase-user-123');
  assert.equal(principal?.provider, 'firebase');
  assert.equal(principal?.emailVerified, true);
  assert.equal(principal?.firebaseSignInProvider, 'password');
  assert.equal(isWorkerOwner(principal!, env), true);
  assert.equal(lookupCalls, 1);

  const revokedFetcher: typeof fetch = async () => new Response(JSON.stringify({
    users: [{
      localId: 'firebase-user-123',
      disabled: false,
      validSince: String(nowSeconds - 10),
    }],
  }), { status: 200 });
  assert.equal(await verifyWorkerBearerToken(bearer(token), env, {
    fetcher: revokedFetcher,
    nowSeconds,
  }), null, 'a token issued before validSince must be rejected as revoked');

  const disabledFetcher: typeof fetch = async () => new Response(JSON.stringify({
    users: [{
      localId: 'firebase-user-123',
      disabled: true,
      validSince: '0',
    }],
  }), { status: 200 });
  assert.equal(await verifyWorkerBearerToken(bearer(token), env, {
    fetcher: disabledFetcher,
    nowSeconds,
  }), null, 'disabled Firebase users must be rejected');

  const wrongProjectToken = makeJwt({ ...payload, aud: 'another-project' },
    generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey, 'firebase-key');
  let unexpectedLookup = false;
  const neverFetch: typeof fetch = async () => {
    unexpectedLookup = true;
    return new Response('{}', { status: 200 });
  };
  assert.equal(await verifyWorkerBearerToken(bearer(wrongProjectToken), env, {
    fetcher: neverFetch,
    nowSeconds,
  }), null, 'Firebase tokens for another project must be rejected before identity lookup');
  assert.equal(unexpectedLookup, false);
});

test('Cloudflare Worker internal-service and owner authorization fail closed', async () => {
  const env: WorkerAuthEnvironment = {
    GLORIFIER_INTERNAL_SERVICE_TOKEN: 'internal-service-test-token',
    GLORIFIER_OWNER_UID: 'owner-123',
    GLORIFIER_OWNER_EMAIL: 'owner@example.test',
  };
  const good = new Request('https://glorifier.pages.dev/api/connections', {
    headers: { 'x-glorifier-internal-token': 'internal-service-test-token' },
  });
  const bad = new Request('https://glorifier.pages.dev/api/connections', {
    headers: {
      'x-glorifier-internal-token': 'wrong-token',
      'x-glorifier-internal-service': 'permanent-orchestrator',
      host: 'glorifier-artificial-intelligence.railway.internal',
    },
  });
  assert.equal(isWorkerInternalService(good, env), true);
  assert.equal(isWorkerInternalService(bad, env), false,
    'marker and private hostname alone must never authenticate an internal service');
  assert.equal(isWorkerInternalService(good, {}), false,
    'a supplied token is invalid when the configured server-side token is missing');
  assert.equal(isWorkerOwner({
    uid: 'owner-123',
    provider: 'firebase',
    email: null,
    emailVerified: false,
    firebaseSignInProvider: null,
    claims: {},
  }, env), true);
  assert.equal(isWorkerOwner({
    uid: 'other-123',
    provider: 'firebase',
    email: 'owner@example.test',
    emailVerified: false,
    firebaseSignInProvider: null,
    claims: {},
  }, env), false, 'an unverified email cannot establish owner authority');
});
