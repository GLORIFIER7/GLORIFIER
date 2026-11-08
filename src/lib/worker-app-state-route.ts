import {
  getWorkerDatabaseSession,
  readWorkerAppState,
  upsertWorkerAppState,
  type WorkerAppState,
  type WorkerAppStateInput,
  type WorkerNeonBinding,
} from './app-state-worker';
import {
  isWorkerOwner,
  verifyWorkerBearerToken,
  type WorkerAuthEnvironment,
  type WorkerIdentity,
} from './auth/worker-auth';

export type WorkerAppStateRouteEnvironment = WorkerAuthEnvironment & {
  APP_STATE_HYPERDRIVE?: WorkerNeonBinding;
};

type WorkerDatabaseSession = Awaited<ReturnType<typeof getWorkerDatabaseSession>>;

export type WorkerAppStateRouteDependencies = {
  verify: (request: Request, environment: WorkerAppStateRouteEnvironment) => Promise<WorkerIdentity | null>;
  isOwner: (identity: WorkerIdentity, environment: WorkerAppStateRouteEnvironment) => boolean;
  read: (binding: WorkerNeonBinding, authenticatedUserId: string) => Promise<WorkerAppState>;
  write: (
    binding: WorkerNeonBinding,
    authenticatedUserId: string,
    payload: WorkerAppStateInput,
  ) => Promise<WorkerAppState>;
  session: (binding: WorkerNeonBinding) => Promise<WorkerDatabaseSession>;
};

const MAX_APP_STATE_BODY_BYTES = 1_048_576;
const RESPONSE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const AUTH_REQUIRED_HEADERS = {
  ...RESPONSE_HEADERS,
  'WWW-Authenticate': 'Bearer realm="GLORIFIER"',
};

const defaultDependencies: WorkerAppStateRouteDependencies = {
  verify: verifyWorkerBearerToken,
  isOwner: isWorkerOwner,
  read: readWorkerAppState,
  write: upsertWorkerAppState,
  session: getWorkerDatabaseSession,
};

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = RESPONSE_HEADERS): Response =>
  Response.json(body, { status, headers });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isJsonContentType = (value: string): boolean => {
  const mediaType = value.split(';', 1)[0].trim().toLowerCase();
  return mediaType === 'application/json' ||
    (mediaType.startsWith('application/') && mediaType.endsWith('+json'));
};

const hasBearerToken = (request: Request): boolean =>
  /^Bearer\s+\S+$/i.test((request.headers.get('authorization') || '').trim());

const hasIdentityProviderConfiguration = (environment: WorkerAppStateRouteEnvironment): boolean =>
  Boolean(
    (environment.FIREBASE_PROJECT_ID?.trim() && environment.FIREBASE_WEB_API_KEY?.trim()) ||
    (environment.AUTH0_ISSUER_BASE_URL?.trim() && environment.AUTH0_AUDIENCE?.trim()),
  );

type BoundedBodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'too-large' | 'invalid' };

const readBoundedBody = async (request: Request): Promise<BoundedBodyResult> => {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) return { ok: false, reason: 'invalid' };
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength)) return { ok: false, reason: 'invalid' };
    if (parsedLength > MAX_APP_STATE_BODY_BYTES) return { ok: false, reason: 'too-large' };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: true, text: '' };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_APP_STATE_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'too-large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
};

/**
 * Worker-native authenticated app-state routes. The authenticated token is the
 * sole authority for the user partition; request-body user references are not
 * forwarded to the database layer. The optional dependency seam keeps route
 * contract tests independent of real identity providers and database writes.
 */
export async function handleWorkerAppStateRequest(
  request: Request,
  pathname: string,
  environment: WorkerAppStateRouteEnvironment,
  dependencies: WorkerAppStateRouteDependencies = defaultDependencies,
): Promise<Response> {
  const isSessionRoute = pathname === '/api/auth/session';
  const isAppStateRoute = pathname === '/api/app-state';
  if (!isSessionRoute && !isAppStateRoute) {
    return jsonResponse({ ok: false, code: 'WORKER_ROUTE_NOT_FOUND' }, 404);
  }

  const allowedMethods = isSessionRoute ? ['GET'] : ['GET', 'PUT'];
  if (!allowedMethods.includes(request.method)) {
    return jsonResponse(
      { ok: false, code: 'METHOD_NOT_ALLOWED' },
      405,
      { ...RESPONSE_HEADERS, Allow: allowedMethods.join(', ') },
    );
  }

  if (!hasBearerToken(request)) {
    return jsonResponse(
      { ok: false, status: 'unauthenticated', error: 'Authentication is required.', code: 'AUTHENTICATION_REQUIRED' },
      401,
      AUTH_REQUIRED_HEADERS,
    );
  }

  if (!hasIdentityProviderConfiguration(environment)) {
    return jsonResponse(
      { ok: false, status: 'unavailable', code: 'WORKER_AUTH_NOT_CONFIGURED' },
      503,
    );
  }

  let identity: WorkerIdentity | null;
  try {
    identity = await dependencies.verify(request, environment);
  } catch {
    identity = null;
  }
  if (!identity || !identity.uid.trim()) {
    return jsonResponse(
      { ok: false, status: 'unauthenticated', error: 'The bearer credential could not be verified.', code: 'AUTHENTICATION_REQUIRED' },
      401,
      AUTH_REQUIRED_HEADERS,
    );
  }

  const binding = environment.APP_STATE_HYPERDRIVE;
  if (!binding?.connectionString?.trim()) {
    return jsonResponse(
      { ok: false, status: 'unavailable', code: 'APP_STATE_HYPERDRIVE_NOT_CONFIGURED' },
      503,
    );
  }

  if (isSessionRoute) {
    try {
      const database = await dependencies.session(binding);
      return jsonResponse({
        ok: true,
        authenticated: true,
        identity: {
          uid: identity.uid,
          email: identity.email,
          emailVerified: identity.emailVerified,
          provider: identity.provider,
        },
        database: { ...database, authority: 'Neon/PostgreSQL' },
        authorization: {
          owner: dependencies.isOwner(identity, environment),
          authenticationAndAuthorizationSeparate: true,
          humanFinalAuthority: true,
        },
      });
    } catch {
      return jsonResponse(
        { ok: false, status: 'unavailable', code: 'APP_STATE_DATABASE_UNAVAILABLE' },
        503,
      );
    }
  }

  if (request.method === 'GET') {
    try {
      const state = await dependencies.read(binding, identity.uid);
      return jsonResponse({ ok: true, state, identity: { uid: identity.uid } });
    } catch {
      return jsonResponse(
        { ok: false, status: 'unavailable', code: 'APP_STATE_DATABASE_UNAVAILABLE' },
        503,
      );
    }
  }

  if (!isJsonContentType(request.headers.get('content-type') || '')) {
    return jsonResponse({ ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' }, 415);
  }

  const body = await readBoundedBody(request);
  if (!body.ok) {
    if (body.reason === 'too-large') {
      return jsonResponse({ ok: false, code: 'REQUEST_BODY_TOO_LARGE' }, 413);
    }
    return jsonResponse({ ok: false, code: 'INVALID_REQUEST_BODY' }, 400);
  }

  let envelope: unknown;
  try {
    envelope = body.text ? JSON.parse(body.text) : null;
  } catch {
    return jsonResponse({ ok: false, code: 'INVALID_JSON' }, 400);
  }
  if (!isRecord(envelope) || !isRecord(envelope.state)) {
    return jsonResponse({ ok: false, code: 'INVALID_APP_STATE' }, 400);
  }

  try {
    const state = await dependencies.write(binding, identity.uid, envelope.state as WorkerAppStateInput);
    return jsonResponse({ ok: true, state, identity: { uid: identity.uid } });
  } catch {
    return jsonResponse(
      { ok: false, status: 'unavailable', code: 'APP_STATE_DATABASE_UNAVAILABLE' },
      503,
    );
  }
}
