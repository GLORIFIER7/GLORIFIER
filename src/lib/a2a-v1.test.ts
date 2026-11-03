import assert from 'node:assert/strict';
import test from 'node:test';
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

const card = buildA2AAgentCard('https://glorifier.glorifier.workers.dev', '0.2.1');

test('A2A protocol version negotiation and execution authorization fail closed', () => {
  assert.equal(A2A_PROTOCOL_VERSION, '1.0');
  assert.equal(isCompatibleA2AProtocolVersion('1.0'), true);
  assert.equal(isCompatibleA2AProtocolVersion('1.0.1'), true);
  assert.equal(isCompatibleA2AProtocolVersion('1.0.12'), true);
  assert.equal(isCompatibleA2AProtocolVersion('1.1'), false);
  assert.equal(isCompatibleA2AProtocolVersion('1.0.invalid'), false);
  assert.equal(isCompatibleA2AProtocolVersion(undefined), false);
  assert.equal(isAuthorizedA2AExecution(false, 'approved'), false);
  assert.equal(isAuthorizedA2AExecution(true, 'pending'), false);
  assert.equal(isAuthorizedA2AExecution(true, 'approved'), true);
  assert.equal(isAuthorizedA2AExecution(true, 'APPROVED'), false);
  assert.equal(isAuthorizedA2AExecution(true, ['approved']), false);
});

test('A2A Agent Card publishes the governed protocol and declared security scheme', () => {
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
  assert.deepEqual(Object.keys(card.securityRequirements[0].schemes), Object.keys(card.securitySchemes));
});

test('A2A Agent Card rejects insecure, credentialed, or path-scoped origins', () => {
  assert.throws(() => buildA2AAgentCard('http://example.com'), /HTTPS/);
  assert.throws(() => buildA2AAgentCard('https://user:pass@example.com'), /credentials/);
  assert.throws(() => buildA2AAgentCard('https://example.com/path'), /origin/);
});

test('SendMessage creates a human-governed task and GetTask returns its state', async () => {
  const created: A2ACreateTaskInput[] = [];
  const existing = baseTask({ status: 'running', requesterAgentId: 'verified-user-42' });
  const handler = createA2AJsonRpcHandler({
    requesterAgentId: 'verified-user-42',
    createTask(input) {
      created.push(input);
      return baseTask({ requesterAgentId: input.requesterAgentId, objective: input.objective });
    },
    getTask(id) { return id === existing.id ? existing : null; },
  });
  const submit = await handler({
    jsonrpc: '2.0', id: 'request-1', method: 'SendMessage',
    params: { message: { messageId: 'message-1', role: 'ROLE_USER', parts: [{ text: 'Review this proposal' }] } },
  });
  const submittedTask = (submit.result as { task: { id: string; status: { state: string; message: { role: string; contextId: string; taskId: string; parts: Array<{ text: string }> } } } }).task;
  assert.equal(submit.id, 'request-1');
  assert.equal(submit.error, undefined);
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
  const result = await handler({ jsonrpc: '2.0', id: 2, method: 'GetTask', params: { id: existing.id } });
  assert.equal((result.result as { status: { state: string } }).status.state, 'TASK_STATE_WORKING');
});

test('A2A task reads remain private across requester identities', async () => {
  const existing = baseTask({ status: 'running', requesterAgentId: 'verified-user-42' });
  const privateHandler = createA2AJsonRpcHandler({
    requesterAgentId: 'other-user',
    createTask: () => { throw new Error('not used'); },
    getTask: () => existing,
  });
  const result = await privateHandler({ jsonrpc: '2.0', id: 22, method: 'GetTask', params: { id: existing.id } });
  assert.equal((result.error as { code: number }).code, -32001);
});

test('A2A JSON-RPC rejects malformed messages, unsupported methods and protocol envelopes', async () => {
  const handler = createA2AJsonRpcHandler({
    requesterAgentId: 'verified-user-42',
    createTask: () => baseTask(),
    getTask: () => null,
  });
  const cases = [
    { request: { jsonrpc: '2.0', id: 3, method: 'GetTask', params: { id: 'missing' } }, code: -32001 },
    { request: { jsonrpc: '2.0', id: 4, method: 'SendMessage', params: { message: { messageId: 'x', role: 'ROLE_AGENT', parts: [{ text: 'hello' }] } } }, code: -32602 },
    { request: { jsonrpc: '2.0', id: 5, method: 'SendMessage', params: { message: { messageId: 'x', role: 'ROLE_USER', parts: [] } } }, code: -32602 },
    { request: { jsonrpc: '2.0', id: 6, method: 'SendMessage', params: { message: { messageId: 'x', role: 'ROLE_USER', taskId: 'existing', parts: [{ text: 'continue' }] } } }, code: -32602 },
    { request: { jsonrpc: '2.0', id: 7, method: 'SendStreamingMessage', params: {} }, code: -32601 },
    { request: { jsonrpc: '1.0', id: 8, method: 'GetTask', params: { id: 'a2a-task-1' } }, code: -32600 },
  ];
  for (const item of cases) {
    const result = await handler(item.request as Parameters<typeof handler>[0]);
    assert.equal((result.error as { code: number }).code, item.code);
  }
});

test('A2A JSON-RPC rejects conflicting parts, disabled push, and unsupported file content', async () => {
  const handler = createA2AJsonRpcHandler({ requesterAgentId: 'verified-user-42', createTask: () => baseTask(), getTask: () => null });
  const conflicting = await handler({
    jsonrpc: '2.0', id: 51, method: 'SendMessage',
    params: { message: { messageId: 'conflict', role: 'ROLE_USER', parts: [{ text: 'do not drop data', data: { confidential: true } }] } },
  });
  assert.equal((conflicting.error as { code: number }).code, -32602);
  const push = await handler({
    jsonrpc: '2.0', id: 52, method: 'SendMessage',
    params: { message: { messageId: 'push', role: 'ROLE_USER', parts: [{ text: 'notify me' }] }, configuration: { taskPushNotificationConfig: { url: 'https://client.invalid/webhook' } } },
  });
  assert.equal((push.error as { code: number }).code, -32602);
  const file = await handler({
    jsonrpc: '2.0', id: 54, method: 'SendMessage',
    params: { message: { messageId: 'file-part', role: 'ROLE_USER', parts: [{ raw: 'YWJj', mediaType: 'application/octet-stream', filename: 'input.bin' }] } },
  });
  assert.equal((file.error as { code: number }).code, -32602);
});

test('A2A JSON-RPC enforces the message-size boundary', async () => {
  const handler = createA2AJsonRpcHandler({ requesterAgentId: 'verified-user-42', createTask: () => baseTask(), getTask: () => null });
  const oversized = await handler({
    jsonrpc: '2.0', id: 9, method: 'SendMessage',
    params: { message: { messageId: 'large', role: 'ROLE_USER', parts: [{ text: 'x'.repeat(20_001) }] } },
  });
  assert.equal((oversized.error as { code: number }).code, -32602);
  const exact = await handler({
    jsonrpc: '2.0', id: 53, method: 'SendMessage',
    params: { message: { messageId: 'exact-limit', role: 'ROLE_USER', parts: [{ text: 'x'.repeat(20_000) }] } },
  });
  assert.equal(exact.error, undefined);
  assert.equal((exact.result as { task: { status: { state: string } } }).task.status.state, 'TASK_STATE_SUBMITTED');
});

test('A2A task status maps safely and redacts provider diagnostics', () => {
  const failed = toA2ATask(baseTask({ status: 'failed', error: 'Upstream provider credential rejected: secret details' }));
  assert.equal(failed.status.message.parts[0].text, 'The task failed.');
  assert.ok(!JSON.stringify(failed).includes('credential rejected'));
  const blocked = toA2ATask(baseTask({ status: 'blocked', error: 'Internal policy implementation details' }));
  assert.equal(blocked.status.message.parts[0].text, 'The task was blocked by GLORIFIER governance.');
  assert.equal(toA2ATask(baseTask({ status: 'completed' })).status.state, 'TASK_STATE_COMPLETED');
  assert.equal(toA2ATask(baseTask({ status: 'failed', error: 'provider unavailable' })).status.state, 'TASK_STATE_FAILED');
  assert.equal(toA2ATask(baseTask({ status: 'blocked' })).status.state, 'TASK_STATE_REJECTED');
  assert.equal(toA2ATask(baseTask({ status: 'degraded' })).status.state, 'TASK_STATE_WORKING');
});

test('A2A SendMessage waits for durable creation before acknowledging success', async () => {
  const existing = baseTask({ status: 'running' });
  let finishCreate: ((value: A2ATaskLike) => void) | undefined;
  const durableCreate = new Promise<A2ATaskLike>((resolve) => { finishCreate = resolve; });
  const handler = createA2AJsonRpcHandler({
    requesterAgentId: 'verified-user-async',
    createTask: async () => durableCreate,
    getTask: async (id) => id === existing.id ? existing : null,
  });
  let responseSettled = false;
  const pending = handler({
    jsonrpc: '2.0', id: 23, method: 'SendMessage',
    params: { message: { messageId: 'async-message', role: 'ROLE_USER', parts: [{ text: 'Durably record this' }] } },
  }).then((result) => { responseSettled = true; return result; });
  await Promise.resolve();
  assert.equal(responseSettled, false);
  finishCreate?.(baseTask({ requesterAgentId: 'verified-user-async', objective: 'Durably record this' }));
  const result = await pending;
  const task = (result.result as { task: { status: { state: string; message: { parts: Array<{ text: string }> } } } }).task;
  assert.equal(task.status.state, 'TASK_STATE_SUBMITTED');
  assert.match(task.status.message.parts[0].text, /human approval/i);
});

test('A2A SendMessage returns no success acknowledgement after a durable write fails', async () => {
  const handler = createA2AJsonRpcHandler({
    requesterAgentId: 'verified-user-async',
    createTask: async () => { throw new Error('database write failed'); },
    getTask: async () => null,
  });
  const result = await handler({
    jsonrpc: '2.0', id: 24, method: 'SendMessage',
    params: { message: { messageId: 'failed-write', role: 'ROLE_USER', parts: [{ text: 'Do not acknowledge me' }] } },
  });
  assert.equal((result.error as { code: number }).code, -32603);
  assert.equal(result.result, undefined);
});
