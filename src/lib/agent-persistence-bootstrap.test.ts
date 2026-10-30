import { strict as assert } from 'node:assert';
import { initializeAgentStateFallbackWhenDatabaseMissing, initializeOptionalPostgresAgentStore } from './agent-persistence-bootstrap.ts';

const calls: string[] = [];
const initialized = await initializeAgentStateFallbackWhenDatabaseMissing(
  undefined,
  async () => { calls.push('runtime'); },
  async () => { calls.push('harness'); },
);
assert.equal(initialized, true);
assert.deepEqual(calls, ['runtime', 'harness'], 'both in-memory stores must be initialized before backend initialization fails');

calls.length = 0;
const configured = await initializeAgentStateFallbackWhenDatabaseMissing(
  'postgresql://configured.example/glorifier',
  async () => { calls.push('runtime'); },
  async () => { calls.push('harness'); },
);
assert.equal(configured, false);
assert.deepEqual(calls, [], 'configured database mode must remain fail-closed until PostgreSQL initialization succeeds');

let harnessCalledAfterFailure = false;
await assert.rejects(
  () => initializeAgentStateFallbackWhenDatabaseMissing(
    undefined,
    async () => { throw new Error('runtime fallback initialization failed'); },
    async () => { harnessCalledAfterFailure = true; },
  ),
  /runtime fallback initialization failed/,
);
assert.equal(harnessCalledAfterFailure, false, 'a partial fallback initialization must not be reported as complete');

let storeFactoryCalls = 0;
let storeInitializeCalls = 0;
const noDatabaseStore = await initializeOptionalPostgresAgentStore(
  undefined,
  undefined,
  () => {
    storeFactoryCalls += 1;
    return { initialize: async () => { storeInitializeCalls += 1; } };
  },
);
assert.equal(noDatabaseStore, null, 'no-database mode must not create a PostgreSQL store');
assert.equal(storeFactoryCalls, 0);
assert.equal(storeInitializeCalls, 0);

const overrideStore = { initialize: async () => { storeInitializeCalls += 1; } };
const overrideResult = await initializeOptionalPostgresAgentStore(
  undefined,
  overrideStore,
  () => { throw new Error('the explicit store override must be used'); },
);
assert.equal(overrideResult, overrideStore);
assert.equal(storeInitializeCalls, 1, 'an explicit test store may initialize without DATABASE_URL');

const postgresStore = await initializeOptionalPostgresAgentStore(
  'postgresql://configured.example/glorifier',
  undefined,
  () => {
    storeFactoryCalls += 1;
    return { initialize: async () => { storeInitializeCalls += 1; } };
  },
);
assert.ok(postgresStore);
assert.equal(storeFactoryCalls, 1);
assert.equal(storeInitializeCalls, 2, 'a configured PostgreSQL store must be initialized before being returned');

console.log('agent persistence bootstrap tests: PASS');
