import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { getPostgresPool } from './db/postgres.ts';
import {
  A2AIdempotencyConflictError,
  createA2ATaskForProtocol,
  getA2ATaskForIdempotencyKeyForProtocol,
  initializeA2ARuntime,
} from './a2a-runtime.ts';

let originalDatabaseUrl: string | undefined;
let originalNodeEnv: string | undefined;
let configured = false;

before(async () => {
  const connectionString = process.env.A2A_TEST_DATABASE_URL;
  originalDatabaseUrl = process.env.DATABASE_URL;
  originalNodeEnv = process.env.NODE_ENV;

  if (!connectionString) {
    throw new Error('A2A_TEST_DATABASE_URL is required; refusing to use DATABASE_URL.');
  }
  if (connectionString === originalDatabaseUrl) {
    throw new Error('A2A_TEST_DATABASE_URL must be separate from DATABASE_URL.');
  }

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = connectionString;
  configured = true;

  const pool = getPostgresPool();
  // Create the pre-idempotency schema to exercise the additive upgrade path,
  // not only the CREATE TABLE path used by a fresh install.
  await pool.query(`
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await initializeA2ARuntime();
});

after(async () => {
  if (configured) {
    try {
      const pool = getPostgresPool();
      await pool.query("DELETE FROM a2a_tasks WHERE requester_agent_id LIKE 'a2a-pg-idem-%'");
      await pool.end();
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  }
});

test('PostgreSQL migrates A2A idempotency and atomically deduplicates concurrent messages', async () => {
  const pool = getPostgresPool();
  const columns = await pool.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'a2a_tasks'
  `);
  const columnNames = new Set(columns.rows.map((row) => String(row.column_name)));
  assert.ok(columnNames.has('idempotency_key'), 'legacy task tables gain the idempotency key column');
  assert.ok(columnNames.has('idempotency_hash'), 'legacy task tables gain the payload fingerprint column');

  const index = await pool.query(`
    SELECT indexdef
      FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname = 'idx_a2a_tasks_requester_idempotency'
  `);
  assert.equal(index.rows.length, 1, 'requester-scoped partial unique index must be installed');
  assert.match(String(index.rows[0].indexdef), /UNIQUE INDEX/i);
  assert.match(String(index.rows[0].indexdef), /requester_agent_id, idempotency_key/i);
  assert.match(String(index.rows[0].indexdef), /idempotency_key IS NOT NULL/i);

  const requesterAgentId = 'a2a-pg-idem-' + randomUUID();
  const base = {
    requesterAgentId,
    capability: 'research',
    objective: 'Verify durable A2A retry handling',
    idempotencyKey: 'message-' + randomUUID(),
  };
  const tasks = await Promise.all(Array.from({ length: 12 }, (_, indexValue) =>
    createA2ATaskForProtocol({
      ...base,
      input: indexValue % 2 === 0
        ? { nested: { z: 2, a: 1 }, labels: ['same', 'payload'] }
        : { labels: ['same', 'payload'], nested: { a: 1, z: 2 } },
    }),
  ));

  assert.equal(new Set(tasks.map((task) => task.id)).size, 1,
    'simultaneous exact retries must converge on one durable task');
  const count = await pool.query(
    'SELECT COUNT(*)::int AS count FROM a2a_tasks WHERE requester_agent_id = $1 AND idempotency_key = $2',
    [requesterAgentId, base.idempotencyKey],
  );
  assert.equal(Number(count.rows[0].count), 1, 'the database must contain only one row for the requester/key pair');
  const replayLookup = await getA2ATaskForIdempotencyKeyForProtocol(requesterAgentId, base.idempotencyKey);
  assert.equal(replayLookup?.id, tasks[0].id, 'the durable requester/key lookup returns the original task');
  const foreignLookup = await getA2ATaskForIdempotencyKeyForProtocol(
    'a2a-pg-idem-foreign-' + randomUUID(),
    base.idempotencyKey,
  );
  assert.equal(foreignLookup, null, 'a replay key must not reveal another requester's task');

  await assert.rejects(
    createA2ATaskForProtocol({ ...base, objective: 'Different content for the same messageId' }),
    (error) => error instanceof A2AIdempotencyConflictError,
    'different content for a used requester key must be rejected by the durable path',
  );

  const otherRequester = await createA2ATaskForProtocol({
    ...base,
    requesterAgentId: 'a2a-pg-idem-' + randomUUID(),
  });
  assert.notEqual(otherRequester.id, tasks[0].id,
    'the same messageId remains independent across authenticated requesters');
});
