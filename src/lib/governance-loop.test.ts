import assert from 'node:assert/strict';
import { withGovernanceTaskFailureRecovery } from './governance-task-failure.ts';
import { normalizeGovernanceRequester } from './governance-loop.ts';

assert.equal(normalizeGovernanceRequester(undefined), 'human-owner');
assert.equal(normalizeGovernanceRequester(''), 'human-owner');
assert.equal(normalizeGovernanceRequester('   '), 'human-owner', 'whitespace-only requester must use the human-owner fallback');
assert.equal(normalizeGovernanceRequester('  operator-1  '), 'operator-1', 'non-empty requester values must be trimmed');

const succeeded = await withGovernanceTaskFailureRecovery(
  'task-success',
  async () => 'cycle-result',
  async () => { throw new Error('must not update a successful task'); },
);
assert.equal(succeeded, 'cycle-result');

const failure = new Error('specialist council unavailable');
const updates: Array<{ taskId: string; message: string }> = [];
let observedError: unknown;
try {
  await withGovernanceTaskFailureRecovery(
    'task-failed',
    async () => { throw failure; },
    async (taskId, message) => { updates.push({ taskId, message }); },
  );
} catch (error) {
  observedError = error;
}
assert.strictEqual(observedError, failure, 'the original governance failure must be rethrown');
assert.deepEqual(updates, [{
  taskId: 'task-failed',
  message: 'specialist council unavailable',
}], 'a failed governance cycle must persist a failed task with the original error');

const originalFailure = new Error('governance operation failed');
const persistenceFailure = new Error('database unavailable');
let preservedOriginal: unknown;
try {
  await withGovernanceTaskFailureRecovery(
    'task-persistence-failed',
    async () => { throw originalFailure; },
    async () => { throw persistenceFailure; },
  );
} catch (error) {
  preservedOriginal = error;
}
assert.strictEqual(
  preservedOriginal,
  originalFailure,
  'a failed status write must not mask the original governance error',
);

console.log('governance task failure recovery tests: PASS');
