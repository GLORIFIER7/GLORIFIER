import { createSign } from 'node:crypto';

const API_ROOT = 'https://api.github.com';
const TARGET_REPOSITORY = 'GLORIFIER7/GLORIFIER';
const MAX_RESPONSE_CHARS = 32_000;
const MAX_JWT_LIFETIME_SECONDS = 540;
const MAX_INSTALLATION_TOKEN_LIFETIME_MS = 70 * 60_000;

type GithubAppEnvironment = Record<string, string | undefined>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

export interface GithubAppWriterIdentity {
  appId: number;
  appSlug: string;
  botLogin: string;
  installationId: number;
  repository: typeof TARGET_REPOSITORY;
}

export interface GithubAppInstallationToken {
  token: string;
  expiresAt: string;
  identity: GithubAppWriterIdentity;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readPositiveInteger = (value: string | undefined, label: string): number => {
  if (!value || !/^\d{1,16}$/.test(value.trim())) {
    throw new Error(label + ' must be a positive integer.');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(label + ' must be a positive integer.');
  }
  return parsed;
};

const base64Url = (value: string | Buffer): string =>
  Buffer.from(value).toString('base64url');

export function hasGithubAppWriteConfiguration(env: GithubAppEnvironment = process.env): boolean {
  const appId = typeof env.GLORIFIER_GITHUB_APP_ID === 'string'
    && /^\d{1,16}$/.test(env.GLORIFIER_GITHUB_APP_ID.trim());
  const installationId = typeof env.GLORIFIER_GITHUB_APP_INSTALLATION_ID === 'string'
    && /^\d{1,16}$/.test(env.GLORIFIER_GITHUB_APP_INSTALLATION_ID.trim());
  const privateKey = typeof env.GLORIFIER_GITHUB_APP_PRIVATE_KEY === 'string'
    && env.GLORIFIER_GITHUB_APP_PRIVATE_KEY.includes('PRIVATE KEY');
  const slug = typeof env.GLORIFIER_GITHUB_APP_SLUG === 'string'
    && /^[a-z0-9-]{1,100}$/.test(env.GLORIFIER_GITHUB_APP_SLUG.trim());
  return appId && installationId && privateKey && slug;
}

function createAppJwt(appId: number, privateKey: string, nowMs: number): string {
  const issuedAt = Math.floor(nowMs / 1000) - 60;
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    iat: issuedAt,
    exp: issuedAt + MAX_JWT_LIFETIME_SECONDS,
    iss: appId,
  }));
  const signingInput = header + '.' + payload;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey, 'base64url');
  return signingInput + '.' + signature;
}

async function readBoundedResponseText(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_CHARS) {
        try { await reader.cancel(); } catch { /* retain bounded-response failure */ }
        throw new Error('GitHub App authentication response exceeded the configured size limit.');
      }
      chunks.push(value);
    }
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(combined);
  } finally {
    try { reader.releaseLock(); } catch { /* reader may already be cancelled */ }
  }
}

async function githubAppRequest(
  fetchImpl: FetchLike,
  path: string,
  authorization: string,
  method = 'GET',
  body?: JsonRecord,
): Promise<unknown> {
  const url = new URL(path, API_ROOT);
  const approvedPath = url.pathname === '/app' ||
    /^\/app\/installations\/\d+\/access_tokens$/.test(url.pathname);
  if (url.origin !== API_ROOT || url.protocol !== 'https:' || !approvedPath) {
    throw new Error('Blocked GitHub App authentication request outside approved GitHub App endpoints.');
  }
  const response = await fetchImpl(url.href, {
    method,
    headers: new Headers({
      Accept: 'application/vnd.github+json',
      Authorization: authorization,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'GLORIFIER-Owner-Controlled-GitHub-App',
    }),
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
  });
  const responseText = await readBoundedResponseText(response);
  let data: unknown = null;
  if (responseText) {
    try {
      data = JSON.parse(responseText) as unknown;
    } catch {
      throw new Error('GitHub App authentication received invalid JSON.');
    }
  }
  if (!response.ok) {
    const status = response.status;
    throw new Error('GitHub App authentication request failed (HTTP ' + status + ').');
  }
  return data;
}

export async function createGithubAppInstallationToken(
  env: GithubAppEnvironment = process.env,
  fetchImpl: FetchLike = fetch,
  nowMs = Date.now(),
): Promise<GithubAppInstallationToken> {
  if (!hasGithubAppWriteConfiguration(env)) {
    throw new Error('Owner-controlled GitHub App credentials are not configured; personal access tokens are not accepted for repository writes.');
  }
  if (!Number.isFinite(nowMs) || nowMs <= 0) {
    throw new Error('GitHub App authentication clock is invalid.');
  }

  const appId = readPositiveInteger(env.GLORIFIER_GITHUB_APP_ID, 'GLORIFIER_GITHUB_APP_ID');
  const installationId = readPositiveInteger(
    env.GLORIFIER_GITHUB_APP_INSTALLATION_ID,
    'GLORIFIER_GITHUB_APP_INSTALLATION_ID',
  );
  const expectedSlug = String(env.GLORIFIER_GITHUB_APP_SLUG || '').trim();
  const privateKey = String(env.GLORIFIER_GITHUB_APP_PRIVATE_KEY || '').trim().replace(/\\n/g, '\n');
  const jwt = createAppJwt(appId, privateKey, nowMs);
  const app = await githubAppRequest(fetchImpl, '/app', 'Bearer ' + jwt);

  if (!isRecord(app) || app.id !== appId) {
    throw new Error('Configured GLORIFIER GitHub App ID does not match the authenticated App.');
  }
  if (!isRecord(app.owner) || app.owner.login !== 'GLORIFIER7') {
    throw new Error('Configured GitHub App does not belong to the GLORIFIER7 owner.');
  }
  if (app.slug !== expectedSlug || typeof app.slug !== 'string') {
    throw new Error('GitHub App slug does not match the configured GLORIFIER App identity.');
  }
  const appPermissions = isRecord(app.permissions) ? app.permissions : {};
  const allowedPermissionNames = new Set(['metadata', 'contents', 'pull_requests']);
  if (appPermissions.contents !== 'write' || appPermissions.pull_requests !== 'write' ||
      (appPermissions.metadata !== undefined && appPermissions.metadata !== 'read') ||
      Object.keys(appPermissions).some(name => !allowedPermissionNames.has(name))) {
    throw new Error('GLORIFIER GitHub App may request only contents:write, pull_requests:write and optional metadata:read permissions.');
  }

  const installation = await githubAppRequest(
    fetchImpl,
    '/app/installations/' + installationId + '/access_tokens',
    'Bearer ' + jwt,
    'POST',
    { repositories: ['GLORIFIER'], permissions: { contents: 'write', pull_requests: 'write' } },
  );

  if (!isRecord(installation) || typeof installation.token !== 'string' ||
      !/^ghs_[A-Za-z0-9_]{20,}$/.test(installation.token)) {
    throw new Error('GitHub did not issue a valid installation access token.');
  }
  if (typeof installation.expires_at !== 'string') {
    throw new Error('GitHub App installation token has no expiry timestamp.');
  }
  const expiresAtMs = Date.parse(installation.expires_at);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs ||
      expiresAtMs > nowMs + MAX_INSTALLATION_TOKEN_LIFETIME_MS) {
    throw new Error('GitHub App installation token expiry is invalid or exceeds the allowed lifetime.');
  }

  const permissions = isRecord(installation.permissions) ? installation.permissions : {};
  const allowedPermissionNames = new Set(['metadata', 'contents', 'pull_requests']);
  if (permissions.contents !== 'write' || permissions.pull_requests !== 'write' ||
      (permissions.metadata !== undefined && permissions.metadata !== 'read') ||
      Object.keys(permissions).some(name => !allowedPermissionNames.has(name))) {
    throw new Error('GLORIFIER GitHub App installation must use only contents:write, pull_requests:write and optional metadata:read permissions.');
  }

  const repositories = Array.isArray(installation.repositories) ? installation.repositories : [];
  if (repositories.length !== 1 || !isRecord(repositories[0]) ||
      repositories[0].full_name !== TARGET_REPOSITORY) {
    throw new Error('GitHub App installation token is not scoped exclusively to GLORIFIER7/GLORIFIER.');
  }

  const identity: GithubAppWriterIdentity = {
    appId,
    appSlug: expectedSlug,
    botLogin: expectedSlug + '[bot]',
    installationId,
    repository: TARGET_REPOSITORY,
  };
  return {
    token: installation.token,
    expiresAt: installation.expires_at,
    identity,
  };
}
