import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  createA2AExpressRouter,
  configureA2AJsonRpcBodyParsing,
  type A2AExpressDependencies,
} from './a2a-v1-express';
import type { A2ATaskLike } from './a2a-v1';

const task = (overrides: Partial<A2ATaskLike> = {}): A2ATaskLike => ({
  id: 'express-a2a-task',
  parentTaskId: null,
  requesterAgentId: 'express-test-user',
  capability: 'a2a-message-intake',
  objective: 'Review this request',
  status: 'queued',
  updatedAt: '2026-10-30T00:00:00.000Z',
  ...overrides,
});

async function withServer(
  dependencies: A2AExpressDependencies,
  run: (origin: string) => Promise<void>,
  authUid: string | null = 'express-test-user',
): Promise<void> {
  const app = express();
  configureA2AJsonRpcBodyParsing(app);
  app.use(express.json({ limit: '10mb' }));
  app.use((req, _res, next) => {
    if (authUid !== null) (req as typeof req & { auth?: { uid?: string } }).auth = authUid ? { uid: authUid } : {}; 
    next();
  });
  app.use(createA2AExpressRouter(dependencies));

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

const baseDependencies = (): A2AExpressDependencies => ({
  getPublicBaseUrl: () => 'https://glorifier.glorifier.workers.dev',
  getAgentVersion: () => '0.2.1',
  isPersistenceConfigured: () => true,
  initializePersistence: async () => {},
  createTask: async (input) => task({
    requesterAgentId: input.requesterAgentId,
    objective: input.objective,
  }),
  getTask: async () => null,
});

async function assertUnsupportedProtocolVersion(origin: string, version?: string): Promise<void> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (version !== undefined) headers.set('A2A-Version', version);
  const response = await fetch(`${origin}/api/a2a/v1`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 91, method: 'SendMessage', params: {} }),
  });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('content-type')?.split(';')[0], 'application/problem+json');
  const body = await response.json() as { supportedVersions?: string[] };
  assert.deepEqual(body.supportedVersions, ['1.0']);
}

function postAgentMessage(origin: string, requestId: string, version = '1.0'): Promise<Response> {
  return fetch(`${origin}/api/a2a/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'A2A-Version': version },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method: 'SendMessage',
      params: { message: { messageId: requestId, role: 'ROLE_USER', parts: [{ text: 'Test' }] } },
    }),
  });
}


await withServer(baseDependencies(), async (origin) => {
  const cardResponse = await fetch(`${origin}/.well-known/agent-card.json`);
  assert.equal(cardResponse.status, 200);
  const card = await cardResponse.json() as {
    name: string;
    supportedInterfaces: Array<{ url: string; protocolBinding: string; protocolVersion: string }>;
  };
  assert.equal(card.name, 'GLORIFIER Services');
  assert.deepEqual(card.supportedInterfaces, [{
    url: 'https://glorifier.glorifier.workers.dev/api/a2a/v1',
    protocolBinding: 'JSONRPC',
    protocolVersion: '1.0',
  }]);

  const response = await fetch(`${origin}/api/a2a/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'A2A-Version': '1.0' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'express-send-1',
      method: 'SendMessage',
      params: { message: { messageId: 'express-message-1', role: 'ROLE_USER', parts: [{ text: 'Review this request' }] } },
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { id: string; result?: { task: { id: string; status: { state: string } } } };
  assert.equal(body.id, 'express-send-1');
  assert.equal(body.result?.task.id, 'express-a2a-task');
  assert.equal(body.result?.task.status.state, 'TASK_STATE_SUBMITTED');
});

await withServer({
  ...baseDependencies(),
  isPersistenceConfigured: () => false,
  initializePersistence: async () => { throw new Error('Agent Card must not initialize database'); },
}, async (origin) => {
  const response = await fetch(`${origin}/.well-known/agent-card.json`);
  assert.equal(response.status, 200, 'public discovery metadata must remain available when the database is unavailable');
  const card = await response.json() as { name: string };
  assert.equal(card.name, 'GLORIFIER Services');
});

await withServer(baseDependencies(), (origin) => assertUnsupportedProtocolVersion(origin, '0.3'));

await withServer(baseDependencies(), (origin) => assertUnsupportedProtocolVersion(origin));

await withServer(baseDependencies(), async (origin) => {
  const response = await postAgentMessage(origin, 'patch-version', '1.0.1');
  assert.equal(response.status, 200, 'a compatible 1.0 patch version must pass protocol negotiation');
  const body = await response.json() as { id?: string; error?: { code: number } };
  assert.equal(body.id, 'patch-version');
  assert.equal(body.error, undefined);
});

await withServer(baseDependencies(), async (origin) => {
  const response = await fetch(`${origin}/api/a2a/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'A2A-Version': '1.0' },
    body: 'true',
  });
  assert.equal(response.status, 200, 'JSON primitives must reach JSON-RPC packet validation');
  const body = await response.json() as { error?: { code: number; message: string } };
  assert.equal(body.error?.code, -32600, 'a valid JSON primitive is a JSON-RPC Invalid Request, not an Express parser error');
});


await withServer(baseDependencies(), async (origin) => {
  const response = await fetch(`${origin}/api/a2a/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'A2A-Version': '1.0' },
    body: '{"jsonrpc":"2.0","id":',
  });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('content-type')?.split(';')[0], 'application/json');
  const body = await response.json() as { error?: { code: number } };
  assert.equal(body.error?.code, -32700, 'malformed JSON must use the JSON-RPC parse-error envelope');
});

await withServer(baseDependencies(), async (origin) => {
  const oversized = JSON.stringify({ jsonrpc: '2.0', id: 'large', method: 'SendMessage', params: { message: { messageId: 'large', role: 'ROLE_USER', parts: [{ text: 'x'.repeat(66_000) }] } } });
  const response = await fetch(`${origin}/api/a2a/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'A2A-Version': '1.0' },
    body: oversized,
  });
  assert.equal(response.status, 413);
  assert.equal(response.headers.get('content-type')?.split(';')[0], 'application/json');
  const body = await response.json() as { error?: { code: number } };
  assert.equal(body.error?.code, -32602, 'oversized JSON-RPC bodies must not leak an HTML parser error');
});

await withServer(baseDependencies(), async (origin) => {
  const response = await fetch(`${origin}/api/a2a/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'A2A-Version': '1.0' },
    body: '{}',
  });
  assert.equal(response.status, 415);
  const body = await response.json() as { error?: { code: number } };
  assert.equal(body.error?.code, -32600);
});

await withServer({
  ...baseDependencies(),
  createTask: async () => { throw new Error('createTask must not run without authenticated requester identity'); },
}, async (origin) => {
  const response = await fetch(`${origin}/api/a2a/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'A2A-Version': '1.0' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'missing-uid', method: 'SendMessage', params: { message: { messageId: 'm', role: 'ROLE_USER', parts: [{ text: 'No identity' }] } } }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { error?: { code: number } };
  assert.equal(body.error?.code, -32603, 'missing auth uid must fail closed as a JSON-RPC error');
}, '');

await withServer({
  ...baseDependencies(),
  getTask: async () => task({ requesterAgentId: 'someone-else' }),
}, async (origin) => {
  const response = await fetch(`${origin}/api/a2a/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'A2A-Version': '1.0' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'foreign-task', method: 'GetTask', params: { id: 'express-a2a-task' } }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { error?: { code: number } };
  assert.equal(body.error?.code, -32001, 'GetTask must hide a task owned by another requester');
});

await withServer({
  ...baseDependencies(),
  getTask: async () => task({ requesterAgentId: 'express-test-user' }),
}, async (origin) => {
  const response = await fetch(`${origin}/api/a2a/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'A2A-Version': '1.0' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'own-task', method: 'GetTask', params: { id: 'express-a2a-task' } }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { error?: { code: number }; result?: { id: string } };
  assert.equal(body.error, undefined);
  assert.equal(body.result?.id, 'express-a2a-task');
});

await withServer({
  ...baseDependencies(),
  initializePersistence: async () => { throw new Error('database initialization failed'); },
  createTask: async () => { throw new Error('createTask must not run after init failure'); },
}, async (origin) => {
  const response = await postAgentMessage(origin, 'init-failure');
  assert.equal(response.status, 503);
  const body = await response.json() as { error?: { code: number; data?: { code?: string } } };
  assert.equal(body.error?.code, -32000);
  assert.equal(body.error?.data?.code, 'A2A_PERSISTENCE_UNAVAILABLE');
});

await withServer({
  ...baseDependencies(),
  createTask: async () => { throw new Error('durable database write failed'); },
}, async (origin) => {
  const response = await postAgentMessage(origin, 'write-failure');
  assert.equal(response.status, 200);
  const body = await response.json() as { error?: { code: number }; result?: unknown };
  assert.equal(body.error?.code, -32603);
  assert.equal(body.result, undefined);
});

console.log('A2A Express endpoint regression tests passed.');
