import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import type { NextFunction, Request, Response } from 'express';

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
    return await getAdminAuth().verifyIdToken(token, true);
  } catch {
    return null;
  }
}

export function isInternalServiceRequest(req: Request): boolean {
  const configured = process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN?.trim();
  const supplied = req.get('x-glorifier-internal-token')?.trim();
  if (configured && supplied && supplied === configured) return true;
  const marker = req.get('x-glorifier-internal-service')?.trim();
  const remote = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  const privateIpv4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(remote);
  const privateIpv6 = remote.startsWith('fc') || remote.startsWith('fd') || remote === '::1';
  const host = String(req.get('host') || '').toLowerCase().replace(/:\d+$/, '');
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  const internalRailwayHost = host === 'glorifier-artificial-intelligence.railway.internal' || forwardedHost === 'glorifier-artificial-intelligence.railway.internal';
  return marker === 'permanent-orchestrator' && (privateIpv4 || privateIpv6 || internalRailwayHost);
}

export function requireAuthentication(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (isInternalServiceRequest(req)) {
    req.auth = undefined;
    return next();
  }
  verifyBearerToken(req).then((decoded) => {
    if (!decoded) return res.status(401).json({ ok: false, error: 'Authentication required' });
    req.auth = decoded;
    next();
  }).catch(() => res.status(401).json({ ok: false, error: 'Authentication unavailable' }));
}

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

export function requireOwnerOrInternalService(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (isInternalServiceRequest(req)) {
    req.auth = undefined;
    return next();
  }
  return requireOwner(req, res, next);
}

export function requireOwner(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  verifyBearerToken(req).then((decoded) => {
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
}

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
