import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { execFileSync } from 'node:child_process';
import {
  createAgentTask,
  getAgentTask,
  getAgentRuntimePersistenceStatus,
  getAgentTaskRecoveryObservation,
  heartbeatAgentTask,
  withAgentTaskHeartbeat,
  initializeAgentRuntimePersistence,
  listAgentTasks,
  updateAgentTask,
  requireAgentTaskUpdate,
  canAccessAgentTask,
  filterAgentTasksByRequester,
  resolveAgentTaskRequester,
} from './agent-runtime.ts';
import type { PostgresAgentStateStore } from './agent-state-store.ts';

const previousDatabaseUrl = process.env.DATABASE_URL;
delete process.env.DATABASE_URL;

after(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

test('agent task ownership and requester attribution fail closed by default', () => {
  const fixtures = [
    { id: 'alice-task', requester: 'alice-uid' },
    { id: 'bob-task', requester: 'bob-uid' },
    { id: 'system-task', requester: 'human-owner' },
  ];
  assert.equal(canAccessAgentTask(fixtures[0], 'alice-uid'), true);
  assert.equal(canAccessAgentTask(fixtures[1], 'alice-uid'), false);
  assert.equal(canAccessAgentTask(fixtures[1], 'alice-uid', true), true);
  assert.equal(canAccessAgentTask(fixtures[0], ''), false);
  assert.deepEqual(filterAgentTasksByRequester(fixtures, 'alice-uid').map((task) => task.id), ['alice-task']);
  assert.deepEqual(filterAgentTasksByRequester(fixtures, '', true).map((task) => task.id), ['alice-task', 'bob-task', 'system-task']);
  assert.equal(resolveAgentTaskRequester('alice-uid', 'human-owner'), 'alice-uid');
  assert.equal(resolveAgentTaskRequester('owner-uid', 'delegated-agent', true), 'delegated-agent');
  assert.equal(resolveAgentTaskRequester(undefined, 'internal-agent', true), 'internal-agent');
  assert.equal(resolveAgentTaskRequester(undefined, 'human-owner'), null);
  const federated = [{ id: 'fa2a-alice', requesterAgentId: 'alice-uid' }, { id: 'fa2a-bob', requesterAgentId: 'bob-uid' }];
  assert.equal(canAccessAgentTask(federated[0], 'alice-uid'), true);
  assert.equal(canAccessAgentTask(federated[1], 'alice-uid'), false);
  assert.deepEqual(filterAgentTasksByRequester(federated, 'alice-uid').map((task) => task.id), ['fa2a-alice']);
  assert.equal(resolveAgentTaskRequester('alice-uid', 'bob-uid'), 'alice-uid');
});

test('agent runtime APIs reject access while persistence is uninitialized', async () => {
  execFileSync(process.execPath, [
    '--import', 'tsx/esm', '--input-type=module', '-e',
    "import assert from 'node:assert/strict'; const runtime = await import('./src/lib/agent-runtime.ts'); assert.equal(runtime.getAgentRuntimePersistenceStatus().mode, 'uninitialized'); await assert.rejects(() => runtime.createAgentTask({ capability: 'research', objective: 'must fail closed', requester: 'test' }), /still initializing/); await assert.rejects(() => runtime.getAgentTask('task-not-initialized'), /still initializing/);",
  ], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: 'postgresql://unit-test.invalid/uninitialized' },
    stdio: 'pipe',
  });
  assert.equal(getAgentRuntimePersistenceStatus().mode, 'uninitialized');
  await assert.rejects(
    () => createAgentTask({ capability: 'research', objective: 'must fail closed', requester: 'test' }),
    /still initializing/,
  );
});

test('memory fallback initializes explicitly and maintains task lifecycle heartbeats', async () => {
  assert.equal(await initializeAgentRuntimePersistence(), false);
  assert.equal(getAgentRuntimePersistenceStatus().mode, 'memory-fallback');
  assert.equal(getAgentRuntimePersistenceStatus().durable, false);
  assert.equal(getAgentRuntimePersistenceStatus().cachedTasks, 0);
  const now = Date.now();
  assert.equal(getAgentTaskRecoveryObservation({ status: 'running', updatedAt: new Date(now - 30_000).toISOString() }, now).state, 'heartbeat-current');
  assert.equal(getAgentTaskRecoveryObservation({ status: 'running', updatedAt: new Date(now - 5 * 60_000).toISOString() }, now).state, 'heartbeat-overdue');
  assert.equal(getAgentTaskRecoveryObservation({ status: 'running', updatedAt: new Date(now - 31 * 60_000).toISOString() }, now).state, 'startup-recovery-eligible');
  assert.deepEqual(getAgentRuntimePersistenceStatus().recoveryPolicy, {
    staleAfterMinutes: 30,
    heartbeatIntervalMs: 60_000,
    heartbeatCoverage: ['agent-task-inference', 'governance-cycle'],
    startupRecoveryOnly: true,
    interruptedWithinGracePeriodMayRemainRunning: true,
    automaticReplay: false,
  });
  const task = await createAgentTask({
    capability: 'research', objective: 'Verify process-local agent task fallback behavior.',
    requester: 'agent-runtime-test', input: { test: true },
  });
  assert.equal(task.status, 'queued');
  assert.equal(typeof task.updatedAt, 'string');
  const running = await updateAgentTask(task.id, { status: 'running' });
  assert.equal(running?.status, 'running');
  assert.equal(running?.createdAt, task.createdAt);
  const firstHeartbeat = running?.updatedAt || '';
  assert.equal(await heartbeatAgentTask(task.id), true);
  assert.equal((await getAgentTask(task.id))?.status, 'running');
  assert.ok(Date.parse((await getAgentTask(task.id))?.updatedAt || '') >= Date.parse(firstHeartbeat));
  const prior = (await getAgentTask(task.id))?.updatedAt || '';
  const result = await withAgentTaskHeartbeat(task.id, async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return 'heartbeat-wrapped-result';
  }, 5);
  assert.equal(result, 'heartbeat-wrapped-result');
  assert.ok(Date.parse((await getAgentTask(task.id))?.updatedAt || '') > Date.parse(prior));
});

test('memory fallback supports terminal status updates and fails closed on unscoped reads', async () => {
  delete process.env.DATABASE_URL;
  assert.equal(await initializeAgentRuntimePersistence(), false);
  const task = await createAgentTask({ capability: 'research', objective: 'Verify terminal statuses.', requester: 'agent-runtime-test' });
  await updateAgentTask(task.id, { status: 'running' });
  const failed = await updateAgentTask(task.id, { status: 'failed', error: 'test failure' });
  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.error, 'test failure');
  const completed = await updateAgentTask(task.id, { status: 'completed', result: { recovered: true } });
  assert.equal(completed?.status, 'completed');
  assert.equal(completed?.error, undefined);
  assert.equal((await getAgentTask(task.id))?.status, 'completed');
  assert.deepEqual(await listAgentTasks(10, ''), []);
  assert.deepEqual(await listAgentTasks(10), []);
  assert.equal((await listAgentTasks(10, undefined, true)).some((entry) => entry.id === task.id), true);
  await assert.rejects(() => requireAgentTaskUpdate('missing-task', { status: 'running' }), /Agent task missing-task no longer exists/);
});

test('memory task ordering uses last update and filters requesters before the limit', async () => {
  delete process.env.DATABASE_URL;
  assert.equal(await initializeAgentRuntimePersistence(), false);
  const older = await createAgentTask({ capability: 'research', objective: 'Older task.', requester: 'agent-runtime-test' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const newer = await createAgentTask({ capability: 'research', objective: 'Newer task.', requester: 'agent-runtime-test' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await updateAgentTask(older.id, { status: 'running' });
  assert.equal((await listAgentTasks(10, undefined, true))[0]?.id, older.id);
  assert.notEqual(older.id, newer.id);
  const alice = await createAgentTask({ capability: 'research', objective: 'Older Alice task.', requester: 'alice-uid' });
  for (let index = 0; index < 55; index += 1) {
    await createAgentTask({ capability: 'research', objective: 'Newer Bob task ' + index, requester: 'bob-uid' });
  }
  assert.deepEqual((await listAgentTasks(10, 'alice-uid')).map((entry) => entry.id), [alice.id]);
  assert.equal((await listAgentTasks(10, 'bob-uid')).length, 10);
});

test('failed durable persistence initialization leaves runtime uninitialized', async () => {
  process.env.DATABASE_URL = 'postgresql://unit-test.invalid/fail-closed';
  const failingStore = {
    initialize: async () => { throw new Error('database initialization failed'); },
    recoverInterruptedTasks: async () => 0,
    list: async <T>() => [] as T[],
    get: async <T>() => null as T | null,
    save: async () => undefined,
  } as unknown as PostgresAgentStateStore;
  await assert.rejects(() => initializeAgentRuntimePersistence(failingStore), /database initialization failed/);
  assert.equal(getAgentRuntimePersistenceStatus().mode, 'uninitialized');
  await assert.rejects(
    () => createAgentTask({ capability: 'research', objective: 'must remain fail closed', requester: 'test' }),
    /still initializing/,
  );
  delete process.env.DATABASE_URL;
});

test('durable state is database-backed and slow heartbeats do not block task completion', async () => {
  const records = new Map<string, unknown>();
  let hang = false;
  let release: (() => void) | undefined;
  const durableStore = {
    initialize: async () => undefined,
    recoverInterruptedTasks: async () => 0,
    heartbeatRunningTask: async () => {
      if (!hang) return true;
      await new Promise<void>((resolve) => { release = resolve; });
      return true;
    },
    list: async <T>(_kind: 'task' | 'session', _limit = 50, requester?: string, allowAll = false) =>
      [...records.values()].filter((value) => {
        const record = value as { requester?: string };
        return allowAll || (typeof requester === 'string' && requester.length > 0 && record.requester === requester);
      }) as T[],
    get: async <T>(_kind: 'task' | 'session', id: string) => (records.get(id) as T | undefined) ?? null,
    save: async (_kind: 'task' | 'session', record: { id: string }) => { records.set(record.id, structuredClone(record)); },
  } as unknown as PostgresAgentStateStore;
  process.env.DATABASE_URL = 'postgresql://unit-test.invalid/glorifier';
  assert.equal(await initializeAgentRuntimePersistence(durableStore), true);
  assert.equal(getAgentRuntimePersistenceStatus().cachedTasks, 0);
  const task = await createAgentTask({
    capability: 'research', objective: 'Verify durable database-backed task state.',
    requester: 'agent-runtime-test', input: { durable: true },
  });
  assert.equal(getAgentRuntimePersistenceStatus().cachedTasks, 0);
  assert.equal((await updateAgentTask(task.id, { status: 'running' }))?.status, 'running');
  assert.equal((await getAgentTask(task.id))?.status, 'running');
  assert.equal((await listAgentTasks(10, undefined, true)).some((entry) => entry.id === task.id), true);
  assert.equal(getAgentRuntimePersistenceStatus().cachedTasks, 0);
  hang = true;
  const operation = withAgentTaskHeartbeat(task.id, async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    return 'operation-finished-with-hanging-heartbeat';
  }, 5);
  const raced = await Promise.race([operation, new Promise<string>((resolve) => setTimeout(() => resolve('heartbeat-timeout'), 150))]);
  hang = false;
  release?.();
  await operation;
  assert.equal(raced, 'operation-finished-with-hanging-heartbeat');
  assert.equal((await getAgentTask(task.id))?.status, 'running');
  assert.equal(getAgentRuntimePersistenceStatus().cachedTasks, 0);
});

test('durable agent task insertion rejects invalid requesters and does not accept failed writes', async () => {
  delete process.env.DATABASE_URL;
  assert.equal(await initializeAgentRuntimePersistence(), false);
  const failingSaveStore = {
    initialize: async () => undefined,
    recoverInterruptedTasks: async () => 1,
    list: async <T>() => [] as T[],
    get: async <T>() => null as T | null,
    save: async () => { throw new Error('simulated durable save failure'); },
  } as unknown as PostgresAgentStateStore;
  await assert.rejects(
    () => createAgentTask({ capability: 'research', objective: 'reject an invalid requester type', requester: 42 } as never),
    /requester must be a non-empty string/,
  );
  assert.equal(await initializeAgentRuntimePersistence(failingSaveStore), true);
  await assert.rejects(
    () => createAgentTask({ capability: 'research', objective: 'must not be accepted without durable save', requester: 'agent-runtime-test' }),
    /simulated durable save failure/,
  );
  assert.deepEqual(await listAgentTasks(10, undefined, true), []);
});
