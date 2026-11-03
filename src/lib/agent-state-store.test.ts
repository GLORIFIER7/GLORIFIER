import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { PostgresAgentStateStore, type AgentStateQuery } from './agent-state-store.ts';

type StoredRow = {
  kind: string; id: string; status: string; created_at: string; updated_at: string; payload: unknown;
};
const rows = new Map<string, StoredRow>();
const statements: string[] = [];
const queryValues: unknown[][] = [];
const query: AgentStateQuery = async (sql, values = []) => {
  statements.push(sql);
  queryValues.push(values);
  if (sql.includes('INSERT INTO glorifier_agent_state')) {
    const [kind, id, status, payload, createdAt, updatedAt] = values as [string, string, string, string, string, string];
    rows.set(kind + ':' + id, { kind, id, status, created_at: createdAt, updated_at: updatedAt, payload: JSON.parse(payload) });
    return { rows: [], rowCount: 1 };
  }
  if (sql.includes('SELECT payload FROM glorifier_agent_state')) {
    const [kind, idOrLimit, requester] = values as [string, string | number, string | undefined];
    if (sql.includes('WHERE kind = $1 AND id = $2')) {
      const row = rows.get(kind + ':' + idOrLimit);
      return { rows: row ? [{ payload: row.payload }] : [] };
    }
    return {
      rows: [...rows.values()]
        .filter((row) => row.kind === kind)
        .filter((row) => !requester || (row.payload as Record<string, unknown>).requester === requester)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, Number(idOrLimit))
        .map((row) => ({ payload: row.payload })),
    };
  }
  if (sql.includes('UPDATE glorifier_agent_state') && sql.includes('RETURNING id')) {
    const [id] = values as [string];
    const row = rows.get('task:' + id);
    if (!row || row.status !== 'running') return { rows: [], rowCount: 0 };
    const updatedAt = new Date().toISOString();
    const updatedPayload = { ...(row.payload as Record<string, unknown>), updatedAt };
    rows.set('task:' + id, { ...row, payload: updatedPayload, updated_at: updatedAt });
    return { rows: [{ id }], rowCount: 1 };
  }
  if (sql.includes('UPDATE glorifier_agent_state') && sql.includes('RETURNING payload')) {
    const [id, contextTokens] = values as [string, number];
    const row = rows.get('session:' + id);
    if (!row) return { rows: [], rowCount: 0 };
    const current = row.payload as Record<string, unknown>;
    const updatedAt = new Date().toISOString();
    const updated = {
      ...current, status: 'active', turnCount: Number(current.turnCount || 0) + 1, contextTokens,
      updatedAt, compactionRecommended: contextTokens >= Math.floor(Number(current.maxContextTokens || 32_000) * 0.8),
    };
    rows.set('session:' + id, { ...row, status: 'active', payload: updated, updated_at: updatedAt });
    return { rows: [{ payload: updated }], rowCount: 1 };
  }
  if (sql.includes('UPDATE glorifier_agent_state')) {
    let recovered = 0;
    const staleAfterMinutes = Number(values[1] ?? 30);
    const staleBefore = Date.now() - staleAfterMinutes * 60 * 1000;
    for (const [key, row] of rows) {
      if (row.kind !== 'task' || row.status !== 'running' || Date.parse(row.updated_at) >= staleBefore) continue;
      const payload = row.payload as Record<string, unknown>;
      const recoveredAt = new Date().toISOString();
      const updatesSerializedTimestamp = sql.includes("'{updatedAt}'");
      const updated = {
        ...payload, status: 'failed',
        error: 'Process restarted before task completion; automatic replay is disabled.',
        ...(updatesSerializedTimestamp ? { updatedAt: recoveredAt } : {}),
      };
      rows.set(key, { ...row, status: 'failed', payload: updated, updated_at: recoveredAt });
      recovered += 1;
    }
    return { rows: [], rowCount: recovered };
  }
  return { rows: [], rowCount: 0 };
};

const store = new PostgresAgentStateStore(query);
before(async () => { await store.initialize(); });

const task = {
  id: 'task-1', capability: 'research', objective: 'Persist this task', requester: 'human-owner',
  createdAt: '2026-10-29T10:00:00.000Z', updatedAt: '2026-10-29T10:00:00.000Z', status: 'queued',
};

test('PostgreSQL agent-state schema initialization serializes DDL and creates indexes', () => {
  assert.ok(statements.some((sql) => sql.includes('pg_advisory_xact_lock')));
  assert.ok(statements[0].indexOf('pg_advisory_xact_lock') < statements[0].indexOf('CREATE TABLE IF NOT EXISTS'));
  assert.ok(statements.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS glorifier_agent_state')));
  assert.ok(statements.some((sql) => sql.includes('CREATE INDEX IF NOT EXISTS idx_glorifier_agent_state_kind_updated')));
  assert.ok(statements.some((sql) => sql.includes('CREATE INDEX IF NOT EXISTS idx_glorifier_agent_state_kind_requester_updated')));
});

test('PostgreSQL task state persists and default requester scoping fails closed', async () => {
  await store.save('task', task);
  assert.deepEqual(await store.get<typeof task>('task', task.id), task);
  assert.deepEqual(await store.list<typeof task>('task', 10), []);
  assert.deepEqual(await store.list<typeof task>('task', 10, ''), []);
  assert.deepEqual(await store.list<typeof task>('task', 10, undefined, true), [task]);
});

test('PostgreSQL requester filtering occurs before LIMIT and explicit all-task grants override it', async () => {
  const alice = { ...task, id: 'task-alice-older', requester: 'alice-uid', updatedAt: '2026-10-29T10:00:00.000Z' };
  const bob = { ...task, id: 'task-bob-newer', requester: 'bob-uid', updatedAt: '2026-10-30T10:00:00.000Z' };
  await store.save('task', alice);
  await store.save('task', bob);
  assert.deepEqual((await store.list<typeof task>('task', 1, 'alice-uid')).map((entry) => entry.id), [alice.id]);
  const requesterListSql = statements[statements.length - 1] || '';
  assert.match(requesterListSql, /payload->>'requester'\s*=\s*\$3/);
  assert.deepEqual(queryValues[queryValues.length - 1], ['task', 1, 'alice-uid']);
  assert.deepEqual(
    (await store.list<typeof task>('task', 10, 'alice-uid', true)).map((entry) => entry.id).sort(),
    [task.id, alice.id, bob.id].sort(),
  );
});

test('PostgreSQL task heartbeats stop after completion and stale recovery is explicit', async () => {
  const running = { ...task, id: 'task-running', status: 'running' };
  await store.save('task', running);
  const recent = { ...task, id: 'task-recent-running', status: 'running', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await store.save('task', recent);
  assert.equal(await store.heartbeatRunningTask(recent.id), true);
  assert.equal((await store.get<typeof recent>('task', recent.id))?.status, 'running');
  assert.ok(Date.parse((await store.get<typeof recent>('task', recent.id))?.updatedAt || '') >= Date.parse(recent.updatedAt));
  await store.save('task', { ...recent, status: 'completed', updatedAt: new Date().toISOString() });
  assert.equal(await store.heartbeatRunningTask(recent.id), false);
  assert.equal(await store.recoverInterruptedTasks(30), 1);
  const sql = statements[statements.length - 1] || '';
  assert.match(sql, /updated_at < NOW\(\) - \(\$2::integer \* INTERVAL '1 minute'\)/);
  assert.equal(queryValues[queryValues.length - 1]?.[1], 30);
  assert.equal((await store.get<typeof recent>('task', recent.id))?.status, 'completed');
  const recovered = await store.get<typeof running & { error?: string }>('task', running.id);
  assert.equal(recovered?.status, 'failed');
  assert.match(recovered?.error || '', /automatic replay is disabled/);
  assert.notEqual(recovered?.updatedAt, running.updatedAt);
  assert.equal(recovered?.updatedAt, rows.get('task:' + running.id)?.updated_at);
  assert.ok(sql.includes("'{updatedAt}'"));
});

test('PostgreSQL session counters preserve safe large integers and compaction thresholds', async () => {
  const session = {
    id: 'session-1', agentId: 'agent-test', createdAt: '2026-10-29T10:00:00.000Z',
    updatedAt: '2026-10-29T10:00:00.000Z', turnCount: 0, contextTokens: 0,
    maxContextTokens: 32_000, status: 'active', compactionRecommended: false,
  };
  await store.save('session', session);
  assert.deepEqual(await store.get<typeof session>('session', session.id), session);
  assert.deepEqual(await store.list<typeof session>('session', 10, undefined, true), [session]);
  const incremented = await store.incrementSessionTurn<typeof session>(session.id, 100);
  assert.equal(incremented?.turnCount, 1);
  assert.equal((await store.get<typeof session>('session', session.id))?.turnCount, 1);
  assert.ok(statements.some((sql) => sql.includes('RETURNING payload')));
  assert.match(statements.find((sql) => sql.includes('RETURNING payload')) || '', /turnCount.*COALESCE/s);
  const large = await store.incrementSessionTurn<typeof session>(session.id, 2_147_483_648);
  assert.equal(large?.contextTokens, 2_147_483_648);
});
