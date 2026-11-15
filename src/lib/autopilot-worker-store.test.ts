import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkerAutopilotMissionStore } from './autopilot-worker-store';

const sampleMission = (overrides: Record<string, unknown> = {}) => ({
  id: 'mission-00000000-0000-4000-8000-000000000001',
  requester: 'owner-uid',
  idempotencyKey: 'request-001',
  title: 'Inspect release drift',
  objective: 'Inspect Cloudflare production release drift.',
  status: 'queued',
  verificationState: 'not-started',
  version: 1,
  steps: [],
  evidenceRefs: [],
  createdAt: '2026-11-15T10:00:00.000Z',
  updatedAt: '2026-11-15T10:00:00.000Z',
  ...overrides,
});

function fakeFactory(
  responder: (sql: string, values: unknown[] | undefined) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }> | { rows: Array<Record<string, unknown>>; rowCount?: number | null },
) {
  const statements: Array<{ sql: string; values?: unknown[] }> = [];
  let connected = 0;
  let ended = 0;
  const factory = () => ({
    async connect() { connected += 1; },
    async query(sql: string, values?: unknown[]) {
      statements.push({ sql, values });
      return responder(sql, values);
    },
    async end() { ended += 1; },
  });
  return { factory, statements, get connected() { return connected; }, get ended() { return ended; } };
}

const binding = { connectionString: 'postgresql://worker.example.test/glorifier' };

function parameterValueForColumn(
  statement: { sql: string; values?: unknown[] },
  columnName: string,
): unknown {
  const match = statement.sql.match(/INSERT INTO\\s+[^ (]+\\s*\\(([^)]+)\\)\\s*VALUES\\s*\\(([^)]+)\\)/is);
  assert.ok(match, 'Expected an INSERT statement with an explicit column/value list.');
  const columns = match[1].split(',').map(column => column.trim());
  const parameters = match[2].split(',').map(parameter => parameter.trim());
  const columnIndex = columns.indexOf(columnName);
  assert.notEqual(columnIndex, -1, `Expected INSERT to include the ${columnName} column.`);
  const placeholder = parameters[columnIndex];
  assert.ok(placeholder && /^\\$[1-9]\\d*$/.test(placeholder), `Expected a bound SQL parameter for ${columnName}.`);
  const valueIndex = Number(placeholder.slice(1)) - 1;
  return statement.values?.[valueIndex];
}

test('Worker Autopilot store checks the pre-provisioned schema and never runs DDL at request time', async () => {
  const fake = fakeFactory((sql) => {
    if (sql.includes('to_regclass')) {
      return { rows: [{
        table_name: 'glorifier_autopilot_missions',
        can_select: true,
        can_insert: true,
        can_update: true,
      }] };
    }
    return { rows: [] };
  });
  const store = new WorkerAutopilotMissionStore(binding, { requester: 'owner-uid' }, fake.factory as never);

  await store.initialize();

  const sql = fake.statements.map(statement => statement.sql).join('\n');
  assert.match(sql, /to_regclass/);
  assert.match(sql, /set_config\('glorifier\.requester'/);
  assert.match(sql, /set_config\('glorifier\.allow_all'/);
  assert.doesNotMatch(sql, /CREATE TABLE|ALTER TABLE|DROP TABLE/i);
  assert.equal(fake.connected, 1);
  assert.equal(fake.ended, 1);
});

test('Worker Autopilot store creates missions idempotently within the authenticated requester partition', async () => {
  const mission = sampleMission();
  const fake = fakeFactory((sql) => {
    if (sql.includes('INSERT INTO public.glorifier_autopilot_missions')) return { rows: [{ payload: mission }] };
    if (sql.includes('SELECT payload FROM public.glorifier_autopilot_missions')) return { rows: [{ payload: mission }] };
    return { rows: [] };
  });
  const store = new WorkerAutopilotMissionStore(binding, { requester: 'owner-uid' }, fake.factory as never);

  const created = await store.create(mission as never);

  assert.equal(created.id, mission.id);
  const insert = fake.statements.find(statement => statement.sql.includes('INSERT INTO public.glorifier_autopilot_missions'));
  assert.ok(insert);
  assert.match(insert.sql, /ON CONFLICT \(requester, idempotency_key\) DO NOTHING/);
  assert.equal(parameterValueForColumn(insert, 'requester'), 'owner-uid');
  assert.equal(fake.statements.some(statement => statement.sql.includes('glorifier.requester')), true);
});

test('Worker Autopilot store prevents a caller-scoped adapter from reading another requester', async () => {
  const fake = fakeFactory(() => ({ rows: [] }));
  const store = new WorkerAutopilotMissionStore(binding, { requester: 'owner-uid' }, fake.factory as never);

  await assert.rejects(
    () => store.list('different-user', 50, false),
    /requester context/i,
  );
  assert.equal(fake.statements.length, 0);
});

test('Worker Autopilot store reserves mission claiming and expiry recovery for an elevated service context', async () => {
  const userScoped = new WorkerAutopilotMissionStore(binding, { requester: 'owner-uid' }, fakeFactory(() => ({ rows: [] })).factory as never);
  await assert.rejects(() => userScoped.claimNext('scheduler', 60_000, '2026-11-15T10:00:00.000Z'), /internal|elevated/i);
  await assert.rejects(() => userScoped.recoverExpired('2026-11-15T10:00:00.000Z'), /internal|elevated/i);
});

test('Worker Autopilot store rolls back a failed mission write and always closes its connection', async () => {
  const fake = fakeFactory((sql) => {
    if (sql.includes('INSERT INTO public.glorifier_autopilot_missions')) throw new Error('database write failed');
    return { rows: [] };
  });
  const store = new WorkerAutopilotMissionStore(binding, { requester: 'owner-uid' }, fake.factory as never);

  await assert.rejects(() => store.create(sampleMission() as never), /database write failed/);
  assert.equal(fake.statements.some(statement => statement.sql === 'ROLLBACK'), true);
  assert.equal(fake.connected, 1);
  assert.equal(fake.ended, 1);
});
