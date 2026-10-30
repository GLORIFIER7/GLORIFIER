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
assert.equal(A2A_PROTOCOL_VERSION, '1.0');
assert.equal(isCompatibleA2AProtocolVersion('1.0'), true);
assert.equal(isCompatibleA2AProtocolVersion('1.0.1'), true, 'patch versions remain compatible within the same major/minor protocol');
assert.equal(isCompatibleA2AProtocolVersion('1.0.12'), true);
assert.equal(isCompatibleA2AProtocolVersion('1.1'), false);
assert.equal(isCompatibleA2AProtocolVersion('1.0.invalid'), false);
assert.equal(isCompatibleA2AProtocolVersion(undefined), false, 'omitted protocol version defaults to unsupported 0.3');

assert.equal(isAuthorizedA2AExecution(false, 'approved'), false, 'caller-supplied approval is never sufficient without verified owner identity');
assert.equal(isAuthorizedA2AExecution(true, 'pending'), false, 'owner identity alone is not an approval');
assert.equal(isAuthorizedA2AExecution(true, 'approved'), true, 'execution requires authenticated owner identity and explicit approval');
assert.equal(isAuthorizedA2AExecution(true, 'APPROVED'), false, 'approval values must match the exact tested token');
assert.equal(isAuthorizedA2AExecution(true, ['approved']), false, 'array coercion must not satisfy the approval gate');

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

const created: A2ACreateTaskInput[] = [];
const existing = baseTask({ status: 'running', requesterAgentId: 'verified-user-42' });
const handler = createA2AJsonRpcHandler({
  requesterAgentId: 'verified-user-42',
  createTask(input) {
    created.push(input);
    return baseTask({ requesterAgentId: input.requesterAgentId, objective: input.objective });
  },
  getTask(id) {
    return id === existing.id ? existing : null;
  },
});

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
const submitResult = submit.result as { task: { id: string; status: { state: string; message: { role: string; contextId: string; taskId: string; parts: Array<{ text: string }> } } } };
const submittedTask = submitResult.task;
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
});
const crossUserTask = await privateTaskHandler({
  jsonrpc: '2.0',
  id: 22,
  method: 'GetTask',
  params: { id: existing.id },
});
assert.equal((crossUserTask.error as { code: number }).code, -32001, 'task lookup must not disclose a different user task');

const missingTask = await handler({
  jsonrpc: '2.0',
  id: 3,
  method: 'GetTask',
  params: { id: 'missing' },
});
assert.equal((missingTask.error as { code: number }).code, -32001);

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
    message: { messageId: 'conflict', role: 'ROLE_USER', parts: [{ text: 'do not drop data', data: { confidential: true } }] },
  },
});
assert.equal((conflictingPartContent.error as { code: number }).code, -32602, 'A2A Part oneof must reject multiple content fields');

const unsupportedPushConfig = await handler({
  jsonrpc: '2.0',
  id: 52,
  method: 'SendMessage',
  params: {
    message: { messageId: 'push', role: 'ROLE_USER', parts: [{ text: 'notify me' }] },
    configuration: { taskPushNotificationConfig: { url: 'https://client.invalid/webhook' } },
  },
});
assert.equal((unsupportedPushConfig.error as { code: number }).code, -32602, 'the current A2A 1.0 push configuration field must be rejected when push is disabled');

const unsupportedContinuation = await handler({
  jsonrpc: '2.0',
  id: 6,
  method: 'SendMessage',
  params: { message: { messageId: 'x', role: 'ROLE_USER', taskId: 'existing', parts: [{ text: 'continue' }] } },
});
assert.equal((unsupportedContinuation.error as { code: number }).code, -32602);

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
assert.equal(exactTextLimit.error, undefined, 'the inclusive 20,000-character message limit must be accepted');
assert.equal(
  ((exactTextLimit.result as { task: { status: { state: string } } }).task.status.state),
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
assert.equal((unsupportedFilePart.error as { code: number }).code, -32602, 'unadvertised file parts must be rejected rather than silently discarded');

assert.equal(toA2ATask(baseTask({ status: 'completed' })).status.state, 'TASK_STATE_COMPLETED');
const failedTaskView = toA2ATask(baseTask({ status: 'failed', error: 'Upstream provider credential rejected: secret details' }));
assert.equal(failedTaskView.status.message.parts[0].text, 'The task failed.');
assert.ok(!JSON.stringify(failedTaskView).includes('credential rejected'), 'provider diagnostics must not leak through A2A task status');
const blockedTaskView = toA2ATask(baseTask({ status: 'blocked', error: 'Internal policy implementation details' }));
assert.equal(blockedTaskView.status.message.parts[0].text, 'The task was blocked by GLORIFIER governance.');

assert.equal(toA2ATask(baseTask({ status: 'failed', error: 'provider unavailable' })).status.state, 'TASK_STATE_FAILED');
assert.equal(toA2ATask(baseTask({ status: 'blocked' })).status.state, 'TASK_STATE_REJECTED');
assert.equal(toA2ATask(baseTask({ status: 'degraded' })).status.state, 'TASK_STATE_WORKING');

console.log('A2A 1.0 JSON-RPC contract tests passed.');

let finishDurableCreate!: (task: A2ATaskLike) => void;
const durableCreate = new Promise<A2ATaskLike>((resolve) => {
  finishDurableCreate = resolve;
});
const asyncCreateHandler = createA2AJsonRpcHandler({
  requesterAgentId: 'verified-user-async',
  createTask: async () => durableCreate,
  getTask: async (id) => id === existing.id ? existing : null,
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
assert.equal(responseSettled, false, 'SendMessage must not acknowledge before durable task creation resolves');
finishDurableCreate(baseTask({
  requesterAgentId: 'verified-user-async',
  objective: 'Durably record this',
}));
const asyncCreated = await pendingAcknowledgement;
const asyncSubmittedTask = (asyncCreated.result as { task: { status: { state: string; message: { parts: Array<{ text: string }> } } } }).task;
assert.equal(asyncSubmittedTask.status.state, 'TASK_STATE_SUBMITTED');
assert.match(asyncSubmittedTask.status.message.parts[0].text, /human approval/i);

const persistenceFailureHandler = createA2AJsonRpcHandler({
  requesterAgentId: 'verified-user-async',
  createTask: async () => { throw new Error('database write failed'); },
  getTask: async () => null,
});
const persistenceFailure = await persistenceFailureHandler({
  jsonrpc: '2.0',
  id: 24,
  method: 'SendMessage',
  params: { message: { messageId: 'failed-write', role: 'ROLE_USER', parts: [{ text: 'Do not acknowledge me' }] } },
});
assert.equal((persistenceFailure.error as { code: number }).code, -32603);
assert.equal(persistenceFailure.result, undefined, 'failed durable writes must not return a successful task acknowledgement');
