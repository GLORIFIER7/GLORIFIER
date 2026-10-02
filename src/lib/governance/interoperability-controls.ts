import { createHash, randomUUID } from 'node:crypto';

export type DurableTaskState =
  | 'DISCOVERED'
  | 'AUTHORIZED'
  | 'ASSIGNED'
  | 'RUNNING'
  | 'EVIDENCE'
  | 'VERIFIED'
  | 'SETTLED'
  | 'FAILED'
  | 'CANCELLED';

export type InteropProtocol = 'mcp' | 'a2a';

export interface DurableTaskEnvelope {
  taskId: string;
  protocol: InteropProtocol;
  capabilityId: string;
  state: DurableTaskState;
  createdAt: string;
  deadlineAt?: string;
  attempt: number;
  idempotencyKey: string;
  authorizationRef?: string;
  evidenceRefs: string[];
}

export interface CapabilitySkill {
  id: string;
  version: string;
  capabilityId: string;
  description: string;
  trustedInstructions: false;
}

export interface InteroperabilityPolicy {
  mcp: {
    preferredRevision: '2026-07-28';
    stateModel: 'external-task-state';
    sessionStateOwnedByGlorifier: true;
  };
  a2a: {
    taskLifecycle: 'durable';
    signedHandoffs: true;
  };
  skillsNeverGrantAuthority: true;
  missingAuthorityFailsClosed: true;
}

export const GLORIFIER_INTEROPERABILITY_POLICY: InteroperabilityPolicy = {
  mcp: {
    preferredRevision: '2026-07-28',
    stateModel: 'external-task-state',
    sessionStateOwnedByGlorifier: true
  },
  a2a: {
    taskLifecycle: 'durable',
    signedHandoffs: true
  },
  skillsNeverGrantAuthority: true,
  missingAuthorityFailsClosed: true
};

export function createDurableTask(input: {
  protocol: InteropProtocol;
  capabilityId: string;
  idempotencyKey: string;
  authorizationRef?: string;
  deadlineAt?: string;
}): DurableTaskEnvelope {
  if (!input.idempotencyKey.trim()) {
    throw new Error('idempotencyKey is required');
  }

  return {
    taskId: 'task-' + randomUUID(),
    protocol: input.protocol,
    capabilityId: input.capabilityId,
    state: 'DISCOVERED',
    createdAt: new Date().toISOString(),
    deadlineAt: input.deadlineAt,
    attempt: 0,
    idempotencyKey: input.idempotencyKey,
    authorizationRef: input.authorizationRef,
    evidenceRefs: []
  };
}

const ALLOWED_TRANSITIONS: Record<DurableTaskState, DurableTaskState[]> = {
  DISCOVERED: ['AUTHORIZED', 'FAILED', 'CANCELLED'],
  AUTHORIZED: ['ASSIGNED', 'FAILED', 'CANCELLED'],
  ASSIGNED: ['RUNNING', 'FAILED', 'CANCELLED'],
  RUNNING: ['EVIDENCE', 'FAILED', 'CANCELLED'],
  EVIDENCE: ['VERIFIED', 'FAILED'],
  VERIFIED: ['SETTLED', 'FAILED'],
  SETTLED: [],
  FAILED: [],
  CANCELLED: []
};

export function transitionDurableTask(
  task: DurableTaskEnvelope,
  nextState: DurableTaskState
): DurableTaskEnvelope {
  if (!ALLOWED_TRANSITIONS[task.state].includes(nextState)) {
    throw new Error(`Invalid task transition: ${task.state} -> ${nextState}`);
  }

  if ((nextState === 'AUTHORIZED' || nextState === 'ASSIGNED' || nextState === 'RUNNING') && !task.authorizationRef) {
    throw new Error('Authorized task execution requires an authorization reference');
  }

  return {
    ...task,
    state: nextState,
    attempt: nextState === 'RUNNING' ? task.attempt + 1 : task.attempt
  };
}

export function verifyTaskEvidence(
  task: DurableTaskEnvelope,
  evidenceRefs: string[]
): DurableTaskEnvelope {
  if (task.state !== 'EVIDENCE') {
    throw new Error('Evidence can only be attached in EVIDENCE state');
  }
  if (!evidenceRefs.length) {
    throw new Error('No evidence means the task cannot become verified');
  }

  return { ...task, evidenceRefs: [...new Set(evidenceRefs)] };
}

export function hashTaskEnvelope(task: DurableTaskEnvelope): string {
  return createHash('sha256').update(JSON.stringify(task)).digest('hex');
}
