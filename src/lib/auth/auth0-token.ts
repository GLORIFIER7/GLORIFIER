import { createPublicKey, verify as verifySignature, type JsonWebKey } from 'node:crypto';

export interface Auth0Principal {
  uid: string;
  sub: string;
  iss: string;
  aud: string | string[];
  email?: string;
  email_verified?: boolean;
  iat: number;
  exp: number;
}

type JwtHeader = { alg?: string; kid?: string; typ?: string };
type JwtPayload = Record<string, unknown> & {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  email?: string;
  email_verified?: boolean;
};
type JwkSet = { keys?: Array<JsonWebKey & { kid?: string; use?: string; alg?: string }> };

const jwksCache = new Map<string, { expiresAt: number; keys: JwkSet['keys'] }>();
const jwksRefreshAt = new Map<string, number>();
const JWKS_REFRESH_COOLDOWN_MS = 30_000;

function decodePart<T>(part: string): T {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
}

export function configuredAuth0Issuer(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.AUTH0_ISSUER_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url.href.endsWith('/') ? url.href : `${url.href}/`;
  } catch {
    return null;
  }
}

/** Validate an Auth0 API access token. No unverified claim is used for authorization. */
export async function verifyAuth0AccessToken(
  token: string,
  options: {
    env?: NodeJS.ProcessEnv;
    fetcher?: typeof fetch;
    nowSeconds?: number;
  } = {},
): Promise<Auth0Principal | null> {
  const env = options.env ?? process.env;
  const issuer = configuredAuth0Issuer(env);
  const audience = env.AUTH0_AUDIENCE?.trim();
  if (!issuer || !audience || !token || token.length > 16_384) return null;

  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return null;

  try {
    const header = decodePart<JwtHeader>(parts[0]);
    const payload = decodePart<JwtPayload>(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) return null;
    if (payload.iss !== issuer || !payload.sub || typeof payload.sub !== 'string') return null;
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(audience)) return null;

    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    if (typeof payload.iat !== 'number' || payload.iat > now + 60) return null;
    if (typeof payload.nbf === 'number' && payload.nbf > now) return null;

    const fetcher = options.fetcher ?? fetch;
    let entry = jwksCache.get(issuer);
    const cacheIsFresh = Boolean(entry && entry.expiresAt > Date.now());
    const requestedKeyIsCached = cacheIsFresh && entry?.keys?.some((key) => key.kid === header.kid);
    if (!requestedKeyIsCached) {
      const refreshStartedAt = Date.now();
      const lastRefreshAt = jwksRefreshAt.get(issuer) ?? 0;
      if (refreshStartedAt - lastRefreshAt < JWKS_REFRESH_COOLDOWN_MS) {
        // Fail closed while a recent refresh is cooling down. Do not trust expired
        // keys or let attacker-controlled kid values amplify outbound JWKS traffic.
        return null;
      }
      // Record before awaiting the network so concurrent unknown-kid requests share
      // the same cooldown instead of each starting an outbound request.
      jwksRefreshAt.set(issuer, refreshStartedAt);
      const response = await fetcher(new URL('.well-known/jwks.json', issuer), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;
      const jwks = await response.json() as JwkSet;
      if (!Array.isArray(jwks.keys) || jwks.keys.length === 0 || jwks.keys.length > 100) return null;
      entry = { keys: jwks.keys, expiresAt: Date.now() + 5 * 60 * 1000 };
      jwksCache.set(issuer, entry);
    }

    const jwk = entry.keys?.find((key) => key.kid === header.kid && key.kty === 'RSA' && (!key.use || key.use === 'sig') && (!key.alg || key.alg === 'RS256'));
    if (!jwk) return null;
    const publicKey = createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' });
    const signedData = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8');
    const signature = Buffer.from(parts[2], 'base64url');
    if (!verifySignature('RSA-SHA256', signedData, publicKey, signature)) return null;

    return {
      uid: payload.sub,
      sub: payload.sub,
      iss: issuer,
      aud: payload.aud as string | string[],
      ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
      ...(typeof payload.email_verified === 'boolean' ? { email_verified: payload.email_verified } : {}),
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

/** Cheap issuer routing only; the token is still fully verified before acceptance. */
export function tokenClaimsAuth0Issuer(token: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const issuer = configuredAuth0Issuer(env);
  if (!issuer) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = decodePart<JwtPayload>(parts[1]);
    return payload.iss === issuer;
  } catch {
    return false;
  }
}
