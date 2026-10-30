import { getPostgresPool } from './db/postgres';

export type AgentStateKind = 'task' | 'session';

export interface AgentStateQueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount?: number | null;
}

export type AgentStateQuery = (
  sql: string,
  values?: unknown[],
) => Promise<AgentStateQueryResult>;

export interface AgentStateRecord {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * PostgreSQL persistence for resumable GLORIFIER agent state.
 *
 * The store deliberately persists task/session records only. It does not
 * schedule tasks, replay work, authorize tools, or perform provider actions.
 * "Running" tasks with no successful heartbeat for at least 30 minutes
 * are marked failed during startup recovery. The long-running inference and
 * governance execution paths heartbeat every minute while active; heartbeat
 * updates are conditional on status still being "running". A task interrupted
 * less than 30 minutes before a restart can remain running until a later
 * startup. Tasks are never automatically replayed because an interrupted
 * action may already have caused an external side effect.
 */
export class PostgresAgentStateStore {
  constructor(private readonly query: AgentStateQuery) {}

  async initialize(): Promise<void> {
    await this.query(`
      SELECT pg_advisory_xact_lock(hashtext('glorifier_agent_state_schema_v1')::bigint);
      CREATE TABLE IF NOT EXISTS glorifier_agent_state (
        kind TEXT NOT NULL CHECK (kind IN ('task', 'session')),
        id TEXT NOT NULL,
        status TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (kind, id)
      );
      CREATE INDEX IF NOT EXISTS idx_glorifier_agent_state_kind_updated
        ON glorifier_agent_state(kind, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_glorifier_agent_state_kind_requester_updated
        ON glorifier_agent_state(kind, (payload->>'requester'), updated_at DESC);
    `);
  }

  async save<T extends AgentStateRecord>(kind: AgentStateKind, record: T): Promise<void> {
    const payload = JSON.stringify(record);
    if (typeof payload !== 'string') {
      throw new Error('Agent state could not be serialized for persistence.');
    }

    await this.query(
      `INSERT INTO glorifier_agent_state(kind,id,status,payload,created_at,updated_at)
       VALUES($1,$2,$3,$4::jsonb,$5::timestamptz,$6::timestamptz)
       ON CONFLICT(kind,id) DO UPDATE SET
         status=EXCLUDED.status,
         payload=EXCLUDED.payload,
         updated_at=EXCLUDED.updated_at`,
      [kind, record.id, record.status, payload, record.createdAt, record.updatedAt],
    );
  }

  async get<T>(kind: AgentStateKind, id: string): Promise<T | null> {
    const result = await this.query(
      'SELECT payload FROM glorifier_agent_state WHERE kind = $1 AND id = $2 LIMIT 1',
      [kind, id],
    );
    const payload = result.rows[0]?.payload;
    if (payload === undefined || payload === null) return null;
    return (typeof payload === 'string' ? JSON.parse(payload) : payload) as T;
  }

  async list<T>(kind: AgentStateKind, limit = 50, requester?: string, allowAll = false): Promise<T[]> {
    const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 50;
    const normalizedRequester = typeof requester === 'string' ? requester.trim() : undefined;
    // An explicitly supplied blank identity is invalid; an omitted identity
    // is unscoped only when the caller supplies an explicit authorization grant.
    if (requester !== undefined && !normalizedRequester) return [];
    const requesterFilter = allowAll ? undefined : normalizedRequester;
    if (!requesterFilter && !allowAll) return [];
    const result = await this.query(
      requesterFilter
        ? `SELECT payload FROM glorifier_agent_state
           WHERE kind = $1 AND payload->>'requester' = $3
           ORDER BY updated_at DESC LIMIT $2`
        : 'SELECT payload FROM glorifier_agent_state WHERE kind = $1 ORDER BY updated_at DESC LIMIT $2',
      requesterFilter ? [kind, boundedLimit, requesterFilter] : [kind, boundedLimit],
    );
    return result.rows
      .map((row) => row.payload)
      .filter((payload) => payload !== undefined && payload !== null)
      .map((payload) => (typeof payload === 'string' ? JSON.parse(payload) : payload) as T);
  }

  /**
   * Atomically increments one session turn in PostgreSQL. Row-level UPDATE
   * locking ensures concurrent requests cannot overwrite each other's count.
   */
  async incrementSessionTurn<T>(id: string, contextTokens: number): Promise<T | null> {
    if (!Number.isSafeInteger(contextTokens) || contextTokens < 0) {
      throw new Error('contextTokens must be a non-negative safe integer.');
    }
    const normalizedContextTokens = contextTokens;
    const result = await this.query(
      `UPDATE glorifier_agent_state
       SET status = 'active',
           payload = payload || jsonb_build_object(
             'status', 'active',
             'turnCount', COALESCE((payload->>'turnCount')::bigint, 0) + 1,
             'contextTokens', $2::bigint,
             'updatedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             'compactionRecommended',
               $2::bigint >= floor(COALESCE((payload->>'maxContextTokens')::numeric, 32000) * 0.8)
           ),
           updated_at = NOW()
       WHERE kind = 'session' AND id = $1
       RETURNING payload`,
      [id, normalizedContextTokens],
    );
    const payload = result.rows[0]?.payload;
    if (payload === undefined || payload === null) return null;
    return (typeof payload === 'string' ? JSON.parse(payload) : payload) as T;
  }

  /**
   * Refreshes the lease timestamp only while the task is still running.
   * The status predicate prevents a late heartbeat from reverting completion.
   */
  async heartbeatRunningTask(id: string): Promise<boolean> {
    const result = await this.query(
      `UPDATE glorifier_agent_state
       SET payload = jsonb_set(
             payload,
             '{updatedAt}',
             to_jsonb(to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
             true
           ),
           updated_at = NOW()
       WHERE kind = 'task' AND id = $1 AND status = 'running'
       RETURNING id`,
      [id],
    );
    return result.rows.length > 0 || (result.rowCount ?? 0) > 0;
  }

  async recoverInterruptedTasks(staleAfterMinutes = 30): Promise<number> {
    if (!Number.isSafeInteger(staleAfterMinutes) || staleAfterMinutes < 1 || staleAfterMinutes > 24 * 60) {
      throw new Error('staleAfterMinutes must be a whole number between 1 and 1440.');
    }
    const error = `Task was stale in running state for more than ${staleAfterMinutes} minutes during recovery; automatic replay is disabled.`;
    const result = await this.query(
      `UPDATE glorifier_agent_state
       SET status = 'failed',
           payload = jsonb_set(
             jsonb_set(
               jsonb_set(payload, '{status}', '"failed"'::jsonb),
               '{error}',
               to_jsonb($1::text)
             ),
             '{updatedAt}',
             to_jsonb(to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
           ),
           updated_at = NOW()
       WHERE kind = 'task'
         AND status = 'running'
         AND updated_at < NOW() - ($2::integer * INTERVAL '1 minute')`,
      [error, staleAfterMinutes],
    );
    return result.rowCount ?? 0;
  }
}

/** Reusable pool adapter; module-specific startup logic remains with each caller. */
export function createPostgresAgentStateStore(): PostgresAgentStateStore {
  return new PostgresAgentStateStore(async (sql, values) => {
    const result = await getPostgresPool().query(sql, values as any[]);
    return { rows: result.rows as Array<Record<string, unknown>>, rowCount: result.rowCount };
  });
}
