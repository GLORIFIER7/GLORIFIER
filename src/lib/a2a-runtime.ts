import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { listAgentCards, routeAgentCapability } from './agent-runtime';

export type A2ATaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'blocked' | 'degraded' | 'canceled';
export type A2AProtocol = 'A2A' | 'MCP' | 'GLORIFIER-A2A-v1';

export interface A2ATask {
  id: string;
  parentTaskId: string | null;
  requesterAgentId: string;
  targetAgentId: string | null;
  capability: string;
  objective: string;
  input: unknown;
  status: A2ATaskStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  result?: unknown;
  error?: string;
  evidenceId?: string;
}

export interface A2AHandoff {
  protocol: A2AProtocol;
  version: '1';
  handoffId: string;
  taskId: string;
  fromAgentId: string;
  toAgentId: string;
  capability: string;
  objective: string;
  payload: unknown;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  signature: string;
  signatureAlgorithm: 'HMAC-SHA256';
}

const memoryTasks = new Map<string, A2ATask>();
const memoryHandoffs = new Map<string, A2AHandoff>();
let initializationPromise: Promise<void> | null = null;

function signingSecret() {
  return String(process.env.GLORIFIER_A2A_SIGNING_SECRET || '').trim();
}

function canonical(value: unknown) {
  return JSON.stringify(value);
}

function signatureInput(h: Omit<A2AHandoff, 'signature'>) {
  return canonical({
    protocol: h.protocol, version: h.version, handoffId: h.handoffId, taskId: h.taskId,
    fromAgentId: h.fromAgentId, toAgentId: h.toAgentId, capability: h.capability,
    objective: h.objective, payload: h.payload, issuedAt: h.issuedAt, expiresAt: h.expiresAt, nonce: h.nonce,
    signatureAlgorithm: h.signatureAlgorithm
  });
}

function sign(h: Omit<A2AHandoff, 'signature'>) {
  const secret = signingSecret();
  if (!secret) throw new Error('A2A signing is not configured');
  return crypto.createHmac('sha256', secret).update(signatureInput(h)).digest('base64url');
}

export function initializeA2ARuntime(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn('[A2A] DATABASE_URL is not configured; persistent task runtime initialization skipped.');
    return Promise.resolve();
  }
  if (initializationPromise) return initializationPromise;
  initializationPromise = getPostgresPool().query(`
    CREATE TABLE IF NOT EXISTS a2a_tasks (
      id TEXT PRIMARY KEY,
      parent_task_id TEXT,
      requester_agent_id TEXT NOT NULL,
      target_agent_id TEXT,
      capability TEXT NOT NULL,
      objective TEXT NOT NULL,
      input JSONB,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      result JSONB,
      error TEXT,
      evidence_id TEXT,
      idempotency_key TEXT,
      idempotency_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE a2a_tasks ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
    ALTER TABLE a2a_tasks ADD COLUMN IF NOT EXISTS idempotency_hash TEXT;
    CREATE INDEX IF NOT EXISTS idx_a2a_tasks_status ON a2a_tasks(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_a2a_tasks_requester_idempotency
      ON a2a_tasks(requester_agent_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    CREATE TABLE IF NOT EXISTS a2a_handoffs (
      handoff_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      from_agent_id TEXT NOT NULL,
      to_agent_id TEXT NOT NULL,
      envelope JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).then(() => undefined).catch((error) => {
    initializationPromise = null;
    console.warn('[A2A] persistence initialization deferred:', error?.message);
    throw error;
  });
  return initializationPromise;
}

async function persistTaskDurably(task: A2ATask): Promise<void> {
  await getPostgresPool().query(
    `INSERT INTO a2a_tasks(id,parent_task_id,requester_agent_id,target_agent_id,capability,objective,input,status,attempts,max_attempts,result,error,evidence_id,created_at,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,attempts=EXCLUDED.attempts,result=EXCLUDED.result,error=EXCLUDED.error,evidence_id=EXCLUDED.evidence_id,updated_at=EXCLUDED.updated_at`,
    [task.id, task.parentTaskId, task.requesterAgentId, task.targetAgentId, task.capability, task.objective,
      task.input ?? null, task.status, task.attempts, task.maxAttempts, task.result ?? null, task.error ?? null,
      task.evidenceId ?? null, task.createdAt, task.updatedAt]
  );
}

function persistTask(task: A2ATask) {
  memoryTasks.set(task.id, task);
  if (!process.env.DATABASE_URL) return;
  void persistTaskDurably(task).catch(error =>
    console.warn('[A2A] task persistence deferred:', error?.message),
  );
}

function persistHandoff(h: A2AHandoff) {
  memoryHandoffs.set(h.handoffId, h);
  if (!process.env.DATABASE_URL) return;
  try {
    void getPostgresPool().query(
      'INSERT INTO a2a_handoffs(handoff_id,task_id,from_agent_id,to_agent_id,envelope) VALUES($1,$2,$3,$4,$5) ON CONFLICT(handoff_id) DO NOTHING',
      [h.handoffId, h.taskId, h.fromAgentId, h.toAgentId, h]
    ).catch(error => console.warn('[A2A] handoff persistence deferred:', error?.message));
  } catch (error) {
    console.warn('[A2A] handoff persistence deferred:', error instanceof Error ? error.message : 'database unavailable');
  }
}

export function getA2AProtocolManifest() {
  return {
    protocol: 'GLORIFIER-A2A-v1',
    interoperableProtocols: ['A2A', 'MCP'],
    discovery: '/.well-known/glorifier-agent.json',
    taskEndpoint: '/api/a2a/tasks',
    handoffEndpoint: '/api/a2a/handoffs',
    lifecycle: ['queued','running','completed','failed','blocked','degraded','canceled'],
    security: ['agent-identity','capability-authorization','HMAC-SHA256-signed-handoffs','expiry','nonce','audit-trail'],
    truthBoundary: 'A task result is not verified truth until linked to qualifying external evidence.',
    financialBoundary: 'No autonomous trading, withdrawal, transfer, or fund movement.',
    humanAuthority: true
  } as const;
}

export function discoverA2ACapabilities() {
  return listAgentCards().map(agent => ({
    agentId: agent.id,
    name: agent.name,
    role: agent.role,
    capabilities: agent.capabilities,
    protocol: agent.protocol,
    endpoint: agent.endpoint,
    status: agent.status
  }));
}

type CreateA2ATaskInput = {
  requesterAgentId: string;
  targetAgentId?: string;
  capability: string;
  objective: string;
  input?: unknown;
  parentTaskId?: string;
  maxAttempts?: number;
  /** A2A message replay key; scoped to the authenticated requester. */
  idempotencyKey?: string;
};

export type A2ATaskPersistenceQuery = (
  sql: string,
  values?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>;

export class A2AIdempotencyConflictError extends Error {
  constructor() {
    super('A2A messageId was already used by this requester with different content.');
    this.name = 'A2AIdempotencyConflictError';
  }
}

function buildA2ATask(input: CreateA2ATaskInput): A2ATask {
  const now = new Date().toISOString();
  return {
    id: `a2a-${crypto.randomUUID()}`,
    parentTaskId: input.parentTaskId || null,
    requesterAgentId: input.requesterAgentId,
    targetAgentId: input.targetAgentId || null,
    capability: input.capability.trim().toLowerCase(),
    objective: input.objective,
    input: input.input ?? null,
    status: 'queued',
    attempts: 0,
    maxAttempts: Math.max(1, Math.min(5, input.maxAttempts || 3)),
    createdAt: now,
    updatedAt: now
  };
}

export function createA2ATask(input: CreateA2ATaskInput) {
  const task = buildA2ATask(input);
  persistTask(task);
  return task;
}

export async function createA2ATaskForProtocol(input: CreateA2ATaskInput): Promise<A2ATask> {
  if (!process.env.DATABASE_URL) {
    throw new Error('A2A persistent task storage is not configured.');
  }
  await initializeA2ARuntime();
  if (input.idempotencyKey !== undefined) {
    return createA2ATaskWithIdempotency(input, async (sql, values = []) => {
      const result = await getPostgresPool().query(sql, values as any[]);
      return { rows: result.rows as Array<Record<string, unknown>> };
    });
  }
  const task = buildA2ATask(input);
  await persistTaskDurably(task);
  memoryTasks.set(task.id, task);
  return task;
}

export function getA2ATask(id: string) {
  return memoryTasks.get(id) || null;
}

function mapPersistedA2ATask(row: Record<string, unknown>): A2ATask {
  const validStatuses: A2ATaskStatus[] = ['queued', 'running', 'completed', 'failed', 'blocked', 'degraded', 'canceled'];
  const status = String(row.status);
  if (!validStatuses.includes(status as A2ATaskStatus)) {
    throw new Error('Persisted A2A task has an unknown status.');
  }
  const toIso = (value: unknown, field: string): string => {
    const date = value instanceof Date ? value : new Date(String(value));
    if (!Number.isFinite(date.getTime())) {
      throw new Error(`Persisted A2A task has an invalid ${field} timestamp.`);
    }
    return date.toISOString();
  };
  return {
    id: String(row.id),
    parentTaskId: row.parent_task_id === null ? null : String(row.parent_task_id),
    requesterAgentId: String(row.requester_agent_id),
    targetAgentId: row.target_agent_id === null ? null : String(row.target_agent_id),
    capability: String(row.capability),
    objective: String(row.objective),
    input: row.input ?? null,
    status: status as A2ATaskStatus,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    createdAt: toIso(row.created_at, 'created_at'),
    updatedAt: toIso(row.updated_at, 'updated_at'),
    ...(row.result === null || row.result === undefined ? {} : { result: row.result }),
    ...(row.error === null || row.error === undefined ? {} : { error: String(row.error) }),
    ...(row.evidence_id === null || row.evidence_id === undefined ? {} : { evidenceId: String(row.evidence_id) }),
  };
}

function canonicalizeIdempotencyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeIdempotencyValue);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonicalizeIdempotencyValue(record[key])]),
    );
  }
  return value;
}

function a2aTaskRequestFingerprint(input: CreateA2ATaskInput): string {
  const semanticRequest = {
    requesterAgentId: input.requesterAgentId,
    targetAgentId: input.targetAgentId || null,
    capability: input.capability.trim().toLowerCase(),
    objective: input.objective,
    input: input.input ?? null,
    parentTaskId: input.parentTaskId || null,
    maxAttempts: Math.max(1, Math.min(5, input.maxAttempts || 3)),
  };
  return crypto.createHash('sha256')
    .update(JSON.stringify(canonicalizeIdempotencyValue(semanticRequest)))
    .digest('hex');
}

/**
 * Persist one A2A task with an atomic requester-scoped idempotency key.
 * Exact retries return the first stored task; key reuse with different content
 * raises A2AIdempotencyConflictError without changing the existing row.
 */
export async function createA2ATaskWithIdempotency(
  input: CreateA2ATaskInput,
  query: A2ATaskPersistenceQuery,
): Promise<A2ATask> {
  const idempotencyKey = typeof input.idempotencyKey === 'string'
    ? input.idempotencyKey.trim()
    : '';
  if (!idempotencyKey || idempotencyKey.length > 256) {
    throw new Error('A2A idempotency key must contain 1 through 256 characters.');
  }

  const task = buildA2ATask(input);
  const fingerprint = a2aTaskRequestFingerprint(input);
  // Resolve both first submissions and retries in one atomic statement. The
  // no-op conflict update returns the original row so a concurrent retry cannot
  // observe a missing record between INSERT and SELECT.
  const persistedResult = await query(
    `INSERT INTO a2a_tasks(
       id,parent_task_id,requester_agent_id,target_agent_id,capability,objective,input,status,
       attempts,max_attempts,result,error,evidence_id,created_at,updated_at,idempotency_key,idempotency_hash
     )
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (requester_agent_id,idempotency_key)
       WHERE idempotency_key IS NOT NULL
       DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
     RETURNING id,parent_task_id,requester_agent_id,target_agent_id,capability,objective,input,status,
               attempts,max_attempts,result,error,evidence_id,created_at,updated_at,idempotency_hash`,
    [
      task.id, task.parentTaskId, task.requesterAgentId, task.targetAgentId, task.capability,
      task.objective, JSON.stringify(task.input ?? null), task.status, task.attempts,
      task.maxAttempts, task.result ?? null, task.error ?? null, task.evidenceId ?? null,
      task.createdAt, task.updatedAt, idempotencyKey, fingerprint,
    ],
  );
  const persistedRow = persistedResult.rows[0];
  if (!persistedRow) {
    throw new Error('A2A idempotency upsert returned no persisted task.');
  }
  if (String(persistedRow.idempotency_hash || '') !== fingerprint) {
    throw new A2AIdempotencyConflictError();
  }

  const persistedTask = mapPersistedA2ATask(persistedRow);
  memoryTasks.set(persistedTask.id, persistedTask);
  return persistedTask;}


export function listA2ATasks(limit = 50, requesterAgentId?: string, allowAll = false) {
  const requester = typeof requesterAgentId === 'string' ? requesterAgentId.trim() : undefined;
  if (requesterAgentId !== undefined && !requester && !allowAll) return [];
  if (!requester && !allowAll) return [];
  const boundedLimit = Math.max(1, Math.min(100, Number.isFinite(limit) ? Math.floor(limit) : 50));
  return [...memoryTasks.values()]
    .filter((task) => allowAll || task.requesterAgentId === requester)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, boundedLimit);
}

/** Read persisted A2A tasks with requester filtering applied in SQL before pagination. */
export async function listA2ATasksForProtocol(
  limit = 50,
  requesterAgentId?: string,
  allowAll = false,
): Promise<A2ATask[]> {
  const requester = typeof requesterAgentId === 'string' ? requesterAgentId.trim() : undefined;
  if (requesterAgentId !== undefined && !requester && !allowAll) return [];
  if (!requester && !allowAll) return [];
  if (!process.env.DATABASE_URL) return listA2ATasks(limit, requester, allowAll);

  await initializeA2ARuntime();
  const boundedLimit = Math.max(1, Math.min(100, Number.isFinite(limit) ? Math.floor(limit) : 50));
  const result = await getPostgresPool().query(
    requester && !allowAll
      ? `SELECT id,parent_task_id,requester_agent_id,target_agent_id,capability,objective,input,status,
                attempts,max_attempts,result,error,evidence_id,created_at,updated_at
         FROM a2a_tasks
         WHERE requester_agent_id = $1
         ORDER BY created_at DESC
         LIMIT $2`
      : `SELECT id,parent_task_id,requester_agent_id,target_agent_id,capability,objective,input,status,
                attempts,max_attempts,result,error,evidence_id,created_at,updated_at
         FROM a2a_tasks
         ORDER BY created_at DESC
         LIMIT $1`,
    requester && !allowAll ? [requester, boundedLimit] : [boundedLimit],
  );
  const tasks = result.rows.map((row) => mapPersistedA2ATask(row));
  for (const task of tasks) memoryTasks.set(task.id, task);
  return tasks;
}


export interface A2ATaskPageRequest {
  requesterAgentId: string;
  pageSize: number;
  pageToken?: string;
  contextId?: string;
  statuses?: A2ATaskStatus[];
  statusTimestampAfter?: string;
}

export interface A2ATaskPage {
  tasks: A2ATask[];
  nextPageToken: string;
  pageSize: number;
  totalSize: number;
}

interface A2ATaskPageCursor {
  version: 1;
  requesterAgentId: string;
  contextId: string | null;
  statuses: A2ATaskStatus[] | null;
  statusTimestampAfter: string | null;
  updatedAt: string;
  id: string;
}

function pageFiltersMatch(cursor: A2ATaskPageCursor, request: A2ATaskPageRequest): boolean {
  return cursor.version === 1 &&
    cursor.requesterAgentId === request.requesterAgentId &&
    cursor.contextId === (request.contextId || null) &&
    JSON.stringify(cursor.statuses) === JSON.stringify(request.statuses || null) &&
    cursor.statusTimestampAfter === (request.statusTimestampAfter || null);
}

function decodeA2ATaskPageCursor(token: string, request: A2ATaskPageRequest): A2ATaskPageCursor {
  if (!token || token.length > 2048) throw new Error('A2A page token is invalid.');
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as Partial<A2ATaskPageCursor>;
    const knownStatuses: A2ATaskStatus[] = ['queued', 'running', 'completed', 'failed', 'blocked', 'degraded', 'canceled'];
    if (decoded.version !== 1 || typeof decoded.requesterAgentId !== 'string' ||
        typeof decoded.updatedAt !== 'string' || !Number.isFinite(Date.parse(decoded.updatedAt)) ||
        typeof decoded.id !== 'string' || !decoded.id ||
        !(decoded.contextId === null || typeof decoded.contextId === 'string') ||
        !(decoded.statuses === null || (Array.isArray(decoded.statuses) &&
          decoded.statuses.every((status) => knownStatuses.includes(status)))) ||
        !(decoded.statusTimestampAfter === null || (typeof decoded.statusTimestampAfter === 'string' &&
          Number.isFinite(Date.parse(decoded.statusTimestampAfter))))) {
      throw new Error('A2A page token is invalid.');
    }
    const cursor = decoded as A2ATaskPageCursor;
    if (!pageFiltersMatch(cursor, request)) throw new Error('A2A page token does not match the current filters.');
    return cursor;
  } catch {
    throw new Error('A2A page token is invalid or does not match the current filters.');
  }
}

function encodeA2ATaskPageCursor(task: A2ATask, request: A2ATaskPageRequest): string {
  const cursor: A2ATaskPageCursor = {
    version: 1,
    requesterAgentId: request.requesterAgentId,
    contextId: request.contextId || null,
    statuses: request.statuses || null,
    statusTimestampAfter: request.statusTimestampAfter || null,
    updatedAt: task.updatedAt,
    id: task.id,
  };
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/**
 * List tasks with authenticated requester scoping and stable cursor pagination.
 * Cursors are bound to the requester and filters; durable queries apply those
 * filters before pagination and order by updated_at/id descending.
 */
export async function listA2ATaskPageForProtocol(request: A2ATaskPageRequest): Promise<A2ATaskPage> {
  const requester = typeof request.requesterAgentId === 'string' ? request.requesterAgentId.trim() : '';
  if (!requester) throw new Error('Authenticated requester identity is required.');
  const pageSize = Math.max(1, Math.min(100, Math.floor(request.pageSize || 50)));
  const normalizedRequest = {
    ...request,
    requesterAgentId: requester,
    pageSize,
    statuses: request.statuses ? [...new Set(request.statuses)].sort() : undefined,
  };
  const cursor = request.pageToken ? decodeA2ATaskPageCursor(request.pageToken, normalizedRequest) : null;
  const statusAfter = request.statusTimestampAfter ? new Date(request.statusTimestampAfter).toISOString() : null;

  if (!process.env.DATABASE_URL) {
    const matching = [...memoryTasks.values()]
      .filter((task) => task.requesterAgentId === requester)
      .filter((task) => !request.contextId || (task.parentTaskId || task.id) === request.contextId)
      .filter((task) => !normalizedRequest.statuses || normalizedRequest.statuses.includes(task.status))
      .filter((task) => !statusAfter || Date.parse(task.updatedAt) >= Date.parse(statusAfter))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
    const totalSize = matching.length;
    const afterCursor = cursor
      ? matching.filter((task) => task.updatedAt < cursor.updatedAt ||
          (task.updatedAt === cursor.updatedAt && task.id < cursor.id))
      : matching;
    const tasks = afterCursor.slice(0, pageSize);
    const hasMore = afterCursor.length > pageSize;
    return {
      tasks,
      nextPageToken: hasMore && tasks.length ? encodeA2ATaskPageCursor(tasks[tasks.length - 1], normalizedRequest) : '',
      pageSize,
      totalSize,
    };
  }

  await initializeA2ARuntime();
  const filters = ['requester_agent_id = $1'];
  const filterParams: unknown[] = [requester];
  if (request.contextId) {
    filterParams.push(request.contextId);
    filters.push(`COALESCE(parent_task_id, id) = $${filterParams.length}`);
  }
  if (normalizedRequest.statuses?.length) {
    filterParams.push(normalizedRequest.statuses);
    filters.push(`status = ANY($${filterParams.length}::text[])`);
  }
  if (statusAfter) {
    filterParams.push(statusAfter);
    filters.push(`updated_at >= $${filterParams.length}::timestamptz`);
  }

  const filterSql = filters.join(' AND ');
  const countResult = await getPostgresPool().query(
    `SELECT COUNT(*)::bigint AS total_size FROM a2a_tasks WHERE ${filterSql}`,
    filterParams,
  );
  const totalSize = Number(countResult.rows[0]?.total_size ?? 0);
  if (!Number.isSafeInteger(totalSize) || totalSize < 0) {
    throw new Error('A2A task count is outside the safe integer range.');
  }

  const pageParams = [...filterParams];
  let pageSql = `SELECT id,parent_task_id,requester_agent_id,target_agent_id,capability,objective,input,status,
                        attempts,max_attempts,result,error,evidence_id,created_at,updated_at
                 FROM a2a_tasks WHERE ${filterSql}`;
  if (cursor) {
    pageParams.push(cursor.updatedAt, cursor.id);
    pageSql += ` AND (updated_at, id) < ($${pageParams.length - 1}::timestamptz, $${pageParams.length})`;
  }
  pageParams.push(pageSize + 1);
  pageSql += ` ORDER BY updated_at DESC, id DESC LIMIT $${pageParams.length}`;
  const pageResult = await getPostgresPool().query(pageSql, pageParams);
  const hasMore = pageResult.rows.length > pageSize;
  const tasks = pageResult.rows.slice(0, pageSize).map((row) => mapPersistedA2ATask(row));
  for (const task of tasks) memoryTasks.set(task.id, task);
  return {
    tasks,
    nextPageToken: hasMore && tasks.length ? encodeA2ATaskPageCursor(tasks[tasks.length - 1], normalizedRequest) : '',
    pageSize,
    totalSize,
  };
}

export async function getA2ATaskForProtocol(id: string): Promise<A2ATask | null> {
  if (!process.env.DATABASE_URL) return memoryTasks.get(id) || null;
  await initializeA2ARuntime();
  const result = await getPostgresPool().query(
    `SELECT id,parent_task_id,requester_agent_id,target_agent_id,capability,objective,input,status,
            attempts,max_attempts,result,error,evidence_id,created_at,updated_at
     FROM a2a_tasks WHERE id = $1 LIMIT 1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  const task = mapPersistedA2ATask(row);
  memoryTasks.set(task.id, task);
  return task;
}

/**
 * Retrieve a task with the requester predicate applied in SQL, preventing
 * cross-requester task existence checks from being performed by the protocol adapter.
 */
export async function getA2ATaskForRequesterProtocol(
  id: string,
  requesterAgentId: string,
): Promise<A2ATask | null> {
  const requester = typeof requesterAgentId === 'string' ? requesterAgentId.trim() : '';
  if (!id || !requester) return null;
  if (!process.env.DATABASE_URL) {
    const task = memoryTasks.get(id);
    return task?.requesterAgentId === requester ? task : null;
  }
  await initializeA2ARuntime();
  const result = await getPostgresPool().query(
    `SELECT id,parent_task_id,requester_agent_id,target_agent_id,capability,objective,input,status,
            attempts,max_attempts,result,error,evidence_id,created_at,updated_at
     FROM a2a_tasks WHERE id = $1 AND requester_agent_id = $2 LIMIT 1`,
    [id, requester],
  );
  const row = result.rows[0];
  if (!row) return null;
  const task = mapPersistedA2ATask(row);
  memoryTasks.set(task.id, task);
  return task;
}

/**
 * Atomically cancel only queued work owned by the authenticated requester.
 * A running task is deliberately left untouched because the current executor
 * has no provider cancellation signal; reporting it as canceled would be false.
 */
export async function cancelA2ATaskForRequesterProtocol(
  id: string,
  requesterAgentId: string,
): Promise<A2ATask | null> {
  const requester = typeof requesterAgentId === 'string' ? requesterAgentId.trim() : '';
  if (!id || !requester) return null;

  if (!process.env.DATABASE_URL) {
    const task = memoryTasks.get(id);
    if (!task || task.requesterAgentId !== requester) return null;
    if (task.status === 'canceled' || task.status !== 'queued') return task;
    task.status = 'canceled';
    task.updatedAt = new Date().toISOString();
    persistTask(task);
    return task;
  }

  await initializeA2ARuntime();
  const result = await getPostgresPool().query(
    `UPDATE a2a_tasks
       SET status = 'canceled', updated_at = NOW()
     WHERE id = $1 AND requester_agent_id = $2 AND status = 'queued'
     RETURNING id,parent_task_id,requester_agent_id,target_agent_id,capability,objective,input,status,
               attempts,max_attempts,result,error,evidence_id,created_at,updated_at`,
    [id, requester],
  );
  const row = result.rows[0];
  if (row) {
    const task = mapPersistedA2ATask(row);
    memoryTasks.set(task.id, task);
    return task;
  }

  // Preserve privacy: this lookup is requester-scoped. Returning an active or
  // terminal task lets the protocol adapter report TaskNotCancelableError.
  return getA2ATaskForRequesterProtocol(id, requester);
}

export function createSignedHandoff(task: A2ATask, toAgentId: string, payload: unknown, ttlSeconds = 300) {
  if (!signingSecret()) throw new Error('A2A signing is not configured');
  const issuedAt = new Date();
  const unsigned: Omit<A2AHandoff, 'signature'> = {
    protocol: 'GLORIFIER-A2A-v1',
    version: '1',
    handoffId: `handoff-${crypto.randomUUID()}`,
    taskId: task.id,
    fromAgentId: task.requesterAgentId,
    toAgentId,
    capability: task.capability,
    objective: task.objective,
    payload,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + ttlSeconds * 1000).toISOString(),
    nonce: crypto.randomBytes(18).toString('base64url'),
    signatureAlgorithm: 'HMAC-SHA256'
  };
  const handoff = { ...unsigned, signature: sign(unsigned) };
  persistHandoff(handoff);
  return handoff;
}

export function verifySignedHandoff(handoff: A2AHandoff) {
  try {
    if (!signingSecret()) return { valid: false, reason: 'signing_not_configured' as const };
    if (new Date(handoff.expiresAt).getTime() <= Date.now()) return { valid: false, reason: 'expired' as const };
    const { signature, ...unsigned } = handoff;
    const expected = sign(unsigned);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valid: false, reason: 'invalid_signature' as const };
    return { valid: true, reason: 'verified' as const };
  } catch {
    return { valid: false, reason: 'verification_error' as const };
  }
}

export async function executeA2ATask(
  task: A2ATask,
  executor: (prompt: string, options?: Record<string, unknown>) => Promise<{ text: string; model: string } | null>,
) {
  if (task.status !== 'queued') return task;

  if (process.env.DATABASE_URL) {
    await initializeA2ARuntime();
    let claim = await getPostgresPool().query(
      `UPDATE a2a_tasks
          SET status = 'running', attempts = 1, updated_at = NOW()
        WHERE id = $1 AND requester_agent_id = $2 AND status = 'queued'
        RETURNING updated_at`,
      [task.id, task.requesterAgentId],
    );
    if (!claim.rows.length) {
      const current = await getA2ATaskForProtocol(task.id);
      if (current) return current;
      // Legacy in-process callers may have inserted the task asynchronously.
      // Persist it before retrying the same atomic claim; do not overwrite an
      // existing canceled/running row.
      const cached = memoryTasks.get(task.id);
      if (!cached || cached.status !== 'queued') return cached || task;
      await persistTaskDurably(cached);
      claim = await getPostgresPool().query(
        `UPDATE a2a_tasks
            SET status = 'running', attempts = 1, updated_at = NOW()
          WHERE id = $1 AND requester_agent_id = $2 AND status = 'queued'
          RETURNING updated_at`,
        [task.id, task.requesterAgentId],
      );
      if (!claim.rows.length) return (await getA2ATaskForProtocol(task.id)) || task;
    }
    task.status = 'running';
    task.attempts = 1;
    task.updatedAt = claim.rows[0].updated_at instanceof Date
      ? claim.rows[0].updated_at.toISOString()
      : new Date(String(claim.rows[0].updated_at)).toISOString();
    memoryTasks.set(task.id, task);
  } else {
    const current = memoryTasks.get(task.id);
    if (current && current.status !== 'queued') return current;
    task.status = 'running';
    task.attempts = 1;
    task.updatedAt = new Date().toISOString();
    memoryTasks.set(task.id, task);
  }

  const route = routeAgentCapability(task.capability);
  const candidates = task.targetAgentId ? [task.targetAgentId] : route.specialists.length ? route.specialists : ['ai-ceo'];
  let lastError = 'No eligible agent/provider available';

  for (let attempt = 1; attempt <= task.maxAttempts; attempt += 1) {
    if (attempt > 1) {
      task.attempts = attempt;
      task.status = 'running';
      task.updatedAt = new Date().toISOString();
      if (process.env.DATABASE_URL) await persistTaskDurably(task);
      else persistTask(task);
    }

    const target = candidates[(attempt - 1) % candidates.length];
    try {
      const handoff = createSignedHandoff(task, target, task.input);
      const verified = verifySignedHandoff(handoff);
      if (!verified.valid) throw new Error(`Handoff rejected: ${verified.reason}`);

      const prompt = [
        'You are an authorized GLORIFIER A2A specialist.',
        `Agent identity: ${target}`,
        `Capability: ${task.capability}`,
        `Objective: ${task.objective}`,
        task.input ? `Input: ${JSON.stringify(task.input)}` : '',
        'Return an evidence-aware artifact. Never claim an external action happened unless external evidence proves it.',
        'Explicitly distinguish observation, inference, proposed action, and verification.'
      ].filter(Boolean).join('\n');

      const result = await executor(prompt, { taskId: task.id, agentId: target, capability: task.capability });
      if (!result) throw new Error('No configured provider available for this agent task');

      const evidenceId = `a2a-evidence-${crypto.randomUUID()}`;
      task.status = 'completed';
      task.result = { agentId: target, model: result.model, artifact: result.text, handoffId: handoff.handoffId };
      task.evidenceId = evidenceId;
      task.error = undefined;
      task.updatedAt = new Date().toISOString();
      if (process.env.DATABASE_URL) await persistTaskDurably(task);
      else persistTask(task);
      return task;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      task.error = lastError;
      task.status = attempt === task.maxAttempts ? 'failed' : 'degraded';
      task.updatedAt = new Date().toISOString();
      if (process.env.DATABASE_URL) await persistTaskDurably(task);
      else persistTask(task);
    }
  }
  return task;
}

export async function runA2AE2ETest(
  executor: (prompt: string, options?: Record<string, unknown>) => Promise<{ text: string; model: string } | null>,
) {
  const startedAt = new Date().toISOString();
  const root = createA2ATask({
    requesterAgentId: 'ai-ceo',
    capability: 'research',
    objective: 'Produce a compact factual research artifact for A2A handoff verification.',
    input: { test: true, scope: 'GLORIFIER A2A runtime' },
    maxAttempts: 2
  });
  const first = await executeA2ATask(root, executor);
  if (first.status !== 'completed') {
    return { ok: false, status: 'degraded', startedAt, completedAt: new Date().toISOString(), stage: 'first-agent', task: first,
      evidenceRule: 'No successful external inference means no successful E2E verification.' };
  }

  const second = createA2ATask({
    requesterAgentId: String(first.result && typeof first.result === 'object' ? (first.result as any).agentId || 'research-agent' : 'research-agent'),
    capability: 'synthesis',
    objective: 'Synthesize the preceding agent artifact and preserve its evidence boundary.',
    input: { previousTaskId: first.id, previousArtifact: first.result },
    parentTaskId: first.id,
    maxAttempts: 2
  });
  const secondResult = await executeA2ATask(second, executor);
  return {
    ok: secondResult.status === 'completed',
    status: secondResult.status === 'completed' ? 'verified-runtime-path' : 'degraded',
    startedAt,
    completedAt: new Date().toISOString(),
    stages: [first, secondResult],
    verification: {
      identity: Boolean(first.requesterAgentId && second.requesterAgentId),
      capabilityDiscovery: Boolean(routeAgentCapability('research').specialists.length),
      signedHandoff: Boolean(first.result && (first.result as any).handoffId),
      taskLifecycle: ['queued','running',first.status,secondResult.status],
      externalInferenceEvidence: secondResult.status === 'completed',
      economicTruth: 'No revenue is inferred or created by this test.'
    }
  };
}
