import { strict as assert } from 'node:assert';
import { persistConnectionApprovalAtomically, createMemoizedAsyncInitializer } from './connection-approval.ts';
import { test } from 'node:test';

test('persists connection approvals atomically and memoizes initialization safely', async () => {
  const approval = {
    id: 'approval-test',
    connection_id: 'connection-test',
    requested_by: 'human-owner',
    action: 'agent-task',
    related_task_id: 'task-test',
    status: 'pending',
  };
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const persisted = await persistConnectionApprovalAtomically(
    (sql, values) => {
      calls.push({ sql, values });
      return Promise.resolve({ rows: [approval] });
    },
    {
      approvalId: approval.id,
      eventId: 'event-test',
      connectionId: approval.connection_id,
      requestedBy: approval.requested_by,
      action: approval.action,
      scope: ['research'],
      relatedTaskId: approval.related_task_id,
    },
  );
  assert.deepEqual(persisted, approval);
  assert.equal(calls.length, 1, 'approval row and audit event must be created by one atomic SQL statement');
  assert.match(calls[0].sql, /WITH\s+inserted_approval\s+AS/i);
  assert.match(calls[0].sql, /INSERT\s+INTO\s+connection_approvals/i);
  assert.match(calls[0].sql, /INSERT\s+INTO\s+connection_events/i);
  assert.match(calls[0].sql, /related_task_id/i);
  assert.equal(calls[0].values?.[6], approval.related_task_id);
  
  await assert.rejects(
    () => persistConnectionApprovalAtomically(() => Promise.resolve({ rows: [] }), {
      approvalId: 'missing-approval',
      eventId: 'missing-event',
      connectionId: 'connection-test',
      requestedBy: 'human-owner',
      action: 'agent-task',
      scope: [],
    }),
    /approval and its audit event were not persisted/,
  );
  
  let initializationCalls = 0;
  const initializeOnce = createMemoizedAsyncInitializer(() => Promise.resolve().then(() => {
    initializationCalls += 1;
  }));
  await Promise.all([initializeOnce(), initializeOnce(), initializeOnce()]);
  await initializeOnce();
  assert.equal(initializationCalls, 1, 'concurrent and later schema initialization calls must share one successful promise');
  
  let retryCalls = 0;
  const initializeWithRetry = createMemoizedAsyncInitializer(() => {
    retryCalls += 1;
    if (retryCalls === 1) return Promise.reject(new Error('transient schema connection failure'));
    return Promise.resolve();
  });
  await assert.rejects(() => initializeWithRetry(), /transient schema connection failure/);
  await initializeWithRetry();
  await initializeWithRetry();
  assert.equal(retryCalls, 2, 'a failed initialization must clear the cached promise so later calls can retry');
  
  console.log('atomic connection approval persistence tests: PASS');
});
