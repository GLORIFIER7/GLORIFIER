export type CapabilityRisk = 'low' | 'medium' | 'high' | 'critical';

export type CapabilityPolicy = {
  id: string;
  risk: CapabilityRisk;
  requiresHumanApproval: boolean;
  reversible: boolean;
};

const POLICIES: Record<string, CapabilityPolicy> = {
  'read.repository': { id: 'read.repository', risk: 'low', requiresHumanApproval: false, reversible: true },
  'repository.search': { id: 'repository.search', risk: 'low', requiresHumanApproval: false, reversible: true },
  'issue.create': { id: 'issue.create', risk: 'medium', requiresHumanApproval: false, reversible: true },
  'issue.comment': { id: 'issue.comment', risk: 'medium', requiresHumanApproval: false, reversible: true },
  'pull_request.review': { id: 'pull_request.review', risk: 'medium', requiresHumanApproval: false, reversible: true },
  'knowledge.search': { id: 'knowledge.search', risk: 'low', requiresHumanApproval: false, reversible: true },
  'knowledge.ask': { id: 'knowledge.ask', risk: 'low', requiresHumanApproval: false, reversible: true },
  'knowledge.answer': { id: 'knowledge.answer', risk: 'medium', requiresHumanApproval: false, reversible: true },
  'knowledge.comment': { id: 'knowledge.comment', risk: 'medium', requiresHumanApproval: false, reversible: true },
  'knowledge.vote': { id: 'knowledge.vote', risk: 'low', requiresHumanApproval: false, reversible: true },
  'knowledge.accept_answer': { id: 'knowledge.accept_answer', risk: 'medium', requiresHumanApproval: true, reversible: true },
  'utility.web_search': { id: 'utility.web_search', risk: 'low', requiresHumanApproval: false, reversible: true },
  'utility.fetch_public_data': { id: 'utility.fetch_public_data', risk: 'low', requiresHumanApproval: false, reversible: true },
  'utility.convert_units': { id: 'utility.convert_units', risk: 'low', requiresHumanApproval: false, reversible: true },
  'utility.convert_currency': { id: 'utility.convert_currency', risk: 'low', requiresHumanApproval: false, reversible: true },
  'utility.calculate': { id: 'utility.calculate', risk: 'low', requiresHumanApproval: false, reversible: true },
  'utility.transform_data': { id: 'utility.transform_data', risk: 'low', requiresHumanApproval: false, reversible: true },
  'agent.discover': { id: 'agent.discover', risk: 'low', requiresHumanApproval: false, reversible: true },
  'agent.delegate': { id: 'agent.delegate', risk: 'medium', requiresHumanApproval: false, reversible: true },
  'tool.discover': { id: 'tool.discover', risk: 'low', requiresHumanApproval: false, reversible: true },
  'tool.invoke': { id: 'tool.invoke', risk: 'high', requiresHumanApproval: true, reversible: true },
  'evidence.attach': { id: 'evidence.attach', risk: 'medium', requiresHumanApproval: false, reversible: true },
  'evidence.verify': { id: 'evidence.verify', risk: 'low', requiresHumanApproval: false, reversible: true },
  'service.publish': { id: 'service.publish', risk: 'high', requiresHumanApproval: true, reversible: true },
  'package.publish': { id: 'package.publish', risk: 'critical', requiresHumanApproval: true, reversible: false },
  'analyze.code': { id: 'analyze.code', risk: 'low', requiresHumanApproval: false, reversible: true },
  'create.branch': { id: 'create.branch', risk: 'medium', requiresHumanApproval: false, reversible: true },
  'create.pull_request': { id: 'create.pull_request', risk: 'medium', requiresHumanApproval: false, reversible: true },
  'run.ci': { id: 'run.ci', risk: 'medium', requiresHumanApproval: false, reversible: true },
  'deploy.staging': { id: 'deploy.staging', risk: 'high', requiresHumanApproval: true, reversible: true },
  'deploy.production': { id: 'deploy.production', risk: 'critical', requiresHumanApproval: true, reversible: false },
  'change.credentials': { id: 'change.credentials', risk: 'critical', requiresHumanApproval: true, reversible: false },
  'move.funds': { id: 'move.funds', risk: 'critical', requiresHumanApproval: true, reversible: false },
  'change.ownership': { id: 'change.ownership', risk: 'critical', requiresHumanApproval: true, reversible: false },
  'delete.resource': { id: 'delete.resource', risk: 'critical', requiresHumanApproval: true, reversible: false },
  'crypto.hash': { id: 'crypto.hash', risk: 'low', requiresHumanApproval: false, reversible: true },
  'crypto.verify': { id: 'crypto.verify', risk: 'low', requiresHumanApproval: false, reversible: true },
  'crypto.sign': { id: 'crypto.sign', risk: 'critical', requiresHumanApproval: true, reversible: false },
  'crypto.encrypt': { id: 'crypto.encrypt', risk: 'high', requiresHumanApproval: true, reversible: true },
  'crypto.decrypt': { id: 'crypto.decrypt', risk: 'critical', requiresHumanApproval: true, reversible: true },
  'wallet.read': { id: 'wallet.read', risk: 'medium', requiresHumanApproval: false, reversible: true },
  'wallet.derive_address': { id: 'wallet.derive_address', risk: 'high', requiresHumanApproval: true, reversible: true },
  'wallet.verify': { id: 'wallet.verify', risk: 'low', requiresHumanApproval: false, reversible: true },
  'wallet.sign': { id: 'wallet.sign', risk: 'critical', requiresHumanApproval: true, reversible: false },
  'wallet.prepare_transfer': { id: 'wallet.prepare_transfer', risk: 'critical', requiresHumanApproval: true, reversible: true },
  'wallet.broadcast': { id: 'wallet.broadcast', risk: 'critical', requiresHumanApproval: true, reversible: false }
};

export function getCapabilityPolicy(capability: string): CapabilityPolicy | null {
  return POLICIES[capability.trim().toLowerCase()] || null;
}

export function authorizeCapability(input: { capability: string; requestedBy?: string; humanApproved?: boolean }) {
  const policy = getCapabilityPolicy(input.capability);
  if (!policy) return { allowed: false, reason: 'unknown_capability', requiresHumanApproval: true };
  if (policy.requiresHumanApproval && input.humanApproved !== true) {
    return { allowed: false, reason: 'human_approval_required', requiresHumanApproval: true, policy };
  }
  return { allowed: true, reason: 'policy_allowed', requiresHumanApproval: policy.requiresHumanApproval, policy };
}

export function listCapabilityPolicies() { return Object.values(POLICIES); }
