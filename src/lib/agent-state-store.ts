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
 * Only "running" tasks stale for at least 30 minutes are marked failed on
 * startup to avoid changing the state of another healthy replica's recent
 * work. Tasks are never automatically replayed because an interrupted action
 * may already have caused an external side effect.
 */
export class PostgresAgentStateStore {
  constructor(private readonly query: AgentStateQuery) {}

  async initialize(): Promise<void> {
    await this.query(`
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

  async list<T>(kind: AgentStateKind, limit = 50): Promise<T[]> {
    const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 50;
    const result = await this.query(
      'SELECT payload FROM glorifier_agent_state WHERE kind = $1 ORDER BY updated_at DESC LIMIT $2',
      [kind, boundedLimit],
    );
    return result.rows
      .map((row) => row.payload)
      .filter((payload) => payload !== undefined && payload !== null)
      .map((payload) => (typeof payload === 'string' ? JSON.parse(payload) : payload) as T);
  }

  async recoverInterruptedTasks(): Promise<number> {
    const error = 'Task was stale in running state for more than 30 minutes during recovery; automatic replay is disabled.';
    const result = await this.query(
      `UPDATE glorifier_agent_state
       SET status = 'failed',
           payload = jsonb_set(
             jsonb_set(payload, '{status}', '"failed"'::jsonb),
             '{error}',
             to_jsonb($1::text)
           ),
           updated_at = NOW()
       WHERE kind = 'task'
         AND status = 'running'
         AND updated_at < NOW() - INTERVAL '30 minutes'`,
      [error],
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
