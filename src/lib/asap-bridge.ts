/**
 * Governance boundary for a future ASAP Protocol transport adapter.
 *
 * This module intentionally does not perform network I/O or claim wire-level
 * ASAP conformance. A concrete, version-pinned client must be added separately.
 */
export type AsapIntegrationStatus = 'NOT_VERIFIED' | 'DISABLED' | 'BLOCKED' | 'READY_FOR_TRANSPORT';

export interface AsapHandoffCandidate {
  taskId: string;
  correlationId: string;
  requesterAgentId: string;
  targetAgentId: string;
  capability: string;
  objective: string;
  payload?: unknown;
  risk?: 'low' | 'medium' | 'high' | 'irreversible';
}

export interface AsapHandoffAuthorization {
  featureEnabled: boolean;
  authenticated: boolean;
  geasAuthorized: boolean;
  humanApproved?: boolean;
}

export interface AsapHandoffIntent {
  protocol: 'ASAP';
  status: 'READY_FOR_TRANSPORT';
  taskId: string;
  correlationId: string;
  fromAgentId: string;
  toAgentId: string;
  capability: string;
  objective: string;
  payload: unknown;
  requiresHumanApproval: boolean;
  conformance: 'NOT_VERIFIED';
}

export interface AsapHandoffDecision {
  allowed: boolean;
  status: AsapIntegrationStatus;
  reason: string;
  intent?: AsapHandoffIntent;
}

// Only capabilities explicitly reviewed as low-risk can bypass human approval.
// Unknown capabilities are treated as sensitive (fail closed).
const LOW_RISK_CAPABILITIES = new Set(['research']);
const SENSITIVE_CAPABILITIES = new Set([
  'repository-merge',
  'production-deploy',
  'credential-rotation',
  'secret-access',
  'external-financial-action',
  'asset-transfer',
  'trading',
]);

const normalize = (value: string) => value.trim().toLowerCase();
// Agent and correlation identifiers are data, never arbitrary unbounded strings.
// Permit common UUIDs and namespaced IDs while rejecting whitespace/control chars.
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const isSafeIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_IDENTIFIER.test(value.trim());

export function isAsapIntegrationEnabled(value = process.env.GLORIFIER_ASAP_ENABLED): boolean {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

export function prepareAsapHandoff(
  candidate: AsapHandoffCandidate,
  authorization: AsapHandoffAuthorization,
): AsapHandoffDecision {
  if (!authorization.featureEnabled) {
    return { allowed: false, status: 'DISABLED', reason: 'ASAP integration is disabled.' };
  }
  if (!isAsapIntegrationEnabled()) {
    return { allowed: false, status: 'DISABLED', reason: 'GLORIFIER_ASAP_ENABLED is not explicitly true.' };
  }

  const required = [
    candidate.taskId,
    candidate.correlationId,
    candidate.requesterAgentId,
    candidate.targetAgentId,
    candidate.capability,
    candidate.objective,
  ];
  if (required.some(value => typeof value !== 'string' || !value.trim())) {
    return { allowed: false, status: 'BLOCKED', reason: 'Required handoff identity and task fields are missing.' };
  }
  if (![candidate.taskId, candidate.correlationId, candidate.requesterAgentId, candidate.targetAgentId]
    .every(isSafeIdentifier)) {
    return { allowed: false, status: 'BLOCKED', reason: 'Task, correlation, and agent identifiers must use the supported safe identifier format.' };
  }
  if (candidate.objective.length > 4_000 || candidate.capability.length > 128) {
    return { allowed: false, status: 'BLOCKED', reason: 'Objective or capability exceeds the supported length limit.' };
  }
  if (!authorization.authenticated) {
    return { allowed: false, status: 'BLOCKED', reason: 'Caller identity is not authenticated.' };
  }
  if (!authorization.geasAuthorized) {
    return { allowed: false, status: 'BLOCKED', reason: 'GEAS has not authorized this capability.' };
  }

  const capability = normalize(candidate.capability);
  const risk = candidate.risk;
  const explicitlyLowRisk = risk === 'low' && LOW_RISK_CAPABILITIES.has(capability);
  // Only the exact low-risk + allowlisted combination can bypass approval.
  // Every other risk value (including undefined) fails closed without comparing
  // mutually exclusive string-literal types.
  const requiresHumanApproval = !explicitlyLowRisk || SENSITIVE_CAPABILITIES.has(capability);

  if (requiresHumanApproval && authorization.humanApproved !== true) {
    return { allowed: false, status: 'BLOCKED', reason: 'Explicit human approval is required for high-risk, unknown, or non-allowlisted capabilities.' };
  }

  return {
    allowed: true,
    status: 'READY_FOR_TRANSPORT',
    reason: 'Local governance gates passed; remote transport and ASAP conformance remain unverified.',
    intent: {
      protocol: 'ASAP',
      status: 'READY_FOR_TRANSPORT',
      taskId: candidate.taskId.trim(),
      correlationId: candidate.correlationId.trim(),
      fromAgentId: candidate.requesterAgentId.trim(),
      toAgentId: candidate.targetAgentId.trim(),
      capability,
      objective: candidate.objective.trim(),
      payload: candidate.payload ?? null,
      requiresHumanApproval,
      conformance: 'NOT_VERIFIED',
    },
  };
}
