import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import {
  createAgentTask,
  getAgentTask,
  getAgentRuntimePersistenceStatus,
  getAgentTaskRecoveryObservation,
  heartbeatAgentTask,
  withAgentTaskHeartbeat,
  initializeAgentRuntimePersistence,
  listAgentTasks,
  updateAgentTask,
  requireAgentTaskUpdate,
  canAccessAgentTask,
  filterAgentTasksByRequester,
  resolveAgentTaskRequester,
} from './agent-runtime.ts';
import type { PostgresAgentStateStore } from './agent-state-store.ts';

// Task ownership is enforced independently of authentication. Request-body identity
// must never let an ordinary authenticated caller impersonate another requester.
const accessFixtures = [
  { id: 'alice-task', requester: 'alice-uid' },
  { id: 'bob-task', requester: 'bob-uid' },
  { id: 'system-task', requester: 'human-owner' },
];
assert.equal(canAccessAgentTask(accessFixtures[0], 'alice-uid'), true);
assert.equal(canAccessAgentTask(accessFixtures[1], 'alice-uid'), false);
assert.equal(canAccessAgentTask(accessFixtures[1], 'alice-uid', true), true, 'the owner or authenticated internal service may inspect all tasks');
assert.equal(canAccessAgentTask(accessFixtures[0], ''), false, 'missing identity must fail closed');
assert.deepEqual(filterAgentTasksByRequester(accessFixtures, 'alice-uid').map((task) => task.id), ['alice-task']);
assert.deepEqual(filterAgentTasksByRequester(accessFixtures, '', true).map((task) => task.id), ['alice-task', 'bob-task', 'system-task']);
assert.equal(resolveAgentTaskRequester('alice-uid', 'human-owner'), 'alice-uid', 'ordinary callers cannot spoof requester identity');
assert.equal(resolveAgentTaskRequester('owner-uid', 'delegated-agent', true), 'delegated-agent', 'owner may intentionally attribute a delegated task');
assert.equal(resolveAgentTaskRequester(undefined, 'internal-agent', true), 'internal-agent', 'authenticated internal services may provide service identity');
assert.equal(resolveAgentTaskRequester(undefined, 'human-owner'), null, 'no authenticated requester or internal authority must fail closed');

const federatedAccessFixtures = [
  { id: 'fa2a-alice', requesterAgentId: 'alice-uid' },
  { id: 'fa2a-bob', requesterAgentId: 'bob-uid' },
];
assert.equal(canAccessAgentTask(federatedAccessFixtures[0], 'alice-uid'), true);
assert.equal(canAccessAgentTask(federatedAccessFixtures[1], 'alice-uid'), false);
assert.deepEqual(
  filterAgentTasksByRequester(federatedAccessFixtures, 'alice-uid').map((task) => task.id),
  ['fa2a-alice'],
  'A2A requesterAgentId must receive the same private-by-default task scope as AgentTask.requester',
);
assert.equal(resolveAgentTaskRequester('alice-uid', 'bob-uid'), 'alice-uid', 'ordinary A2A callers cannot spoof requesterAgentId');

const previousDatabaseUrl = process.env.DATABASE_URL;
delete process.env.DATABASE_URL;

// A separate process proves DATABASE_URL is read after the environment is populated
// but before the module initializes persistence; APIs must fail closed in that state.
execFileSync(process.execPath, [
  '--import',
  'tsx/esm',
  '--input-type=module',
  '-e',
  `
    import assert from 'node:assert/strict';
    const runtime = await import('./src/lib/agent-runtime.ts');
    assert.equal(runtime.getAgentRuntimePersistenceStatus().mode, 'uninitialized');
    await assert.rejects(
      () => runtime.createAgentTask({ capability: 'research', objective: 'must fail closed', requester: 'test' }),
      /still initializing/,
    );
    await assert.rejects(() => runtime.getAgentTask('task-not-initialized'), /still initializing/);
  `,
], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: 'postgresql://unit-test.invalid/uninitialized' },
  stdio: 'pipe',
});

// Modules must not assume memory fallback before dotenv/runtime configuration has settled.
assert.equal(getAgentRuntimePersistenceStatus().mode, 'uninitialized');
await assert.rejects(
  () => createAgentTask({ capability: 'research', objective: 'must fail closed', requester: 'test' }),
  /still initializing/,
);

try {
  assert.equal(await initializeAgentRuntimePersistence(), false);
  assert.equal(getAgentRuntimePersistenceStatus().mode, 'memory-fallback');
  assert.equal(getAgentRuntimePersistenceStatus().durable, false);
  assert.equal(getAgentRuntimePersistenceStatus().cachedTasks, 0);

  const recoveryNow = Date.now();
  assert.equal(
    getAgentTaskRecoveryObservation({ status: 'running', updatedAt: new Date(recoveryNow - 30_000).toISOString() }, recoveryNow).state,
    'heartbeat-current',
  );
  assert.equal(
    getAgentTaskRecoveryObservation({ status: 'running', updatedAt: new Date(recoveryNow - 5 * 60_000).toISOString() }, recoveryNow).state,
    'heartbeat-overdue',
  );
  assert.equal(
    getAgentTaskRecoveryObservation({ status: 'running', updatedAt: new Date(recoveryNow - 31 * 60_000).toISOString() }, recoveryNow).state,
    'startup-recovery-eligible',
  );
  assert.deepEqual(getAgentRuntimePersistenceStatus().recoveryPolicy, {
    staleAfterMinutes: 30,
    heartbeatIntervalMs: 60_000,
    heartbeatCoverage: ['agent-task-inference', 'governance-cycle'],
    startupRecoveryOnly: true,
    interruptedWithinGracePeriodMayRemainRunning: true,
    automaticReplay: false,
  });

  const task = await createAgentTask({
    capability: 'research',
    objective: 'Verify process-local agent task fallback behavior.',
    requester: 'agent-runtime-test',
    input: { test: true },
  });
  assert.equal(task.status, 'queued');
  assert.equal(typeof task.updatedAt, 'string');

  const running = await updateAgentTask(task.id, { status: 'running' });
  assert.equal(running?.status, 'running');
  assert.equal(running?.createdAt, task.createdAt);

  const firstHeartbeat = running?.updatedAt || '';
  assert.equal(await heartbeatAgentTask(task.id), true);
  assert.equal((await getAgentTask(task.id))?.status, 'running');
  assert.ok(Date.parse((await getAgentTask(task.id))?.updatedAt || '') >= Date.parse(firstHeartbeat));

  const beforeWrappedHeartbeat = (await getAgentTask(task.id))?.updatedAt || '';
  const heartbeatResult = await withAgentTaskHeartbeat(
    task.id,
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return 'heartbeat-wrapped-result';
    },
    5,
  );
  assert.equal(heartbeatResult, 'heartbeat-wrapped-result');
  assert.equal((await getAgentTask(task.id))?.status, 'running');
  assert.ok(
    Date.parse((await getAgentTask(task.id))?.updatedAt || '') > Date.parse(beforeWrappedHeartbeat),
    'the heartbeat wrapper must refresh the persisted task timestamp while work is active',
  );

  const failed = await updateAgentTask(task.id, { status: 'failed', error: 'test failure' });
  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.error, 'test failure');

  const completed = await updateAgentTask(task.id, { status: 'completed', result: { recovered: true } });
  assert.equal(completed?.status, 'completed');
  assert.equal(completed?.error, undefined, 'successful completion must clear stale recovery errors');

  assert.equal((await getAgentTask(task.id))?.status, 'completed');
  assert.deepEqual(await listAgentTasks(10, ''), [], 'an explicitly blank requester must not disable tenant scoping');
  assert.deepEqual(await listAgentTasks(10), [], 'a missing requester must fail closed unless all-task access is explicit');
  assert.equal((await listAgentTasks(10, undefined, true)).some((entry) => entry.id === task.id), true);

  // Memory fallback and PostgreSQL mode must order tasks by last update, not creation.
  const olderTask = await createAgentTask({
    capability: 'research',
    objective: 'Verify ordering by last update.',
    requester: 'agent-runtime-test',
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const newerTask = await createAgentTask({
    capability: 'research',
    objective: 'Verify ordering by last update with a newer creation time.',
    requester: 'agent-runtime-test',
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await updateAgentTask(olderTask.id, { status: 'running' });
  assert.equal(
    (await listAgentTasks(10, undefined, true))[0]?.id,
    olderTask.id,
    'recently updated older tasks must sort ahead of newly created but older-updated tasks',
  );
  assert.notEqual(olderTask.id, newerTask.id);

  // The requester filter must run before the in-memory limit too. A user's
  // older tasks must not be hidden by another user's newer task volume.
  const aliceOlderTask = await createAgentTask({
    capability: 'research',
    objective: 'Older Alice task must remain visible.',
    requester: 'alice-uid',
  });
  for (let index = 0; index < 55; index += 1) {
    await createAgentTask({
      capability: 'research',
      objective: `Newer Bob task ${index}.`,
      requester: 'bob-uid',
    });
  }
  assert.deepEqual(
    (await listAgentTasks(10, 'alice-uid')).map((entry) => entry.id),
    [aliceOlderTask.id],
    'requester filtering must precede the memory-fallback list limit',
  );
  assert.equal((await listAgentTasks(10, 'bob-uid')).length, 10);

  await assert.rejects(
    () => requireAgentTaskUpdate('missing-task', { status: 'running' }),
    /Agent task missing-task no longer exists/,
  );

  process.env.DATABASE_URL = 'postgresql://unit-test.invalid/fail-closed';
  const failingStore = {
    initialize: async () => { throw new Error('database initialization failed'); },
    recoverInterruptedTasks: async () => 0,
    list: async <T>() => [] as T[],
    get: async <T>() => null as T | null,
    save: async () => undefined,
  } as unknown as PostgresAgentStateStore;
  await assert.rejects(() => initializeAgentRuntimePersistence(failingStore), /database initialization failed/);
  assert.equal(getAgentRuntimePersistenceStatus().mode, 'uninitialized');
  await assert.rejects(
    () => createAgentTask({ capability: 'research', objective: 'must remain fail closed', requester: 'test' }),
    /still initializing/,
  );

  const durableRecords = new Map<string, unknown>();
  let hangNextHeartbeat = false;
  let releaseHangingHeartbeat: (() => void) | undefined;
  const durableStore = {
    initialize: async () => undefined,
    recoverInterruptedTasks: async () => 0,
    heartbeatRunningTask: async () => {
      if (!hangNextHeartbeat) return true;
      await new Promise<void>((resolve) => { releaseHangingHeartbeat = resolve; });
      return true;
    },
    list: async <T>(_kind: 'task' | 'session', _limit = 50, requester?: string, allowAll = false) =>
      [...durableRecords.values()].filter((value) => {
        const record = value as { requester?: string };
        return allowAll || (typeof requester === 'string' && requester.length > 0 && record.requester === requester);
      }) as T[],
    get: async <T>(_kind: 'task' | 'session', id: string) => (durableRecords.get(id) as T | undefined) ?? null,
    save: async (_kind: 'task' | 'session', record: { id: string }) => {
      durableRecords.set(record.id, structuredClone(record));
    },
  } as unknown as PostgresAgentStateStore;

  process.env.DATABASE_URL = 'postgresql://unit-test.invalid/glorifier';
  assert.equal(await initializeAgentRuntimePersistence(durableStore), true);
  assert.equal(getAgentRuntimePersistenceStatus().cachedTasks, 0);
  const durableTask = await createAgentTask({
    capability: 'research',
    objective: 'Verify durable task state remains database-backed.',
    requester: 'agent-runtime-test',
    input: { durable: true },
  });
  assert.equal(getAgentRuntimePersistenceStatus().cachedTasks, 0);
  assert.equal((await updateAgentTask(durableTask.id, { status: 'running' }))?.status, 'running');
  assert.equal((await getAgentTask(durableTask.id))?.status, 'running');
  assert.equal((await listAgentTasks(10, undefined, true)).some((entry) => entry.id === durableTask.id), true);
  assert.equal(getAgentRuntimePersistenceStatus().cachedTasks, 0);
  hangNextHeartbeat = true;
  const nonBlockingHeartbeatOperation = withAgentTaskHeartbeat(
    durableTask.id,
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return 'operation-finished-with-hanging-heartbeat';
    },
    5,
  );
  const nonBlockingHeartbeatResult = await Promise.race([
    nonBlockingHeartbeatOperation,
    new Promise<string>((resolve) => setTimeout(() => resolve('heartbeat-timeout'), 150)),
  ]);
  hangNextHeartbeat = false;
  releaseHangingHeartbeat?.();
  await nonBlockingHeartbeatOperation;
  assert.equal(
    nonBlockingHeartbeatResult,
    'operation-finished-with-hanging-heartbeat',
    'a slow heartbeat must not block completion of the monitored operation',
  );

  await assert.rejects(
    () => createAgentTask({
      capability: 'research',
      objective: 'reject an invalid requester type',
      requester: 42,
    } as never),
    /requester must be a non-empty string/,
  );

  const failingSaveStore = {
    initialize: async () => undefined,
    recoverInterruptedTasks: async () => 1,
    list: async <T>() => [] as T[],
    get: async <T>() => null as T | null,
    save: async () => { throw new Error('simulated durable save failure'); },
  } as unknown as PostgresAgentStateStore;
  assert.equal(await initializeAgentRuntimePersistence(failingSaveStore), true);
  await assert.rejects(
    () => createAgentTask({ capability: 'research', objective: 'must not be accepted without durable save', requester: 'agent-runtime-test' }),
    /simulated durable save failure/,
  );
  assert.deepEqual(await listAgentTasks(10, undefined, true), [], 'a task whose durable insert failed must not appear as accepted');
} finally {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
}

console.log('agent runtime persistence fallback tests: PASS');
