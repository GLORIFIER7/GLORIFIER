import crypto from 'node:crypto';
import express, { type Request, type RequestHandler, type Response } from 'express';
import type { Pool } from 'pg';
import { A2A_JSONRPC_PATH, A2A_MACHINE_SCOPE, buildA2AOAuthMetadata, validatedA2AOrigin } from './a2a-v1';

// Self-service machine identity for A2A agents: OAuth 2.0 dynamic client registration
// (RFC 7591) plus the client credentials grant (RFC 6749 section 4.4). A machine token
// is accepted only on the A2A JSON-RPC endpoint and grants only requester-scoped task
// intake; submitted tasks still wait for human-owner approval before execution.
export const A2A_MACHINE_TOKEN_TTL_SECONDS = 600;
export const A2A_MACHINE_SUBJECT_PREFIX = 'a2a-client:';
export const A2A_MAX_MACHINE_CLIENTS = 10_000;
const MIN_SIGNING_SECRET_CHARS = 32;
const CLOCK_SKEW_SECONDS = 60;
const CLIENT_ID_PATTERN = /^a2a-client-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SECRET_PATTERN = /^a2as_[A-Za-z0-9_-]{43}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
const TOKEN_TYPE = 'at+jwt';

export interface A2AMachineClientRecord {
  clientId: string;
  clientName: string;
  secretSha256: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface A2AMachineClientStore {
  countActive(): Promise<number>;
  insert(record: A2AMachineClientRecord): Promise<void>;
  get(clientId: string): Promise<A2AMachineClientRecord | null>;
  revoke(clientId: string, revokedAt: string): Promise<boolean>;
}

export function createMemoryA2AMachineClientStore(): A2AMachineClientStore {
  const clients = new Map<string, A2AMachineClientRecord>();
  return {
    async countActive() { return [...clients.values()].filter((c) => !c.revokedAt).length; },
    async insert(record) {
      if (clients.has(record.clientId)) throw new Error('A2A client already exists.');
      clients.set(record.clientId, { ...record });
    },
    async get(clientId) { const c = clients.get(clientId); return c ? { ...c } : null; },
    async revoke(clientId, revokedAt) {
      const c = clients.get(clientId);
      if (!c || c.revokedAt) return false;
      c.revokedAt = revokedAt;
      return true;
    },
  };
}

const TABLE = 'glorifier_a2a_machine_clients';

export function createPostgresA2AMachineClientStore(getPool: () => Pool): A2AMachineClientStore {
  let ready: Promise<unknown> | null = null;
  const pool = async () => {
    const p = getPool();
    ready ??= p.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (client_id TEXT PRIMARY KEY, client_name TEXT NOT NULL, secret_sha256 TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ)`)
      .catch((error) => { ready = null; throw error; });
    await ready;
    return p;
  };
  const toRecord = (row: Record<string, unknown>): A2AMachineClientRecord => ({
    clientId: String(row.client_id),
    clientName: String(row.client_name),
    secretSha256: String(row.secret_sha256),
    createdAt: new Date(row.created_at as string).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at as string).toISOString() : null,
  });
  return {
    async countActive() {
      const r = await (await pool()).query(`SELECT COUNT(*)::int AS n FROM ${TABLE} WHERE revoked_at IS NULL`);
      return Number(r.rows[0]?.n ?? 0);
    },
    async insert(c) {
      await (await pool()).query(`INSERT INTO ${TABLE} (client_id, client_name, secret_sha256, created_at, revoked_at) VALUES ($1, $2, $3, $4, NULL)`, [c.clientId, c.clientName, c.secretSha256, c.createdAt]);
    },
    async get(clientId) {
      const r = await (await pool()).query(`SELECT client_id, client_name, secret_sha256, created_at, revoked_at FROM ${TABLE} WHERE client_id = $1`, [clientId]);
      return r.rows[0] ? toRecord(r.rows[0]) : null;
    },
    async revoke(clientId, revokedAt) {
      const r = await (await pool()).query(`UPDATE ${TABLE} SET revoked_at = $2 WHERE client_id = $1 AND revoked_at IS NULL`, [clientId, revokedAt]);
      return (r.rowCount ?? 0) === 1;
    },
  };
}

const sha256Hex = (value: string) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const b64urlJson = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Domain-separated HMAC key; null (fail closed) when the server secret is missing or weak. */
export function deriveA2AMachineTokenKey(signingSecret: string): Buffer | null {
  const secret = signingSecret.trim();
  if (secret.length < MIN_SIGNING_SECRET_CHARS) return null;
  return crypto.createHmac('sha256', secret).update('glorifier-a2a-machine-access-token-v1').digest();
}

export function issueA2AMachineAccessToken(key: Buffer, origin: string, clientId: string, nowSeconds: number): string {
  const header = b64urlJson({ alg: 'HS256', typ: TOKEN_TYPE });
  const payload = b64urlJson({
    iss: origin,
    aud: new URL(A2A_JSONRPC_PATH, origin).toString(),
    sub: A2A_MACHINE_SUBJECT_PREFIX + clientId,
    client_id: clientId,
    scope: A2A_MACHINE_SCOPE,
    iat: nowSeconds,
    exp: nowSeconds + A2A_MACHINE_TOKEN_TTL_SECONDS,
    jti: crypto.randomUUID(),
  });
  const signature = crypto.createHmac('sha256', key).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/** Returns the client ID of a structurally valid, unexpired, correctly signed token, else null. */
export function verifyA2AMachineAccessToken(key: Buffer, origin: string, token: string, nowSeconds: number): string | null {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts.every((p) => B64URL.test(p))) return null;
  const expected = crypto.createHmac('sha256', key).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (!safeEqual(expected, parts[2])) return null;
  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isRecord(header) || Object.keys(header).length !== 2 || header.alg !== 'HS256' || header.typ !== TOKEN_TYPE) return null;
  if (!isRecord(payload)) return null;
  const { iss, aud, sub, client_id: clientId, scope, iat, exp } = payload;
  if (iss !== origin || aud !== new URL(A2A_JSONRPC_PATH, origin).toString() || scope !== A2A_MACHINE_SCOPE) return null;
  if (typeof clientId !== 'string' || !CLIENT_ID_PATTERN.test(clientId) || sub !== A2A_MACHINE_SUBJECT_PREFIX + clientId) return null;
  if (!Number.isSafeInteger(iat) || !Number.isSafeInteger(exp)) return null;
  const issuedAt = iat as number;
  const expiresAt = exp as number;
  if (expiresAt - issuedAt !== A2A_MACHINE_TOKEN_TTL_SECONDS || issuedAt > nowSeconds + CLOCK_SKEW_SECONDS || expiresAt <= nowSeconds) return null;
  return clientId;
}

export interface A2AMachineAuthDependencies {
  getStore(): A2AMachineClientStore | null;
  getSigningSecret(): string;
  getPublicBaseUrl(): string;
  /** Owner-only guard for revocation; never public. */
  requireOwner: RequestHandler;
  nowMs?(): number;
}

interface ResolvedConfig { store: A2AMachineClientStore; key: Buffer; origin: string }

function resolveConfig(deps: A2AMachineAuthDependencies): ResolvedConfig | null {
  const store = deps.getStore();
  const key = deriveA2AMachineTokenKey(deps.getSigningSecret());
  let origin: string;
  try {
    origin = validatedA2AOrigin(deps.getPublicBaseUrl().trim());
  } catch {
    return null;
  }
  return store && key ? { store, key, origin } : null;
}

const nowSeconds = (deps: A2AMachineAuthDependencies) => Math.floor((deps.nowMs?.() ?? Date.now()) / 1000);

/**
 * Resolve the requester identity for a machine bearer token on the A2A endpoint.
 * Returns null for anything that is not a valid, unrevoked machine token so the caller
 * can fall back to user authentication.
 */
export function createA2AMachineIdentityResolver(deps: A2AMachineAuthDependencies) {
  return async (authorization: string | undefined): Promise<string | null> => {
    const match = /^Bearer +([A-Za-z0-9_.-]{1,2048})$/i.exec(authorization ?? '');
    if (!match) return null;
    const config = resolveConfig(deps);
    if (!config) return null;
    const clientId = verifyA2AMachineAccessToken(config.key, config.origin, match[1], nowSeconds(deps));
    if (!clientId) return null;
    try {
      const client = await config.store.get(clientId);
      return client && !client.revokedAt ? A2A_MACHINE_SUBJECT_PREFIX + clientId : null;
    } catch {
      return null;
    }
  };
}

const noStore = (res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
};
const oauthError = (res: Response, status: number, error: string, description: string) =>
  res.status(status).json({ error, error_description: description });

function parseBasicCredentials(header: string | undefined): { clientId: string; clientSecret: string } | null | 'invalid' {
  if (!header) return null;
  const match = /^Basic +([A-Za-z0-9+/]+={0,2})$/i.exec(header);
  if (!match) return 'invalid';
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) return 'invalid';
  try {
    return {
      clientId: decodeURIComponent(decoded.slice(0, separator).replace(/\+/g, ' ')),
      clientSecret: decodeURIComponent(decoded.slice(separator + 1).replace(/\+/g, ' ')),
    };
  } catch {
    return 'invalid';
  }
}

export function createA2AMachineAuthRouter(deps: A2AMachineAuthDependencies) {
  const router = express.Router();

  router.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
    noStore(res);
    try {
      return res.json(buildA2AOAuthMetadata(deps.getPublicBaseUrl().trim()));
    } catch {
      return res.status(503).json({ ok: false, code: 'A2A_PUBLIC_URL_NOT_CONFIGURED' });
    }
  });

  router.post('/api/a2a/oauth/register', async (req: Request, res: Response) => {
    noStore(res);
    const config = resolveConfig(deps);
    if (!config) return oauthError(res, 503, 'temporarily_unavailable', 'A2A machine registration is not configured.');
    if (!req.is('application/json')) return oauthError(res, 400, 'invalid_client_metadata', 'Content-Type must be application/json.');
    const body: unknown = req.body ?? {};
    if (!isRecord(body)) return oauthError(res, 400, 'invalid_client_metadata', 'Client metadata must be a JSON object.');
    const name = body.client_name ?? 'A2A agent';
    if (typeof name !== 'string' || !/^[\x20-\x7E]{1,100}$/.test(name)) return oauthError(res, 400, 'invalid_client_metadata', 'client_name must be 1-100 printable ASCII characters.');
    if (body.grant_types !== undefined && !(Array.isArray(body.grant_types) && body.grant_types.length === 1 && body.grant_types[0] === 'client_credentials')) {
      return oauthError(res, 400, 'invalid_client_metadata', 'Only the client_credentials grant is supported.');
    }
    if (body.response_types !== undefined && !(Array.isArray(body.response_types) && body.response_types.length === 0)) {
      return oauthError(res, 400, 'invalid_client_metadata', 'No response types are supported.');
    }
    const method = body.token_endpoint_auth_method ?? 'client_secret_basic';
    if (method !== 'client_secret_basic' && method !== 'client_secret_post') return oauthError(res, 400, 'invalid_client_metadata', 'Unsupported token_endpoint_auth_method.');
    if (body.scope !== undefined && body.scope !== A2A_MACHINE_SCOPE) return oauthError(res, 400, 'invalid_client_metadata', `Only the ${A2A_MACHINE_SCOPE} scope is available.`);
    try {
      if (await config.store.countActive() >= A2A_MAX_MACHINE_CLIENTS) return oauthError(res, 503, 'temporarily_unavailable', 'A2A machine client capacity reached.');
      const clientId = `a2a-client-${crypto.randomUUID()}`;
      const clientSecret = `a2as_${crypto.randomBytes(32).toString('base64url')}`;
      const issuedAt = nowSeconds(deps);
      await config.store.insert({ clientId, clientName: name, secretSha256: sha256Hex(clientSecret), createdAt: new Date(issuedAt * 1000).toISOString(), revokedAt: null });
      return res.status(201).json({
        client_id: clientId,
        client_secret: clientSecret,
        client_id_issued_at: issuedAt,
        client_secret_expires_at: 0,
        client_name: name,
        grant_types: ['client_credentials'],
        response_types: [],
        token_endpoint_auth_method: method,
        scope: A2A_MACHINE_SCOPE,
      });
    } catch {
      return oauthError(res, 503, 'temporarily_unavailable', 'A2A machine client storage is unavailable.');
    }
  });

  router.post('/api/a2a/oauth/token', express.urlencoded({ extended: false, limit: '4kb', parameterLimit: 10 }), async (req: Request, res: Response) => {
    noStore(res);
    const config = resolveConfig(deps);
    if (!config) return oauthError(res, 503, 'temporarily_unavailable', 'A2A machine token issuance is not configured.');
    if (!req.is('application/x-www-form-urlencoded')) return oauthError(res, 400, 'invalid_request', 'Content-Type must be application/x-www-form-urlencoded.');
    const form: Record<string, unknown> = isRecord(req.body) ? req.body : {};
    const basic = parseBasicCredentials(req.get('authorization'));
    const usesBody = form.client_id !== undefined || form.client_secret !== undefined;
    const challenge = () => { if (basic) res.setHeader('WWW-Authenticate', 'Basic realm="glorifier-a2a"'); };
    if (basic === 'invalid' || (basic && usesBody)) {
      challenge();
      return oauthError(res, 401, 'invalid_client', 'Use exactly one valid client authentication method.');
    }
    if (form.grant_type !== 'client_credentials') return oauthError(res, 400, 'unsupported_grant_type', 'Only grant_type=client_credentials is supported.');
    if (form.scope !== undefined && form.scope !== A2A_MACHINE_SCOPE) return oauthError(res, 400, 'invalid_scope', `Only the ${A2A_MACHINE_SCOPE} scope is available.`);
    const clientId = basic ? basic.clientId : form.client_id;
    const clientSecret = basic ? basic.clientSecret : form.client_secret;
    if (typeof clientId !== 'string' || typeof clientSecret !== 'string' || !CLIENT_ID_PATTERN.test(clientId) || !SECRET_PATTERN.test(clientSecret)) {
      challenge();
      return oauthError(res, 401, 'invalid_client', 'Client authentication failed.');
    }
    let client: A2AMachineClientRecord | null;
    try {
      client = await config.store.get(clientId);
    } catch {
      return oauthError(res, 503, 'temporarily_unavailable', 'A2A machine client storage is unavailable.');
    }
    if (!client || client.revokedAt || !safeEqual(client.secretSha256, sha256Hex(clientSecret))) {
      challenge();
      return oauthError(res, 401, 'invalid_client', 'Client authentication failed.');
    }
    return res.json({
      access_token: issueA2AMachineAccessToken(config.key, config.origin, clientId, nowSeconds(deps)),
      token_type: 'Bearer',
      expires_in: A2A_MACHINE_TOKEN_TTL_SECONDS,
      scope: A2A_MACHINE_SCOPE,
    });
  });

  router.post('/api/a2a/oauth/clients/:clientId/revoke', deps.requireOwner, async (req: Request, res: Response) => {
    noStore(res);
    const config = resolveConfig(deps);
    if (!config) return oauthError(res, 503, 'temporarily_unavailable', 'A2A machine registration is not configured.');
    const clientId = String(req.params.clientId ?? '');
    if (!CLIENT_ID_PATTERN.test(clientId)) return res.status(400).json({ ok: false, code: 'INVALID_A2A_CLIENT_ID' });
    try {
      const revoked = await config.store.revoke(clientId, new Date(nowSeconds(deps) * 1000).toISOString());
      return revoked ? res.json({ ok: true, clientId, revoked: true }) : res.status(404).json({ ok: false, code: 'A2A_CLIENT_NOT_ACTIVE' });
    } catch {
      return oauthError(res, 503, 'temporarily_unavailable', 'A2A machine client storage is unavailable.');
    }
  });

  return router;
}
