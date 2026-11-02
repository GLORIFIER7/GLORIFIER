import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { PostgresAgentStateStore, type AgentStateQuery } from './agent-state-store.ts';

let adminPool: Pool | undefined;
let pool: Pool | undefined;
let store: PostgresAgentStateStore;
let peerStore: PostgresAgentStateStore;
let schemaName: string;

before(async () => {
  const connectionString = process.env.AGENT_STATE_TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error('AGENT_STATE_TEST_DATABASE_URL is required; refusing to use DATABASE_URL.');
  }
  if (connectionString === process.env.DATABASE_URL) {
    throw new Error('AGENT_STATE_TEST_DATABASE_URL must be separate from DATABASE_URL.');
  }

  schemaName = 'agent_state_test_' + randomUUID().replace(/-/g, '');
  adminPool = new Pool({ connectionString, max: 2 });
  await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
  pool = new Pool({ connectionString, max: 4, options: '-c search_path=' + schemaName });
  const query: AgentStateQuery = async (sql, values) => {
    const result = values ? await pool!.query(sql, values) : await pool!.query(sql);
    return { rows: result.rows as Array<Record<string, unknown>>, rowCount: result.rowCount };
  };
  store = new PostgresAgentStateStore(query);
  peerStore = new PostgresAgentStateStore(query);

  // Concurrent initialization exercises schema setup against a fresh isolated schema.
  await Promise.all([store.initialize(), peerStore.initialize()]);
});

after(async () => {
  await pool?.end();
  if (adminPool && schemaName) {
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => undefined);
    await adminPool.end();
  }
});

function createSession(id: string) {
  return {
    id,
    agentId: 'integration-test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    turnCount: 0,
    contextTokens: 0,
    maxContextTokens: 10_000,
    status: 'active',
    compactionRecommended: false,
  };
}

test('upserts sessions and applies kind, ordering, and limit filters', async () => {
  const session = createSession('session-' + randomUUID());
  await store.save('session', session);
  await store.save('session', { ...session, agentId: 'integration-test-upsert' });
  assert.equal(
    (await store.get<typeof session>('session', session.id))?.agentId,
    'integration-test-upsert',
    'save must exercise the SQL upsert path',
  );

  const newestSession = {
    ...session,
    id: 'session-newest-' + randomUUID(),
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
});

test('increments concurrent session turns atomically and supports BIGINT counters', async () => {
  const session = createSession('session-increment-' + randomUUID());
  await store.save('session', session);
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
});

test('maintains running-task heartbeats, ordering, and completion safety', async () => {
  const recentTask = {
    id: 'task-heartbeat-' + randomUUID(),
    status: 'running',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const newestTask = {
    ...recentTask,
    id: 'task-newest-' + randomUUID(),
    updatedAt: new Date(Date.now() + 2_000).toISOString(),
  };
  await store.save('task', recentTask);
  await store.save('task', newestTask);
  assert.equal(await store.heartbeatRunningTask(recentTask.id), true);
  assert.equal((await store.get<typeof recentTask>('task', recentTask.id))?.status, 'running');
  assert.deepEqual(
    (await store.list<typeof recentTask>('task', 1, undefined, true)).map((entry) => entry.id),
    [newestTask.id],
    'task listing must return the newest task row and respect the result limit',
  );

  await store.save('task', { ...recentTask, status: 'completed', updatedAt: new Date().toISOString() });
  assert.equal(await store.heartbeatRunningTask(recentTask.id), false, 'late heartbeat must not revive a completed task');
});

test('isolates task queries by requester before applying the limit', async () => {
  const baseTask = {
    id: 'task-requester-' + randomUUID(),
    status: 'running',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const aliceTask = { ...baseTask, id: 'task-alice-' + randomUUID(), requester: 'alice-uid' };
  const bobTask = {
    ...baseTask,
    id: 'task-bob-' + randomUUID(),
    requester: 'bob-uid',
    updatedAt: new Date(Date.now() + 2_000).toISOString(),
  };
  await store.save('task', aliceTask);
  await store.save('task', bobTask);
  assert.deepEqual(await store.list('task', 10), [], 'unscoped PostgreSQL task listing must return no tenants');
  assert.deepEqual(await store.list('task', 10, ''), [], 'blank PostgreSQL requester must return no tenants');
  assert.deepEqual(
    (await store.list<typeof aliceTask>('task', 1, 'alice-uid')).map((entry) => entry.id),
    [aliceTask.id],
    'requester filter must be applied before LIMIT',
  );
});

test('recovers stale running tasks without replaying them or interrupting fresh tasks', async () => {
  const staleAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const staleTask = {
    id: 'task-stale-' + randomUUID(),
    status: 'running',
    createdAt: staleAt,
    updatedAt: staleAt,
  };
  const recentTask = {
    id: 'task-recent-' + randomUUID(),
    status: 'running',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const recentlyRunningTask = {
    id: 'task-fresh-' + randomUUID(),
    status: 'running',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await store.save('task', staleTask);
  await store.save('task', recentTask);
  await store.save('task', recentlyRunningTask);

  assert.equal(await store.recoverInterruptedTasks(30), 1);
  const recovered = await store.get<typeof staleTask & { error?: string }>('task', staleTask.id);
  assert.equal(recovered?.status, 'failed');
  assert.match(recovered?.error || '', /automatic replay is disabled/);
  assert.ok(Date.parse(recovered?.updatedAt || '') > Date.parse(staleAt));
  assert.equal((await store.get<typeof recentTask>('task', recentTask.id))?.status, 'running');
  assert.equal(
    (await store.get<typeof recentlyRunningTask>('task', recentlyRunningTask.id))?.status,
    'running',
    'a fresh running task must remain running when startup recovery uses the 30-minute grace period',
  );
});
