import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresAgentStateStore, type AgentStateQuery } from './agent-state-store.ts';

// Use an explicitly named test connection and isolate all DDL/data in a unique schema.
// Never fall back to the application's DATABASE_URL or drop its agent-state table.
const connectionString = process.env.AGENT_STATE_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('AGENT_STATE_TEST_DATABASE_URL is required; refusing to use DATABASE_URL.');
}
if (connectionString === process.env.DATABASE_URL) {
  throw new Error('AGENT_STATE_TEST_DATABASE_URL must be separate from DATABASE_URL.');
}

const schemaName = 'agent_state_test_' + randomUUID().replace(/-/g, '');
const adminPool = new Pool({ connectionString, max: 2 });
await adminPool.query('CREATE SCHEMA "' + schemaName + '"');
const pool = new Pool({ connectionString, max: 4, options: '-c search_path=' + schemaName });
const query: AgentStateQuery = async (sql, values) => {
  const result = values ? await pool.query(sql, values as any[]) : await pool.query(sql);
  return { rows: result.rows as Array<Record<string, unknown>>, rowCount: result.rowCount };
};
const store = new PostgresAgentStateStore(query);
const peerStore = new PostgresAgentStateStore(query);

try {
  // Concurrent initialization must serialize schema DDL on a fresh database.
  await Promise.all([store.initialize(), peerStore.initialize()]);

  const session = {
    id: 'integration-session',
    agentId: 'integration-test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    turnCount: 0,
    contextTokens: 0,
    maxContextTokens: 10_000,
    status: 'active',
    compactionRecommended: false,
  };
  await store.save('session', session);
  const replacedSession = { ...session, agentId: 'integration-test-upsert' };
  await store.save('session', replacedSession);
  assert.equal((await store.get<typeof session>('session', session.id))?.agentId, 'integration-test-upsert', 'save must exercise the SQL upsert path');

  const newestSession = {
    ...session,
    id: 'integration-session-newest',
    updatedAt: new Date(Date.now() + 1_000).toISOString(),
  };
  await store.save('session', newestSession);
  assert.deepEqual(
    (await store.list<typeof session>('session', 1, undefined, true)).map((entry) => entry.id),
    [newestSession.id],
    'list must filter by kind, order by updated_at, and honor its limit',
  );
  assert.deepEqual(await store.list('task', 10), [], 'unscoped task listing must fail closed');
  assert.deepEqual(await store.list('task', 10, undefined, true), [], 'explicit all-task access must still respect the task kind');

  const increments = await Promise.all([
    store.incrementSessionTurn<typeof session>(session.id, 100),
    peerStore.incrementSessionTurn<typeof session>(session.id, 200),
  ]);
  assert.deepEqual(
    increments.map((entry) => entry?.turnCount).sort(),
    [1, 2],
    'concurrent database increments must each receive a unique turn count',
  );
  const persistedSession = await store.get<typeof session>('session', session.id);
  assert.equal(persistedSession?.turnCount, 2);
  const largeCounterSession = await store.incrementSessionTurn<typeof session>(session.id, 2_147_483_648);
  assert.equal(largeCounterSession?.contextTokens, 2_147_483_648, 'BIGINT-backed context counters must exceed int32');
  assert.ok(
    persistedSession?.contextTokens === 100 || persistedSession?.contextTokens === 200,
    'the final context token count must come from one complete atomic update',
  );

  const staleAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const staleTask = {
    id: 'integration-stale-task',
    status: 'running',
    createdAt: staleAt,
    updatedAt: staleAt,
  };
  const recentTask = {
    id: 'integration-recent-task',
    status: 'running',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const recentlyRunningTask = {
    id: 'integration-recently-running-task',
    status: 'running',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await store.save('task', staleTask);
  await store.save('task', recentTask);
  await store.save('task', recentlyRunningTask);
  assert.equal(await store.heartbeatRunningTask(recentTask.id), true);
  assert.equal((await store.get<typeof recentTask>('task', recentTask.id))?.status, 'running');
  assert.deepEqual(
    (await store.list<typeof recentTask>('task', 1, undefined, true)).map((entry) => entry.id),
    [recentTask.id],
    'task listing must return the newest task row and respect the result limit',
  );

  // Keep requester-isolation fixtures after the global ordering assertion so
  // the deliberately newer Bob task cannot invalidate that independent check.
  const aliceTask = { ...recentTask, id: 'integration-alice-task', requester: 'alice-uid' };
  const bobTask = { ...recentTask, id: 'integration-bob-task', requester: 'bob-uid', updatedAt: new Date(Date.now() + 2_000).toISOString() };
  await store.save('task', aliceTask);
  await store.save('task', bobTask);
  assert.deepEqual(await store.list('task', 10), [], 'unscoped PostgreSQL task listing must return no tenants');
  assert.deepEqual(await store.list('task', 10, ''), [], 'blank PostgreSQL requester must return no tenants');
  assert.deepEqual((await store.list<typeof aliceTask>('task', 1, 'alice-uid')).map((entry) => entry.id), [aliceTask.id], 'requester filter must be applied before LIMIT');
  await store.save('task', { ...recentTask, status: 'completed', updatedAt: new Date().toISOString() });
  assert.equal(await store.heartbeatRunningTask(recentTask.id), false, 'late heartbeat must not revive a completed task');

  assert.equal(await store.recoverInterruptedTasks(30), 1);
  const recovered = await store.get<typeof staleTask & { error?: string }>('task', staleTask.id);
  assert.equal(recovered?.status, 'failed');
  assert.match(recovered?.error || '', /automatic replay is disabled/);
  assert.ok(Date.parse(recovered?.updatedAt || '') > Date.parse(staleAt));
  assert.equal((await store.get<typeof recentTask>('task', recentTask.id))?.status, 'completed');
  assert.equal(
    (await store.get<typeof recentlyRunningTask>('task', recentlyRunningTask.id))?.status,
    'running',
    'a fresh running task must remain running when startup recovery uses the 30-minute grace period',
  );

  console.log('PostgreSQL agent state integration tests: PASS');
} finally {
  await pool.end();
  await adminPool.query('DROP SCHEMA IF EXISTS "' + schemaName + '" CASCADE').catch(() => undefined);
  await adminPool.end();
}
