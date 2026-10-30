import { strict as assert } from 'node:assert';
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
} from './agent-runtime.ts';
import type { PostgresAgentStateStore } from './agent-state-store.ts';

const previousDatabaseUrl = process.env.DATABASE_URL;
delete process.env.DATABASE_URL;

// A separate process proves DATABASE_URL is read after the environment is populated
// but before the module initializes persistence; APIs must fail closed in that state.
execFileSync(process.execPath, [
  '--import',
  'tsx/esm',
  '--input-type=module',
  '-e',
  `
    import assert from 'node:assert/strict';
    const runtime = await import('./src/lib/agent-runtime.ts');
    assert.equal(runtime.getAgentRuntimePersistenceStatus().mode, 'uninitialized');
    await assert.rejects(
      () => runtime.createAgentTask({ capability: 'research', objective: 'must fail closed', requester: 'test' }),
      /still initializing/,
    );
    await assert.rejects(() => runtime.getAgentTask('task-not-initialized'), /still initializing/);
  `,
], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: 'postgresql://unit-test.invalid/uninitialized' },
  stdio: 'pipe',
});

// Modules must not assume memory fallback before dotenv/runtime configuration has settled.
assert.equal(getAgentRuntimePersistenceStatus().mode, 'uninitialized');
await assert.rejects(
  () => createAgentTask({ capability: 'research', objective: 'must fail closed', requester: 'test' }),
  /still initializing/,
);

try {
  assert.equal(await initializeAgentRuntimePersistence(), false);
  assert.equal(getAgentRuntimePersistenceStatus().mode, 'memory-fallback');
  assert.equal(getAgentRuntimePersistenceStatus().durable, false);
  assert.equal(getAgentRuntimePersistenceStatus().cachedTasks, 0);

  const recoveryNow = Date.now();
  assert.equal(
    getAgentTaskRecoveryObservation({ status: 'running', updatedAt: new Date(recoveryNow - 30_000).toISOString() }, recoveryNow).state,
    'heartbeat-current',
  );
  assert.equal(
    getAgentTaskRecoveryObservation({ status: 'running', updatedAt: new Date(recoveryNow - 5 * 60_000).toISOString() }, recoveryNow).state,
    'heartbeat-overdue',
  );
  assert.equal(
    getAgentTaskRecoveryObservation({ status: 'running', updatedAt: new Date(recoveryNow - 31 * 60_000).toISOString() }, recoveryNow).state,
    'startup-recovery-eligible',
  );
  assert.deepEqual(getAgentRuntimePersistenceStatus().recoveryPolicy, {
    staleAfterMinutes: 30,
    heartbeatIntervalMs: 60_000,
    heartbeatCoverage: ['agent-task-inference', 'governance-cycle'],
    startupRecoveryOnly: true,
    interruptedWithinGracePeriodMayRemainRunning: true,
    automaticReplay: false,
  });

  const task = await createAgentTask({
    capability: 'research',
    objective: 'Verify process-local agent task fallback behavior.',
    requester: 'agent-runtime-test',
    input: { test: true },
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

  const heartbeatResult = await withAgentTaskHeartbeat(
    task.id,
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 'heartbeat-wrapped-result';
    },
    5,
  );
  assert.equal(heartbeatResult, 'heartbeat-wrapped-result');
  assert.equal((await getAgentTask(task.id))?.status, 'running');

  const failed = await updateAgentTask(task.id, { status: 'failed', error: 'test failure' });
  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.error, 'test failure');

  assert.equal((await getAgentTask(task.id))?.status, 'failed');
  assert.equal((await listAgentTasks(10)).some((entry) => entry.id === task.id), true);

  // Memory fallback and PostgreSQL mode must order tasks by last update, not creation.
  const olderTask = await createAgentTask({
    capability: 'research',
    objective: 'Verify ordering by last update.',
    requester: 'agent-runtime-test',
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const newerTask = await createAgentTask({
    capability: 'research',
    objective: 'Verify ordering by last update with a newer creation time.',
    requester: 'agent-runtime-test',
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await updateAgentTask(olderTask.id, { status: 'running' });
  assert.equal(
    (await listAgentTasks(10))[0]?.id,
    olderTask.id,
    'recently updated older tasks must sort ahead of newly created but older-updated tasks',
  );
  assert.notEqual(olderTask.id, newerTask.id);

  await assert.rejects(
    () => requireAgentTaskUpdate('missing-task', { status: 'running' }),
    /Agent task missing-task no longer exists/,
  );

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

  const durableRecords = new Map<string, unknown>();
  const durableStore = {
    initialize: async () => undefined,
    recoverInterruptedTasks: async () => 0,
    list: async <T>() => [...durableRecords.values()] as T[],
    get: async <T>(_kind: 'task' | 'session', id: string) => (durableRecords.get(id) as T | undefined) ?? null,
    save: async (_kind: 'task' | 'session', record: { id: string }) => {
      durableRecords.set(record.id, structuredClone(record));
    },
  } as unknown as PostgresAgentStateStore;

  process.env.DATABASE_URL = 'postgresql://unit-test.invalid/glorifier';
  assert.equal(await initializeAgentRuntimePersistence(durableStore), true);
  assert.equal(getAgentRuntimePersistenceStatus().cachedTasks, 0);
  const durableTask = await createAgentTask({
    capability: 'research',
    objective: 'Verify durable task state remains database-backed.',
    requester: 'agent-runtime-test',
    input: { durable: true },
  });
  assert.equal(getAgentRuntimePersistenceStatus().cachedTasks, 0);
  assert.equal((await updateAgentTask(durableTask.id, { status: 'running' }))?.status, 'running');
  assert.equal((await getAgentTask(durableTask.id))?.status, 'running');
  assert.equal((await listAgentTasks(10)).some((entry) => entry.id === durableTask.id), true);
  assert.equal(getAgentRuntimePersistenceStatus().cachedTasks, 0);

  await assert.rejects(
    () => createAgentTask({
      capability: 'research',
      objective: 'reject an invalid requester type',
      requester: 42,
    } as never),
    /requester must be a non-empty string/,
  );

  const failingSaveStore = {
    initialize: async () => undefined,
    recoverInterruptedTasks: async () => 1,
    list: async <T>() => [] as T[],
    get: async <T>() => null as T | null,
    save: async () => { throw new Error('simulated durable save failure'); },
  } as unknown as PostgresAgentStateStore;
  assert.equal(await initializeAgentRuntimePersistence(failingSaveStore), true);
  await assert.rejects(
    () => createAgentTask({ capability: 'research', objective: 'must not be accepted without durable save', requester: 'agent-runtime-test' }),
    /simulated durable save failure/,
  );
  assert.deepEqual(await listAgentTasks(10), [], 'a task whose durable insert failed must not appear as accepted');
} finally {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
}

console.log('agent runtime persistence fallback tests: PASS');
