import { randomUUID } from 'node:crypto';

export type ArchitectureRisk = 'low' | 'medium' | 'high' | 'irreversible';
export type VerificationStatus = 'FULLY VERIFIED' | 'VERIFIED' | 'PARTIALLY VERIFIED' | 'NOT VERIFIED' | 'DEGRADED' | 'UNKNOWN';

export interface CapabilityDefinition {
  id: string;
  description: string;
  risk: ArchitectureRisk;
  requiresHumanApproval: boolean;
  pluginOnly?: boolean;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  capabilities: string[];
  status: 'available' | 'degraded' | 'unavailable' | 'unconfigured';
  authenticated: boolean;
  metadata?: Record<string, unknown>;
}

export interface SpecialistPlugin {
  id: string;
  title: string;
  capabilities: string[];
  enabled: boolean;
  providerNeutral: true;
  version: string;
}

export interface ArchitectureAuditEvent {
  id: string;
  type: string;
  actor: string;
  component: string;
  decision: 'allow' | 'deny' | 'pending' | 'observe';
  risk: ArchitectureRisk;
  evidence: string[];
  details: Record<string, unknown>;
  createdAt: string;
}

export interface VerificationRecord {
  subject: string;
  status: VerificationStatus;
  checks: string[];
  evidence: string[];
  updatedAt: string;
  reason?: string;
}

const capabilities = new Map<string, CapabilityDefinition>();
const providers = new Map<string, ProviderDefinition>();
const plugins = new Map<string, SpecialistPlugin>();
const auditEvents: ArchitectureAuditEvent[] = [];
const verification = new Map<string, VerificationRecord>();

const CORE_CAPABILITIES: CapabilityDefinition[] = [
  { id: 'model-inference', description: 'Request inference from an eligible AI provider.', risk: 'low', requiresHumanApproval: false },
  { id: 'specialist-analysis', description: 'Run bounded specialist analysis.', risk: 'low', requiresHumanApproval: false },
  { id: 'sandbox-execution', description: 'Execute bounded work in an isolated execution environment.', risk: 'medium', requiresHumanApproval: false },
  { id: 'filesystem-write', description: 'Modify authorized workspace files.', risk: 'high', requiresHumanApproval: true },
  { id: 'repository-merge', description: 'Merge a repository change.', risk: 'irreversible', requiresHumanApproval: true },
  { id: 'production-deploy', description: 'Promote software to production.', risk: 'irreversible', requiresHumanApproval: true },
  { id: 'external-financial-action', description: 'Perform a consequential external financial action.', risk: 'irreversible', requiresHumanApproval: true },
  { id: 'legal-commitment', description: 'Make or execute a consequential legal commitment.', risk: 'irreversible', requiresHumanApproval: true },
  { id: 'secret-access', description: 'Access provider or infrastructure secrets.', risk: 'irreversible', requiresHumanApproval: true },
];

export function initializeArchitectureCore(): void {
  for (const capability of CORE_CAPABILITIES) capabilities.set(capability.id, capability);
}

export function registerCapability(capability: CapabilityDefinition): CapabilityDefinition {
  if (!capability.id.trim()) throw new Error('Capability id is required.');
  capabilities.set(capability.id, capability);
  return capability;
}

export function listCapabilities(): CapabilityDefinition[] {
  initializeArchitectureCore();
  return [...capabilities.values()];
}

export function registerProvider(provider: ProviderDefinition): ProviderDefinition {
  providers.set(provider.id, { ...provider, capabilities: [...new Set(provider.capabilities)] });
  return providers.get(provider.id)!;
}

export function listArchitectureProviders(): ProviderDefinition[] {
  return [...providers.values()];
}

export function registerSpecialistPlugin(plugin: SpecialistPlugin): SpecialistPlugin {
  if (!plugin.providerNeutral) throw new Error('Specialist plugins must remain provider-neutral.');
  plugins.set(plugin.id, plugin);
  return plugin;
}

export function listSpecialistPlugins(): SpecialistPlugin[] {
  return [...plugins.values()];
}

export function authorizeCapability(input: {
  capabilityId: string;
  grantedCapabilities: Set<string>;
  risk?: ArchitectureRisk;
  humanApproval?: { approved: true; approvedBy: 'human'; approvedAt: string; capabilityId: string };
}): { allowed: boolean; requiresHumanApproval: boolean; reason: string } {
  initializeArchitectureCore();
  const capability = capabilities.get(input.capabilityId);
  if (!capability) return { allowed: false, requiresHumanApproval: false, reason: `Unknown capability: ${input.capabilityId}` };
  if (!input.grantedCapabilities.has(input.capabilityId)) {
    return { allowed: false, requiresHumanApproval: false, reason: `Capability not granted: ${input.capabilityId}` };
  }

  const risk = input.risk || capability.risk;
  const approvalRequired = capability.requiresHumanApproval || risk === 'high' || risk === 'irreversible';
  const approvalValid = input.humanApproval?.approved === true &&
    input.humanApproval.approvedBy === 'human' &&
    input.humanApproval.capabilityId === input.capabilityId &&
    Number.isFinite(Date.parse(input.humanApproval.approvedAt));

  if (approvalRequired && !approvalValid) {
    return { allowed: false, requiresHumanApproval: true, reason: 'Explicit human approval is required for this capability.' };
  }

  return { allowed: true, requiresHumanApproval: false, reason: approvalRequired ? 'Capability and explicit human approval verified.' : 'Capability authorization verified.' };
}

export function recordArchitectureAudit(input: Omit<ArchitectureAuditEvent, 'id' | 'createdAt'>): ArchitectureAuditEvent {
  const event = { ...input, id: `arch-${randomUUID()}`, createdAt: new Date().toISOString() };
  auditEvents.unshift(event);
  if (auditEvents.length > 5000) auditEvents.length = 5000;
  return event;
}

export function listArchitectureAudit(limit = 100): ArchitectureAuditEvent[] {
  return auditEvents.slice(0, Math.max(1, Math.min(500, Math.floor(limit))));
}

export function setVerification(record: Omit<VerificationRecord, 'updatedAt'>): VerificationRecord {
  const next = { ...record, updatedAt: new Date().toISOString() };
  verification.set(record.subject, next);
  return next;
}

export function getVerification(subject: string): VerificationRecord | null {
  return verification.get(subject) || null;
}

export function listVerificationRecords(): VerificationRecord[] {
  return [...verification.values()];
}

export function getAIExecutiveProfile() {
  const available = [...providers.values()].filter((p) => p.status === 'available' && p.authenticated);
  const leader = available[0] || null;
  return {
    role: 'GLORIFIER AI CEO',
    status: leader ? 'active' : 'degraded',
    provider: leader?.id || null,
    humanOwnerFinalAuthority: true,
    autonomousMerge: false,
    autonomousProductionDeploy: false,
    autonomousSecretAccess: false,
    autonomousFinancialCommitment: false,
    selection: leader ? 'Eligible provider selected by governance/routing policy; provider remains replaceable.' : 'NO ELIGIBLE PROVIDER',
  } as const;
}

export function getArchitectureConsolidationSnapshot() {
  initializeArchitectureCore();
  return {
    identity: 'GLORIFIER = provider-neutral, governed operating system for orchestrating heterogeneous intelligence, computation and execution under human authority.',
    version: 'GLORIFIER-ARCH-4.0',
    status: 'consolidation',
    humanAuthority: { finalAuthority: true, irreversibleActionsRequireApproval: true },
    kernel: {
      governance: 'active',
      providerRegistry: 'active',
      capabilityRegistry: 'active',
      aiCeo: 'active',
      permanentOrchestrator: 'active',
      specialistCouncil: 'plugin-based',
      execution: 'TrueForge-compatible isolated execution',
      verification: 'evidence-backed',
      audit: 'append-only event interface',
      selfHealingCICD: 'governed CI/CD'
    },
    counts: {
      capabilities: capabilities.size,
      providers: providers.size,
      specialistPlugins: plugins.size,
      auditEvents: auditEvents.length,
      verificationRecords: verification.size
    },
    invariants: [
      'No single AI provider is the system brain.',
      'Providers are replaceable adapters, not system authority.',
      'Authentication does not imply authorization.',
      'Approval never grants a missing capability.',
      'High-risk and irreversible actions require explicit human approval.',
      'TrueForge is an execution boundary, not an intelligence authority.',
      'Additional scientists and providers are plugins, not architectural branches.',
      'Unknown evidence remains UNKNOWN; absence of evidence is not verification.',
      'Estimated value is never verified revenue.',
      'No synthetic success is permitted.'
    ]
  };
}
