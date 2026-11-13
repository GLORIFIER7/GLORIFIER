import { strict as assert } from 'node:assert';
import { createA2ATask, createA2ATaskWithIdempotency, A2AIdempotencyConflictError, executeA2ATask, getA2AProtocolManifest, listA2ATasks, listA2ATaskPageForProtocol, getA2ATaskForRequesterProtocol, cancelA2ATaskForRequesterProtocol } from './a2a-runtime.ts';
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


void test('A2A cancellation is requester-scoped, queued-only, and prevents later execution', async () => {
  await withA2ATestEnvironment(async () => {
    const queued = createA2ATask({ requesterAgentId: 'alice', capability: 'research', objective: 'Cancelable queued task' });
    const cancelled = await cancelA2ATaskForRequesterProtocol(queued.id, 'alice');
    assert.equal(cancelled?.status, 'canceled');

    let executed = false;
    const afterCancel = await executeA2ATask(cancelled!, async () => {
      executed = true;
      return { text: 'must not execute', model: 'test-model' };
    });
    assert.equal(executed, false, 'a canceled task must never be handed to a provider');
    assert.equal(afterCancel.status, 'canceled');

    const foreign = await cancelA2ATaskForRequesterProtocol(queued.id, 'bob');
    assert.equal(foreign, null, "cancellation must not disclose another requester's task");

    const running = createA2ATask({ requesterAgentId: 'alice', capability: 'research', objective: 'Already running task' });
    running.status = 'running';
    const notCancelable = await cancelA2ATaskForRequesterProtocol(running.id, 'alice');
    assert.equal(notCancelable?.status, 'running', 'running provider work must not be falsely marked canceled');
  });
});

void test('A2A canceled tasks remain filterable across pages and appear in the protocol lifecycle', async () => {
  await withA2ATestEnvironment(async () => {
    const requester = `a2a-canceled-page-${crypto.randomUUID()}`;
    const created = [
      createA2ATask({ requesterAgentId: requester, capability: 'research', objective: 'canceled page one' }),
      createA2ATask({ requesterAgentId: requester, capability: 'research', objective: 'canceled page two' }),
      createA2ATask({ requesterAgentId: requester, capability: 'research', objective: 'canceled page three' }),
    ];

    for (const task of created) {
      const canceled = await cancelA2ATaskForRequesterProtocol(task.id, requester);
      assert.equal(canceled?.status, 'canceled');
    }

    const first = await listA2ATaskPageForProtocol({
      requesterAgentId: requester,
      pageSize: 1,
      statuses: ['canceled'],
    });
    const second = await listA2ATaskPageForProtocol({
      requesterAgentId: requester,
      pageSize: 1,
      statuses: ['canceled'],
      pageToken: first.nextPageToken,
    });
    const third = await listA2ATaskPageForProtocol({
      requesterAgentId: requester,
      pageSize: 1,
      statuses: ['canceled'],
      pageToken: second.nextPageToken,
    });

    assert.equal(first.totalSize, 3);
    assert.equal(second.totalSize, 3);
    assert.equal(third.totalSize, 3);
    assert.deepEqual(
      [first.tasks[0].id, second.tasks[0].id, third.tasks[0].id].sort(),
      created.map((task) => task.id).sort(),
      'all canceled tasks must be returned exactly once across pages',
    );
    assert.equal(third.nextPageToken, '');

    const manifest = getA2AProtocolManifest();
    assert.ok(manifest.lifecycle.includes('canceled'),
      'the advertised A2A lifecycle must include the terminal canceled state');
  });
});


void test('A2A protocol message idempotency is durable, requester-scoped, and content-bound', async () => {
  await withA2ATestEnvironment(async () => {
    type Stored = Record<string, unknown> & { idempotency_hash: string };
    const records = new Map<string, Stored>();
    const query = async (sql: string, values: unknown[] = []) => {
      if (sql.includes('INSERT INTO a2a_tasks') && sql.includes('idempotency_key')) {
        const [
          id, parentTaskId, requesterAgentId, targetAgentId, capability, objective,
          serializedInput, status, attempts, maxAttempts, createdAt, updatedAt,
          idempotencyKey, idempotencyHash,
        ] = values;
        const key = JSON.stringify([requesterAgentId, idempotencyKey]);
        if (records.has(key)) return { rows: [] };
        records.set(key, {
          id: String(id),
          parent_task_id: parentTaskId ?? null,
          requester_agent_id: String(requesterAgentId),
          target_agent_id: targetAgentId ?? null,
          capability: String(capability),
          objective: String(objective),
          input: typeof serializedInput === 'string' ? JSON.parse(serializedInput) : serializedInput,
          status: String(status),
          attempts: Number(attempts),
          max_attempts: Number(maxAttempts),
          created_at: String(createdAt),
          updated_at: String(updatedAt),
          idempotency_key: String(idempotencyKey),
          idempotency_hash: String(idempotencyHash),
        });
        return { rows: [{ id: String(id) }] };
      }
      if (sql.includes('SELECT') && sql.includes('idempotency_hash')) {
        const key = JSON.stringify([values[0], values[1]]);
        const row = records.get(key);
        return { rows: row ? [row] : [] };
      }
      throw new Error('Unexpected A2A idempotency query.');
    };

    const firstInput = {
      requesterAgentId: 'alice',
      capability: 'research',
      objective: 'Review a proposal',
      input: { nested: { z: 1, a: 2 }, labels: ['one', 'two'] },
      idempotencyKey: 'message-123',
    };
    const first = await createA2ATaskWithIdempotency(firstInput, query);
    const replay = await createA2ATaskWithIdempotency({
      ...firstInput,
      input: { labels: ['one', 'two'], nested: { a: 2, z: 1 } },
    }, query);

    assert.equal(replay.id, first.id,
      'retrying a message with the same requester, key, and semantic JSON payload must return the original task');
    assert.equal(records.size, 1, 'an idempotent retry must not create a second durable task');

    await assert.rejects(
      createA2ATaskWithIdempotency({
        ...firstInput,
        objective: 'A different proposal',
      }, query),
      (error: unknown) => error instanceof A2AIdempotencyConflictError,
      'reusing a requester messageId for different content must return a typed conflict',
    );
    assert.equal(records.size, 1, 'a conflicting retry must not create or overwrite a task');

    const anotherRequester = await createA2ATaskWithIdempotency({
      ...firstInput,
      requesterAgentId: 'bob',
    }, query);
    assert.notEqual(anotherRequester.id, first.id,
      'the same messageId may be used independently by a different authenticated requester');
    assert.equal(records.size, 2);
  });
});
