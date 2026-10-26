import { timingSafeEqual } from 'node:crypto';
import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import type { NextFunction, Request, Response } from 'express';
import { tokenClaimsAuth0Issuer, verifyAuth0AccessToken } from './auth0-token';

let adminReady = false;

function getAdminAuth() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (raw) {
      const serviceAccount = JSON.parse(raw);
      initializeApp({ credential: cert(serviceAccount) });
    } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
    } else {
      initializeApp({ credential: applicationDefault() });
    }
  }
  adminReady = true;
  return getAuth();
}

export async function initializeAuthenticationBackend() {
  try {
    getAdminAuth();
    return authenticationStatus();
  } catch (error) {
    adminReady = false;
    throw error;
  }
}

export interface AuthenticatedRequest extends Request {
  auth?: DecodedIdToken;
}

export async function verifyBearerToken(req: Request): Promise<DecodedIdToken | null> {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;
  try {
    if (tokenClaimsAuth0Issuer(token)) {
      const principal = await verifyAuth0AccessToken(token);
      if (!principal) return null;
      // Auth0 roles/owner-like claims are intentionally not copied into Firebase custom-claim fields.
      return {
        uid: principal.uid,
        sub: principal.sub,
        iss: principal.iss,
        aud: principal.aud,
        ...(principal.email ? { email: principal.email } : {}),
        ...(typeof principal.email_verified === 'boolean' ? { email_verified: principal.email_verified } : {}),
        iat: principal.iat,
        exp: principal.exp,
      } as unknown as DecodedIdToken;
    }
    return await getAdminAuth().verifyIdToken(token, true);
  } catch {
    return null;
  }
}

export function isInternalServiceRequest(req: Request): boolean {
  // Internal identity must be proven by the configured shared secret. Caller-controlled
  // marker, Host, forwarded-host, and network-address values are not authentication.
  const configured = process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN?.trim();
  const supplied = req.get('x-glorifier-internal-token')?.trim();
  if (!configured || !supplied) return false;
  const expectedBytes = Buffer.from(configured, 'utf8');
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  return expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes);
}

export type TokenVerifier = (req: Request) => Promise<DecodedIdToken | null>;

export function createRequireAuthentication(verify: TokenVerifier = verifyBearerToken) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (isInternalServiceRequest(req)) {
      req.auth = undefined;
      return next();
    }
    verify(req).then((decoded) => {
      if (!decoded) return res.status(401).json({ ok: false, error: 'Authentication required' });
      req.auth = decoded;
      next();
    }).catch(() => res.status(401).json({ ok: false, error: 'Authentication unavailable' }));
  };
}

export const requireAuthentication = createRequireAuthentication();

export function isOwner(decoded: DecodedIdToken): boolean {
  const ownerUid = process.env.GLORIFIER_OWNER_UID?.trim();
  const ownerEmail = process.env.GLORIFIER_OWNER_EMAIL?.trim().toLowerCase();
  const claims = decoded as DecodedIdToken & { owner?: boolean; admin?: boolean; role?: string };
  return Boolean(
    claims.owner === true ||
    claims.admin === true ||
    claims.role === 'owner' ||
    (ownerUid && decoded.uid === ownerUid) ||
    (ownerEmail && decoded.email?.toLowerCase() === ownerEmail)
  );
}

export function createRequireOwner(verify: TokenVerifier = verifyBearerToken) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    verify(req).then((decoded) => {
      if (!decoded) return res.status(401).json({ ok: false, error: 'Authentication required' });
      const ownerUid = process.env.GLORIFIER_OWNER_UID?.trim();
      const ownerEmail = process.env.GLORIFIER_OWNER_EMAIL?.trim().toLowerCase();
      const claims = decoded as DecodedIdToken & { owner?: boolean; admin?: boolean; role?: string };
      const matchesOwner = Boolean(
        claims.owner === true ||
        claims.admin === true ||
        claims.role === 'owner' ||
        (ownerUid && decoded.uid === ownerUid) ||
        (ownerEmail && decoded.email?.toLowerCase() === ownerEmail)
      );
      if (!matchesOwner) return res.status(403).json({ ok: false, error: 'Owner authorization required' });
      req.auth = decoded;
      next();
    }).catch(() => res.status(401).json({ ok: false, error: 'Authentication unavailable' }));
  };
}

export const requireOwner = createRequireOwner();

export function createRequireOwnerOrInternalService(verify: TokenVerifier = verifyBearerToken) {
  const requireVerifiedOwner = createRequireOwner(verify);
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (isInternalServiceRequest(req)) {
      req.auth = undefined;
      return next();
    }
    return requireVerifiedOwner(req, res, next);
  };
}

export const requireOwnerOrInternalService = createRequireOwnerOrInternalService();

export function authenticationStatus() {
  return {
    backendVerification: adminReady,
    providerConfigured: Boolean(process.env.FIREBASE_PROJECT_ID),
    provider: 'Firebase Authentication',
    mode: 'Firebase ID token + revocation check',
    ownerBindingConfigured: Boolean(process.env.GLORIFIER_OWNER_UID || process.env.GLORIFIER_OWNER_EMAIL),
    rule: 'Authentication and authorization are evaluated separately.'
  };
}
