import { strict as assert } from 'node:assert';
import {
  createAgentTask,
  getAgentTask,
  getAgentRuntimePersistenceStatus,
  initializeAgentRuntimePersistence,
  listAgentTasks,
  updateAgentTask,
  requireAgentTaskUpdate,
} from './agent-runtime.ts';
import type { PostgresAgentStateStore } from './agent-state-store.ts';

const previousDatabaseUrl = process.env.DATABASE_URL;
delete process.env.DATABASE_URL;

try {
  assert.equal(await initializeAgentRuntimePersistence(), false);
  assert.deepEqual(getAgentRuntimePersistenceStatus(), { mode: 'memory-fallback', durable: false, cachedTasks: 0 });

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

  const failed = await updateAgentTask(task.id, { status: 'failed', error: 'test failure' });
  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.error, 'test failure');

  assert.equal((await getAgentTask(task.id))?.status, 'failed');
  assert.equal((await listAgentTasks(10)).some((entry) => entry.id === task.id), true);

  await assert.rejects(
    () => requireAgentTaskUpdate('missing-task', { status: 'running' }),
    /Agent task missing-task no longer exists/,
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
} finally {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
}

console.log('agent runtime persistence fallback tests: PASS');
