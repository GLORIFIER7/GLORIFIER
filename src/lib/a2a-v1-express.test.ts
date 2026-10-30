import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  createA2AExpressRouter,
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
): Promise<void> {
  const app = express();
  app.use('/api/a2a/v1', express.json({ limit: '64kb', strict: true, type: 'application/json' }));
  app.use('/api/a2a/v1', (error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    const parserError = error as { type?: string } | null;
    if (parserError?.type === 'entity.too.large') {
      return res.status(413).type('application/json').json({ jsonrpc: '2.0', id: null, error: { code: -32602, message: 'A2A request body exceeds 65,536 bytes.' } });
    }
    if (parserError?.type === 'entity.parse.failed' || parserError?.type === 'entity.verify.failed') {
      return res.status(400).type('application/json').json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: request body must be valid JSON.' } });
    }
    return next(error);
  });
  app.use(express.json({ limit: '10mb' }));
  app.use((req, _res, next) => {
    (req as typeof req & { auth?: { uid: string } }).auth = { uid: 'express-test-user' };
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

await withServer(baseDependencies(), async (origin) => {
  const response = await fetch(`${origin}/api/a2a/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'A2A-Version': '0.3' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 91, method: 'SendMessage', params: {} }),
  });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('content-type')?.split(';')[0], 'application/problem+json');
  const body = await response.json() as { supportedVersions?: string[] };
  assert.deepEqual(body.supportedVersions, ['1.0']);
});

await withServer(baseDependencies(), async (origin) => {
  const response = await fetch(`${origin}/api/a2a/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'A2A-Version': '1.0' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 92, method: 'SendMessage', params: {} }),
  });
  assert.equal(response.status, 400, 'an absent A2A-Version is interpreted as 0.3 and rejected');
  const body = await response.json() as { supportedVersions?: string[] };
  assert.deepEqual(body.supportedVersions, ['1.0']);
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

await withServer({
  ...baseDependencies(),
  initializePersistence: async () => { throw new Error('database initialization failed'); },
  createTask: async () => { throw new Error('createTask must not run after init failure'); },
}, async (origin) => {
  const response = await fetch(`${origin}/api/a2a/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'init-failure',
      method: 'SendMessage',
      params: { message: { messageId: 'm', role: 'ROLE_USER', parts: [{ text: 'Test' }] } },
    }),
  });
  assert.equal(response.status, 503);
  const body = await response.json() as { error?: { code: number; data?: { code?: string } } };
  assert.equal(body.error?.code, -32000);
  assert.equal(body.error?.data?.code, 'A2A_PERSISTENCE_UNAVAILABLE');
});

await withServer({
  ...baseDependencies(),
  createTask: async () => { throw new Error('durable database write failed'); },
}, async (origin) => {
  const response = await fetch(`${origin}/api/a2a/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'write-failure',
      method: 'SendMessage',
      params: { message: { messageId: 'm', role: 'ROLE_USER', parts: [{ text: 'Test' }] } },
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { error?: { code: number }; result?: unknown };
  assert.equal(body.error?.code, -32603);
  assert.equal(body.result, undefined);
});

console.log('A2A Express endpoint regression tests passed.');
