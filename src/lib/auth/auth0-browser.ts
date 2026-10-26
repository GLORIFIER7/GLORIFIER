export type Auth0BrowserPrincipal = { uid: string; email: string | null; displayName: string | null };

const ACCESS_TOKEN_KEY = 'glorifier_auth0_access_token';
const EXPIRES_AT_KEY = 'glorifier_auth0_expires_at';
const PRINCIPAL_KEY = 'glorifier_auth0_principal';
const STATE_KEY = 'glorifier_auth0_state';
const VERIFIER_KEY = 'glorifier_auth0_pkce_verifier';
const NONCE_KEY = 'glorifier_auth0_nonce';

function config() {
  const domain = (import.meta.env.VITE_AUTH0_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const clientId = (import.meta.env.VITE_AUTH0_CLIENT_ID || '').trim();
  const audience = (import.meta.env.VITE_AUTH0_AUDIENCE || '').trim();
  if (!domain || !clientId || !audience || domain.includes('/') || domain.includes('@')) return null;
  return { issuer: `https://${domain}/`, clientId, audience };
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomValue(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256(value: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')));
  } catch {
    return null;
  }
}

export function getAuth0AccessToken(): string | null {
  try {
    const token = sessionStorage.getItem(ACCESS_TOKEN_KEY);
    const expiresAt = Number(sessionStorage.getItem(EXPIRES_AT_KEY) || 0);
    if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 15_000) {
      clearAuth0Session();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function getAuth0Principal(): Auth0BrowserPrincipal | null {
  try {
    const raw = sessionStorage.getItem(PRINCIPAL_KEY);
    if (!raw || !getAuth0AccessToken()) return null;
    const parsed = JSON.parse(raw) as Auth0BrowserPrincipal;
    return typeof parsed.uid === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function clearAuth0Session(): void {
  try {
    [ACCESS_TOKEN_KEY, EXPIRES_AT_KEY, PRINCIPAL_KEY, STATE_KEY, VERIFIER_KEY, NONCE_KEY].forEach((key) => sessionStorage.removeItem(key));
  } catch {}
}

export async function loginWithAuth0(): Promise<void> {
  const settings = config();
  if (!settings) throw new Error('Auth0 sign-in is not configured. Set VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, and VITE_AUTH0_AUDIENCE.');
  if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    throw new Error('Auth0 sign-in requires HTTPS.');
  }
  const state = randomValue();
  const nonce = randomValue();
  const verifier = randomValue();
  const challenge = await sha256(verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(NONCE_KEY, nonce);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const redirectUri = window.location.origin + window.location.pathname;
  const authorize = new URL('authorize', settings.issuer);
  authorize.search = new URLSearchParams({
    response_type: 'code',
    response_mode: 'query',
    client_id: settings.clientId,
    redirect_uri: redirectUri,
    audience: settings.audience,
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  window.location.assign(authorize.toString());
}

export async function completeAuth0RedirectSignIn(): Promise<Auth0BrowserPrincipal | null> {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const returnedState = params.get('state');
  const oauthError = params.get('error_description') || params.get('error');
  if (!code && !oauthError) return getAuth0Principal();
  const settings = config();
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expectedNonce = sessionStorage.getItem(NONCE_KEY);
  const cleanUrl = window.location.pathname + window.location.hash;
  window.history.replaceState({}, document.title, cleanUrl);
  if (oauthError) {
    clearAuth0Session();
    throw new Error(`Auth0 sign-in failed: ${oauthError}`);
  }
  if (!settings || !code || !returnedState || returnedState !== expectedState || !verifier || !expectedNonce) {
    clearAuth0Session();
    throw new Error('Auth0 callback state validation failed. Restart sign-in.');
  }
  try {
    const response = await fetch(new URL('oauth/token', settings.issuer), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: settings.clientId,
        code,
        redirect_uri: window.location.origin + window.location.pathname,
        code_verifier: verifier,
      }),
    });
    if (!response.ok) throw new Error('Auth0 authorization-code exchange failed.');
    const result = await response.json() as { access_token?: string; id_token?: string; expires_in?: number; token_type?: string };
    if (result.token_type?.toLowerCase() !== 'bearer' || !result.access_token || !result.id_token || !Number.isFinite(result.expires_in)) {
      throw new Error('Auth0 returned an incomplete token response.');
    }
    const idClaims = decodeJwtPayload(result.id_token);
    const idAudiences = Array.isArray(idClaims?.aud) ? idClaims.aud : [idClaims?.aud];
    if (!idClaims || idClaims.iss !== settings.issuer || !idAudiences.includes(settings.clientId) || idClaims.nonce !== expectedNonce || typeof idClaims.sub !== 'string' || typeof idClaims.exp !== 'number' || idClaims.exp <= Math.floor(Date.now() / 1000)) {
      throw new Error('Auth0 ID-token issuer, audience, nonce, or subject did not match the login request.');
    }
    const principal: Auth0BrowserPrincipal = {
      uid: idClaims.sub,
      email: typeof idClaims.email === 'string' ? idClaims.email : null,
      displayName: typeof idClaims.name === 'string' ? idClaims.name : null,
    };
    sessionStorage.setItem(ACCESS_TOKEN_KEY, result.access_token);
    sessionStorage.setItem(EXPIRES_AT_KEY, String(Date.now() + Math.max(0, result.expires_in! - 30) * 1000));
    sessionStorage.setItem(PRINCIPAL_KEY, JSON.stringify(principal));
    [STATE_KEY, VERIFIER_KEY, NONCE_KEY].forEach((key) => sessionStorage.removeItem(key));
    return principal;
  } catch (error) {
    clearAuth0Session();
    throw error;
  }
}
