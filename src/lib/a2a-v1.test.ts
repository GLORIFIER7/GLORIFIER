import assert from 'node:assert/strict';
import {
  A2A_PROTOCOL_VERSION,
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
  targetAgentId: null,
  capability: 'a2a-message-intake',
  objective: 'Review this proposal',
  input: { messageId: 'message-1', parts: [{ text: 'Review this proposal' }] },
  status: 'queued',
  attempts: 0,
  maxAttempts: 3,
  createdAt: '2026-10-30T00:00:00.000Z',
  updatedAt: '2026-10-30T00:00:00.000Z',
  ...overrides,
});

const card = buildA2AAgentCard('https://glorifier.glorifier.workers.dev', '0.2.1');
assert.equal(A2A_PROTOCOL_VERSION, '1.0');
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
assert.deepEqual(card.securityRequirements, [{ schemes: { bearer: [] } }]);

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
  method: 'message/send',
  params: {
    message: {
      messageId: 'message-1',
      role: 'user',
      parts: [{ text: 'Review this proposal' }],
    },
  },
});
assert.equal(submit.id, 'request-1');
assert.equal(submit.error, undefined);
const submittedTask = submit.result as { id: string; status: { state: string; message: { parts: Array<{ text: string }> } } };
assert.equal(submittedTask.id, 'a2a-task-1');
assert.equal(submittedTask.status.state, 'submitted');
assert.match(submittedTask.status.message.parts[0].text, /human approval/i);
assert.equal(created.length, 1);
assert.equal(created[0].requesterAgentId, 'verified-user-42');
assert.equal(created[0].capability, 'a2a-message-intake');
assert.equal(created[0].objective, 'Review this proposal');

const getTask = await handler({
  jsonrpc: '2.0',
  id: 2,
  method: 'tasks/get',
  params: { id: existing.id },
});
assert.equal((getTask.result as { status: { state: string } }).status.state, 'working');
assert.equal(getTask.id, 2);

const privateTaskHandler = createA2AJsonRpcHandler({
  requesterAgentId: 'other-user',
  createTask: () => { throw new Error('not used'); },
  getTask: () => existing,
});
const crossUserTask = await privateTaskHandler({
  jsonrpc: '2.0',
  id: 22,
  method: 'tasks/get',
  params: { id: existing.id },
});
assert.equal((crossUserTask.error as { code: number }).code, -32001, 'task lookup must not disclose a different user task');

const missingTask = await handler({
  jsonrpc: '2.0',
  id: 3,
  method: 'tasks/get',
  params: { id: 'missing' },
});
assert.equal((missingTask.error as { code: number }).code, -32001);

const invalidRole = await handler({
  jsonrpc: '2.0',
  id: 4,
  method: 'message/send',
  params: { message: { messageId: 'x', role: 'agent', parts: [{ text: 'hello' }] } },
});
assert.equal((invalidRole.error as { code: number }).code, -32602);

const invalidParts = await handler({
  jsonrpc: '2.0',
  id: 5,
  method: 'message/send',
  params: { message: { messageId: 'x', role: 'user', parts: [] } },
});
assert.equal((invalidParts.error as { code: number }).code, -32602);

const unsupportedContinuation = await handler({
  jsonrpc: '2.0',
  id: 6,
  method: 'message/send',
  params: { message: { messageId: 'x', role: 'user', taskId: 'existing', parts: [{ text: 'continue' }] } },
});
assert.equal((unsupportedContinuation.error as { code: number }).code, -32602);

const unsupportedMethod = await handler({
  jsonrpc: '2.0',
  id: 7,
  method: 'message/stream',
  params: {},
});
assert.equal((unsupportedMethod.error as { code: number }).code, -32601);

const invalidVersion = await handler({
  jsonrpc: '1.0',
  id: 8,
  method: 'tasks/get',
  params: { id: existing.id },
});
assert.equal((invalidVersion.error as { code: number }).code, -32600);

const oversized = await handler({
  jsonrpc: '2.0',
  id: 9,
  method: 'message/send',
  params: {
    message: {
      messageId: 'large',
      role: 'user',
      parts: [{ text: 'x'.repeat(20_001) }],
    },
  },
});
assert.equal((oversized.error as { code: number }).code, -32602);

assert.equal(toA2ATask(baseTask({ status: 'completed' })).status.state, 'completed');
assert.equal(toA2ATask(baseTask({ status: 'failed', error: 'provider unavailable' })).status.state, 'failed');
assert.equal(toA2ATask(baseTask({ status: 'blocked' })).status.state, 'rejected');
assert.equal(toA2ATask(baseTask({ status: 'degraded' })).status.state, 'working');

console.log('A2A 1.0 JSON-RPC contract tests passed.');

const asyncCreateHandler = createA2AJsonRpcHandler({
  requesterAgentId: 'verified-user-async',
  async createTask(input) {
    await Promise.resolve();
    return baseTask({
      requesterAgentId: input.requesterAgentId,
      objective: input.objective,
    });
  },
  getTask: async (id) => id === existing.id ? existing : null,
});
const asyncCreated = await asyncCreateHandler({
  jsonrpc: '2.0',
  id: 23,
  method: 'message/send',
  params: { message: { messageId: 'async-message', role: 'user', parts: [{ text: 'Durably record this' }] } },
});
const asyncSubmittedTask = asyncCreated.result as { status: { state: string; message: { parts: Array<{ text: string }> } } };
assert.equal(asyncSubmittedTask.status.state, 'submitted');
assert.equal(asyncSubmittedTask.status.message.parts[0].text.includes('human approval'), true);
