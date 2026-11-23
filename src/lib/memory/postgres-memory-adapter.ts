import { getOptionalPostgresPool } from '../db/postgres';
import { PostgresLongTermMemoryStore } from './long-term-memory';

/** Node-only, opt-in adapter. Reuses the existing shared PostgreSQL TLS/pool policy. */
export function createOptionalPostgresLongTermMemoryStore(): PostgresLongTermMemoryStore | null {
  const pool = getOptionalPostgresPool();
  if (!pool) return null;
  return new PostgresLongTermMemoryStore(async (sql, values = []) => {
    const result = await pool.query(sql, values);
    return { rows: result.rows as Array<Record<string, unknown>>, rowCount: result.rowCount };
  });
}
