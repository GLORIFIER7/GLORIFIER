import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import {
  createA2AExpressRouter,
  configureA2AJsonRpcBodyParsing,
  type A2AExpressDependencies,
} from './a2a-v1-express';
import type { A2ACreateTaskInput, A2AListTasksInput, A2ATaskLike } from './a2a-v1';
import { createRequireAuthentication, type TokenVerifier } from './auth/backend-auth';

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

async function withA2AServer(run: (origin: string) => Promise<void>): Promise<void> {
  const tasks = new Map<string, A2ATaskLike>();
  let nextId = 0;

  // The integration test uses an explicit verifier fixture. It exercises the
  // production authentication middleware and A2A router together without
  // requiring production credentials or submitting a task to a live service.
  const verifier: TokenVerifier = async (req) => {
    const authorization = req.get('authorization');
    if (authorization === 'Bearer alice-test-token') return { uid: 'agent-alice' } as never;
    if (authorization === 'Bearer bob-test-token') return { uid: 'agent-bob' } as never;
    return null;
  };

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
  app.use('/api', createRequireAuthentication(verifier));
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

test('A2A authenticated exchange binds tasks to verified identity and scopes retrieval', async () => {
  await withA2AServer(async (origin) => {
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

    const submitted = await postRpc(origin, 'alice-test-token', {
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
    assert.ok(taskId, 'authenticated SendMessage must return the durable task identifier');

    const aliceRead = await postRpc(origin, 'alice-test-token', {
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

    const bobRead = await postRpc(origin, 'bob-test-token', {
      jsonrpc: '2.0',
      id: 'bob-get-alice-task',
      method: 'GetTask',
      params: { id: taskId },
    });
    const bobBody = await bobRead.json() as { error?: { code: number; message: string } };
    assert.equal(bobRead.status, 200);
    assert.equal(bobBody.error?.code, -32001, 'a different authenticated agent must not read Alice task details');
    assert.equal(bobBody.error?.message, 'Task not found.');

    const aliceList = await postRpc(origin, 'alice-test-token', {
      jsonrpc: '2.0',
      id: 'alice-list',
      method: 'ListTasks',
      params: { pageSize: 10 },
    });
    const aliceListBody = await aliceList.json() as { result?: { tasks: Array<{ id: string }> } };
    assert.deepEqual(aliceListBody.result?.tasks.map((task) => task.id), [taskId]);

    const bobList = await postRpc(origin, 'bob-test-token', {
      jsonrpc: '2.0',
      id: 'bob-list',
      method: 'ListTasks',
      params: { pageSize: 10 },
    });
    const bobListBody = await bobList.json() as { result?: { tasks: Array<{ id: string }> } };
    assert.deepEqual(bobListBody.result?.tasks, []);
  });
});
