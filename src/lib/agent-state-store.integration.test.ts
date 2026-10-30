import { strict as assert } from 'node:assert';
import { Pool } from 'pg';
import { PostgresAgentStateStore, type AgentStateQuery } from './agent-state-store.ts';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for the PostgreSQL agent-state integration test.');
}

const pool = new Pool({ connectionString });
const query: AgentStateQuery = async (sql, values) => {
  const result = values ? await pool.query(sql, values as any[]) : await pool.query(sql);
  return {
    rows: result.rows as Array<Record<string, unknown>>,
    rowCount: result.rowCount,
  };
};

const store = new PostgresAgentStateStore(query);
const peerStore = new PostgresAgentStateStore(query);

try {
  await pool.query('DROP TABLE IF EXISTS glorifier_agent_state');
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
  await store.save('task', staleTask);
  await store.save('task', recentTask);

  assert.equal(await store.recoverInterruptedTasks(), 1);
  const recovered = await store.get<typeof staleTask & { error?: string }>('task', staleTask.id);
  assert.equal(recovered?.status, 'failed');
  assert.match(recovered?.error || '', /automatic replay is disabled/);
  assert.ok(Date.parse(recovered?.updatedAt || '') > Date.parse(staleAt));
  assert.equal((await store.get<typeof recentTask>('task', recentTask.id))?.status, 'running');

  console.log('PostgreSQL agent state integration tests: PASS');
} finally {
  await pool.query('DROP TABLE IF EXISTS glorifier_agent_state').catch(() => undefined);
  await pool.end();
}
