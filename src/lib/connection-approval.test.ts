import { strict as assert } from 'node:assert';
import { persistConnectionApprovalAtomically } from './connection-approval.ts';

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
  async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [approval] };
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
assert.match(calls[0].sql, /WITH\s+approval\s+AS/i);
assert.match(calls[0].sql, /INSERT\s+INTO\s+connection_approvals/i);
assert.match(calls[0].sql, /INSERT\s+INTO\s+connection_events/i);
assert.match(calls[0].sql, /related_task_id/i);
assert.equal(calls[0].values?.[6], approval.related_task_id);

await assert.rejects(
  () => persistConnectionApprovalAtomically(async () => ({ rows: [] }), {
    approvalId: 'missing-approval',
    eventId: 'missing-event',
    connectionId: 'connection-test',
    requestedBy: 'human-owner',
    action: 'agent-task',
    scope: [],
  }),
  /approval and its audit event were not persisted/,
);

console.log('atomic connection approval persistence tests: PASS');
