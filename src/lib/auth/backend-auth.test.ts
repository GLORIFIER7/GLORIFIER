import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { Request } from 'express';
import {
  authenticationStatus,
  createRequireAuthentication,
  createRequireOwnerOrInternalService,
  initializeAuthenticationBackend,
  isInternalServiceRequest,
  verifyBearerToken,
  type TokenVerifier,
} from './backend-auth';

const request = (headers: Record<string, string>): Request => ({
  get(name: string) { return headers[name.toLowerCase()]; },
} as unknown as Request);

const runMiddleware = async (
  middleware: (req: any, res: any, next: () => void) => unknown,
  headers: Record<string, string>,
) => {
  const req = request(headers) as any;
  let nextCalled = false;
  let statusCode = 200;
  let body: unknown;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  };
  middleware(req, res, () => { nextCalled = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  return { req, nextCalled, statusCode, body };
};

const fakeVerifier: TokenVerifier = async (req) => {
  const header = req.get('authorization');
  if (header === 'Bearer user-token') return { uid: 'user-123' } as any;
  if (header === 'Bearer owner-token') return { uid: 'owner-123', owner: true } as any;
  return null;
};

const previous = process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN;
try {
  process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN = 'test-secret-token';
  assert.equal(isInternalServiceRequest(request({
    'x-glorifier-internal-service': 'permanent-orchestrator',
    host: 'glorifier-artificial-intelligence.railway.internal',
  })), false, 'marker and private address alone must not authenticate');
  assert.equal(isInternalServiceRequest(request({
    'x-glorifier-internal-service': 'permanent-orchestrator',
    'x-forwarded-host': 'glorifier-artificial-intelligence.railway.internal',
  })), false, 'forwarded host must not authenticate');
  assert.equal(isInternalServiceRequest(request({
    'x-glorifier-internal-token': 'wrong-token',
  })), false, 'wrong token must fail');
  assert.equal(isInternalServiceRequest(request({
    'x-glorifier-internal-token': 'test-secret-token',
  })), true, 'configured service token should authenticate');

  const unauthenticatedCreate = await runMiddleware(createRequireAuthentication(fakeVerifier), {});
  assert.equal(unauthenticatedCreate.statusCode, 401, 'payment-intent creation must reject unauthenticated requests');
  assert.equal(unauthenticatedCreate.nextCalled, false);

  const verifiedUserCreate = await runMiddleware(createRequireAuthentication(fakeVerifier), {
    authorization: 'Bearer user-token',
  });
  assert.equal(verifiedUserCreate.nextCalled, true, 'a verified user may reach the payer-binding handler');
  assert.equal(verifiedUserCreate.req.auth.uid, 'user-123');

  const nonOwnerRead = await runMiddleware(createRequireOwnerOrInternalService(fakeVerifier), {
    authorization: 'Bearer user-token',
  });
  assert.equal(nonOwnerRead.statusCode, 403, 'non-owners must not read private payment intents');
  assert.equal(nonOwnerRead.nextCalled, false);

  const ownerRead = await runMiddleware(createRequireOwnerOrInternalService(fakeVerifier), {
    authorization: 'Bearer owner-token',
  });
  assert.equal(ownerRead.nextCalled, true, 'owner identity should pass the owner guard');

  const internalRead = await runMiddleware(createRequireOwnerOrInternalService(fakeVerifier), {
    'x-glorifier-internal-token': 'test-secret-token',
  });
  assert.equal(internalRead.nextCalled, true, 'configured internal-service identity should pass the service guard');

  delete process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN;
  assert.equal(isInternalServiceRequest(request({
    'x-glorifier-internal-token': 'test-secret-token',
  })), false, 'missing configured token must fail closed');
  const authEnvKeys = [
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_PROJECT_ID',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'AUTH0_ISSUER_BASE_URL',
    'AUTH0_AUDIENCE',
  ] as const;
  const priorAuthEnv = Object.fromEntries(authEnvKeys.map((key) => [key, process.env[key]]));
  try {
    authEnvKeys.forEach((key) => { delete process.env[key]; });
    process.env.AUTH0_ISSUER_BASE_URL = 'https://auth0-only.example/';
    process.env.AUTH0_AUDIENCE = 'https://api.auth0-only.example';
    await initializeAuthenticationBackend();
    const auth0OnlyStatus = authenticationStatus();
    assert.equal(auth0OnlyStatus.provider, 'Auth0', 'Auth0-only configuration must not claim Firebase is configured');
    assert.equal(auth0OnlyStatus.providerConfigured, true, 'Auth0-only configuration must be accepted as a configured provider');
    assert.equal(auth0OnlyStatus.backendVerification, true, 'Auth0-only verification must be considered available without Firebase Admin startup');

    const auth0Issuer = 'https://auth0-only.example/';
    const auth0Audience = 'https://api.auth0-only.example';
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'auth0-array-aud-test', use: 'sig', alg: 'RS256' };
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const tokenHeader = encode({ alg: 'RS256', typ: 'JWT', kid: 'auth0-array-aud-test' });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const tokenPayload = encode({
      iss: auth0Issuer,
      sub: 'auth0|array-audience-user',
      aud: [auth0Audience, 'https://another-api.example'],
      iat: nowSeconds - 10,
      exp: nowSeconds + 300,
    });
    const signedData = tokenHeader + '.' + tokenPayload;
    const token = signedData + '.' + sign('RSA-SHA256', Buffer.from(signedData), privateKey).toString('base64url');
    const previousFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      const decodedAuth0 = await verifyBearerToken(request({ authorization: 'Bearer ' + token }));
      assert.equal(decodedAuth0?.aud, auth0Audience, 'Auth0 audience arrays must normalize to the configured API audience in the backend principal');
    } finally {
      globalThis.fetch = previousFetch;
    }
  } finally {
    authEnvKeys.forEach((key) => {
      const prior = priorAuthEnv[key];
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    });
  }

  console.log('backend-auth internal service regression tests passed');
} finally {
  if (previous === undefined) delete process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN;
  else process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN = previous;
}
