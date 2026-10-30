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
