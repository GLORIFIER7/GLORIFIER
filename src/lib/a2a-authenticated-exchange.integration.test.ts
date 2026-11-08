import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import {
  createA2AExpressRouter,
  configureA2AJsonRpcBodyParsing,
  type A2AExpressDependencies,
} from './a2a-v1-express';
import type { A2ACreateTaskInput, A2AListTasksInput, A2ATaskLike } from './a2a-v1';
import { createRequireAuthentication, verifyBearerToken } from './auth/backend-auth';

type RpcEnvelope = {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: Record<string, unknown>;
};

const makeTask = (
  id: string,
  input: A2ACreateTaskInput,
): A2ATaskLike => ({
  id,
  parentTaskId: input.parentTaskId ?? null,
  requesterAgentId: input.requesterAgentId,
  capability: input.capability,
  objective: input.objective,
  status: 'queued',
  updatedAt: new Date().toISOString(),
});

function makeSignedAccessToken(
  subject: string,
  issuer: string,
  audience: string,
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  keyId: string,
): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: keyId });
  const payload = encode({
    iss: issuer,
    sub: subject,
    aud: audience,
    iat: nowSeconds - 10,
    exp: nowSeconds + 300,
  });
  const signedData = `${header}.${payload}`;
  return `${signedData}.${sign('RSA-SHA256', Buffer.from(signedData), privateKey).toString('base64url')}`;
}

async function withA2AServer(
  aliceToken: string,
  bobToken: string,
  run: (origin: string) => Promise<void>,
): Promise<void> {
  const tasks = new Map<string, A2ATaskLike>();
  let nextId = 0;

  const dependencies: A2AExpressDependencies = {
    getPublicBaseUrl: () => 'https://a2a.integration.test',
    getAgentVersion: () => 'test',
    isPersistenceConfigured: () => true,
    initializePersistence: async () => {},
    createTask: async (input) => {
      const task = makeTask(`task-${++nextId}`, input);
      tasks.set(task.id, task);
      return task;
    },
    getTask: async (id, requesterAgentId) => {
      const task = tasks.get(id);
      return task?.requesterAgentId === requesterAgentId ? task : null;
    },
    listTasks: async (requesterAgentId, input: A2AListTasksInput) => {
      const matching = [...tasks.values()].filter((task) => task.requesterAgentId === requesterAgentId);
      return {
        tasks: matching.slice(0, input.pageSize),
        nextPageToken: '',
        pageSize: input.pageSize,
        totalSize: matching.length,
      };
    },
  };

  const app = express();
  configureA2AJsonRpcBodyParsing(app);
  app.use(express.json({ limit: '10mb' }));
  // Exercise the same bearer-token verifier and authentication middleware used
  // by the backend. The integration supplies locally signed RS256 tokens and
  // a local JWKS response; no production identity provider is contacted.
  app.use('/api', createRequireAuthentication(verifyBearerToken));
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

async function postRpc(
  origin: string,
  token: string | undefined,
  envelope: RpcEnvelope,
): Promise<Response> {
  const headers = new Headers({
    'Content-Type': 'application/a2a+json',
    'A2A-Version': '1.0',
  });
  if (token !== undefined) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${origin}/api/a2a/v1`, {
    method: 'POST',
    headers,
    body: JSON.stringify(envelope),
  });
}

test('A2A authenticated exchange verifies bearer identity and scopes task lifecycle', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyId = 'a2a-authenticated-exchange-test-key';
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: keyId,
    use: 'sig',
    alg: 'RS256',
  };
  const issuer = `https://a2a-${randomUUID()}.integration.test/`;
  const audience = 'https://glorifier-api.integration.test';
  const aliceToken = makeSignedAccessToken('a2a-agent-alice', issuer, audience, privateKey, keyId);
  const bobToken = makeSignedAccessToken('a2a-agent-bob', issuer, audience, privateKey, keyId);

  const previousFetch = globalThis.fetch;
  const previousIssuer = process.env.AUTH0_ISSUER_BASE_URL;
  const previousAudience = process.env.AUTH0_AUDIENCE;
  process.env.AUTH0_ISSUER_BASE_URL = issuer;
  process.env.AUTH0_AUDIENCE = audience;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    await withA2AServer(aliceToken, bobToken, async (origin) => {
      const missing = await postRpc(origin, undefined, {
        jsonrpc: '2.0',
        id: 'missing-auth',
        method: 'SendMessage',
        params: {
          message: {
            messageId: 'message-missing-auth',
            role: 'ROLE_USER',
            parts: [{ text: 'This must not be stored.' }],
          },
        },
      });
      assert.equal(missing.status, 401);
      assert.equal(missing.headers.get('www-authenticate'), 'Bearer');

      const invalid = await postRpc(origin, 'invalid-token', {
        jsonrpc: '2.0',
        id: 'invalid-auth',
        method: 'SendMessage',
        params: {
          message: {
            messageId: 'message-invalid-auth',
            role: 'ROLE_USER',
            parts: [{ text: 'This must not be stored either.' }],
          },
        },
      });
      assert.equal(invalid.status, 401);
      assert.equal(invalid.headers.get('www-authenticate'), 'Bearer');

      const submitted = await postRpc(origin, aliceToken, {
        jsonrpc: '2.0',
        id: 'alice-submit',
        method: 'SendMessage',
        params: {
          message: {
            messageId: 'alice-message-1',
            role: 'ROLE_USER',
            parts: [{ text: 'Prepare a proposal for owner review.' }],
          },
        },
      });
      assert.equal(submitted.status, 200);
      const submittedBody = await submitted.json() as {
        id: string;
        result?: { task?: { id: string; status: { state: string } } };
        error?: { code: number; message: string };
      };
      assert.equal(submittedBody.id, 'alice-submit');
      assert.equal(submittedBody.error, undefined);
      assert.equal(submittedBody.result?.task?.status.state, 'TASK_STATE_SUBMITTED');
      const taskId = submittedBody.result?.task?.id;
      assert.ok(taskId, 'authenticated SendMessage must return the task identifier');

      const aliceRead = await postRpc(origin, aliceToken, {
        jsonrpc: '2.0',
        id: 'alice-get',
        method: 'GetTask',
        params: { id: taskId },
      });
      assert.equal(aliceRead.status, 200);
      const aliceBody = await aliceRead.json() as {
        result?: { id: string; status: { state: string } };
        error?: { code: number };
      };
      assert.equal(aliceBody.error, undefined);
      assert.equal(aliceBody.result?.id, taskId);
      assert.equal(aliceBody.result?.status.state, 'TASK_STATE_SUBMITTED');

      const bobRead = await postRpc(origin, bobToken, {
        jsonrpc: '2.0',
        id: 'bob-get-alice-task',
        method: 'GetTask',
        params: { id: taskId },
      });
      const bobBody = await bobRead.json() as { error?: { code: number; message: string } };
      assert.equal(bobRead.status, 200);
      assert.equal(bobBody.error?.code, -32001, 'a different verified identity must not read Alice task details');
      assert.equal(bobBody.error?.message, 'Task not found.');

      const aliceList = await postRpc(origin, aliceToken, {
        jsonrpc: '2.0',
        id: 'alice-list',
        method: 'ListTasks',
        params: { pageSize: 10 },
      });
      const aliceListBody = await aliceList.json() as { result?: { tasks: Array<{ id: string }> } };
      assert.deepEqual(aliceListBody.result?.tasks.map((task) => task.id), [taskId]);

      const bobList = await postRpc(origin, bobToken, {
        jsonrpc: '2.0',
        id: 'bob-list',
        method: 'ListTasks',
        params: { pageSize: 10 },
      });
      const bobListBody = await bobList.json() as { result?: { tasks: Array<{ id: string }> } };
      assert.deepEqual(bobListBody.result?.tasks, []);
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousIssuer === undefined) delete process.env.AUTH0_ISSUER_BASE_URL;
    else process.env.AUTH0_ISSUER_BASE_URL = previousIssuer;
    if (previousAudience === undefined) delete process.env.AUTH0_AUDIENCE;
    else process.env.AUTH0_AUDIENCE = previousAudience;
  }
});
