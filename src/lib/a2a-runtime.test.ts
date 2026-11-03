import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createA2ATask, executeA2ATask, listA2ATasks } from './a2a-runtime.ts';

const previousDatabaseUrl = process.env.DATABASE_URL;
const previousSecret = process.env.GLORIFIER_A2A_SIGNING_SECRET;
delete process.env.DATABASE_URL;
process.env.GLORIFIER_A2A_SIGNING_SECRET = 'unit-test-a2a-signing-secret';

after(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  if (previousSecret === undefined) delete process.env.GLORIFIER_A2A_SIGNING_SECRET;
  else process.env.GLORIFIER_A2A_SIGNING_SECRET = previousSecret;
});

test('A2A task listing is scoped to its authenticated requester', () => {
  const alice = createA2ATask({ requesterAgentId: 'alice-uid', capability: 'research', objective: 'Verify requester-scoped A2A task listing.' });
  const bob = createA2ATask({ requesterAgentId: 'bob-uid', capability: 'research', objective: 'Verify tenant isolation for A2A task listing.' });
  assert.deepEqual(listA2ATasks(50), [], 'unscoped A2A task reads must fail closed');
  assert.deepEqual(listA2ATasks(50, ''), [], 'blank A2A requester identity must fail closed');
  assert.deepEqual(listA2ATasks(50, 'alice-uid').map((task) => task.id), [alice.id]);
  assert.deepEqual(listA2ATasks(50, 'bob-uid').map((task) => task.id), [bob.id]);
  assert.deepEqual(listA2ATasks(50, undefined, true).map((task) => task.id).sort(), [alice.id, bob.id].sort());
  assert.deepEqual(listA2ATasks(50, 'alice-uid', true).map((task) => task.id).sort(), [alice.id, bob.id].sort());
});

test('A2A executor prompts use real newline separators', async () => {
  const task = createA2ATask({ requesterAgentId: 'a2a-runtime-test', targetAgentId: 'research-agent', capability: 'research', objective: 'Check prompt line boundaries', input: { source: 'unit-test' }, maxAttempts: 1 });
  let capturedPrompt = '';
  const result = await executeA2ATask(task, async (prompt) => { capturedPrompt = prompt; return { text: 'test artifact', model: 'test-model' }; });
  assert.equal(result.status, 'completed');
  assert.ok(capturedPrompt.includes('\nAgent identity: research-agent\nCapability: research\nObjective: Check prompt line boundaries'));
  assert.ok(!capturedPrompt.includes('\\nAgent identity:'), 'executor prompt must not contain literal backslash-n separators');
});
