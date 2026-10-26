import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyAuth0AccessToken } from './auth0-token';

const issuer = 'https://glorifier-test.example/';
const audience = 'https://api.glorifier.test';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' };

function makeToken(claimOverrides: Record<string, unknown> = {}, signingKey = privateKey) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: 'test-key' });
  const payload = encode({
    iss: issuer,
    sub: 'auth0|user-123',
    aud: audience,
    iat: 1_900_000_000,
    exp: 1_900_000_300,
    ...claimOverrides,
  });
  const signed = `${header}.${payload}`;
  return `${signed}.${sign('RSA-SHA256', Buffer.from(signed), signingKey).toString('base64url')}`;
}

const env = { AUTH0_ISSUER_BASE_URL: issuer, AUTH0_AUDIENCE: audience } as NodeJS.ProcessEnv;
const nowSeconds = 1_900_000_100;
const fetcher: typeof fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

const principal = await verifyAuth0AccessToken(makeToken({ email: 'user@example.test', email_verified: true }), { env, fetcher, nowSeconds });
assert.equal(principal?.uid, 'auth0|user-123', 'valid Auth0 subject becomes the normalized uid');
assert.equal(principal?.email, 'user@example.test');
assert.equal(principal?.email_verified, true);

assert.equal(await verifyAuth0AccessToken(makeToken({ aud: 'wrong-api' }), { env, fetcher, nowSeconds }), null, 'wrong audience is rejected');
assert.equal(await verifyAuth0AccessToken(makeToken({ iss: 'https://attacker.example/' }), { env, fetcher, nowSeconds }), null, 'wrong issuer is rejected');
assert.equal(await verifyAuth0AccessToken(makeToken({ exp: nowSeconds }), { env, fetcher, nowSeconds }), null, 'expired token is rejected');
assert.equal(await verifyAuth0AccessToken(makeToken({ nbf: nowSeconds + 1 }), { env, fetcher, nowSeconds }), null, 'not-yet-valid token is rejected');
const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
assert.equal(await verifyAuth0AccessToken(makeToken({}, otherKey), { env, fetcher, nowSeconds }), null, 'invalid RSA signatures are rejected');
assert.equal(await verifyAuth0AccessToken('not-a-jwt', { env, fetcher, nowSeconds }), null, 'malformed tokens are rejected');
assert.equal(await verifyAuth0AccessToken(makeToken(), { env: { AUTH0_ISSUER_BASE_URL: issuer } as NodeJS.ProcessEnv, fetcher, nowSeconds }), null, 'missing audience configuration fails closed');
console.log('Auth0 access-token validation tests passed');
