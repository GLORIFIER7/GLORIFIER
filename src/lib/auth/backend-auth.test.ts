import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
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

const originalServiceToken = process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN;
const authEnvKeys = [
  'FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY',
  'FIREBASE_PROJECT_ID', 'GOOGLE_APPLICATION_CREDENTIALS', 'AUTH0_ISSUER_BASE_URL', 'AUTH0_AUDIENCE',
] as const;
const originalAuthEnvironment = new Map(authEnvKeys.map((key) => [key, process.env[key]] as const));
const originalFetch = globalThis.fetch;

afterEach(() => {
  delete process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN;
});

after(() => {
  if (originalServiceToken === undefined) delete process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN;
  else process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN = originalServiceToken;
  globalThis.fetch = originalFetch;
  for (const key of authEnvKeys) {
    const value = originalAuthEnvironment.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('internal service authentication rejects marker, host and wrong-token impersonation', () => {
  process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN = 'test-secret-token';
  assert.equal(isInternalServiceRequest(request({
    'x-glorifier-internal-service': 'permanent-orchestrator',
    host: 'glorifier-artificial-intelligence.railway.internal',
  })), false);
  assert.equal(isInternalServiceRequest(request({
    'x-glorifier-internal-service': 'permanent-orchestrator',
    'x-forwarded-host': 'glorifier-artificial-intelligence.railway.internal',
  })), false);
  assert.equal(isInternalServiceRequest(request({ 'x-glorifier-internal-token': 'wrong-token' })), false);
  assert.equal(isInternalServiceRequest(request({ 'x-glorifier-internal-token': 'test-secret-token' })), true);
  delete process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN;
  assert.equal(isInternalServiceRequest(request({ 'x-glorifier-internal-token': 'test-secret-token' })), false);
});

test('authentication middleware rejects anonymous users and accepts verified users', async () => {
  const denied = await runMiddleware(createRequireAuthentication(fakeVerifier), {});
  assert.equal(denied.statusCode, 401);
  assert.equal(denied.nextCalled, false);
  const allowed = await runMiddleware(createRequireAuthentication(fakeVerifier), { authorization: 'Bearer user-token' });
  assert.equal(allowed.nextCalled, true);
  assert.equal(allowed.req.auth.uid, 'user-123');
});

test('owner and internal-service middleware protect private payment intent reads', async () => {
  const nonOwner = await runMiddleware(createRequireOwnerOrInternalService(fakeVerifier), { authorization: 'Bearer user-token' });
  assert.equal(nonOwner.statusCode, 403);
  assert.equal(nonOwner.nextCalled, false);
  const owner = await runMiddleware(createRequireOwnerOrInternalService(fakeVerifier), { authorization: 'Bearer owner-token' });
  assert.equal(owner.nextCalled, true);
  process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN = 'test-secret-token';
  const internal = await runMiddleware(createRequireOwnerOrInternalService(fakeVerifier), { 'x-glorifier-internal-token': 'test-secret-token' });
  assert.equal(internal.nextCalled, true);
  delete process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN;
});

test('Auth0-only authentication initializes without Firebase Admin and validates audience arrays', async () => {
  authEnvKeys.forEach((key) => { delete process.env[key]; });
  process.env.AUTH0_ISSUER_BASE_URL = 'https://auth0-only.example/';
  process.env.AUTH0_AUDIENCE = 'https://api.auth0-only.example';
  await initializeAuthenticationBackend();
  const status = authenticationStatus();
  assert.equal(status.provider, 'Auth0');
  assert.equal(status.providerConfigured, true);
  assert.equal(status.backendVerification, true);
  const issuer = 'https://auth0-only.example/';
  const audience = 'https://api.auth0-only.example';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'auth0-array-aud-test', use: 'sig', alg: 'RS256' };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: 'auth0-array-aud-test' });
  const now = Math.floor(Date.now() / 1000);
  const payload = encode({ iss: issuer, sub: 'auth0|array-audience-user', aud: [audience, 'https://another-api.example'], iat: now - 10, exp: now + 300 });
  const signingInput = header + '.' + payload;
  const token = signingInput + '.' + sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
  const principal = await verifyBearerToken(request({ authorization: 'Bearer ' + token }));
  assert.equal(principal?.aud, audience);
});
