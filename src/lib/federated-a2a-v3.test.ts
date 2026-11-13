import { FEDERATED_A2A_V3_LIFECYCLE, FEDERATED_A2A_V3_VERSION, getFederatedA2AV3Policy, createFederatedA2ATask, listFederatedA2ATasks, listFederatedA2ATasksFromStore, getFederatedA2ATaskFromStore, type FederatedA2AQuery } from './federated-a2a-v3';
import { strict as assert } from 'node:assert';
import { before, test } from 'node:test';

let assertionsCompleted = false;

before(async () => {
const p=getFederatedA2AV3Policy();
if(FEDERATED_A2A_V3_VERSION!=='G-A2A-TASK-3.0') throw new Error('version');
if(JSON.stringify(p.lifecycle)!==JSON.stringify(FEDERATED_A2A_V3_LIFECYCLE)) throw new Error('lifecycle');
if(!p.humanAuthorityRemainsHighest||p.automaticFinancialTransfers||p.automaticIrreversibleProductionChanges||p.automaticCredentialRotation) throw new Error('governance');
const t=await createFederatedA2ATask({requesterAgentId:'ai-ceo',capability:'research',objective:'test'}, async () => {});
if (listFederatedA2ATasks(100).length !== 0) throw new Error('missing requester must fail closed unless all-task access is explicit');
if (listFederatedA2ATasks(100, '').length !== 0) throw new Error('blank requester must fail closed');
const initialAdminPage = listFederatedA2ATasks(100, undefined, true);
if (initialAdminPage.length !== 1 || initialAdminPage[0].id !== t.id) {
  throw new Error('explicit all-task access must include the seeded task');
}
if(t.state!=='DISCOVERED'||t.attempt!==0||t.evidenceRefs.length!==0) throw new Error('task');

const aliceTask = await createFederatedA2ATask({ requesterAgentId: 'alice-uid', capability: 'research', objective: 'older private task' }, async () => {});
await new Promise((resolve) => setTimeout(resolve, 2));
for (let index = 0; index < 55; index += 1) {
  await createFederatedA2ATask({ requesterAgentId: 'bob-uid', capability: 'research', objective: 'newer task ' + index }, async () => {});
}
const alicePage = listFederatedA2ATasks(1, 'alice-uid');
if (alicePage.length !== 1 || alicePage[0].id !== aliceTask.id) {
  throw new Error('requester filtering must run before Federated A2A list pagination');
}
const adminPage = listFederatedA2ATasks(100, undefined, true);
if (adminPage.length !== 57) throw new Error('explicit all-task access must include all seeded tasks');
console.log('FEDERATED_A2A_V3_TEST_OK',JSON.stringify({version:FEDERATED_A2A_V3_VERSION,lifecycle:p.lifecycle}));


const persistedRow = {
  id: 'fa2a-persisted',
  requester_agent_id: 'alice-uid',
  target_agent_id: null,
  capability: 'research',
  objective: 'survive process restart',
  input: { source: 'integration' },
  state: 'DISCOVERED',
  attempt: 0,
  max_attempts: 3,
  parent_task_id: null,
  evidence_refs: [],
  audit_refs: [],
  result: null,
  error: null,
  created_at: new Date('2026-10-29T10:00:00.000Z'),
  updated_at: new Date('2026-10-29T10:00:00.000Z'),
};
const dbCalls: Array<{ sql: string; values: unknown[] }> = [];
const fakeDbQuery: FederatedA2AQuery = async (sql, values = []) => {
  dbCalls.push({ sql, values });
  return { rows: [persistedRow] };
};
const persistedTasks = await listFederatedA2ATasksFromStore(1, 'alice-uid', false, fakeDbQuery);
if (persistedTasks.length !== 1 || persistedTasks[0].id !== persistedRow.id) {
  throw new Error('requester-scoped federated task listing must read durable PostgreSQL rows');
}
if (!dbCalls[0].sql.includes('requester_agent_id = $1') || !dbCalls[0].sql.includes('ORDER BY created_at DESC LIMIT $2')) {
  throw new Error('durable federated task listing must filter by requester before applying LIMIT');
}
if (JSON.stringify(dbCalls[0].values) !== JSON.stringify(['alice-uid', 1])) {
  throw new Error('durable federated task list must bind requester and limit parameters');
}
const persistedTask = await getFederatedA2ATaskFromStore(persistedRow.id, 'alice-uid', false, fakeDbQuery);
if (!persistedTask || persistedTask.requesterAgentId !== 'alice-uid') {
  throw new Error('durable federated task detail must restore the persisted requester task');
}
if (!dbCalls[1].sql.includes('requester_agent_id = $2')) {
  throw new Error('durable federated task detail must enforce requester ownership in SQL');
}
const deniedUnscoped = await listFederatedA2ATasksFromStore(10, undefined, false, fakeDbQuery);
if (deniedUnscoped.length !== 0 || dbCalls.length !== 2) {
  throw new Error('unscoped federated task listing must fail closed without querying PostgreSQL');
}
console.log('FEDERATED_A2A_V3_DURABLE_READ_TEST_OK');


let releaseDurableCreate!: () => void;
let createFinished = false;
const delayedCreate = createFederatedA2ATask(
  { requesterAgentId: 'durable-user', capability: 'research', objective: 'wait for durable commit' },
  () => new Promise<void>((resolve) => { releaseDurableCreate = resolve; }),
).then((task) => { createFinished = true; return task; });
await Promise.resolve();
if (createFinished) throw new Error('federated task creation must wait for durable persistence before returning');
releaseDurableCreate();
const durablyCreated = await delayedCreate;
if (!durablyCreated.id || !createFinished) throw new Error('federated task creation must resolve after persistence completes');
console.log('FEDERATED_A2A_V3_DURABLE_CREATE_TEST_OK');
  assertionsCompleted = true;
});

test('existing assertions completed in setup hook', () => {
  assert.ok(assertionsCompleted, 'existing assertions completed before the test case');
});


test('Federated A2A cannot promote caller-supplied evidence to VERIFIED without an independent verifier', async () => {
  const {
    authorizeFederatedA2ATask,
    assignFederatedA2ATask,
    startFederatedA2ATask,
    markFederatedA2AEvidence,
    verifyFederatedA2ATask,
  } = await import('./federated-a2a-v3');
  const persistence = {
    audit: async () => 'audit-test',
    persist: async () => {},
  };
  const task = await createFederatedA2ATask(
    {
      requesterAgentId: 'requester-a',
      targetAgentId: 'evidence-agent',
      capability: 'evidence.attach',
      objective: 'verify evidence safely',
    },
    async () => {},
  );
  await authorizeFederatedA2ATask(task.id, 'human-owner', false, persistence);
  assert.equal(task.state, 'AUTHORIZED');
  await assignFederatedA2ATask(task.id, 'glorifier-daemon', persistence);
  assert.equal(task.state, 'ASSIGNED');
  await startFederatedA2ATask(task.id, 'evidence-agent', persistence);
  assert.equal(task.state, 'RUNNING');

  const evidenceRef = 'https://evidence.example/owner-supplied-claim';
  await markFederatedA2AEvidence(task.id, evidenceRef, 'evidence-agent', persistence);
  assert.equal(task.state, 'EVIDENCE');
  assert.deepEqual(task.evidenceRefs, [evidenceRef]);

  await assert.rejects(
    verifyFederatedA2ATask(task.id, 'reviewer-a'),
    /independent evidence verifier is not configured/i,
  );
  assert.equal(task.state, 'EVIDENCE',
    'missing independent verifier must not mutate the task into VERIFIED');

  await assert.rejects(
    verifyFederatedA2ATask(task.id, 'reviewer-a', async (snapshot) => ({
      status: 'NOT VERIFIED',
      source: 'independent-verifier',
      evidenceRefs: [...snapshot.evidenceRefs],
      observedAt: new Date().toISOString(),
      verifier: 'independent-verifier',
    })),
    /independent evidence verifier did not confirm/i,
  );
  assert.equal(task.state, 'EVIDENCE',
    'a negative verifier decision must leave the task in EVIDENCE');

  await assert.rejects(
    verifyFederatedA2ATask(task.id, 'reviewer-a', async () => ({
      status: 'VERIFIED',
      source: 'independent-verifier',
      evidenceRefs: ['https://evidence.example/not-attached-to-task'],
      observedAt: new Date().toISOString(),
      verifier: 'independent-verifier',
    })),
    /independent verification evidence references do not match/i,
  );
  assert.equal(task.state, 'EVIDENCE',
    'a verifier cannot approve evidence references that are not attached to the task');
});


test('Federated A2A terminal task states cannot be reauthorized or overwritten as failed', async () => {
  const {
    getFederatedA2ATask,
    authorizeFederatedA2ATask,
    failFederatedA2ATask,
  } = await import('./federated-a2a-v3');

  const settledForAuthorization = await createFederatedA2ATask(
    { requesterAgentId: 'requester-terminal-a', capability: 'research', objective: 'terminal authorization guard' },
    async () => {},
  );
  const authorizationRecord = getFederatedA2ATask(settledForAuthorization.id);
  assert.ok(authorizationRecord);
  authorizationRecord.state = 'SETTLED';
  await assert.rejects(
    authorizeFederatedA2ATask(settledForAuthorization.id, 'human-owner', true),
    /only DISCOVERED tasks may be authorized/i,
  );
  assert.equal(authorizationRecord.state, 'SETTLED',
    'authorization must not resurrect a settled task');

  const settledForFailure = await createFederatedA2ATask(
    { requesterAgentId: 'requester-terminal-b', capability: 'research', objective: 'terminal failure guard' },
    async () => {},
  );
  const failureRecord = getFederatedA2ATask(settledForFailure.id);
  assert.ok(failureRecord);
  failureRecord.state = 'SETTLED';
  await assert.rejects(
    failFederatedA2ATask(settledForFailure.id, 'late failure'),
    /terminal task cannot transition to FAILED/i,
  );
  assert.equal(failureRecord.state, 'SETTLED',
    'failure reporting must not overwrite a settled task');
});


test('Federated A2A rejects unbounded and non-integer envelope lifetimes', async () => {
  const { getFederatedA2ATask, createFederatedA2AEnvelope } = await import('./federated-a2a-v3');
  const task = await createFederatedA2ATask(
    { requesterAgentId: 'requester-envelope', capability: 'research', objective: 'bounded handoff lifetime' },
    async () => {},
  );
  const stored = getFederatedA2ATask(task.id);
  assert.ok(stored);
  stored.state = 'ASSIGNED';
  stored.targetAgentId = 'neural-agent';

  for (const ttlSeconds of [0, -1, 1.5, 301, Number.POSITIVE_INFINITY]) {
    await assert.rejects(
      createFederatedA2AEnvelope(task.id, 'glorifier-daemon', ttlSeconds),
      /TTL must be an integer from 1 through 300 seconds/i,
      `TTL ${String(ttlSeconds)} must be rejected`,
    );
  }
});
