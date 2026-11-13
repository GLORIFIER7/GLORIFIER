import { newId } from './new-id';
import { getPostgresPool } from './db/postgres';

export type AutopilotMissionStatus =
  | 'queued'
  | 'planning'
  | 'executing'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'reconciliation-required';

export type AutopilotMissionStepStatus =
  | 'pending'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'reconciliation-required';

export type AutopilotActionEffect = 'read-only' | 'reversible' | 'irreversible';

export type AutopilotMissionApproval = {
  approvedBy: string;
  approvedAt: string;
  evidenceRef?: string;
};

export type AutopilotMissionStep = {
  id: string;
  capability: string;
  objective: string;
  effect: AutopilotActionEffect;
  status: AutopilotMissionStepStatus;
  idempotencyKey: string;
  evidenceRefs: string[];
  approval?: AutopilotMissionApproval;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

export type AutopilotMission = {
  id: string;
  requester: string;
  idempotencyKey: string;
  title: string;
  objective: string;
  status: AutopilotMissionStatus;
  version: number;
  steps: AutopilotMissionStep[];
  evidenceRefs: string[];
  createdAt: string;
  updatedAt: string;
  nextRunAt?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  lastError?: string;
};

export type AutopilotMissionPlanStep = Pick<
  AutopilotMissionStep,
  'id' | 'capability' | 'objective' | 'effect'
>;

export interface AutopilotMissionStore {
  initialize(): Promise<void>;
  create(mission: AutopilotMission): Promise<AutopilotMission>;
  get(id: string): Promise<AutopilotMission | null>;
  list(requester: string | undefined, limit: number, allowAll?: boolean): Promise<AutopilotMission[]>;
  save(mission: AutopilotMission, expectedVersion: number): Promise<AutopilotMission | null>;
  claimNext(workerId: string, leaseMs: number, now: string): Promise<AutopilotMission | null>;
  recoverExpired(now: string): Promise<number>;
}

type AutopilotQueryResult = { rows: Array<Record<string, unknown>>; rowCount?: number | null };

class PostgresAutopilotMissionStore implements AutopilotMissionStore {
  async initialize(): Promise<void> {
    await getPostgresPool().query(`
      SELECT pg_advisory_xact_lock(hashtext('glorifier_autopilot_missions_schema_v1')::bigint);
      CREATE TABLE IF NOT EXISTS glorifier_autopilot_missions (
        id TEXT PRIMARY KEY,
        requester TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN (
          'queued', 'planning', 'executing', 'blocked',
          'completed', 'failed', 'cancelled', 'reconciliation-required'
        )),
        version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
        payload JSONB NOT NULL,
        next_run_at TIMESTAMPTZ,
        lease_owner TEXT,
        lease_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE (requester, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS idx_glorifier_autopilot_missions_status_due
        ON glorifier_autopilot_missions(status, next_run_at, created_at);
      CREATE INDEX IF NOT EXISTS idx_glorifier_autopilot_missions_requester_updated
        ON glorifier_autopilot_missions(requester, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_glorifier_autopilot_missions_lease
        ON glorifier_autopilot_missions(status, lease_expires_at);
    `);
  }

  async create(mission: AutopilotMission): Promise<AutopilotMission> {
    const payload = JSON.stringify(mission);
    const inserted = await getPostgresPool().query(
      `INSERT INTO glorifier_autopilot_missions
        (id, requester, idempotency_key, status, version, payload, next_run_at,
         lease_owner, lease_expires_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz,$8,$9::timestamptz,$10::timestamptz,$11::timestamptz)
       ON CONFLICT (requester, idempotency_key) DO NOTHING
       RETURNING payload`,
      [
        mission.id, mission.requester, mission.idempotencyKey, mission.status, mission.version,
        payload, mission.nextRunAt ?? null, mission.leaseOwner ?? null,
        mission.leaseExpiresAt ?? null, mission.createdAt, mission.updatedAt,
      ],
    );
    if (inserted.rows[0]?.payload) return parseMission(inserted.rows[0].payload);
    const existing = await getPostgresPool().query(
      'SELECT payload FROM glorifier_autopilot_missions WHERE requester = $1 AND idempotency_key = $2 LIMIT 1',
      [mission.requester, mission.idempotencyKey],
    );
    if (!existing.rows[0]?.payload) throw new Error('Mission idempotency conflict could not be reconciled.');
    return parseMission(existing.rows[0].payload);
  }

  async get(id: string): Promise<AutopilotMission | null> {
    const result = await getPostgresPool().query(
      'SELECT payload FROM glorifier_autopilot_missions WHERE id = $1 LIMIT 1',
      [id],
    );
    return result.rows[0]?.payload ? parseMission(result.rows[0].payload) : null;
  }

  async list(requester: string | undefined, limit: number, allowAll = false): Promise<AutopilotMission[]> {
    const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    if (!allowAll && (!requester || !requester.trim())) return [];
    const result = await getPostgresPool().query(
      allowAll
        ? 'SELECT payload FROM glorifier_autopilot_missions ORDER BY updated_at DESC LIMIT $1'
        : 'SELECT payload FROM glorifier_autopilot_missions WHERE requester = $1 ORDER BY updated_at DESC LIMIT $2',
      allowAll ? [boundedLimit] : [requester!.trim(), boundedLimit],
    );
    return result.rows
      .filter((row) => row.payload !== undefined && row.payload !== null)
      .map((row) => parseMission(row.payload));
  }

  async save(mission: AutopilotMission, expectedVersion: number): Promise<AutopilotMission | null> {
    const next = { ...mission, version: expectedVersion + 1 };
    const result = await getPostgresPool().query(
      `UPDATE glorifier_autopilot_missions
       SET status = $3,
           version = version + 1,
           payload = $4::jsonb,
           next_run_at = $5::timestamptz,
           lease_owner = $6,
           lease_expires_at = $7::timestamptz,
           updated_at = $8::timestamptz
       WHERE id = $1 AND version = $2
       RETURNING payload`,
      [
        mission.id, expectedVersion, next.status, JSON.stringify(next),
        next.nextRunAt ?? null, next.leaseOwner ?? null, next.leaseExpiresAt ?? null, next.updatedAt,
      ],
    );
    return result.rows[0]?.payload ? parseMission(result.rows[0].payload) : null;
  }

  async claimNext(workerId: string, leaseMs: number, now: string): Promise<AutopilotMission | null> {
    const result = await getPostgresPool().query(
      `WITH candidate AS (
         SELECT id
         FROM glorifier_autopilot_missions
         WHERE status = 'queued'
           AND (next_run_at IS NULL OR next_run_at <= $3::timestamptz)
           AND (lease_expires_at IS NULL OR lease_expires_at <= $3::timestamptz)
         ORDER BY COALESCE(next_run_at, created_at), created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE glorifier_autopilot_missions AS mission
       SET status = 'planning',
           version = mission.version + 1,
           lease_owner = $1,
           lease_expires_at = $3::timestamptz + ($2::bigint * INTERVAL '1 millisecond'),
           updated_at = $3::timestamptz,
           payload = mission.payload || jsonb_build_object(
             'status', 'planning',
             'version', mission.version + 1,
             'leaseOwner', $1,
             'leaseExpiresAt', ($3::timestamptz + ($2::bigint * INTERVAL '1 millisecond')),
             'updatedAt', $3::timestamptz
           )
       WHERE mission.id = (SELECT id FROM candidate)
       RETURNING mission.payload`,
      [workerId, leaseMs, now],
    );
    return result.rows[0]?.payload ? parseMission(result.rows[0].payload) : null;
  }

  async recoverExpired(now: string): Promise<number> {
    const result = await getPostgresPool().query(
      `UPDATE glorifier_autopilot_missions
       SET status = 'reconciliation-required',
           version = version + 1,
           lease_owner = NULL,
           lease_expires_at = NULL,
           updated_at = $1::timestamptz,
           payload = jsonb_set(
             jsonb_set(
               jsonb_set(
                 payload,
                 '{status}',
                 '"reconciliation-required"'::jsonb
               ),
               '{lastError}',
               to_jsonb('Expired execution lease; external side effects must be reconciled before any retry.'::text)
             ),
             '{steps}',
             COALESCE((
               SELECT jsonb_agg(
                 CASE WHEN step->>'status' = 'running'
                   THEN jsonb_set(step, '{status}', '"reconciliation-required"'::jsonb)
                   ELSE step
                 END
               )
               FROM jsonb_array_elements(COALESCE(payload->'steps', '[]'::jsonb)) AS step
             ), '[]'::jsonb)
           ) || jsonb_build_object(
             'version', version + 1,
             'leaseOwner', NULL,
             'leaseExpiresAt', NULL,
             'updatedAt', $1::timestamptz
           )
       WHERE status IN ('planning', 'executing')
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at <= $1::timestamptz
       RETURNING id`,
      [now],
    );
    return result.rowCount ?? result.rows.length;
  }
}

function parseMission(value: unknown): AutopilotMission {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object') throw new Error('Stored Autopilot mission payload is invalid.');
  return parsed as AutopilotMission;
}

const MAX_OBJECTIVE_LENGTH = 20_000;
const MAX_TITLE_LENGTH = 160;
const MAX_STEPS = 30;
const MIN_LEASE_MS = 30_000;
const MAX_LEASE_MS = 30 * 60_000;

function timestamp(value?: string): string {
  const candidate = value ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(candidate))) throw new Error('timestamp must be a valid ISO-8601 date.');
  return new Date(candidate).toISOString();
}

function requireNonEmpty(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${field} must not exceed ${maxLength} characters.`);
  return normalized;
}

function validateLease(leaseMs: number): void {
  if (!Number.isSafeInteger(leaseMs) || leaseMs < MIN_LEASE_MS || leaseMs > MAX_LEASE_MS) {
    throw new Error(`leaseMs must be between ${MIN_LEASE_MS} and ${MAX_LEASE_MS} milliseconds.`);
  }
}

async function saveMission(
  store: AutopilotMissionStore,
  current: AutopilotMission,
  patch: Partial<AutopilotMission>,
  now: string,
): Promise<AutopilotMission> {
  const next = { ...current, ...patch, id: current.id, requester: current.requester, idempotencyKey: current.idempotencyKey, createdAt: current.createdAt, updatedAt: timestamp(now) };
  const saved = await store.save(next, current.version);
  if (!saved) throw new Error(`Autopilot mission ${current.id} changed concurrently; reload before retrying.`);
  return saved;
}

export async function createAutopilotMission(
  store: AutopilotMissionStore,
  input: { requester: string; idempotencyKey: string; objective: string; title?: string; nextRunAt?: string; now?: string },
): Promise<AutopilotMission> {
  const requester = requireNonEmpty(input.requester, 'requester', 256);
  const idempotencyKey = requireNonEmpty(input.idempotencyKey, 'idempotencyKey', 128);
  const objective = requireNonEmpty(input.objective, 'objective', MAX_OBJECTIVE_LENGTH);
  const title = input.title === undefined
    ? objective.slice(0, MAX_TITLE_LENGTH)
    : requireNonEmpty(input.title, 'title', MAX_TITLE_LENGTH);
  const createdAt = timestamp(input.now);
  const nextRunAt = input.nextRunAt ? timestamp(input.nextRunAt) : undefined;
  const mission: AutopilotMission = {
    id: newId('mission'),
    requester,
    idempotencyKey,
    title,
    objective,
    status: 'queued',
    version: 1,
    steps: [],
    evidenceRefs: [],
    createdAt,
    updatedAt: createdAt,
    ...(nextRunAt ? { nextRunAt } : {}),
  };
  return store.create(mission);
}

export async function getAutopilotMission(
  store: AutopilotMissionStore,
  id: string,
  requester?: string,
  allowAll = false,
): Promise<AutopilotMission | null> {
  const normalizedId = requireNonEmpty(id, 'mission id', 256);
  if (!allowAll && (!requester || !requester.trim())) return null;
  const mission = await store.get(normalizedId);
  if (!mission || (!allowAll && mission.requester !== requester!.trim())) return null;
  return mission;
}

export async function listAutopilotMissions(
  store: AutopilotMissionStore,
  requester?: string,
  limit = 50,
  allowAll = false,
): Promise<AutopilotMission[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be an integer between 1 and 100.');
  if (!allowAll && (!requester || !requester.trim())) return [];
  return store.list(requester?.trim(), limit, allowAll);
}

export async function claimNextAutopilotMission(
  store: AutopilotMissionStore,
  workerId: string,
  leaseMs = 5 * 60_000,
  now = new Date().toISOString(),
): Promise<AutopilotMission | null> {
  const worker = requireNonEmpty(workerId, 'workerId', 256);
  validateLease(leaseMs);
  return store.claimNext(worker, leaseMs, timestamp(now));
}

export async function recordAutopilotMissionPlan(
  store: AutopilotMissionStore,
  missionId: string,
  expectedVersion: number,
  plan: AutopilotMissionPlanStep[],
  now = new Date().toISOString(),
): Promise<AutopilotMission> {
  if (!Array.isArray(plan) || plan.length < 1 || plan.length > MAX_STEPS) {
    throw new Error(`mission plan must contain between 1 and ${MAX_STEPS} steps.`);
  }
  const ids = new Set<string>();
  const steps: AutopilotMissionStep[] = plan.map((step) => {
    const id = requireNonEmpty(step.id, 'step id', 128);
    const capability = requireNonEmpty(step.capability, 'step capability', 128);
    const objective = requireNonEmpty(step.objective, 'step objective', MAX_OBJECTIVE_LENGTH);
    if (ids.has(id)) throw new Error('step identifiers must be unique.');
    ids.add(id);
    if (!['read-only', 'reversible', 'irreversible'].includes(step.effect)) throw new Error('step effect must be read-only, reversible, or irreversible.');
    return {
      id,
      capability,
      objective,
      effect: step.effect,
      status: 'pending',
      idempotencyKey: `mission:${missionId}:step:${id}`,
      evidenceRefs: [],
    };
  });
  const mission = await store.get(requireNonEmpty(missionId, 'mission id', 256));
  if (!mission) throw new Error('Autopilot mission not found.');
  if (mission.version !== expectedVersion) throw new Error(`Autopilot mission ${missionId} changed concurrently; reload before retrying.`);
  if (mission.status !== 'planning' || !mission.leaseOwner || !mission.leaseExpiresAt) {
    throw new Error('mission must hold an active planning lease before a plan can be recorded.');
  }
  if (Date.parse(mission.leaseExpiresAt) <= Date.parse(timestamp(now))) throw new Error('mission planning lease has expired.');
  if (mission.steps.length > 0) throw new Error('mission plan is already recorded.');
  return saveMission(store, mission, { status: 'executing', steps, lastError: undefined }, now);
}

export async function claimAutopilotMissionStep(
  store: AutopilotMissionStore,
  missionId: string,
  stepId: string,
  workerId: string,
  approval?: AutopilotMissionApproval,
  now = new Date().toISOString(),
): Promise<{ claimed: boolean; reason?: string; mission: AutopilotMission }> {
  const mission = await store.get(requireNonEmpty(missionId, 'mission id', 256));
  if (!mission) throw new Error('Autopilot mission not found.');
  const worker = requireNonEmpty(workerId, 'workerId', 256);
  const currentTime = timestamp(now);
  if (mission.status !== 'executing') throw new Error('mission is not in an executable state.');
  if (mission.leaseOwner !== worker || !mission.leaseExpiresAt || Date.parse(mission.leaseExpiresAt) <= Date.parse(currentTime)) {
    throw new Error('worker does not hold an active mission lease.');
  }
  const index = mission.steps.findIndex((step) => step.id === stepId);
  if (index < 0) throw new Error('Autopilot mission step not found.');
  const step = mission.steps[index];
  if (step.status !== 'pending') throw new Error('mission step is not pending and cannot be replayed.');
  if (step.effect === 'irreversible') {
    const approver = approval && typeof approval.approvedBy === 'string' ? approval.approvedBy.trim() : '';
    if (!approver || !approval?.approvedAt || !Number.isFinite(Date.parse(approval.approvedAt))) {
      return { claimed: false, reason: 'human-approval-required', mission };
    }
  }
  const updatedSteps = mission.steps.map((entry, position) => position === index
    ? {
        ...entry,
        status: 'running' as const,
        startedAt: currentTime,
        ...(approval ? { approval: { ...approval, approvedBy: approval.approvedBy.trim(), approvedAt: timestamp(approval.approvedAt) } } : {}),
      }
    : entry);
  const saved = await saveMission(store, mission, { steps: updatedSteps }, currentTime);
  return { claimed: true, mission: saved };
}

export async function completeAutopilotMissionStep(
  store: AutopilotMissionStore,
  missionId: string,
  stepId: string,
  expectedVersion: number,
  evidenceRefs: string[],
  now = new Date().toISOString(),
): Promise<AutopilotMission> {
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length < 1) throw new Error('completed mission steps require at least one evidence reference.');
  const refs = evidenceRefs.map((ref) => requireNonEmpty(ref, 'evidence reference', 2048));
  const mission = await store.get(requireNonEmpty(missionId, 'mission id', 256));
  if (!mission) throw new Error('Autopilot mission not found.');
  if (mission.version !== expectedVersion) throw new Error(`Autopilot mission ${missionId} changed concurrently; reload before retrying.`);
  const index = mission.steps.findIndex((step) => step.id === stepId);
  if (index < 0) throw new Error('Autopilot mission step not found.');
  const step = mission.steps[index];
  if (step.status !== 'running') throw new Error('only a running mission step can be completed.');
  if (step.effect === 'irreversible' && !step.approval) throw new Error('irreversible mission step is missing recorded human approval.');
  const updatedSteps = mission.steps.map((entry, position) => position === index
    ? { ...entry, status: 'completed' as const, completedAt: timestamp(now), evidenceRefs: [...new Set(refs)] }
    : entry);
  const allCompleted = updatedSteps.every((entry) => entry.status === 'completed');
  return saveMission(store, mission, {
    steps: updatedSteps,
    evidenceRefs: [...new Set([...mission.evidenceRefs, ...refs])],
    status: allCompleted ? 'completed' : 'executing',
    ...(allCompleted ? { leaseOwner: undefined, leaseExpiresAt: undefined } : {}),
  }, now);
}

export async function recoverAutopilotMissions(store: AutopilotMissionStore, now = new Date().toISOString()): Promise<number> {
  return store.recoverExpired(timestamp(now));
}

export async function initializeAutopilotMissionControl(storeOverride?: AutopilotMissionStore): Promise<boolean> {
  autopilotStore = null;
  autopilotPersistenceMode = 'uninitialized';
  if (!storeOverride && !process.env.DATABASE_URL) {
    autopilotPersistenceMode = 'unavailable';
    return false;
  }
  const store = storeOverride ?? new PostgresAutopilotMissionStore();
  await store.initialize();
  const recovered = await store.recoverExpired(new Date().toISOString());
  autopilotStore = store;
  autopilotPersistenceMode = storeOverride ? 'injected' : 'postgres';
  if (recovered > 0) {
    console.warn(`[Autopilot] moved ${recovered} expired mission(s) to reconciliation-required; automatic replay is disabled.`);
  }
  return true;
}

let autopilotStore: AutopilotMissionStore | null = null;
let autopilotPersistenceMode: 'uninitialized' | 'unavailable' | 'postgres' | 'injected' = 'uninitialized';

export function getAutopilotMissionStore(): AutopilotMissionStore | null {
  return autopilotStore;
}

export function getAutopilotMissionControlStatus() {
  return {
    mode: autopilotPersistenceMode,
    available: autopilotStore !== null,
    durable: autopilotPersistenceMode === 'postgres',
    missionQueue: autopilotStore !== null,
    automaticReplay: false,
    expiredExecutionPolicy: 'reconciliation-required',
    approvalBoundary: 'irreversible-actions-require-recorded-human-approval',
    nextCapabilities: ['event-driven-triggers', 'provider-backed-planning', 'approved-step-execution', 'evidence-reconciliation'],
  };
}

export async function recoverAutopilotMissionsIfAvailable(now = new Date().toISOString()): Promise<number> {
  if (!autopilotStore) return 0;
  return recoverAutopilotMissions(autopilotStore, now);
}
