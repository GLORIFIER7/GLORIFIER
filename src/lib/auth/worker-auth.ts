export type WorkerAuthEnvironment = {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_WEB_API_KEY?: string;
  AUTH0_ISSUER_BASE_URL?: string;
  AUTH0_AUDIENCE?: string;
  GLORIFIER_OWNER_UID?: string;
  GLORIFIER_OWNER_EMAIL?: string;
  GLORIFIER_INTERNAL_SERVICE_TOKEN?: string;
};

export type WorkerIdentity = {
  uid: string;
  provider: 'firebase' | 'auth0';
  email: string | null;
  emailVerified: boolean;
  firebaseSignInProvider: string | null;
  claims: Record<string, unknown>;
};

export type WorkerAuthDependencies = {
  fetcher?: typeof fetch;
  nowSeconds?: number;
};

type JwtHeader = { alg?: string; kid?: string; typ?: string };
type JwtPayload = Record<string, unknown> & {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  auth_time?: number;
  email?: string;
  email_verified?: boolean;
  firebase?: { sign_in_provider?: string };
};
type Jwk = JsonWebKey & { kid?: string; use?: string; alg?: string; kty?: string };
type Jwks = { keys?: Jwk[] };
type CachedJwks = { expiresAt: number; keys: Jwk[] };

const MAX_BEARER_TOKEN_LENGTH = 16_384;
const JWKS_CACHE_TTL_MS = 5 * 60_000;
const JWKS_REFRESH_COOLDOWN_MS = 30_000;
const jwksCache = new Map<string, CachedJwks>();
const jwksRefreshAt = new Map<string, number>();
const jwksRefreshInFlight = new Map<string, Promise<Jwk[] | null>>();
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function decodeBase64Url(value: string): Uint8Array | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const standard = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, '=');
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function decodeJsonPart<T>(value: string): T | null {
  const bytes = decodeBase64Url(value);
  if (!bytes) return null;
  try {
    return JSON.parse(textDecoder.decode(bytes)) as T;
  } catch {
    return null;
  }
}

function decodeJwt(token: string): {
  header: JwtHeader;
  payload: JwtPayload;
  signingInput: string;
  signature: Uint8Array;
} | null {
  if (typeof token !== 'string' || token.length < 32 || token.length > MAX_BEARER_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !part)) return null;
  const header = decodeJsonPart<JwtHeader>(parts[0]);
  const payload = decodeJsonPart<JwtPayload>(parts[1]);
  const signature = decodeBase64Url(parts[2]);
  if (!header || !payload || !signature) return null;
  return { header, payload, signingInput: parts.slice(0, 2).join('.'), signature };
}

function bearerFromRequest(request: Request): string | null {
  const header = request.headers.get('authorization')?.trim() || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match || match[1].length > MAX_BEARER_TOKEN_LENGTH) return null;
  return match[1];
}

function validTimeClaims(payload: JwtPayload, nowSeconds: number): boolean {
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= nowSeconds) return false;
  if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat) || payload.iat > nowSeconds + 60) return false;
  if (payload.nbf !== undefined &&
      (typeof payload.nbf !== 'number' || !Number.isFinite(payload.nbf) || payload.nbf > nowSeconds)) return false;
  return true;
}

function normalizeAuth0Issuer(raw: string | undefined): string | null {
  const value = raw?.trim() || '';
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url.href.endsWith('/') ? url.href : `${url.href}/`;
  } catch {
    return null;
  }
}

async function fetchJwks(
  issuer: string,
  fetcher: typeof fetch,
  nowMilliseconds: number,
  requestedKid: string,
): Promise<Jwk[] | null> {
  const cached = jwksCache.get(issuer);
  const cacheIsFresh = Boolean(cached && cached.expiresAt > nowMilliseconds);
  const requestedKeyIsCached = cacheIsFresh && cached?.keys.some(key => key.kid === requestedKid);
  if (requestedKeyIsCached && cached) return cached.keys;

  // Share one refresh across concurrent unknown-kid requests. The caller still
  // matches its requested kid after this promise resolves and fails closed if
  // the key is absent. The per-issuer cooldown intentionally bounds refreshes
  // for random kid values; a second rotation during that window may be rejected
  // until the cooldown expires.
  const inFlight = jwksRefreshInFlight.get(issuer);
  if (inFlight) return inFlight;

  const lastRefresh = jwksRefreshAt.get(issuer) ?? 0;
  if (nowMilliseconds - lastRefresh < JWKS_REFRESH_COOLDOWN_MS) return null;
  jwksRefreshAt.set(issuer, nowMilliseconds);

  const refresh = (async (): Promise<Jwk[] | null> => {
    try {
      const response = await fetcher(new URL('.well-known/jwks.json', issuer), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return null;
      const body = await response.json() as Jwks;
      if (!Array.isArray(body.keys) || body.keys.length === 0 || body.keys.length > 100) return null;
      const keys = body.keys.filter(key =>
        key.kty === 'RSA' &&
        typeof key.kid === 'string' &&
        (!key.use || key.use === 'sig') &&
        (!key.alg || key.alg === 'RS256') &&
        typeof key.n === 'string' &&
        typeof key.e === 'string',
      );
      if (keys.length === 0) return null;
      jwksCache.set(issuer, { keys, expiresAt: Date.now() + JWKS_CACHE_TTL_MS });
      return keys;
    } catch {
      return null;
    }
  })();
  jwksRefreshInFlight.set(issuer, refresh);
  try {
    return await refresh;
  } finally {
    if (jwksRefreshInFlight.get(issuer) === refresh) jwksRefreshInFlight.delete(issuer);
  }
}

async function verifyAuth0Token(
  token: string,
  environment: WorkerAuthEnvironment,
  dependencies: WorkerAuthDependencies,
): Promise<WorkerIdentity | null> {
  const issuer = normalizeAuth0Issuer(environment.AUTH0_ISSUER_BASE_URL);
  const audience = environment.AUTH0_AUDIENCE?.trim();
  if (!issuer || !audience) return null;

  const jwt = decodeJwt(token);
  if (!jwt || jwt.header.alg !== 'RS256' || !jwt.header.kid) return null;
  const payload = jwt.payload;
  if (payload.iss !== issuer || typeof payload.sub !== 'string' || !payload.sub.trim()) return null;
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(audience) || !validTimeClaims(payload, dependencies.nowSeconds ?? Math.floor(Date.now() / 1000))) return null;

  const fetcher = dependencies.fetcher ?? fetch;
  const keys = await fetchJwks(issuer, fetcher, Date.now(), jwt.header.kid);
  const jwk = keys?.find(key => key.kid === jwt.header.kid);
  if (!jwk) return null;

  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const validSignature = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      publicKey,
      new Uint8Array(jwt.signature).buffer as ArrayBuffer,
      textEncoder.encode(jwt.signingInput).buffer as ArrayBuffer,
    );
    if (!validSignature) return null;
  } catch {
    return null;
  }

  return {
    uid: payload.sub,
    provider: 'auth0',
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: payload.email_verified === true,
    firebaseSignInProvider: null,
    // Auth0 role-like claims deliberately do not become GLORIFIER owner claims.
    claims: {},
  };
}

async function verifyFirebaseToken(
  token: string,
  environment: WorkerAuthEnvironment,
  dependencies: WorkerAuthDependencies,
): Promise<WorkerIdentity | null> {
  const projectId = environment.FIREBASE_PROJECT_ID?.trim();
  const apiKey = environment.FIREBASE_WEB_API_KEY?.trim();
  if (!projectId || !apiKey) return null;

  const jwt = decodeJwt(token);
  if (!jwt || jwt.header.alg !== 'RS256' || !jwt.header.kid) return null;
  const payload = jwt.payload;
  const now = dependencies.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (payload.iss !== `https://securetoken.google.com/${projectId}` ||
      payload.aud !== projectId ||
      typeof payload.sub !== 'string' ||
      !payload.sub.trim() ||
      typeof payload.auth_time !== 'number' ||
      !Number.isFinite(payload.auth_time) ||
      payload.auth_time > now + 60 ||
      !validTimeClaims(payload, now)) return null;

  const endpoint = new URL('https://identitytoolkit.googleapis.com/v1/accounts:lookup');
  endpoint.searchParams.set('key', apiKey);
  const fetcher = dependencies.fetcher ?? fetch;
  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const body = await response.json() as {
      users?: Array<{
        localId?: string;
        email?: string;
        emailVerified?: boolean;
        disabled?: boolean;
        validSince?: string | number;
      }>;
    };
    const users = body.users;
    if (!Array.isArray(users) || users.length !== 1) return null;
    const user = users[0];
    if (user.localId !== payload.sub || user.disabled === true) return null;

    // Identity Toolkit validates the signed Firebase ID token and returns the
    // user's current validSince value. Matching auth_time against validSince
    // preserves the revocation check that Firebase Admin performs when
    // verifyIdToken(token, true) is used by the legacy backend.
    const validSince = Number(user.validSince ?? 0);
    if (!Number.isFinite(validSince) || payload.auth_time <= validSince) return null;

    const firebaseClaims = payload.firebase && typeof payload.firebase === 'object'
      ? payload.firebase
      : {};
    const claims: Record<string, unknown> = {};
    if (payload.owner === true) claims.owner = true;
    if (payload.admin === true) claims.admin = true;
    if (typeof payload.role === 'string') claims.role = payload.role;

    return {
      uid: user.localId,
      provider: 'firebase',
      email: typeof user.email === 'string' ? user.email : (typeof payload.email === 'string' ? payload.email : null),
      emailVerified: user.emailVerified === true || payload.email_verified === true,
      firebaseSignInProvider: typeof firebaseClaims.sign_in_provider === 'string'
        ? firebaseClaims.sign_in_provider
        : null,
      claims,
    };
  } catch {
    return null;
  }
}

/**
 * Verify a Firebase ID token (including disabled/revoked account checks) or
 * an Auth0 RS256 access token. No decoded, unverified claim is returned to
 * callers unless Identity Toolkit or a cryptographic JWKS verification has
 * first established the token's authenticity.
 */
export async function verifyWorkerBearerToken(
  request: Request,
  environment: WorkerAuthEnvironment,
  dependencies: WorkerAuthDependencies = {},
): Promise<WorkerIdentity | null> {
  const token = bearerFromRequest(request);
  if (!token) return null;

  const issuer = normalizeAuth0Issuer(environment.AUTH0_ISSUER_BASE_URL);
  if (issuer) {
    const jwt = decodeJwt(token);
    if (jwt?.payload.iss === issuer) {
      return verifyAuth0Token(token, environment, dependencies);
    }
  }
  return verifyFirebaseToken(token, environment, dependencies);
}

export function isWorkerOwner(
  identity: WorkerIdentity,
  environment: WorkerAuthEnvironment,
): boolean {
  const ownerUid = environment.GLORIFIER_OWNER_UID?.trim();
  const ownerEmail = environment.GLORIFIER_OWNER_EMAIL?.trim().toLowerCase();
  const claims = identity.claims ?? {};
  if (identity.provider === 'firebase' &&
      (claims.owner === true || claims.admin === true || claims.role === 'owner')) return true;
  if (ownerUid && identity.uid === ownerUid) return true;
  return Boolean(
    ownerEmail &&
    identity.emailVerified &&
    identity.email?.trim().toLowerCase() === ownerEmail,
  );
}

export function isWorkerInternalService(
  request: Request,
  environment: WorkerAuthEnvironment,
): boolean {
  const configured = environment.GLORIFIER_INTERNAL_SERVICE_TOKEN?.trim() || '';
  const supplied = request.headers.get('x-glorifier-internal-token')?.trim() || '';
  if (!configured || !supplied) return false;
  const expectedBytes = textEncoder.encode(configured);
  const suppliedBytes = textEncoder.encode(supplied);
  if (expectedBytes.length !== suppliedBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= expectedBytes[index] ^ suppliedBytes[index];
  }
  return difference === 0;
}
