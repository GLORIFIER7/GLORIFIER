import { strict as assert } from 'node:assert';
import {
  createAgentTask,
  getAgentTask,
  getAgentRuntimePersistenceStatus,
  initializeAgentRuntimePersistence,
  listAgentTasks,
  updateAgentTask,
} from './agent-runtime.ts';

const previousDatabaseUrl = process.env.DATABASE_URL;
delete process.env.DATABASE_URL;

try {
  assert.equal(await initializeAgentRuntimePersistence(), false);
  assert.deepEqual(getAgentRuntimePersistenceStatus(), { mode: 'memory-fallback', durable: false });

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
} finally {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
}

console.log('agent runtime persistence fallback tests: PASS');
