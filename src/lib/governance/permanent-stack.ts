import { createHash, randomUUID } from 'node:crypto';

export type Protocol = 'mcp' | 'a2a';
export type TruthStatus = 'estimated' | 'observed' | 'verified' | 'not-verified' | 'degraded';
export type EconomicKind = 'cost' | 'revenue' | 'outcome' | 'verified-value';

export interface ProtocolBoundary {
  id: string;
  protocol: Protocol;
  role: 'tool-data' | 'agent-agent';
  enabled: boolean;
  authorization: 'delegated' | 'human-approved';
  notes: string;
}

export interface ProviderRecord {
  id: string;
  name: string;
  kind: 'hosted' | 'gateway' | 'local' | 'future';
  capabilities: string[];
  replaceable: true;
  status: 'available' | 'degraded' | 'unavailable' | 'unconfigured';
}

export interface CapabilityRecord {
  id: string;
  risk: 'low' | 'medium' | 'high' | 'irreversible';
  requiresHumanApproval: boolean;
  providerIndependent: true;
}

export interface GovernanceBoundary {
  geas: true;
  policy: true;
  identity: true;
  authorityAttenuation: true;
  humanApproval: true;
  failClosedOnMissingAuthority: true;
}

export interface EvidenceReceipt {
  id: string;
  sourceRef: string;
  observedAt: string;
  contentHash: string;
  externallyVerifiable: boolean;
  verificationStatus: TruthStatus;
}

export interface EconomicTruthRecord {
  id: string;
  kind: EconomicKind;
  amount?: number;
  currency?: string;
  metric: string;
  truthStatus: TruthStatus;
  evidenceRefs: string[];
  verifiedAt?: string;
  sourceSystem?: string;
}

export interface PermanentGlorifierStack {
  schemaVersion: 'GLORIFIER-STACK-1.0';
  generatedAt: string;
  identity: 'provider-neutral governed intelligence orchestration';
  protocols: ProtocolBoundary[];
  providers: ProviderRecord[];
  capabilities: CapabilityRecord[];
  orchestration: {
    providerRegistry: true;
    capabilityRegistry: true;
    aiCeo: true;
    permanentOrchestrator: true;
    implicitFallback: false;
  };
  governance: GovernanceBoundary;
  execution: {
    governedTools: true;
    governedAgents: true;
    infrastructure: true;
    irreversibleActionsRequireHumanApproval: true;
  };
  evidence: {
    telemetry: true;
    provenance: true;
    receipts: true;
    externalVerification: true;
    noEvidenceNoVerification: true;
  };
  economicTruth: {
    cost: true;
    revenue: true;
    outcome: true;
    verifiedValue: true;
    estimatedIsSeparateFromVerified: true;
  };
  humanAuthority: {
    finalControl: true;
    autonomousMerge: false;
    autonomousProductionDeploy: false;
    autonomousFinancialCommitment: false;
    autonomousSecretAccess: false;
  };
}

const DEFAULT_PROTOCOLS: ProtocolBoundary[] = [
  {
    id: 'mcp-boundary',
    protocol: 'mcp',
    role: 'tool-data',
    enabled: true,
    authorization: 'delegated',
    notes: 'Interoperability boundary for governed tools, resources and data; never system authority.'
  },
  {
    id: 'a2a-boundary',
    protocol: 'a2a',
    role: 'agent-agent',
    enabled: true,
    authorization: 'delegated',
    notes: 'Inter-agent collaboration boundary; every consequential action remains governed by GLORIFIER.'
  }
];

const DEFAULT_PROVIDERS: ProviderRecord[] = [
  { id: 'openai', name: 'OpenAI', kind: 'hosted', capabilities: ['model-inference'], replaceable: true, status: 'unconfigured' },
  { id: 'gemini', name: 'Google Gemini', kind: 'hosted', capabilities: ['model-inference'], replaceable: true, status: 'unconfigured' },
  { id: 'anthropic', name: 'Anthropic', kind: 'hosted', capabilities: ['model-inference'], replaceable: true, status: 'unconfigured' },
  { id: 'openrouter', name: 'OpenRouter', kind: 'gateway', capabilities: ['model-inference'], replaceable: true, status: 'unconfigured' },
  { id: 'ollama', name: 'Local / Ollama', kind: 'local', capabilities: ['model-inference'], replaceable: true, status: 'unconfigured' }
];

const DEFAULT_CAPABILITIES: CapabilityRecord[] = [
  { id: 'model-inference', risk: 'low', requiresHumanApproval: false, providerIndependent: true },
  { id: 'governed-tool-use', risk: 'medium', requiresHumanApproval: false, providerIndependent: true },
  { id: 'repository-merge', risk: 'irreversible', requiresHumanApproval: true, providerIndependent: true },
  { id: 'production-deploy', risk: 'irreversible', requiresHumanApproval: true, providerIndependent: true },
  { id: 'external-financial-action', risk: 'irreversible', requiresHumanApproval: true, providerIndependent: true },
  { id: 'secret-access', risk: 'irreversible', requiresHumanApproval: true, providerIndependent: true }
];

export function getPermanentGlorifierStack(): PermanentGlorifierStack {
  return {
    schemaVersion: 'GLORIFIER-STACK-1.0',
    generatedAt: new Date().toISOString(),
    identity: 'provider-neutral governed intelligence orchestration',
    protocols: DEFAULT_PROTOCOLS.map(x => ({ ...x })),
    providers: DEFAULT_PROVIDERS.map(x => ({ ...x, capabilities: [...x.capabilities] })),
    capabilities: DEFAULT_CAPABILITIES.map(x => ({ ...x })),
    orchestration: {
      providerRegistry: true,
      capabilityRegistry: true,
      aiCeo: true,
      permanentOrchestrator: true,
      implicitFallback: false
    },
    governance: {
      geas: true,
      policy: true,
      identity: true,
      authorityAttenuation: true,
      humanApproval: true,
      failClosedOnMissingAuthority: true
    },
    execution: {
      governedTools: true,
      governedAgents: true,
      infrastructure: true,
      irreversibleActionsRequireHumanApproval: true
    },
    evidence: {
      telemetry: true,
      provenance: true,
      receipts: true,
      externalVerification: true,
      noEvidenceNoVerification: true
    },
    economicTruth: {
      cost: true,
      revenue: true,
      outcome: true,
      verifiedValue: true,
      estimatedIsSeparateFromVerified: true
    },
    humanAuthority: {
      finalControl: true,
      autonomousMerge: false,
      autonomousProductionDeploy: false,
      autonomousFinancialCommitment: false,
      autonomousSecretAccess: false
    }
  };
}

export function validatePermanentStack(stack: PermanentGlorifierStack = getPermanentGlorifierStack()) {
  const errors: string[] = [];
  if (stack.schemaVersion !== 'GLORIFIER-STACK-1.0') errors.push('unsupported stack schema');
  if (!stack.orchestration.providerRegistry || !stack.orchestration.capabilityRegistry || !stack.orchestration.aiCeo || !stack.orchestration.permanentOrchestrator) errors.push('orchestration layers incomplete');
  if (stack.orchestration.implicitFallback) errors.push('implicit fallback is forbidden');
  if (!stack.governance.geas || !stack.governance.policy || !stack.governance.identity || !stack.governance.authorityAttenuation || !stack.governance.humanApproval) errors.push('governance boundary incomplete');
  if (!stack.governance.failClosedOnMissingAuthority) errors.push('missing authority must fail closed');
  if (!stack.evidence.noEvidenceNoVerification) errors.push('verification evidence boundary missing');
  if (!stack.economicTruth.estimatedIsSeparateFromVerified) errors.push('estimated and verified economic truth must remain separate');
  if (!stack.humanAuthority.finalControl) errors.push('human authority must retain final control');
  return { valid: errors.length === 0, errors, hash: createHash('sha256').update(JSON.stringify(stack)).digest('hex') };
}

export function authorizePermanentStackAction(input: {
  capability: CapabilityRecord;
  authorityGranted: boolean;
  humanApproved?: boolean;
  irreversible?: boolean;
}) {
  const needsHuman = input.capability.requiresHumanApproval || input.capability.risk === 'high' || input.capability.risk === 'irreversible' || Boolean(input.irreversible);
  if (!input.authorityGranted) return { allowed: false, requiresHumanApproval: needsHuman, reason: 'Authority is not granted.' };
  if (needsHuman && !input.humanApproved) return { allowed: false, requiresHumanApproval: true, reason: 'Explicit human approval is required.' };
  return { allowed: true, requiresHumanApproval: false, reason: 'Governed authority and approval requirements satisfied.' };
}

export function createEvidenceReceipt(input: Omit<EvidenceReceipt, 'id' | 'contentHash'> & { content: unknown }): EvidenceReceipt {
  const { content, ...metadata } = input;
  const contentHash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
  return { ...metadata, id: 'receipt-' + randomUUID(), contentHash };
}

export function verifyEconomicTruth(record: EconomicTruthRecord, receipts: EvidenceReceipt[]) {
  if (record.truthStatus !== 'verified' && record.kind === 'verified-value') {
    return { verified: false, reason: 'Verified value must carry verified truth status.' };
  }
  if (!record.evidenceRefs.length) return { verified: false, reason: 'No evidence references; no verification.' };
  const evidence = receipts.filter(r => record.evidenceRefs.includes(r.id));
  if (!evidence.length) return { verified: false, reason: 'Referenced evidence receipts are unavailable.' };
  if (evidence.some(r => !r.externallyVerifiable || r.verificationStatus !== 'verified')) {
    return { verified: false, reason: 'At least one required receipt is not externally verified.' };
  }
  return { verified: true, reason: 'Economic truth is backed by externally verifiable evidence receipts.' };
}

export function getProtocolRole(protocol: Protocol): string {
  return protocol === 'mcp' ? 'tool/data interoperability' : 'agent-to-agent interoperability';
}
