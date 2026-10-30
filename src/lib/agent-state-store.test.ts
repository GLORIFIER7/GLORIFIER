import { strict as assert } from 'node:assert';
import { PostgresAgentStateStore, type AgentStateQuery } from './agent-state-store.ts';

type StoredRow = {
  kind: string;
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  payload: unknown;
};

const rows = new Map<string, StoredRow>();
const statements: string[] = [];
const queryValues: unknown[][] = [];
const query: AgentStateQuery = async (sql, values = []) => {
  statements.push(sql);
  queryValues.push(values);
  if (sql.includes('INSERT INTO glorifier_agent_state')) {
    const [kind, id, status, payload, createdAt, updatedAt] = values as [string, string, string, string, string, string];
    rows.set(`${kind}:${id}`, {
      kind, id, status, created_at: createdAt, updated_at: updatedAt, payload: JSON.parse(payload),
    });
    return { rows: [], rowCount: 1 };
  }
  if (sql.includes('SELECT payload FROM glorifier_agent_state')) {
    const [kind, idOrLimit, requester] = values as [string, string | number, string | undefined];
    if (sql.includes('WHERE kind = $1 AND id = $2')) {
      const row = rows.get(`${kind}:${idOrLimit}`);
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
    const row = rows.get(`task:${id}`);
    if (!row || row.status !== 'running') return { rows: [], rowCount: 0 };
    const updatedAt = new Date().toISOString();
    const updatedPayload = { ...(row.payload as Record<string, unknown>), updatedAt };
    rows.set(`task:${id}`, { ...row, payload: updatedPayload, updated_at: updatedAt });
    return { rows: [{ id }], rowCount: 1 };
  }
  if (sql.includes('UPDATE glorifier_agent_state') && sql.includes('RETURNING payload')) {
    const [id, contextTokens] = values as [string, number];
    const row = rows.get(`session:${id}`);
    if (!row) return { rows: [], rowCount: 0 };
    const current = row.payload as Record<string, unknown>;
    const updatedAt = new Date().toISOString();
    const updated = {
      ...current,
      status: 'active',
      turnCount: Number(current.turnCount || 0) + 1,
      contextTokens,
      updatedAt,
      compactionRecommended: contextTokens >= Math.floor(Number(current.maxContextTokens || 32_000) * 0.8),
    };
    rows.set(`session:${id}`, { ...row, status: 'active', payload: updated, updated_at: updatedAt });
    return { rows: [{ payload: updated }], rowCount: 1 };
  }
  if (sql.includes('UPDATE glorifier_agent_state')) {
    let recovered = 0;
    const staleAfterMinutes = Number(values[1] ?? 30);
    const staleBefore = Date.now() - staleAfterMinutes * 60 * 1000;
    for (const [key, row] of rows) {
      if (row.kind !== 'task' || row.status !== 'running') continue;
      if (Date.parse(row.updated_at) >= staleBefore) continue;
      const payload = row.payload as Record<string, unknown>;
      const recoveredAt = new Date().toISOString();
      const updatesSerializedTimestamp = sql.includes("'{updatedAt}'");
      const updated = {
        ...payload,
        status: 'failed',
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
await store.initialize();

assert.ok(statements.some((sql) => sql.includes('pg_advisory_xact_lock')), 'schema initialization must serialize concurrent DDL');
assert.ok(
  statements[0].indexOf('pg_advisory_xact_lock') < statements[0].indexOf('CREATE TABLE IF NOT EXISTS'),
  'the transaction-scoped schema lock must be acquired before DDL',
);
assert.ok(statements.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS glorifier_agent_state')));
assert.ok(statements.some((sql) => sql.includes('CREATE INDEX IF NOT EXISTS idx_glorifier_agent_state_kind_updated')));
assert.ok(statements.some((sql) => sql.includes('CREATE INDEX IF NOT EXISTS idx_glorifier_agent_state_kind_requester_updated')));

const task = {
  id: 'task-1',
  capability: 'research',
  objective: 'Persist this task',
  requester: 'human-owner',
  createdAt: '2026-10-29T10:00:00.000Z',
  updatedAt: '2026-10-29T10:00:00.000Z',
  status: 'queued',
};
await store.save('task', task);
assert.deepEqual(await store.get<typeof task>('task', task.id), task);
assert.deepEqual(await store.list<typeof task>('task', 10), [], 'task listing without an explicit requester or all-task grant must fail closed');
assert.deepEqual(await store.list<typeof task>('task', 10, ''), [], 'a blank requester must not disable task scoping');
assert.deepEqual(await store.list<typeof task>('task', 10, undefined, true), [task], 'all-task listing requires an explicit authorization grant');

// Requester filtering must occur in SQL before LIMIT, not after a global page
// has already been selected. A much newer task from Bob must not hide Alice's.
const aliceOlderTask = {
  ...task,
  id: 'task-alice-older',
  requester: 'alice-uid',
  updatedAt: '2026-10-29T10:00:00.000Z',
};
const bobNewerTask = {
  ...task,
  id: 'task-bob-newer',
  requester: 'bob-uid',
  updatedAt: '2026-10-30T10:00:00.000Z',
};
await store.save('task', aliceOlderTask);
await store.save('task', bobNewerTask);
assert.deepEqual(
  (await store.list<typeof task>('task', 1, 'alice-uid')).map((entry) => entry.id),
  [aliceOlderTask.id],
  'the per-requester filter must apply before the list limit',
);
const requesterListSql = statements[statements.length - 1] || '';
assert.match(requesterListSql, /payload->>'requester'\s*=\s*\$3/);
assert.deepEqual(queryValues[queryValues.length - 1], ['task', 1, 'alice-uid']);

assert.deepEqual(
  (await store.list<typeof task>('task', 10, 'alice-uid', true)).map((entry) => entry.id).sort(),
  [task.id, aliceOlderTask.id, bobNewerTask.id].sort(),
  'an explicit all-task grant must take precedence over an optional requester filter',
);

const running = { ...task, id: 'task-running', status: 'running' };
await store.save('task', running);
const recentRunning = {
  ...task,
  id: 'task-recent-running',
  status: 'running',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
await store.save('task', recentRunning);
assert.equal(await store.heartbeatRunningTask(recentRunning.id), true);
assert.equal((await store.get<typeof recentRunning>('task', recentRunning.id))?.status, 'running');
assert.ok(Date.parse((await store.get<typeof recentRunning>('task', recentRunning.id))?.updatedAt || '') >= Date.parse(recentRunning.updatedAt));
await store.save('task', { ...recentRunning, status: 'completed', updatedAt: new Date().toISOString() });
assert.equal(await store.heartbeatRunningTask(recentRunning.id), false, 'a late heartbeat must not resurrect a completed task');
assert.equal(await store.recoverInterruptedTasks(30), 1);
const recoverySql = statements[statements.length - 1] || '';
assert.match(recoverySql, /updated_at < NOW\(\) - \(\$2::integer \* INTERVAL '1 minute'\)/);
assert.equal(queryValues[queryValues.length - 1]?.[1], 30, 'the store SQL receives the configured stale threshold');
assert.equal((await store.get<typeof recentRunning>('task', recentRunning.id))?.status, 'completed');
const recovered = await store.get<typeof running & { error?: string }>('task', running.id);
assert.equal(recovered?.status, 'failed');
assert.match(recovered?.error || '', /automatic replay is disabled/);
assert.notEqual(recovered?.updatedAt, running.updatedAt, 'recovery must refresh the serialized task timestamp');
assert.equal(
  recovered?.updatedAt,
  rows.get(`task:${running.id}`)?.updated_at,
  'serialized and indexed task timestamps must remain consistent after recovery',
);
assert.ok(
  recoverySql.includes("'{updatedAt}'"),
  'recovery SQL must update the timestamp stored inside the JSON payload',
);

const session = {
  id: 'session-1',
  agentId: 'agent-test',
  createdAt: '2026-10-29T10:00:00.000Z',
  updatedAt: '2026-10-29T10:00:00.000Z',
  turnCount: 0,
  contextTokens: 0,
  maxContextTokens: 32_000,
  status: 'active',
  compactionRecommended: false,
};
await store.save('session', session);
assert.deepEqual(await store.get<typeof session>('session', session.id), session);
assert.deepEqual(await store.list<typeof session>('session', 10, undefined, true), [session]);
const incrementedSession = await store.incrementSessionTurn<typeof session>(session.id, 100);
assert.equal(incrementedSession?.turnCount, 1, 'the store returns the incremented session record');
assert.equal((await store.get<typeof session>('session', session.id))?.turnCount, 1);
assert.ok(statements.some((sql) => sql.includes('RETURNING payload')));
assert.match(statements.find((sql) => sql.includes('RETURNING payload')) || '', /turnCount.*COALESCE/s);
const largeTokenUpdate = await store.incrementSessionTurn<typeof session>(session.id, 2_147_483_648);
assert.equal(largeTokenUpdate?.contextTokens, 2_147_483_648, 'safe counters above int32 must be preserved');



console.log('durable agent state store tests: PASS');
