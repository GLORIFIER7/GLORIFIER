import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  User,
  updateProfile,
  GithubAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { clearAuth0Session, getAuth0AccessToken, loginWithAuth0 as startAuth0Login } from './auth/auth0-browser';

export { completeAuth0RedirectSignIn, getAuth0Principal } from './auth/auth0-browser';

export const loginWithAuth0 = async () => {
  // Make provider selection deterministic when both providers have persisted sessions.
  clearAuth0Session();
  await signOut(auth);
  cachedAccessToken = null;
  return startAuth0Login();
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

const firestoreDbId = (firebaseConfig as any).firestoreDatabaseId || 'ai-studio-personaldatamone-2569f3c8-4865-4a6a-b7cf-da9a1de696fc';
export const db = getFirestore(app, firestoreDbId);
export const auth = getAuth(app);

// Keep the Firebase session across Vercel reloads/mobile browser navigation.
// This is especially important when Google OAuth returns through a full-page redirect.
export const authPersistenceReady = setPersistence(auth, browserLocalPersistence);

export const GMAIL_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.addons.current.action',
  'https://www.googleapis.com/auth/gmail.addons.current.message.action',
  'https://www.googleapis.com/auth/gmail.addons.current.message.metadata',
  'https://www.googleapis.com/auth/gmail.addons.current.message.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.insert',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.metadata',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
];

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.activity',
  'https://www.googleapis.com/auth/drive.activity.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.apps.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.install',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.photos.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.scripts',
];

export const ALL_WORKSPACE_SCOPES = [...GMAIL_SCOPES, ...DRIVE_SCOPES];

// Basic Google provider for Command Center sign-in.
// Workspace scopes are requested separately so normal login is not blocked by Gmail/Drive consent.
export const googleAuthProvider = new GoogleAuthProvider();

const workspaceAuthProvider = new GoogleAuthProvider();
ALL_WORKSPACE_SCOPES.forEach(scope => workspaceAuthProvider.addScope(scope));

let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const getAccessToken = (): string | null => cachedAccessToken;
export const setAccessToken = (token: string | null) => { cachedAccessToken = token; };

// Return a short-lived Firebase ID token for backend authentication.
export const getIdToken = async (): Promise<string | null> => {
  const user = auth.currentUser;
  if (user) return user.getIdToken();
  return getAuth0AccessToken();
};

// Central API authentication bridge: attach Firebase ID tokens only to trusted API origins.
// The configured API origin is explicit; never forward credentials to arbitrary external URLs.
const nativeFetch = typeof window !== 'undefined' ? window.fetch.bind(window) : null;
const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
let configuredApiOrigin: string | null = null;
let configuredApiPathPrefix = '';
try {
  if (configuredApiBase) {
    const configuredUrl = new URL(configuredApiBase);
    const isHttps = configuredUrl.protocol === 'https:';
    const isLoopbackHttp = configuredUrl.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(configuredUrl.hostname);
    if (isHttps || isLoopbackHttp) {
      if (configuredUrl.username || configuredUrl.password || configuredUrl.search || configuredUrl.hash) {
        console.error('VITE_API_BASE_URL must not include credentials, a query string, or a fragment; automatic Firebase auth is disabled for that origin.');
      } else {
        configuredApiOrigin = configuredUrl.origin;
        configuredApiPathPrefix = configuredUrl.pathname.replace(/\/$/, '');
      }
    } else {
      console.error('VITE_API_BASE_URL must use HTTPS except for loopback development; automatic Firebase auth is disabled for that origin.');
    }
  }
} catch {
  console.error('VITE_API_BASE_URL is invalid; automatic Firebase auth is disabled for the configured origin.');
}

const resolveRequestUrl = (input: RequestInfo | URL): URL | null => {
  try {
    let rawUrl: string;
    if (typeof input === 'string') rawUrl = input;
    else if (input instanceof URL) rawUrl = input.toString();
    else rawUrl = input.url;
    return new URL(rawUrl, window.location.origin);
  } catch {
    return null;
  }
};

const matchesApiPath = (pathname: string, prefix = ''): boolean => {
  const apiRoot = prefix ? `${prefix}/api` : '/api';
  return pathname === apiRoot || pathname.startsWith(`${apiRoot}/`);
};

const isTrustedApiUrl = (requestUrl: URL): boolean => {
  if (requestUrl.origin === window.location.origin) {
    return matchesApiPath(requestUrl.pathname);
  }
  return configuredApiOrigin !== null &&
    requestUrl.origin === configuredApiOrigin &&
    matchesApiPath(requestUrl.pathname, configuredApiPathPrefix);
};

const createAuthenticatedHeaders = async (input: RequestInfo | URL, init: RequestInit): Promise<Headers> => {
  const inputHeaders = typeof input === 'string' || input instanceof URL ? undefined : input.headers;
  const headers = new Headers(inputHeaders);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  if (!headers.has('Authorization')) {
    const token = await getIdToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
};

if (typeof window !== 'undefined' && nativeFetch) {
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const requestUrl = resolveRequestUrl(input);
    if (!requestUrl || !isTrustedApiUrl(requestUrl)) return nativeFetch(input, init);
    const headers = await createAuthenticatedHeaders(input, init);
    return nativeFetch(input, { ...init, headers });
  };
}

export const authenticatedFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const token = await getIdToken();
  if (!token) throw new Error('Authentication required. Please sign in again.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer ' + token);
  return fetch(input, { ...init, headers });
};

export const loginWithGoogle = async () => {
  try {
    isSigningIn = true;
    await authPersistenceReady;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      await signInWithRedirect(auth, googleAuthProvider);
      return { user: null, accessToken: null };
    }
    const result = await signInWithPopup(auth, googleAuthProvider);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    // Mobile browsers and restrictive popup policies can block signInWithPopup.
    // Fall back to Firebase's full-page OAuth redirect instead of silently failing.
    const code = error?.code || '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/internal-error'
    ) {
      await signInWithRedirect(auth, googleAuthProvider);
      return { user: null, accessToken: null };
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const completeGoogleRedirectSignIn = async () => {
  try {
    await authPersistenceReady;
    const result = await getRedirectResult(auth);
    if (!result) return null;
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google redirect sign-in failed:', error);
    try {
      sessionStorage.setItem('glorifier_google_auth_error', JSON.stringify({
        code: (error as any)?.code || 'auth/unknown',
        message: (error as any)?.message || 'Google sign-in failed.'
      }));
    } catch {}
    throw error;
  }
};

export const loginWithEmail = async (email: string, password: string) => {
  await authPersistenceReady;
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
};

export const registerWithEmail = async (email: string, password: string, displayName?: string) => {
  await authPersistenceReady;
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (displayName?.trim()) {
    await updateProfile(result.user, { displayName: displayName.trim() });
  }
  return result.user;
};

export const resetPassword = async (email: string) => {
  await authPersistenceReady;
  await sendPasswordResetEmail(auth, email.trim());
};

export const authorizeGoogleWorkspace = async () => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, workspaceAuthProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const logout = async () => {
  cachedAccessToken = null;
  clearAuth0Session();
  return await signOut(auth);
};

onAuthStateChanged(auth, (user) => {
  if (!user && !isSigningIn) cachedAccessToken = null;
});

export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase connection: client appears offline.');
    }
  }
}

export type { User };


export type SocialProviderId = 'google' | 'microsoft' | 'github' | 'facebook' | 'apple';

export const SOCIAL_PROVIDER_REGISTRY: Record<SocialProviderId, { label: string; enabled: boolean }> = {
  google: { label: 'Google', enabled: true },
  microsoft: { label: 'Microsoft', enabled: false },
  github: { label: 'GitHub', enabled: false },
  facebook: { label: 'Facebook', enabled: false },
  apple: { label: 'Apple', enabled: false },
};

const socialProvider = (id: SocialProviderId) => {
  switch (id) {
    case 'google': return googleAuthProvider;
    case 'microsoft': return new OAuthProvider('microsoft.com');
    case 'github': return new GithubAuthProvider();
    case 'facebook': return new FacebookAuthProvider();
    case 'apple': return new OAuthProvider('apple.com');
  }
};

export const loginWithSocialProvider = async (id: SocialProviderId) => {
  if (!SOCIAL_PROVIDER_REGISTRY[id].enabled) throw new Error(`${SOCIAL_PROVIDER_REGISTRY[id].label} sign-in is not enabled in Firebase yet.`);
  const provider = socialProvider(id);
  await authPersistenceReady;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    await signInWithRedirect(auth, provider);
    return { user: null, accessToken: null };
  }
  const result = await signInWithPopup(auth, provider);
  return { user: result.user, accessToken: cachedAccessToken };
};
