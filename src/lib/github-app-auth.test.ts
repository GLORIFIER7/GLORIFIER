import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, verify as verifySignature } from 'node:crypto';
import {
  createGithubAppInstallationToken,
  hasGithubAppWriteConfiguration,
} from './github-app-auth.ts';

const now = Date.parse('2026-11-16T16:00:00.000Z');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const baseEnv = {
  GLORIFIER_GITHUB_APP_ID: '12345',
  GLORIFIER_GITHUB_APP_INSTALLATION_ID: '67890',
  GLORIFIER_GITHUB_APP_PRIVATE_KEY: pem,
  GLORIFIER_GITHUB_APP_SLUG: 'glorifier-contributor',
};

function decodeJwt(token: string) {
  const [header, payload, signature] = token.split('.');
  assert.ok(header && payload && signature);
  const signingInput = header + '.' + payload;
  assert.equal(verifySignature(
    'RSA-SHA256',
    Buffer.from(signingInput),
    publicKey,
    Buffer.from(signature, 'base64url'),
  ), true);
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
  };
}

function fakeFetch(options: {
  app?: Record<string, unknown>;
  installation?: Record<string, unknown>;
  onTokenRequest?: (body: Record<string, unknown>, jwt: string) => void;
} = {}) {
  const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method || 'GET';
    const body = typeof init?.body === 'string'
      ? JSON.parse(init.body) as Record<string, unknown>
      : undefined;
    calls.push({ url: url.href, method, body });
    const authorization = new Headers(init?.headers).get('Authorization') || '';
    if (url.pathname === '/app' && method === 'GET') {
      assert.match(authorization, /^Bearer [A-Za-z0-9_.-]+$/);
      const jwt = authorization.slice('Bearer '.length);
      const decoded = decodeJwt(jwt);
      assert.equal(decoded.header.alg, 'RS256');
      assert.equal(decoded.payload.iss, 12345);
      assert.ok(decoded.payload.exp - decoded.payload.iat <= 600);
      return Response.json(options.app ?? {
        id: 12345,
        slug: 'glorifier-contributor',
        owner: { login: 'GLORIFIER7' },
        permissions: { contents: 'write', pull_requests: 'write' },
      });
    }
    if (url.pathname === '/app/installations/67890/access_tokens' && method === 'POST') {
      assert.match(authorization, /^Bearer [A-Za-z0-9_.-]+$/);
      const jwt = authorization.slice('Bearer '.length);
      options.onTokenRequest?.(body || {}, jwt);
      return Response.json(options.installation ?? {
        token: 'ghs_test_installation_token',
        expires_at: new Date(now + 60 * 60_000).toISOString(),
        permissions: { contents: 'write', pull_requests: 'write' },
        repositories: [{
          id: 1377237797,
          name: 'GLORIFIER',
          full_name: 'GLORIFIER7/GLORIFIER',
        }],
      });
    }
    throw new Error('Unexpected request: ' + method + ' ' + url.href);
  };
  return { fetchImpl, calls };
}

test('GitHub App write configuration requires all app credentials and never treats a PAT as a bot identity', () => {
  assert.equal(hasGithubAppWriteConfiguration(baseEnv), true);
  assert.equal(hasGithubAppWriteConfiguration({ GLORIFIER_GITHUB_WRITE_TOKEN: 'ghp_legacy_token' }), false);
  assert.equal(hasGithubAppWriteConfiguration({ ...baseEnv, GLORIFIER_GITHUB_APP_SLUG: '' }), false);
  assert.equal(hasGithubAppWriteConfiguration({ ...baseEnv, GLORIFIER_GITHUB_APP_ID: '0' }), false);
  assert.equal(hasGithubAppWriteConfiguration({ ...baseEnv, GLORIFIER_GITHUB_APP_INSTALLATION_ID: '0' }), false);
  assert.equal(hasGithubAppWriteConfiguration({ ...baseEnv, GLORIFIER_GITHUB_APP_ID: '9999999999999999' }), false);
  assert.equal(hasGithubAppWriteConfiguration({ ...baseEnv, GLORIFIER_GITHUB_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----invalid-----END PRIVATE KEY-----' }), false);
});

test('GitHub App installation token is repository-scoped and verifies the owner-controlled bot identity', async () => {
  let requestedBody: Record<string, unknown> | undefined;
  const { fetchImpl, calls } = fakeFetch({
    onTokenRequest: (body, jwt) => {
      requestedBody = body;
      const decoded = decodeJwt(jwt);
      assert.equal(decoded.header.alg, 'RS256');
      assert.equal(decoded.payload.iss, 12345);
    },
  });
  const result = await createGithubAppInstallationToken(baseEnv, fetchImpl, now);

  assert.equal(result.token, 'ghs_test_installation_token');
  assert.deepEqual(result.identity, {
    appId: 12345,
    appSlug: 'glorifier-contributor',
    botLogin: 'glorifier-contributor[bot]',
    installationId: 67890,
    repository: 'GLORIFIER7/GLORIFIER',
  });
  assert.deepEqual(requestedBody, {
    repositories: ['GLORIFIER'],
    permissions: { contents: 'write', pull_requests: 'write' },
  });
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1].url).pathname, '/app/installations/67890/access_tokens');
});

test('GitHub App authentication fails closed when the app belongs to another owner', async () => {
  const { fetchImpl } = fakeFetch({ app: {
    id: 12345,
    slug: 'glorifier-contributor',
    owner: { login: 'untrusted-owner' },
  } });
  await assert.rejects(
    () => createGithubAppInstallationToken(baseEnv, fetchImpl, now),
    /does not belong to the GLORIFIER7 owner/,
  );
});

test('GitHub App authentication fails closed when the configured app slug does not match GitHub', async () => {
  const { fetchImpl } = fakeFetch({ app: {
    id: 12345,
    slug: 'different-app',
    owner: { login: 'GLORIFIER7' },
  } });
  await assert.rejects(
    () => createGithubAppInstallationToken(baseEnv, fetchImpl, now),
    /slug does not match the configured GLORIFIER App/,
  );
});

test('GitHub App installation token fails closed unless both required write permissions are granted', async () => {
  const { fetchImpl } = fakeFetch({ installation: {
    token: 'ghs_test_installation_token',
    expires_at: new Date(now + 60 * 60_000).toISOString(),
    permissions: { contents: 'write', pull_requests: 'read' },
    repositories: [{ full_name: 'GLORIFIER7/GLORIFIER' }],
  } });
  await assert.rejects(
    () => createGithubAppInstallationToken(baseEnv, fetchImpl, now),
    /contents:write, pull_requests:write/,
  );
});

test('GitHub App installation token fails closed unless it is scoped to only GLORIFIER7/GLORIFIER', async () => {
  const { fetchImpl } = fakeFetch({ installation: {
    token: 'ghs_test_installation_token',
    expires_at: new Date(now + 60 * 60_000).toISOString(),
    permissions: { contents: 'write', pull_requests: 'write' },
    repositories: [
      { full_name: 'GLORIFIER7/GLORIFIER' },
      { full_name: 'GLORIFIER7/OTHER' },
    ],
  } });
  await assert.rejects(
    () => createGithubAppInstallationToken(baseEnv, fetchImpl, now),
    /not scoped exclusively to GLORIFIER7\/GLORIFIER/,
  );
});

test('GitHub App authentication rejects missing app credentials before making any request', async () => {
  let requested = false;
  await assert.rejects(
    () => createGithubAppInstallationToken({ GLORIFIER_GITHUB_WRITE_TOKEN: 'legacy' }, async () => {
      requested = true;
      return Response.json({});
    }, now),
    /Owner-controlled GitHub App credentials are not configured/,
  );
  assert.equal(requested, false);
});


test('GitHub App fails closed when it has permissions outside the approved writer scope', async () => {
  const { fetchImpl } = fakeFetch({ app: {
    id: 12345,
    slug: 'glorifier-contributor',
    owner: { login: 'GLORIFIER7' },
    permissions: { contents: 'write', pull_requests: 'write', administration: 'write' },
  } });
  await assert.rejects(
    () => createGithubAppInstallationToken(baseEnv, fetchImpl, now),
    /only contents:write, pull_requests:write/,
  );
});

test('GitHub App fails closed when installation token carries an extra permission', async () => {
  const { fetchImpl } = fakeFetch({ installation: {
    token: 'ghs_test_installation_token',
    expires_at: new Date(now + 60 * 60_000).toISOString(),
    permissions: { contents: 'write', pull_requests: 'write', actions: 'write' },
    repositories: [{ full_name: 'GLORIFIER7/GLORIFIER' }],
  } });
  await assert.rejects(
    () => createGithubAppInstallationToken(baseEnv, fetchImpl, now),
    /only contents:write, pull_requests:write/,
  );
});

test('GitHub App response bodies are cancelled when they exceed the bounded stream limit', async () => {
  let cancelled = false;
  const fetchImpl = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === '/app') {
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(32_001).fill(65));
        },
        cancel() { cancelled = true; },
      }));
    }
    throw new Error('installation request must not run after oversized response');
  };
  await assert.rejects(
    () => createGithubAppInstallationToken(baseEnv, fetchImpl, now),
    /response exceeded the configured size limit/,
  );
  assert.equal(cancelled, true);
});


test('GitHub App rejects excessive app-level permissions before creating an installation token', async () => {
  let installationRequested = false;
  const { fetchImpl } = fakeFetch({ app: {
    id: 12345,
    slug: 'glorifier-contributor',
    owner: { login: 'GLORIFIER7' },
    permissions: { contents: 'write', pull_requests: 'write', administration: 'write' },
  } });
  const guardedFetch = async (input: string | URL | Request, init?: RequestInit) => {
    if (new URL(String(input)).pathname.endsWith('/access_tokens')) installationRequested = true;
    return fetchImpl(input, init);
  };
  await assert.rejects(
    () => createGithubAppInstallationToken(baseEnv, guardedFetch, now),
    /only contents:write, pull_requests:write and optional metadata:read/,
  );
  assert.equal(installationRequested, false);
});

test('GitHub App rejects excessive installation permissions', async () => {
  const { fetchImpl } = fakeFetch({ installation: {
    token: 'ghs_test_installation_token',
    expires_at: new Date(now + 60 * 60_000).toISOString(),
    permissions: { contents: 'write', pull_requests: 'write', actions: 'write' },
    repositories: [{ full_name: 'GLORIFIER7/GLORIFIER' }],
  } });
  await assert.rejects(
    () => createGithubAppInstallationToken(baseEnv, fetchImpl, now),
    /only contents:write, pull_requests:write and optional metadata:read/,
  );
});
