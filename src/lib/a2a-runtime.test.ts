import { strict as assert } from 'node:assert';
import { createA2ATask, listA2ATasks } from './a2a-runtime.ts';
import { getPostgresPool } from './db/postgres.ts';

const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/glorifier_test';

try {
  const alice = createA2ATask({
    requesterAgentId: 'alice-uid',
    capability: 'research',
    objective: 'Verify requester-scoped A2A task listing.',
  });
  const bob = createA2ATask({
    requesterAgentId: 'bob-uid',
    capability: 'research',
    objective: 'Verify tenant isolation for A2A task listing.',
  });

  assert.deepEqual(listA2ATasks(50), [], 'unscoped A2A task reads must fail closed');
  assert.deepEqual(listA2ATasks(50, ''), [], 'blank A2A requester identity must fail closed');
  assert.deepEqual(listA2ATasks(50, 'alice-uid').map((task) => task.id), [alice.id]);
  assert.deepEqual(listA2ATasks(50, 'bob-uid').map((task) => task.id), [bob.id]);
  assert.deepEqual(
    listA2ATasks(50, undefined, true).map((task) => task.id).sort(),
    [alice.id, bob.id].sort(),
    'only an explicit all-task grant may return tasks across requesters',
  );
  await new Promise((resolve) => setTimeout(resolve, 25));
  await getPostgresPool().end();
} finally {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
}

console.log('A2A task-list authorization tests: PASS');
import assert from 'node:assert/strict';
import { createA2ATask, executeA2ATask } from './a2a-runtime';

const previousSecret = process.env.GLORIFIER_A2A_SIGNING_SECRET;
process.env.GLORIFIER_A2A_SIGNING_SECRET = 'unit-test-a2a-signing-secret';

try {
  const task = createA2ATask({
    requesterAgentId: 'a2a-runtime-test',
    targetAgentId: 'research-agent',
    capability: 'research',
    objective: 'Check prompt line boundaries',
    input: { source: 'unit-test' },
    maxAttempts: 1,
  });

  let capturedPrompt = '';
  const result = await executeA2ATask(task, async (prompt) => {
    capturedPrompt = prompt;
    return { text: 'test artifact', model: 'test-model' };
  });

  assert.equal(result.status, 'completed');
  assert.ok(
    capturedPrompt.includes('\nAgent identity: research-agent\nCapability: research\nObjective: Check prompt line boundaries'),
    'executor prompt fields must be separated by actual newline characters',
  );
  assert.ok(
    !capturedPrompt.includes('\\nAgent identity:'),
    'executor prompt must not contain literal backslash-n separators',
  );
  console.log('A2A runtime prompt formatting regression test passed.');
} finally {
  if (previousSecret === undefined) delete process.env.GLORIFIER_A2A_SIGNING_SECRET;
  else process.env.GLORIFIER_A2A_SIGNING_SECRET = previousSecret;
}
