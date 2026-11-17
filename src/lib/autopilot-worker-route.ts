import {
  isWorkerInternalService,
  isWorkerOwner,
  verifyWorkerBearerToken,
  type WorkerAuthEnvironment,
} from './auth/worker-auth';
import type { WorkerNeonBinding } from './app-state-worker';
import {
  WorkerAutopilotMissionStore,
  WorkerAutopilotSchemaNotReadyError,
  type WorkerAutopilotMissionAccess,
} from './autopilot-worker-store';
import type { AutopilotMission, AutopilotMissionStore } from './autopilot-mission-control';

export type AutopilotWorkerRouteEnvironment = WorkerAuthEnvironment & {
  APP_STATE_HYPERDRIVE?: WorkerNeonBinding;
  GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS?: string;
  GLORIFIER_ENABLE_INFERENCE?: string;
  GLORIFIER_PAID_INFERENCE_AUTHORIZED?: string;
  GLORIFIER_WORKERS_PLAN?: string;
  GLORIFIER_WORKERS_PLAN_VERIFIED?: string;
  GLORIFIER_WORKERS_AI_FREE_ONLY?: string;
};

type AutopilotWorkerAccess = WorkerAutopilotMissionAccess & {
  source: 'owner' | 'internal-service';
};

type AutopilotWorkerStore = AutopilotMissionStore & {
  initialize(): Promise<void>;
};

export type AutopilotWorkerRouteDependencies = {
  authorize: (
    request: Request,
    environment: AutopilotWorkerRouteEnvironment,
  ) => Promise<AutopilotWorkerAccess | null>;
  createStore: (
    binding: WorkerNeonBinding,
    access: AutopilotWorkerAccess,
  ) => AutopilotWorkerStore;
  now: () => string;
  createId: () => string;
};

const STATUS_PATH = '/api/autopilot/status';
const MISSIONS_PATH = '/api/autopilot/missions';
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_OBJECTIVE_LENGTH = 20_000;
const MAX_TITLE_LENGTH = 160;
const RESPONSE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
});
const AUTH_HEADERS = Object.freeze({
  ...RESPONSE_HEADERS,
  'WWW-Authenticate': 'Bearer realm="GLORIFIER Autopilot"',
});

const jsonResponse = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = RESPONSE_HEADERS,
): Response => Response.json(body, { status, headers });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function isAutopilotPath(pathname: string): boolean {
  return pathname === STATUS_PATH ||
    pathname === MISSIONS_PATH ||
    /^\/api\/autopilot\/missions\/[^/]+$/.test(pathname);
}

async function defaultAuthorize(
  request: Request,
  environment: AutopilotWorkerRouteEnvironment,
): Promise<AutopilotWorkerAccess | null> {
  const identity = await verifyWorkerBearerToken(request, environment);
  if (identity && isWorkerOwner(identity, environment)) {
    return { requester: identity.uid, allowAll: true, source: 'owner' };
  }
  if (isWorkerInternalService(request, environment)) {
    return {
      requester: identity?.uid?.trim() || 'glorifier-internal-service',
      allowAll: true,
      source: 'internal-service',
    };
  }
  return null;
}

const defaultDependencies: AutopilotWorkerRouteDependencies = {
  authorize: defaultAuthorize,
  createStore: (binding, access) => new WorkerAutopilotMissionStore(binding, access),
  now: () => new Date().toISOString(),
  createId: () => `mission-${crypto.randomUUID()}`,
};

type BoundedBody =
  | { ok: true; text: string }
  | { ok: false; reason: 'too-large' | 'invalid' };

async function readBoundedBody(request: Request): Promise<BoundedBody> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) return { ok: false, reason: 'invalid' };
    const size = Number(declaredLength);
    if (!Number.isSafeInteger(size)) return { ok: false, reason: 'invalid' };
    if (size > MAX_REQUEST_BYTES) return { ok: false, reason: 'too-large' };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: true, text: '' };
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'too-large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const bytes = new Uint8Array(total);
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
}

function isJsonContentType(value: string): boolean {
  const mediaType = value.split(';', 1)[0].trim().toLowerCase();
  return mediaType === 'application/json' ||
    (mediaType.startsWith('application/') && mediaType.endsWith('+json'));
}

function inferenceAuthorized(environment: AutopilotWorkerRouteEnvironment): boolean {
  return environment.GLORIFIER_ENABLE_INFERENCE === 'true' &&
    environment.GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS === 'true' &&
    environment.GLORIFIER_PAID_INFERENCE_AUTHORIZED === 'true';
}

function buildWorkerControl() {
  return {
    mode: 'cloudflare-hyperdrive',
    available: true,
    durable: true,
    missionQueue: true,
    missionPersistence: 'available',
    autonomousPlanningEnabled: false,
    autonomousStepExecutionEnabled: false,
    readOnlyToolExecutionEnabled: false,
    writeToolExecutionEnabled: false,
    writeCredentialConfigured: false,
    writeCredentialPermissionVerification: 'not-configured',
    repositoryWriteScope: 'disabled',
    automaticPullRequestMergeEnabled: false,
    automaticProductionDeploymentEnabled: false,
    independentOutcomeVerificationEnabled: false,
    githubSourceReadbackVerificationEnabled: false,
    boundedReadOnlyRetryEnabled: false,
    eventDrivenTriggersEnabled: false,
    scheduledTriggerEnabled: true,
    scheduledTriggerCron: '*/5 * * * *',
    scheduledAnalysisMode: 'workers-ai-free-only-read-only',
    automaticReplay: false,
    expiredExecutionPolicy: 'reconciliation-required',
    approvalBoundary: 'irreversible-actions-require-recorded-human-approval',
    runtime: 'worker-native-scheduled-read-only-analysis',
  };
}

function buildWorkerOrchestration(environment: AutopilotWorkerRouteEnvironment) {
  const freePlanVerified = environment.GLORIFIER_WORKERS_PLAN === 'free' &&
    environment.GLORIFIER_WORKERS_PLAN_VERIFIED === 'true';
  const freeOnlyEnabled = environment.GLORIFIER_WORKERS_AI_FREE_ONLY === 'true';
  const inferenceEnabled = environment.GLORIFIER_ENABLE_INFERENCE === 'true';
  const externalEgressDisabled = environment.GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS === 'false';
  const paidInferenceDisabled = environment.GLORIFIER_PAID_INFERENCE_AUTHORIZED === 'false';
  const localGateReady = freePlanVerified && freeOnlyEnabled && inferenceEnabled &&
    externalEgressDisabled && paidInferenceDisabled;
  const reason = !freePlanVerified ? 'workers-free-plan-not-verified'
    : !freeOnlyEnabled ? 'workers-ai-free-only-mode-not-enabled'
    : !inferenceEnabled ? 'workers-ai-inference-not-owner-enabled'
    : !externalEgressDisabled ? 'external-data-egress-must-remain-disabled'
    : !paidInferenceDisabled ? 'paid-inference-must-remain-disabled'
    : 'neural-free-provider-readiness-probe-required';

  return {
    enabled: false,
    aiCeoConnected: false,
    specialistCouncilConnected: false,
    providerOrchestratorConnected: false,
    inferenceAuthorized: localGateReady,
    inferenceMode: localGateReady
      ? 'free-only-neural-readiness-required'
      : 'disabled-zero-paid-budget-default',
    selectedProvider: 'cloudflare_workers_ai',
    selectedModel: '@cf/google/gemma-4-26b-a4b-it',
    workersPlan: freePlanVerified ? 'free' : 'unverified',
    workersPlanVerified: freePlanVerified,
    workersAiFreeOnly: freeOnlyEnabled,
    a2aConnected: false,
    writeToolExecution: false,
    autoMerge: false,
    autoDeploy: false,
    externalActionExecution: false,
    scheduledReadOnlyAnalysis: localGateReady,
    reason,
    limitations: [
      'Scheduled cycles require both the GLORIFIER Worker and NEURAL to attest the exact Workers Free plan and free-only provider configuration.',
      'A cycle performs one bounded read-only analysis; it does not execute repository writes, external actions, merges, or deployments.',
      'Completed analysis remains blocked pending capability execution and independent external evidence verification.',
      'No mission is replayed automatically after a failed or interrupted execution.',
    ],
  };
}

function validIsoDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} must be a valid ISO-8601 timestamp.`);
  }
  return new Date(value).toISOString();
}

function buildMission(
  body: Record<string, unknown>,
  requester: string,
  idempotencyKey: string,
  now: string,
  id: string,
): AutopilotMission {
  const objective = typeof body.objective === 'string' ? body.objective.trim() : '';
  if (!objective || objective.length > MAX_OBJECTIVE_LENGTH) {
    throw new Error(`objective must contain between 1 and ${MAX_OBJECTIVE_LENGTH} characters.`);
  }
  const titleInput = body.title;
  const title = titleInput === undefined
    ? objective.slice(0, MAX_TITLE_LENGTH)
    : typeof titleInput === 'string'
      ? titleInput.trim()
      : '';
  if (!title || title.length > MAX_TITLE_LENGTH) {
    throw new Error(`title must contain between 1 and ${MAX_TITLE_LENGTH} characters.`);
  }
  const createdAt = new Date(now);
  if (!Number.isFinite(createdAt.getTime())) throw new Error('Worker clock returned an invalid timestamp.');
  const nextRunAt = validIsoDate(body.nextRunAt, 'nextRunAt');
  return {
    id,
    requester,
    idempotencyKey,
    title,
    objective,
    status: 'queued',
    verificationState: 'not-started',
    version: 1,
    steps: [],
    evidenceRefs: [],
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
    ...(nextRunAt ? { nextRunAt } : {}),
  };
}

function unavailableStoreResponse(error: unknown): Response {
  if (error instanceof WorkerAutopilotSchemaNotReadyError ||
      (isRecord(error) && error.code === 'AUTOPILOT_MISSION_SCHEMA_NOT_READY')) {
    return jsonResponse({
      ok: false,
      status: 'unavailable',
      code: 'AUTOPILOT_MISSION_SCHEMA_NOT_READY',
      error: 'The reviewed Neon Autopilot migration and Worker-role grants have not been applied.',
    }, 503);
  }
  return jsonResponse({
    ok: false,
    status: 'unavailable',
    code: 'AUTOPILOT_MISSION_STORE_UNAVAILABLE',
    error: 'The Cloudflare Autopilot mission store could not be reached.',
  }, 503);
}

/**
 * Worker-native Autopilot mission intake/read API. This intentionally ports
 * persistence only; it does not invoke AI providers or execute mission steps.
 */
export async function handleAutopilotWorkerRequest(
  request: Request,
  pathname: string,
  environment: AutopilotWorkerRouteEnvironment,
  dependencies: AutopilotWorkerRouteDependencies = defaultDependencies,
): Promise<Response | null> {
  if (!isAutopilotPath(pathname)) return null;
  if (pathname === STATUS_PATH && request.method !== 'GET') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, { ...RESPONSE_HEADERS, Allow: 'GET' });
  }
  if (pathname !== STATUS_PATH && pathname === MISSIONS_PATH && !['GET', 'POST'].includes(request.method)) {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, { ...RESPONSE_HEADERS, Allow: 'GET, POST' });
  }
  if (pathname.startsWith(`${MISSIONS_PATH}/`) && request.method !== 'GET') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, { ...RESPONSE_HEADERS, Allow: 'GET' });
  }

  let access: AutopilotWorkerAccess | null;
  try {
    access = await dependencies.authorize(request, environment);
  } catch {
    access = null;
  }
  if (!access || !access.requester?.trim() || access.allowAll !== true) {
    return jsonResponse({
      ok: false,
      status: 'unauthenticated',
      code: 'OWNER_OR_INTERNAL_SERVICE_REQUIRED',
      error: 'Autopilot mission control requires verified owner or internal-service authorization.',
    }, 401, AUTH_HEADERS);
  }

  const binding = environment.APP_STATE_HYPERDRIVE;
  if (!binding?.connectionString?.trim()) {
    return jsonResponse({
      ok: false,
      status: 'unavailable',
      code: 'AUTOPILOT_HYPERDRIVE_NOT_CONFIGURED',
      error: 'The dedicated Neon Hyperdrive binding is not configured.',
    }, 503);
  }

  let store: AutopilotWorkerStore;
  try {
    store = dependencies.createStore(binding, access);
    await store.initialize();
  } catch (error) {
    return unavailableStoreResponse(error);
  }

  if (pathname === STATUS_PATH) {
    return jsonResponse({
      ok: true,
      product: 'GLORIFIER Autopilot',
      purpose: 'Durable, governed mission intake on Cloudflare Workers.',
      control: buildWorkerControl(),
      orchestration: buildWorkerOrchestration(environment),
    });
  }

  if (pathname === MISSIONS_PATH && request.method === 'POST') {
    if (!isJsonContentType(request.headers.get('content-type') || '')) {
      return jsonResponse({ ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' }, 415);
    }
    const bounded = await readBoundedBody(request);
    if (!bounded.ok) {
      return jsonResponse({ ok: false, code: bounded.reason === 'too-large' ? 'REQUEST_BODY_TOO_LARGE' : 'INVALID_REQUEST_BODY' },
        bounded.reason === 'too-large' ? 413 : 400);
    }
    let body: unknown;
    try {
      body = bounded.text ? JSON.parse(bounded.text) : null;
    } catch {
      return jsonResponse({ ok: false, code: 'INVALID_JSON' }, 400);
    }
    if (!isRecord(body)) return jsonResponse({ ok: false, code: 'INVALID_REQUEST_BODY' }, 400);

    const idempotencyValue = request.headers.get('Idempotency-Key') || body.idempotencyKey;
    if (typeof idempotencyValue !== 'string' || !idempotencyValue.trim() || idempotencyValue.trim().length > 128) {
      return jsonResponse({
        ok: false,
        error: 'Idempotency-Key header or idempotencyKey body field is required.',
        code: 'IDEMPOTENCY_KEY_REQUIRED',
      }, 400);
    }
    let mission: AutopilotMission;
    try {
      mission = buildMission(
        body,
        access.requester.trim(),
        idempotencyValue.trim(),
        dependencies.now(),
        dependencies.createId(),
      );
    } catch (error) {
      return jsonResponse({
        ok: false,
        code: 'AUTOPILOT_MISSION_INVALID',
        error: error instanceof Error ? error.message : 'Autopilot mission could not be accepted.',
      }, 400);
    }

    try {
      const created = await store.create(mission);
      return jsonResponse({ ok: true, accepted: true, executionStarted: false, mission: created }, 201);
    } catch (error) {
      return unavailableStoreResponse(error);
    }
  }

  if (pathname === MISSIONS_PATH) {
    try {
      const missions = await store.list(access.requester.trim(), 50, true);
      return jsonResponse({ ok: true, missions, control: buildWorkerControl() });
    } catch (error) {
      return unavailableStoreResponse(error);
    }
  }

  const rawId = pathname.slice(`${MISSIONS_PATH}/`.length);
  let missionId: string;
  try {
    missionId = decodeURIComponent(rawId);
  } catch {
    return jsonResponse({ ok: false, code: 'INVALID_MISSION_ID' }, 400);
  }
  if (!missionId || missionId.length > 256 || missionId.includes('/')) {
    return jsonResponse({ ok: false, code: 'INVALID_MISSION_ID' }, 400);
  }
  try {
    const mission = await store.get(missionId);
    if (!mission) return jsonResponse({ ok: false, error: 'Mission not found' }, 404);
    return jsonResponse({ ok: true, mission });
  } catch (error) {
    return unavailableStoreResponse(error);
  }
}
