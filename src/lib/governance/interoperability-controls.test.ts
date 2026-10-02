import {
  createDurableTask,
  GLORIFIER_INTEROPERABILITY_POLICY,
  hashTaskEnvelope,
  transitionDurableTask,
  verifyTaskEvidence
} from './interoperability-controls';

if (GLORIFIER_INTEROPERABILITY_POLICY.skillsNeverGrantAuthority !== true) {
  throw new Error('skills must never grant authority');
}
if (GLORIFIER_INTEROPERABILITY_POLICY.mcp.preferredRevision !== '2026-07-28') {
  throw new Error('MCP revision invariant failed');
}

const task = createDurableTask({
  protocol: 'a2a',
  capabilityId: 'model-inference',
  idempotencyKey: 'test-task-1',
  authorizationRef: 'auth:test'
});

let current = transitionDurableTask(task, 'AUTHORIZED');
current = transitionDurableTask(current, 'ASSIGNED');
current = transitionDurableTask(current, 'RUNNING');
current = transitionDurableTask(current, 'EVIDENCE');
current = verifyTaskEvidence(current, ['receipt:test']);
current = transitionDurableTask(current, 'VERIFIED');
current = transitionDurableTask(current, 'SETTLED');

if (current.state !== 'SETTLED') throw new Error('durable lifecycle did not settle');
if (current.attempt !== 1) throw new Error('unexpected execution attempt count');
if (!hashTaskEnvelope(current)) throw new Error('task envelope hash missing');

let rejected = false;
try {
  transitionDurableTask(task, 'RUNNING');
} catch {
  rejected = true;
}
if (!rejected) throw new Error('unauthorized task execution must fail closed');

console.log('Interoperability controls invariants: PASS');
