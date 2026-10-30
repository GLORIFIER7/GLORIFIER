import { strict as assert } from 'node:assert';
import { initializeAgentStateFallbackWhenDatabaseMissing } from './agent-persistence-bootstrap.ts';

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

console.log('agent persistence bootstrap tests: PASS');
