import assert from 'node:assert/strict';
import {
  A2A_PROTOCOL_VERSION,
  isCompatibleA2AProtocolVersion,
  isAuthorizedA2AExecution,
  buildA2AAgentCard,
  createA2AJsonRpcHandler,
  toA2ATask,
  type A2ATaskLike,
  type A2ACreateTaskInput,
} from './a2a-v1';
import { test } from 'node:test';

const baseTask = (overrides: Partial<A2ATaskLike> = {}): A2ATaskLike => ({
  id: 'a2a-task-1',
  parentTaskId: null,
  requesterAgentId: 'user-123',
  capability: 'a2a-message-intake',
  objective: 'Review this proposal',
  status: 'queued',
  updatedAt: '2026-10-30T00:00:00.000Z',
  ...overrides,
});

const createTestHandler = () => {
  const created: A2ACreateTaskInput[] = [];
  const existing = baseTask({ status: 'running', requesterAgentId: 'verified-user-42' });
  const handler = createA2AJsonRpcHandler({
    requesterAgentId: 'verified-user-42',
    createTask(input) {
      created.push(input);
      return baseTask({ requesterAgentId: input.requesterAgentId, objective: input.objective, parentTaskId: input.parentTaskId || null });
    },
    getTask(id) {
      return id === existing.id ? existing : null;
    },
    listTasks: async (input) => ({
      tasks: [existing],
      nextPageToken: '',
      pageSize: input.pageSize,
      totalSize: 1,
    }),
  });
  return { created, existing, handler };
};

void test('A2A v1 Agent Card advertises a valid protocol and requires owner approval', () => {
  const card = buildA2AAgentCard('https://glorifier.glorifier.workers.dev', '0.2.1');

  assert.equal(A2A_PROTOCOL_VERSION, '1.0');
  assert.equal(isCompatibleA2AProtocolVersion('1.0'), true);
  assert.equal(isCompatibleA2AProtocolVersion('1.0.1'), true,
    'patch versions remain compatible within the same major/minor protocol');
  assert.equal(isCompatibleA2AProtocolVersion('1.0.12'), true);
  assert.equal(isCompatibleA2AProtocolVersion('1.1'), false);
  assert.equal(isCompatibleA2AProtocolVersion('1.0.invalid'), false);
  assert.equal(isCompatibleA2AProtocolVersion(undefined), false,
    'omitted protocol version defaults to unsupported 0.3');

  assert.equal(isAuthorizedA2AExecution(false, 'approved'), false,
    'caller-supplied approval is never sufficient without verified owner identity');
  assert.equal(isAuthorizedA2AExecution(true, 'pending'), false,
    'owner identity alone is not an approval');
  assert.equal(isAuthorizedA2AExecution(true, 'approved'), true,
    'execution requires authenticated owner identity and explicit approval');
  assert.equal(isAuthorizedA2AExecution(true, 'APPROVED'), false,
    'approval values must match the exact tested token');
  assert.equal(isAuthorizedA2AExecution(true, ['approved']), false,
    'array coercion must not satisfy the approval gate');

  assert.equal(card.name, 'GLORIFIER Services');
  assert.equal(card.version, '0.2.1');
  assert.deepEqual(card.supportedInterfaces, [{
    url: 'https://glorifier.glorifier.workers.dev/api/a2a/v1',
    protocolBinding: 'JSONRPC',
    protocolVersion: '1.0',
  }]);
  assert.equal(card.capabilities.streaming, false);
  assert.equal(card.capabilities.pushNotifications, false);
  assert.deepEqual(card.defaultInputModes, ['text/plain', 'application/json']);
  assert.deepEqual(card.defaultOutputModes, ['application/json']);
  assert.ok(card.skills.some((skill) => skill.id === 'governed-task-intake'));
  assert.ok(card.securitySchemes.bearer.httpAuthSecurityScheme);
  assert.deepEqual(card.securityRequirements, [{ schemes: { bearer: { list: [] } } }]);
  assert.deepEqual(
    Object.keys(card.securityRequirements[0].schemes),
    Object.keys(card.securitySchemes),
    'every security requirement must reference a declared Agent Card security scheme',
  );

  assert.throws(() => buildA2AAgentCard('http://example.com'), /HTTPS/);
  assert.throws(() => buildA2AAgentCard('https://user:pass@example.com'), /credentials/);
  assert.throws(() => buildA2AAgentCard('https://example.com/path'), /origin/);
});

void test('A2A SendMessage creates a task for the authenticated requester', async () => {
  const { created, handler } = createTestHandler();
  const submit = await handler({
    jsonrpc: '2.0',
    id: 'request-1',
    method: 'SendMessage',
    params: {
      message: {
        messageId: 'message-1',
        role: 'ROLE_USER',
        parts: [{ text: 'Review this proposal' }],
      },
    },
  });

  assert.equal(submit.id, 'request-1');
  assert.equal(submit.error, undefined);
  const submittedTask = (submit.result as {
    task: {
      id: string;
      status: {
        state: string;
        message: { role: string; contextId: string; taskId: string; parts: Array<{ text: string }> };
      };
    };
  }).task;
  assert.equal(submittedTask.id, 'a2a-task-1');
  assert.equal(submittedTask.status.state, 'TASK_STATE_SUBMITTED');
  assert.match(submittedTask.status.message.parts[0].text, /human approval/i);
  assert.equal(submittedTask.status.message.role, 'ROLE_AGENT');
  assert.equal(submittedTask.status.message.contextId, 'a2a-task-1');
  assert.equal(submittedTask.status.message.taskId, 'a2a-task-1');
  assert.equal(created.length, 1);
  assert.equal(created[0].requesterAgentId, 'verified-user-42');
  assert.equal(created[0].capability, 'a2a-message-intake');
  assert.equal(created[0].objective, 'Review this proposal');
});

void test('A2A GetTask returns only tasks owned by the authenticated requester', async () => {
  const { existing, handler } = createTestHandler();
  const getTask = await handler({
    jsonrpc: '2.0',
    id: 2,
    method: 'GetTask',
    params: { id: existing.id },
  });
  assert.equal((getTask.result as { status: { state: string } }).status.state, 'TASK_STATE_WORKING');
  assert.equal(getTask.id, 2);

  const privateTaskHandler = createA2AJsonRpcHandler({
    requesterAgentId: 'other-user',
    createTask: () => { throw new Error('not used'); },
    getTask: () => existing,
    listTasks: async (input) => ({ tasks: [], nextPageToken: '', pageSize: input.pageSize, totalSize: 0 }),
  });
  const crossUserTask = await privateTaskHandler({
    jsonrpc: '2.0',
    id: 22,
    method: 'GetTask',
    params: { id: existing.id },
  });
  assert.equal((crossUserTask.error as { code: number }).code, -32001,
    'task lookup must not disclose a different user task');

  const missingTask = await handler({
    jsonrpc: '2.0',
    id: 3,
    method: 'GetTask',
    params: { id: 'missing' },
  });
  assert.equal((missingTask.error as { code: number }).code, -32001);
});

void test('A2A JSON-RPC rejects invalid message roles, parts, and disabled push configuration', async () => {
  const { handler } = createTestHandler();

  const invalidRole = await handler({
    jsonrpc: '2.0',
    id: 4,
    method: 'SendMessage',
    params: { message: { messageId: 'x', role: 'ROLE_AGENT', parts: [{ text: 'hello' }] } },
  });
  assert.equal((invalidRole.error as { code: number }).code, -32602);

  const invalidParts = await handler({
    jsonrpc: '2.0',
    id: 5,
    method: 'SendMessage',
    params: { message: { messageId: 'x', role: 'ROLE_USER', parts: [] } },
  });
  assert.equal((invalidParts.error as { code: number }).code, -32602);

  const conflictingPartContent = await handler({
    jsonrpc: '2.0',
    id: 51,
    method: 'SendMessage',
    params: {
      message: {
        messageId: 'conflict',
        role: 'ROLE_USER',
        parts: [{ text: 'do not drop data', data: { confidential: true } }],
      },
    },
  });
  assert.equal((conflictingPartContent.error as { code: number }).code, -32602,
    'A2A Part oneof must reject multiple content fields');

  const unsupportedPushConfig = await handler({
    jsonrpc: '2.0',
    id: 52,
    method: 'SendMessage',
    params: {
      message: { messageId: 'push', role: 'ROLE_USER', parts: [{ text: 'notify me' }] },
      configuration: { taskPushNotificationConfig: { url: 'https://client.invalid/webhook' } },
    },
  });
  assert.equal((unsupportedPushConfig.error as { code: number }).code, -32602,
    'the current A2A 1.0 push configuration field must be rejected when push is disabled');
});

void test('A2A SendMessage accepts every JSON value supported by Part.data', async () => {
  const { created, handler } = createTestHandler();
  const values: unknown[] = [
    { nested: { enabled: true }, tags: ['a', 'b'] },
    ['first', 2, false, null],
    'structured scalar',
    42,
    0,
    true,
    false,
    null,
  ];

  for (const [index, value] of values.entries()) {
    const response = await handler({
      jsonrpc: '2.0',
      id: 'data-' + index,
      method: 'SendMessage',
      params: {
        message: {
          messageId: 'data-message-' + index,
          role: 'ROLE_USER',
          parts: [{ data: value, mediaType: 'application/json' }],
        },
      },
    });

    assert.equal(response.error, undefined, 'valid JSON data value at index ' + index + ' must be accepted');
    const stored = created[index].input as { parts: Array<{ data: unknown; mediaType: string }> };
    assert.deepEqual(stored.parts[0].data, value, 'the original JSON value must be preserved');
    assert.equal(stored.parts[0].mediaType, 'application/json');
    assert.equal(created[index].objective, JSON.stringify(value),
      'the governed task objective must preserve the full JSON value without lossy coercion');
  }
  assert.equal(created.length, values.length);
});

void test('A2A SendMessage continues a requester-owned task inside its stable context', async () => {
  const { existing, created, handler } = createTestHandler();
  const continued = await handler({
    jsonrpc: '2.0',
    id: 'continue-1',
    method: 'SendMessage',
    params: {
      message: {
        messageId: 'follow-up-1',
        role: 'ROLE_USER',
        taskId: existing.id,
        contextId: existing.id,
        parts: [{ text: 'Add this clarification' }],
      },
    },
  });
  assert.equal(continued.error, undefined);
  assert.equal(created.length, 1);
  assert.equal(created[0].parentTaskId, existing.id);
  const task = (continued.result as { task: { contextId: string } }).task;
  assert.equal(task.contextId, existing.id);
});

void test('A2A SendMessage rejects foreign and terminal task continuations', async () => {
  const { existing } = createTestHandler();
  const foreign = createA2AJsonRpcHandler({
    requesterAgentId: 'other-user',
    createTask: () => { throw new Error('must not create a task'); },
    getTask: () => existing,
    listTasks: async (input) => ({ tasks: [], nextPageToken: '', pageSize: input.pageSize, totalSize: 0 }),
  });
  const denied = await foreign({
    jsonrpc: '2.0', id: 61, method: 'SendMessage',
    params: { message: { messageId: 'foreign-follow-up', role: 'ROLE_USER', taskId: existing.id, parts: [{ text: 'no' }] } },
  });
  assert.equal((denied.error as { code: number }).code, -32001);

  const terminal = createA2AJsonRpcHandler({
    requesterAgentId: 'verified-user-42',
    createTask: () => { throw new Error('terminal tasks cannot be resumed'); },
    getTask: () => ({ ...existing, status: 'completed' }),
    listTasks: async (input) => ({ tasks: [], nextPageToken: '', pageSize: input.pageSize, totalSize: 0 }),
  });
  const rejected = await terminal({
    jsonrpc: '2.0', id: 62, method: 'SendMessage',
    params: { message: { messageId: 'terminal-follow-up', role: 'ROLE_USER', taskId: existing.id, parts: [{ text: 'no' }] } },
  });
  assert.equal((rejected.error as { code: number }).code, -32000);

  const canceledTask = createA2AJsonRpcHandler({
    requesterAgentId: 'verified-user-42',
    createTask: () => { throw new Error('canceled tasks cannot be resumed'); },
    getTask: () => ({ ...existing, status: 'canceled' }),
    listTasks: async (input) => ({ tasks: [], nextPageToken: '', pageSize: input.pageSize, totalSize: 0 }),
  });
  const canceledFollowUp = await canceledTask({
    jsonrpc: '2.0', id: 65, method: 'SendMessage',
    params: { message: { messageId: 'canceled-follow-up', role: 'ROLE_USER', taskId: existing.id, parts: [{ text: 'no' }] } },
  });
  assert.equal((canceledFollowUp.error as { code: number }).code, -32000,
    'canceled tasks are terminal and must reject follow-up messages');
});

void test('A2A SendMessage maps idempotency conflicts to a server-defined error', async () => {
  const handler = createA2AJsonRpcHandler({
    requesterAgentId: 'verified-user-42',
    createTask: async (input) => {
      assert.equal(input.idempotencyKey, 'duplicate-message-1');
      const conflict = new Error('messageId already belongs to different content');
      conflict.name = 'A2AIdempotencyConflictError';
      throw conflict;
    },
    getTask: async () => null,
    listTasks: async (input) => ({
      tasks: [],
      nextPageToken: '',
      pageSize: input.pageSize,
      totalSize: 0,
    }),
  });

  const response = await handler({
    jsonrpc: '2.0',
    id: 'conflict-1',
    method: 'SendMessage',
    params: {
      message: {
        messageId: 'duplicate-message-1',
        role: 'ROLE_USER',
        parts: [{ text: 'Different payload for an existing message ID' }],
      },
    },
  });

  assert.equal(response.result, undefined);
  assert.deepEqual(response.error, {
    code: -32003,
    message: 'messageId was already used with different content.',
  });
});

void test('A2A ListTasks returns a bounded requester-scoped page with stable result fields', async () => {
  const existing = baseTask({ status: 'running', result: { secret: 'only include when requested' } });
  let received: unknown;
  const handler = createA2AJsonRpcHandler({
    requesterAgentId: 'verified-user-42',
    createTask: () => { throw new Error('not used'); },
    getTask: () => existing,
    listTasks: async (input) => {
      received = input;
      return { tasks: [existing], nextPageToken: 'next-cursor', pageSize: input.pageSize, totalSize: 3 };
    },
  });
  const page = await handler({
    jsonrpc: '2.0', id: 63, method: 'ListTasks',
    params: { pageSize: 2, pageToken: 'prior-cursor', status: 'TASK_STATE_WORKING', contextId: 'a2a-context' },
  });
  assert.equal(page.error, undefined);
  assert.deepEqual(received, {
    pageSize: 2,
    pageToken: 'prior-cursor',
    contextId: 'a2a-context',
    statuses: ['running', 'degraded'],
  });
  const result = page.result as { tasks: Array<{ status: { state: string }; artifacts: unknown[] }>; nextPageToken: string; pageSize: number; totalSize: number };
  assert.equal(result.tasks[0].status.state, 'TASK_STATE_WORKING');
  assert.deepEqual(result.tasks[0].artifacts, [], 'list results omit artifacts unless requested');
  assert.equal(result.nextPageToken, 'next-cursor');
  assert.equal(result.pageSize, 2);
  assert.equal(result.totalSize, 3);

  const invalid = await handler({
    jsonrpc: '2.0', id: 64, method: 'ListTasks',
    params: { pageSize: 101 },
  });
  assert.equal((invalid.error as { code: number }).code, -32602);
});

void test('A2A JSON-RPC rejects unsupported methods and invalid protocol versions', async () => {
  const { existing, handler } = createTestHandler();

  const unsupportedMethod = await handler({
    jsonrpc: '2.0',
    id: 7,
    method: 'SendStreamingMessage',
    params: {},
  });
  assert.equal((unsupportedMethod.error as { code: number }).code, -32601);

  const invalidVersion = await handler({
    jsonrpc: '1.0',
    id: 8,
    method: 'GetTask',
    params: { id: existing.id },
  });
  assert.equal((invalidVersion.error as { code: number }).code, -32600);
});

void test('A2A CancelTask scopes atomic cancellation to the authenticated requester', async () => {
  const requester = 'verified-user-42';
  const queued = baseTask({ id: 'queued-cancel', requesterAgentId: requester, status: 'queued' });
  const running = baseTask({ id: 'running-cancel', requesterAgentId: requester, status: 'running' });
  const foreignQueued = baseTask({ id: 'foreign-cancel', requesterAgentId: 'other-user', status: 'queued' });
  const cancellationRequests: Array<{ id: string; requesterAgentId: string }> = [];
  const handler = createA2AJsonRpcHandler({
    requesterAgentId: requester,
    createTask: () => { throw new Error('not used'); },
    getTask: (id) => [queued, running, foreignQueued].find((task) => task.id === id) || null,
    listTasks: async (input) => ({ tasks: [], nextPageToken: '', pageSize: input.pageSize, totalSize: 0 }),
    cancelTask: async (id, requesterAgentId) => {
      cancellationRequests.push({ id, requesterAgentId });
      const task = [queued, running, foreignQueued].find((candidate) => candidate.id === id);
      if (!task || task.requesterAgentId !== requesterAgentId) return null;
      return task.id === queued.id ? { ...task, status: 'canceled' } : task;
    },
  });

  const canceled = await handler({
    jsonrpc: '2.0', id: 'cancel-1', method: 'CancelTask', params: { id: queued.id },
  });
  assert.equal(canceled.error, undefined);
  assert.equal((canceled.result as { status: { state: string } }).status.state, 'TASK_STATE_CANCELED');

  const active = await handler({
    jsonrpc: '2.0', id: 'cancel-2', method: 'CancelTask', params: { id: running.id },
  });
  assert.equal((active.error as { code: number }).code, -32002,
    'running tasks must not be reported canceled when the provider cannot be interrupted');

  const foreign = await handler({
    jsonrpc: '2.0', id: 'cancel-3', method: 'CancelTask', params: { id: foreignQueued.id },
  });
  assert.equal((foreign.error as { code: number }).code, -32001,
    'foreign task IDs must not reach an unscoped cancellation implementation');

  const missing = await handler({
    jsonrpc: '2.0', id: 'cancel-4', method: 'CancelTask', params: { id: 'not-owned' },
  });
  assert.equal((missing.error as { code: number }).code, -32001);

  const malformed = await handler({
    jsonrpc: '2.0', id: 'cancel-5', method: 'CancelTask', params: { id: ' ' },
  });
  assert.equal((malformed.error as { code: number }).code, -32602);

  assert.equal(cancellationRequests.length, 4, 'malformed task IDs must not reach cancellation');
  assert.ok(cancellationRequests.every((request) => request.requesterAgentId === requester),
    'every cancellation request must carry the authenticated requester identity');
});

void test('A2A JSON-RPC enforces the inclusive text limit and rejects unsupported file parts', async () => {
  const { handler } = createTestHandler();

  const oversized = await handler({
    jsonrpc: '2.0',
    id: 9,
    method: 'SendMessage',
    params: {
      message: {
        messageId: 'large',
        role: 'ROLE_USER',
        parts: [{ text: 'x'.repeat(20_001) }],
      },
    },
  });
  assert.equal((oversized.error as { code: number }).code, -32602);

  const exactTextLimit = await handler({
    jsonrpc: '2.0',
    id: 53,
    method: 'SendMessage',
    params: {
      message: {
        messageId: 'exact-limit',
        role: 'ROLE_USER',
        parts: [{ text: 'x'.repeat(20_000) }],
      },
    },
  });
  assert.equal(exactTextLimit.error, undefined,
    'the inclusive 20,000-character message limit must be accepted');
  assert.equal(
    (exactTextLimit.result as { task: { status: { state: string } } }).task.status.state,
    'TASK_STATE_SUBMITTED',
  );

  const unsupportedFilePart = await handler({
    jsonrpc: '2.0',
    id: 54,
    method: 'SendMessage',
    params: {
      message: {
        messageId: 'file-part',
        role: 'ROLE_USER',
        parts: [{ raw: 'YWJj', mediaType: 'application/octet-stream', filename: 'input.bin' }],
      },
    },
  });
  assert.equal((unsupportedFilePart.error as { code: number }).code, -32602,
    'unadvertised file parts must be rejected rather than silently discarded');
});

void test('A2A task status maps failures and governance blocks without exposing diagnostics', () => {
  assert.equal(toA2ATask(baseTask({ status: 'completed' })).status.state, 'TASK_STATE_COMPLETED');

  const failedTaskView = toA2ATask(baseTask({
    status: 'failed',
    error: 'Upstream provider credential rejected: secret details',
  }));
  assert.equal(failedTaskView.status.message.parts[0].text, 'The task failed.');
  assert.ok(!JSON.stringify(failedTaskView).includes('credential rejected'),
    'provider diagnostics must not leak through A2A task status');

  const blockedTaskView = toA2ATask(baseTask({
    status: 'blocked',
    error: 'Internal policy implementation details',
  }));
  assert.equal(blockedTaskView.status.message.parts[0].text,
    'The task was blocked by GLORIFIER governance.');

  assert.equal(toA2ATask(baseTask({ status: 'failed', error: 'provider unavailable' })).status.state, 'TASK_STATE_FAILED');
  assert.equal(toA2ATask(baseTask({ status: 'blocked' })).status.state, 'TASK_STATE_REJECTED');
  assert.equal(toA2ATask(baseTask({ status: 'degraded' })).status.state, 'TASK_STATE_WORKING');
});

void test('A2A JSON-RPC waits for durable creation and reports persistence failures', async () => {
  const { existing } = createTestHandler();
  let finishDurableCreate!: (task: A2ATaskLike) => void;
  const durableCreate = new Promise<A2ATaskLike>((resolve) => {
    finishDurableCreate = resolve;
  });
  const asyncCreateHandler = createA2AJsonRpcHandler({
    requesterAgentId: 'verified-user-async',
    createTask: async () => durableCreate,
    getTask: async (id) => id === existing.id ? existing : null,
    listTasks: async (input) => ({ tasks: [], nextPageToken: '', pageSize: input.pageSize, totalSize: 0 }),
  });

  let responseSettled = false;
  const pendingAcknowledgement = asyncCreateHandler({
    jsonrpc: '2.0',
    id: 23,
    method: 'SendMessage',
    params: { message: { messageId: 'async-message', role: 'ROLE_USER', parts: [{ text: 'Durably record this' }] } },
  }).then((response) => {
    responseSettled = true;
    return response;
  });
  await Promise.resolve();
  assert.equal(responseSettled, false,
    'SendMessage must not acknowledge before durable task creation resolves');

  finishDurableCreate(baseTask({
    requesterAgentId: 'verified-user-async',
    objective: 'Durably record this',
  }));
  const asyncCreated = await pendingAcknowledgement;
  const asyncSubmittedTask = (asyncCreated.result as {
    task: { status: { state: string; message: { parts: Array<{ text: string }> } } };
  }).task;
  assert.equal(asyncSubmittedTask.status.state, 'TASK_STATE_SUBMITTED');
  assert.match(asyncSubmittedTask.status.message.parts[0].text, /human approval/i);

  const persistenceFailureHandler = createA2AJsonRpcHandler({
    requesterAgentId: 'verified-user-async',
    createTask: async () => { throw new Error('database write failed'); },
    getTask: async () => null,
    listTasks: async (input) => ({ tasks: [], nextPageToken: '', pageSize: input.pageSize, totalSize: 0 }),
  });
  const persistenceFailure = await persistenceFailureHandler({
    jsonrpc: '2.0',
    id: 24,
    method: 'SendMessage',
    params: { message: { messageId: 'failed-write', role: 'ROLE_USER', parts: [{ text: 'Do not acknowledge me' }] } },
  });
  assert.equal((persistenceFailure.error as { code: number }).code, -32603);
  assert.equal(persistenceFailure.result, undefined,
    'failed durable writes must not return a successful task acknowledgement');
  console.log('A2A 1.0 JSON-RPC contract tests passed.');
});
