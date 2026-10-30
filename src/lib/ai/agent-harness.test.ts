import { strict as assert } from 'node:assert';
import {
  authorizeToolRequest,
  executeAgentTurn,
  createAgentSession,
  getAgentSession,
  getAgentHarnessPersistenceStatus,
  initializeAgentHarnessPersistence,
  recordAgentTurn,
  type AgentToolRequest,
  type HumanToolApproval,
} from './agent-harness.ts';
import type { PostgresAgentStateStore } from '../agent-state-store';

const originalDatabaseUrl = process.env.DATABASE_URL;
delete process.env.DATABASE_URL;
assert.equal(getAgentHarnessPersistenceStatus().mode, 'uninitialized');
await assert.rejects(() => createAgentSession('must-fail-before-harness-init'), /still initializing/);
assert.equal(await initializeAgentHarnessPersistence(), false);
assert.deepEqual(getAgentHarnessPersistenceStatus(), {
  mode: 'memory-fallback',
  durable: false,
  cachedSessions: 0,
});

const capability = new Set(['mcp-tool']);
const lowRisk: AgentToolRequest = { id: 'read-1', name: 'read', risk: 'low', capability: 'mcp-tool' };
const dangerous: AgentToolRequest = { id: 'delete-1', name: 'delete', risk: 'irreversible', capability: 'mcp-tool' };

const normal = authorizeToolRequest(lowRisk, capability);
assert.equal(normal.allowed, true);

const blocked = authorizeToolRequest(dangerous, capability);
assert.equal(blocked.allowed, false);
assert.equal(blocked.requiresHumanApproval, true);

const approval: HumanToolApproval = {
  toolId: dangerous.id,
  approved: true,
  approvedBy: 'human',
  approvedAt: new Date().toISOString(),
};

const approved = authorizeToolRequest(dangerous, capability, approval);
assert.equal(approved.allowed, true);
assert.equal(approved.requiresHumanApproval, false);

const missingCapability = authorizeToolRequest(dangerous, new Set(), approval);
assert.equal(missingCapability.allowed, false);
assert.equal(missingCapability.requiresHumanApproval, false);

const session = await createAgentSession('harness-test');

const concurrentSession = await createAgentSession('harness-test-concurrent');
await Promise.all([
  recordAgentTurn(concurrentSession.id, 100),
  recordAgentTurn(concurrentSession.id, 200),
]);
assert.equal(
  (await getAgentSession(concurrentSession.id))?.turnCount,
  2,
  'concurrent turns must not overwrite each other or lose the turn increment',
);
await assert.rejects(() => recordAgentTurn(session.id, Number.POSITIVE_INFINITY), /finite/);

let unsafeTokenActionStarted = false;
await assert.rejects(
  () => executeAgentTurn({
    session,
    contextTokens: Number.MAX_SAFE_INTEGER + 1,
    run: async () => {
      unsafeTokenActionStarted = true;
      return 'must-not-run';
    },
  }),
  /safe integer/,
);
assert.equal(unsafeTokenActionStarted, false, 'unsafe token counts must be rejected before an external action runs');
await assert.rejects(
  () => createAgentSession('harness-test-duplicate', { sessionId: session.id }),
  /already exists/,
);
await assert.rejects(
  () => executeAgentTurn({ session, contextTokens: 100, tools: [dangerous], approvedCapabilities: capability, run: async () => 'must-not-run' }),
  /Tool approval required/,
);
assert.equal((await getAgentSession(session.id))?.status, 'waiting-approval');

const approvedSession = await createAgentSession('harness-test-approved');
let executed = false;
const result = await executeAgentTurn({
  session: approvedSession,
  contextTokens: 100,
  tools: [dangerous],
  approvedCapabilities: capability,
  humanApproval: approval,
  run: async () => {
    assert.equal((await getAgentSession(approvedSession.id))?.lastHumanApproval?.toolId, dangerous.id, 'approval must be durable before execution begins');
    executed = true;
    return 'executed';
  },
});
assert.equal(executed, true);
assert.equal(result.result, 'executed');
assert.equal(result.session.lastHumanApproval?.toolId, dangerous.id);
assert.equal((await getAgentSession(approvedSession.id))?.turnCount, 1);

const unrelatedApprovalSession = await createAgentSession('harness-test-unrelated-approval');
const unrelatedApproval: HumanToolApproval = {
  toolId: 'not-the-requested-tool',
  approved: true,
  approvedBy: 'human',
  approvedAt: 'not-a-valid-timestamp',
};
await executeAgentTurn({
  session: unrelatedApprovalSession,
  contextTokens: 1,
  tools: [lowRisk],
  approvedCapabilities: capability,
  humanApproval: unrelatedApproval,
  run: async () => 'low-risk task completed',
});
assert.equal(
  (await getAgentSession(unrelatedApprovalSession.id))?.lastHumanApproval,
  undefined,
  'an invalid or unrelated approval must never be recorded as authorization',
);

const failedSession = await createAgentSession('harness-test-failed');
await assert.rejects(
  () => executeAgentTurn({
    session: failedSession,
    contextTokens: 10,
    tools: [],
    approvedCapabilities: new Set(),
    run: async () => { throw new Error('mocked inference failure'); },
  }),
  /mocked inference failure/,
);
assert.equal((await getAgentSession(failedSession.id))?.status, 'failed');

// A durable store is the source of truth; persisted sessions must not also
// accumulate in the process-local fallback cache.
const durableSessions = new Map<string, unknown>();
let failDurableSave = false;
const testStore = {
  initialize: async () => undefined,
  list: async <T>() => [] as T[],
  get: async <T>(_kind: 'task' | 'session', id: string) => (durableSessions.get(id) as T | undefined) ?? null,
  save: async (_kind: 'task' | 'session', record: { id: string }) => {
    if (failDurableSave) throw new Error('simulated session persistence failure');
    durableSessions.set(record.id, structuredClone(record));
  },
  incrementSessionTurn: async <T>(_id: string, _contextTokens: number) => {
    if (failDurableSave) throw new Error('simulated session persistence failure');
    const current = durableSessions.get(_id) as {
      id: string; turnCount: number; maxContextTokens: number; [key: string]: unknown;
    } | undefined;
    if (!current) return null;
    const updated = {
      ...current,
      status: 'active',
      updatedAt: new Date().toISOString(),
      turnCount: current.turnCount + 1,
      contextTokens: _contextTokens,
      compactionRecommended: _contextTokens >= Math.floor(current.maxContextTokens * 0.8),
    };
    durableSessions.set(_id, structuredClone(updated));
    return structuredClone(updated) as T;
  },
} as unknown as PostgresAgentStateStore;

process.env.DATABASE_URL = 'postgresql://unit-test.invalid/glorifier';
assert.equal(await initializeAgentHarnessPersistence(testStore), true);
const durableSession = await createAgentSession('harness-test-durable');
assert.equal(getAgentHarnessPersistenceStatus().mode, 'postgres');
assert.equal(getAgentHarnessPersistenceStatus().cachedSessions, 0);
assert.deepEqual(await getAgentSession(durableSession.id), durableSession);
assert.equal(getAgentHarnessPersistenceStatus().cachedSessions, 0);

const failingReinitializationStore = {
  ...testStore,
  initialize: async () => { throw new Error('simulated durable store reinitialization failure'); },
} as unknown as PostgresAgentStateStore;
await assert.rejects(
  () => initializeAgentHarnessPersistence(failingReinitializationStore),
  /simulated durable store reinitialization failure/,
);
await assert.rejects(
  () => recordAgentTurn(durableSession.id, 25),
  /still initializing/,
  'session writes must fail closed after a durable-store reinitialization failure',
);
let executedAfterFailedReinitialize = false;
await assert.rejects(
  () => executeAgentTurn({
    session: durableSession,
    contextTokens: 25,
    run: async () => {
      executedAfterFailedReinitialize = true;
      return 'must-not-run';
    },
  }),
  /still initializing/,
  'the harness must reject before starting an external action when persistence is uninitialized',
);
assert.equal(executedAfterFailedReinitialize, false);
assert.equal(await initializeAgentHarnessPersistence(testStore), true);

const persistenceFailureSession = await createAgentSession('harness-test-post-action-persistence-failure');
let externalActionCompleted = false;
let persistenceFailure: unknown;
failDurableSave = true;
try {
  await executeAgentTurn({
    session: persistenceFailureSession,
    contextTokens: 50,
    run: async () => {
      externalActionCompleted = true;
      return { externalAction: 'completed', id: 'action-123' };
    },
  });
} catch (error) {
  persistenceFailure = error;
} finally {
  failDurableSave = false;
}
assert.equal(externalActionCompleted, true);
assert.equal((persistenceFailure as { persisted?: boolean } | undefined)?.persisted, false);
assert.deepEqual(
  (persistenceFailure as { result?: unknown } | undefined)?.result,
  { externalAction: 'completed', id: 'action-123' },
  'the completed result must be available when its session write fails so callers do not blindly repeat the action',
);
assert.equal(
  (persistenceFailure as { sessionId?: string } | undefined)?.sessionId,
  persistenceFailureSession.id,
);
assert.match((persistenceFailure as Error)?.message || '', /completed.*persist/i);

if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
else process.env.DATABASE_URL = originalDatabaseUrl;

console.log('agent-harness approval and persistence-cache tests: PASS');
