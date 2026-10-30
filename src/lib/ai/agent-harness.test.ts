import { strict as assert } from 'node:assert';
import {
  authorizeToolRequest,
  executeAgentTurn,
  createAgentSession,
  getAgentSession,
  getAgentHarnessPersistenceStatus,
  initializeAgentHarnessPersistence,
  type AgentToolRequest,
  type HumanToolApproval,
} from './agent-harness.ts';
import type { PostgresAgentStateStore } from '../agent-state-store';

const originalDatabaseUrl = process.env.DATABASE_URL;
delete process.env.DATABASE_URL;
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
    executed = true;
    return 'executed';
  },
});
assert.equal(executed, true);
assert.equal(result.result, 'executed');
assert.equal(result.session.lastHumanApproval?.toolId, dangerous.id);
assert.equal((await getAgentSession(approvedSession.id))?.turnCount, 1);

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
const testStore = {
  initialize: async () => undefined,
  list: async <T>() => [] as T[],
  get: async <T>(_kind: 'task' | 'session', id: string) => (durableSessions.get(id) as T | undefined) ?? null,
  save: async (_kind: 'task' | 'session', record: { id: string }) => {
    durableSessions.set(record.id, structuredClone(record));
  },
} as unknown as PostgresAgentStateStore;

process.env.DATABASE_URL = 'postgresql://unit-test.invalid/glorifier';
assert.equal(await initializeAgentHarnessPersistence(testStore), true);
const durableSession = await createAgentSession('harness-test-durable');
assert.equal(getAgentHarnessPersistenceStatus().mode, 'postgres');
assert.equal(getAgentHarnessPersistenceStatus().cachedSessions, 0);
assert.deepEqual(await getAgentSession(durableSession.id), durableSession);
assert.equal(getAgentHarnessPersistenceStatus().cachedSessions, 0);

if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
else process.env.DATABASE_URL = originalDatabaseUrl;

console.log('agent-harness approval and persistence-cache tests: PASS');
