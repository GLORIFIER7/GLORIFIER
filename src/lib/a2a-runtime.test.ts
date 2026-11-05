import { strict as assert } from 'node:assert';
import { createA2ATask, executeA2ATask, listA2ATasks, listA2ATaskPageForProtocol, getA2ATaskForRequesterProtocol } from './a2a-runtime.ts';
import { test } from 'node:test';
import crypto from 'node:crypto';

const withA2ATestEnvironment = async (run: () => Promise<void>): Promise<void> => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousSecret = process.env.GLORIFIER_A2A_SIGNING_SECRET;
  delete process.env.DATABASE_URL;
  process.env.GLORIFIER_A2A_SIGNING_SECRET = 'unit-test-a2a-signing-secret';

  try {
    await run();
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousSecret === undefined) delete process.env.GLORIFIER_A2A_SIGNING_SECRET;
    else process.env.GLORIFIER_A2A_SIGNING_SECRET = previousSecret;
  }
};

void test('A2A task listing is requester-scoped unless an explicit all-task grant is present', async () => {
  await withA2ATestEnvironment(async () => {
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
    assert.deepEqual(
      listA2ATasks(50, 'alice-uid', true).map((task) => task.id).sort(),
      [alice.id, bob.id].sort(),
      'an explicit all-task grant must have identical semantics with or without a requester value',
    );
  });
});

void test('A2A executor prompts use real line boundaries', async () => {
  await withA2ATestEnvironment(async () => {
    const promptTask = createA2ATask({
      requesterAgentId: 'a2a-runtime-test',
      targetAgentId: 'research-agent',
      capability: 'research',
      objective: 'Check prompt line boundaries',
      input: { source: 'unit-test' },
      maxAttempts: 1,
    });

    let capturedPrompt = '';
    const result = await executeA2ATask(promptTask, async (prompt) => {
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
  });
});


void test('A2A protocol task pages are requester-scoped, filtered, and cursor-stable', async () => {
  await withA2ATestEnvironment(async () => {
    const requester = `a2a-page-${crypto.randomUUID()}`;
    const otherRequester = `a2a-page-other-${crypto.randomUUID()}`;
    const context = `a2a-context-${crypto.randomUUID()}`;
    const created = [
      createA2ATask({ requesterAgentId: requester, capability: 'research', objective: 'page one', parentTaskId: context }),
      createA2ATask({ requesterAgentId: requester, capability: 'research', objective: 'page two', parentTaskId: context }),
      createA2ATask({ requesterAgentId: requester, capability: 'research', objective: 'page three', parentTaskId: context }),
    ];
    createA2ATask({ requesterAgentId: otherRequester, capability: 'research', objective: 'foreign task' });

    const first = await listA2ATaskPageForProtocol({ requesterAgentId: requester, pageSize: 1, contextId: context });
    assert.equal(first.pageSize, 1);
    assert.equal(first.totalSize, 3);
    assert.equal(first.tasks.length, 1);
    assert.ok(first.nextPageToken);

    const second = await listA2ATaskPageForProtocol({
      requesterAgentId: requester,
      pageSize: 1,
      contextId: context,
      pageToken: first.nextPageToken,
    });
    const third = await listA2ATaskPageForProtocol({
      requesterAgentId: requester,
      pageSize: 1,
      contextId: context,
      pageToken: second.nextPageToken,
    });
    assert.equal(second.totalSize, 3);
    assert.equal(third.totalSize, 3);
    assert.equal(second.tasks.length, 1);
    assert.equal(third.tasks.length, 1);
    assert.equal(third.nextPageToken, '');

    const listedIds = [first.tasks[0].id, second.tasks[0].id, third.tasks[0].id];
    assert.equal(new Set(listedIds).size, 3, 'cursor pagination must not repeat tasks');
    assert.deepEqual([...listedIds].sort(), created.map((task) => task.id).sort(),
      'all requester-owned tasks in the selected context must be returned exactly once');

    await assert.rejects(
      listA2ATaskPageForProtocol({
        requesterAgentId: otherRequester,
        pageSize: 1,
        contextId: context,
        pageToken: first.nextPageToken,
      }),
      /invalid or does not match/,
      'a cursor must not be reusable by a different requester',
    );
  });
});


void test('A2A protocol task lookup applies requester scope before returning a task', async () => {
  await withA2ATestEnvironment(async () => {
    const owner = `a2a-read-owner-${crypto.randomUUID()}`;
    const stranger = `a2a-read-stranger-${crypto.randomUUID()}`;
    const task = createA2ATask({
      requesterAgentId: owner,
      capability: 'research',
      objective: 'Check requester-scoped task reads',
    });

    assert.equal((await getA2ATaskForRequesterProtocol(task.id, owner))?.id, task.id);
    assert.equal(await getA2ATaskForRequesterProtocol(task.id, stranger), null);
    assert.equal(await getA2ATaskForRequesterProtocol(task.id, ''), null);
    assert.equal(await getA2ATaskForRequesterProtocol('missing-task', owner), null);
  });
});
