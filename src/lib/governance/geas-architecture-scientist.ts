import { createHash, randomUUID } from 'node:crypto';
import { getPostgresPool } from '../db/postgres';
import { GLORIFIER_ARCHITECTURE_MODEL } from './glorifier-architecture';

export type ArchitectureDomain =
  | 'enterprise-architecture'
  | 'cloud'
  | 'ai'
  | 'data'
  | 'cybersecurity'
  | 'networking'
  | 'software'
  | 'platform-engineering'
  | 'observability'
  | 'reliability'
  | 'finops'
  | 'iot'
  | 'edge'
  | 'blockchain'
  | 'integration'
  | 'governance'
  | 'emerging-technology';

export type EvidenceClass = 'observed-fact' | 'analysis' | 'recommendation';
export type DriftStatus = 'aligned' | 'partial' | 'drift' | 'unknown';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type EvidenceStatus = 'source-available' | 'content-matched' | 'claim-supported' | 'not-observed' | 'unavailable';
export type ArchitectureState = 'desired' | 'declared' | 'deployed' | 'observed' | 'verified';
export type EvidenceSensitivity = 'public' | 'internal' | 'confidential' | 'restricted';

export interface EvidenceGovernance { sensitivity: EvidenceSensitivity; retentionDays: number; disclosure: 'full' | 'redacted' | 'selective'; minimizationRequired: boolean; }
export interface AgentTelemetryContract { version: 'GEAS-OTEL-GENAI-1'; operation: 'create_agent' | 'invoke_agent' | 'execute_tool' | 'invoke_workflow' | 'plan'; traceId: string; agentId: string; provider?: string; model?: string; tool?: string; policyDecisionRef?: string; evidenceRefs: string[]; }
export interface FinOpsEvidenceContract { specification: 'FOCUS-1.4'; workloadId: string; provider: string; usageQuantity?: number; usageUnit?: string; billedCost?: number; currency?: string; invoiceRef?: string; billingPeriod?: string; commitmentRef?: string; verifiedOutcomeRef?: string; }
export interface ArchitectureReconciliationContract { resourceId: string; desired: Record<string, unknown>; declared: Record<string, unknown>; deployed: Record<string, unknown>; observed: Record<string, unknown>; verified: Record<string, unknown>; status: 'ALIGNED' | 'PARTIALLY_VERIFIED' | 'DRIFT' | 'UNKNOWN'; evidenceRefs: string[]; }

export interface ArchitectureSource {
  id: string;
  authority: string;
  domain: ArchitectureDomain;
  url: string;
  patternIds: string[];
  cadenceHours: number;
}

export interface SourceObservation {
  sourceId: string;
  ok: boolean;
  status: number | null;
  contentHash: string | null;
  observedAt: string;
  finalUrl?: string;
  etag?: string | null;
  lastModified?: string | null;
  evidenceExcerpt: string | null;
  evidenceStatus: EvidenceStatus;
  error?: string;
}

export interface ArchitecturePattern {
  id: string;
  title: string;
  domain: ArchitectureDomain;
  evidenceClass: 'observed-fact';
  sourceId: string;
  evidenceUrl: string;
  evidenceExcerpt: string;
  pattern: string;
  GLORIFIERMapping: string;
  controlIds: string[];
  lastReviewed: string;
  evidenceGovernance?: EvidenceGovernance;
}

export interface ArchitectureControl {
  id: string;
  name: string;
  family: string;
  requirement: string;
  enforcement: 'observe' | 'gate' | 'human-approval';
  irreversibleChangeAllowed: false;
}

export interface DriftFinding {
  id: string;
  controlId: string;
  status: DriftStatus;
  severity: RiskLevel;
  intended: string;
  observed: string;
  evidenceRefs: string[];
  recommendation: string;
  createdAt: string;
}

export interface ArchitectureEvidence {
  id: string;
  sourceId: string;
  sourceUrl: string;
  observedAt: string;
  contentHash: string;
  excerpt: string;
  evidenceClass: 'observed-fact';
  sourceStatus: number;
  patternIds: string[];
}

export interface ArchitectureScanResult {
  scanId: string;
  startedAt: string;
  completedAt: string;
  sources: SourceObservation[];
  evidence: ArchitectureEvidence[];
  patterns: ArchitecturePattern[];
  drift: DriftFinding[];
  recommendations: string[];
  coverage: Record<
    ArchitectureDomain,
    {
      sources: number;
      observedPatterns: number;
      status: 'covered' | 'source-unavailable' | 'no-observed-pattern';
    }
  >;
  irreversibleChangesExecuted: false;
  architectureStateModel: ArchitectureState[];
  sourcePolicyVersion: 'GEAS-AUTHORITY-1';
}

export interface AgentIdentityContract {
  identityType: 'human' | 'agent' | 'service' | 'provider' | 'execution';
  subject: string;
  issuer?: string;
  audience?: string;
  scope: string[];
  delegatedFrom?: string;
  expiresAt?: string;
  revocationRef?: string;
  keyBinding?: string;
}

export interface TokenLifecycleContract {
  issuer: string;
  audience: string;
  scope: string[];
  issuedAt: string;
  expiresAt: string;
  keyId?: string;
  verificationRequired: boolean;
  replayProtectionRequired: boolean;
  revocationRef?: string;
}

export interface GovernedActionEvidencePackage {
  id: string;
  actorIdentity: string;
  authorityRef: string;
  capability: string;
  policyDecisionRef: string;
  actionHash: string;
  executionIdentity: string;
  provider?: string;
  model?: string;
  tool?: string;
  traceId?: string;
  evidenceRefs: string[];
  outcomeRef?: string;
  economicImpactRef?: string;
  verificationStatus: 'UNKNOWN' | 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'NOT_VERIFIED';
  createdAt: string;
}

export interface AgentReliabilityContract {
  timeoutMs: number;
  maxRetries: number;
  circuitBreakerFailures: number;
  gracefulDegradation: boolean;
  outputValidationRequired: boolean;
  idempotencyRequired: boolean;
  isolationRequired: boolean;
  humanEscalationForRisk: RiskLevel;
}

export interface SovereigntyBoundary {
  data: string;
  modelInference: string;
  infrastructure: string;
  operator: string;
  jurisdiction: string;
  keyCustody: string;
  controlPlaneDependencies: string[];
  evidenceRetention: string;
  portability: 'portable' | 'partial' | 'unknown';
  exitStrategy: string;
}

export interface AIImpactAssessment {
  id: string;
  lifecycleStage: 'design' | 'build' | 'evaluate' | 'deploy' | 'operate' | 'monitor' | 'retire';
  intendedPurpose: string;
  foreseeableUse: string[];
  affectedParties: string[];
  risks: string[];
  dataSources: string[];
  humanOversight: string;
  evidenceRefs: string[];
  reassessmentTrigger: string;
  createdAt: string;
}

export interface FinOpsArchitectureDecision {
  id: string;
  workload: string;
  options: string[];
  unitMetric?: string;
  expectedCost?: Record<string, number>;
  valueMetric?: string;
  constraints: string[];
  placementTradeoffs: string[];
  reversibility: 'high' | 'medium' | 'low' | 'unknown';
  approvalRequired: boolean;
}

interface PatternDefinition {
  id: string;
  title: string;
  domain: ArchitectureDomain;
  sourceId: string;
  pattern: string;
  GLORIFIERMapping: string;
  controlIds: string[];
  keywords: string[];
}

const SOURCES: ArchitectureSource[] = [
  {
    id: 'microsoft-architecture',
    authority: 'Microsoft',
    domain: 'enterprise-architecture',
    url: 'https://learn.microsoft.com/en-us/azure/architecture/',
    patternIds: ['cross-cutting-cloud-controls'],
    cadenceHours: 168,
  },
  {
    id: 'aws-well-architected',
    authority: 'AWS',
    domain: 'cloud',
    url: 'https://aws.amazon.com/architecture/well-architected/',
    patternIds: ['cross-cutting-cloud-controls', 'durable-agent-execution'],
    cadenceHours: 168,
  },
  {
    id: 'google-architecture',
    authority: 'Google Cloud',
    domain: 'cloud',
    url: 'https://cloud.google.com/architecture',
    patternIds: ['federated-data-access'],
    cadenceHours: 168,
  },
  {
    id: 'nist-ai-rmf',
    authority: 'NIST',
    domain: 'ai',
    url: 'https://www.nist.gov/itl/ai-risk-management-framework',
    patternIds: ['ai-lifecycle-risk'],
    cadenceHours: 168,
  },
  {
    id: 'nist-ai-agents',
    authority: 'NIST',
    domain: 'ai',
    url: 'https://www.nist.gov/programs-projects/ai-agent-standards-initiative',
    patternIds: ['agent-identity-delegation'],
    cadenceHours: 168,
  },
  {
    id: 'nist-csf',
    authority: 'NIST',
    domain: 'cybersecurity',
    url: 'https://www.nist.gov/cyberframework',
    patternIds: ['identity-risk-controls'],
    cadenceHours: 168,
  },
  {
    id: 'nist-ssdf',
    authority: 'NIST',
    domain: 'software',
    url: 'https://csrc.nist.gov/Projects/ssdf',
    patternIds: ['software-supply-chain'],
    cadenceHours: 168,
  },
  {
    id: 'opentelemetry-semconv',
    authority: 'OpenTelemetry',
    domain: 'observability',
    url: 'https://opentelemetry.io/docs/concepts/semantic-conventions/',
    patternIds: ['vendor-neutral-telemetry', 'evidence-minimization'],
    cadenceHours: 168,
  },
  {
    id: 'finops-focus',
    authority: 'FinOps Foundation',
    domain: 'finops',
    url: 'https://focus.finops.org/',
    patternIds: ['cost-outcome-accounting'],
    cadenceHours: 168,
  },
  {
    id: 'cncf-kyverno',
    authority: 'CNCF',
    domain: 'platform-engineering',
    url: 'https://www.cncf.io/projects/kyverno/',
    patternIds: ['policy-as-code'],
    cadenceHours: 168,
  },
  {
    id: 'cncf-dapr-agents',
    authority: 'CNCF',
    domain: 'reliability',
    url: 'https://www.cncf.io/projects/dapr/',
    patternIds: ['durable-agent-execution'],
    cadenceHours: 168,
  },
  {
    id: 'etsi-eni',
    authority: 'ETSI',
    domain: 'networking',
    url: 'https://www.etsi.org/technical-groups/eni/',
    patternIds: ['federated-continuum', 'intent-closed-loop'],
    cadenceHours: 168,
  },
  {
    id: 'ietf-rfcs',
    authority: 'IETF',
    domain: 'integration',
    url: 'https://www.ietf.org/process/rfcs/',
    patternIds: ['protocol-neutral-interoperability'],
    cadenceHours: 168,
  },
  {
    id: 'nist-iot',
    authority: 'NIST',
    domain: 'iot',
    url: 'https://www.nist.gov/programs-projects/nist-cybersecurity-iot-program',
    patternIds: ['iot-device-boundaries'],
    cadenceHours: 336,
  },
  {
    id: 'etsi-edge',
    authority: 'ETSI',
    domain: 'edge',
    url: 'https://www.etsi.org/technologies/multi-access-edge-computing',
    patternIds: ['edge-degradation'],
    cadenceHours: 336,
  },
  {
    id: 'nist-blockchain',
    authority: 'NIST',
    domain: 'blockchain',
    url: 'https://csrc.nist.gov/pubs/ir/8202/final',
    patternIds: ['selective-trust-anchoring'],
    cadenceHours: 336,
  },
  {
    id: 'iso-42001',
    authority: 'ISO',
    domain: 'governance',
    url: 'https://www.iso.org/standard/42001',
    patternIds: ['ai-management-system'],
    cadenceHours: 336,
  },
  {
    id: 'w3c-vc',
    authority: 'W3C',
    domain: 'emerging-technology',
    url: 'https://www.w3.org/TR/vc-data-model-2.0/',
    patternIds: ['verifiable-credentials'],
    cadenceHours: 336,
  },
  {
    id: 'owasp-agent-control',
    authority: 'OWASP',
    domain: 'cybersecurity',
    url: 'https://genai.owasp.org/resource/agent-control-standard-acs/',
    patternIds: ['runtime-agent-controls'],
    cadenceHours: 168,
  },
  {
    id: 'mitre-atlas',
    authority: 'MITRE',
    domain: 'cybersecurity',
    url: 'https://atlas.mitre.org/',
    patternIds: ['adversarial-ai-controls'],
    cadenceHours: 168,
  },
  {
    id: 'nist-token-protection',
    authority: 'NIST',
    domain: 'cybersecurity',
    url: 'https://www.nist.gov/publications/protecting-tokens-and-assertions-forgery-theft-and-misuse-implementation',
    patternIds: ['token-lifecycle-protection'],
    cadenceHours: 168,
  },
  {
    id: 'otel-genai-agents',
    authority: 'OpenTelemetry',
    domain: 'observability',
    url: 'https://github.com/open-telemetry/semantic-conventions-genai',
    patternIds: ['genai-agent-telemetry'],
    cadenceHours: 168,
  },
  {
    id: 'finops-focus-1-4',
    authority: 'FinOps Foundation',
    domain: 'finops',
    url: 'https://focus.finops.org/docs/specification/v1-4/',
    patternIds: ['cost-outcome-accounting'],
    cadenceHours: 168,
  },
  {
    id: 'nist-zero-trust',
    authority: 'NIST',
    domain: 'networking',
    url: 'https://csrc.nist.gov/pubs/sp/800/207/final',
    patternIds: ['zero-trust-resource-access'],
    cadenceHours: 336,
  },
  {
    id: 'nist-traceability',
    authority: 'NIST',
    domain: 'data',
    url: 'https://csrc.nist.gov/pubs/ir/8536/final',
    patternIds: ['provenance-graph'],
    cadenceHours: 168,
  },
];

const P = (
  id: string,
  title: string,
  domain: ArchitectureDomain,
  sourceId: string,
  pattern: string,
  mapping: string,
  controlIds: string[],
  keywords: string[],
): PatternDefinition => ({
  id,
  title,
  domain,
  sourceId,
  pattern,
  GLORIFIERMapping: mapping,
  controlIds,
  keywords,
});

const PATTERN_DEFINITIONS: PatternDefinition[] = [
  P('cross-cutting-cloud-controls', 'Cross-cutting architecture controls', 'cloud', 'aws-well-architected', 'Treat operational excellence, security, reliability, performance and cost as architecture concerns.', 'GEAS architecture evidence and drift model', ['REL-01', 'SEC-01', 'FIN-01'], ['security', 'reliability', 'cost']),
  P('ai-lifecycle-risk', 'Continuous AI risk lifecycle', 'ai', 'nist-ai-rmf', 'Manage AI trustworthiness and risk across design, development, use and evaluation.', 'GEAS + AI impact assessment', ['AI-01', 'GOV-01'], ['risk', 'design', 'development', 'evaluation']),
  P('agent-identity-delegation', 'Agent identity and authorization', 'ai', 'nist-ai-agents', 'Treat agent identity, authorization, auditing and non-repudiation as explicit architecture concerns.', 'Agent Identity + Delegation Plane', ['SEC-01', 'AUTH-01'], ['identity', 'authorization', 'auditing', 'agent']),
  P('identity-risk-controls', 'Risk-based cybersecurity controls', 'cybersecurity', 'nist-csf', 'Organize cybersecurity outcomes around governance, identification, protection, detection, response and recovery.', 'GEAS security control crosswalk', ['SEC-01', 'REL-01'], ['governance', 'identify', 'protect', 'detect', 'respond', 'recover']),
  P('software-supply-chain', 'Secure software supply chain', 'software', 'nist-ssdf', 'Integrate secure software practices throughout the software development lifecycle.', 'Code Sentinel + provenance graph + release gates', ['SUPPLY-01', 'POL-01'], ['software', 'secure', 'development', 'supply chain']),
  P('vendor-neutral-telemetry', 'Common telemetry semantics', 'observability', 'opentelemetry-semconv', 'Use common semantic conventions so telemetry can be correlated across systems.', 'Agent observability + evidence graph', ['OBS-01'], ['semantic conventions', 'telemetry', 'traces', 'metrics']),
  P('evidence-minimization', 'Sensitive telemetry minimization', 'observability', 'opentelemetry-semconv', 'Treat telemetry data as potentially sensitive and apply redaction and retention controls.', 'Evidence minimization policy', ['EVID-01'], ['sensitive', 'redact', 'privacy']),
  P('cost-outcome-accounting', 'Standardized cost and usage accounting', 'finops', 'finops-focus', 'Normalize technology cost and usage data so architecture and economic decisions can be compared.', 'Revenue Control Plane + cost-per-verified-outcome', ['FIN-01'], ['cost', 'usage', 'standard']),
  P('policy-as-code', 'Declarative policy enforcement', 'platform-engineering', 'cncf-kyverno', 'Encode guardrails as versioned policies and enforce them at platform control points.', 'GEAS policy engine + deployment gates', ['POL-01'], ['policy', 'enforce']),
  P('durable-agent-execution', 'Durable agent execution', 'reliability', 'cncf-dapr-agents', 'Use durable state and recovery patterns for long-running agent workflows.', 'Daemon + durable work coordinator', ['REL-01', 'STATE-01'], ['durable', 'state', 'recovery', 'workflow']),
  P('federated-continuum', 'Federated cloud-network-edge-device continuum', 'networking', 'etsi-eni', 'Use semantic interoperability and common information models across network, edge and compute domains.', 'Connection Registry + provider-neutral orchestration', ['FED-01'], ['interoperability', 'common information', 'edge']),
  P('intent-closed-loop', 'Intent-driven closed-loop automation', 'networking', 'etsi-eni', 'Translate high-level intent into policy-driven automated actions with assurance.', 'GEAS policy → governed execution + verification', ['POL-01', 'GOV-01'], ['intent', 'policy', 'automated', 'assurance']),
  P('protocol-neutral-interoperability', 'Protocol-neutral interoperability', 'integration', 'ietf-rfcs', 'Prefer explicit, versioned protocols and interoperable interfaces over provider-specific coupling.', 'A2A/MCP/API adapters + capability registry', ['FED-01'], ['protocol', 'interoperability', 'interface']),
  P('iot-device-boundaries', 'Explicit IoT device security boundaries', 'iot', 'nist-iot', 'Treat device identity, security capabilities and lifecycle boundaries as explicit controls.', 'Device identity + capability + lifecycle governance', ['SEC-01'], ['device', 'identity', 'lifecycle']),
  P('edge-degradation', 'Edge graceful degradation', 'edge', 'etsi-edge', 'Design edge systems around constrained connectivity, locality and resilient operation.', 'Degraded-mode contracts', ['REL-01', 'FED-01'], ['edge', 'connectivity', 'resilience']),
  P('selective-trust-anchoring', 'Selective distributed trust anchoring', 'blockchain', 'nist-blockchain', 'Use distributed ledger concepts selectively where multi-party integrity or provenance requires them.', 'Optional external receipt/proof anchoring', ['EVID-01'], ['blockchain', 'distributed', 'ledger', 'trust']),
  P('ai-management-system', 'AI management system', 'governance', 'iso-42001', 'Establish and continually improve a management system for responsible AI governance.', 'GEAS governance lifecycle + audit evidence', ['AI-01', 'GOV-01'], ['management system', 'AI', 'continuous', 'governance']),
  P('verifiable-credentials', 'Machine-verifiable credentials', 'emerging-technology', 'w3c-vc', 'Use cryptographically secure, privacy-respecting, machine-verifiable credentials where portable trust is required.', 'Future portable agent/provider credentials', ['AUTH-01', 'EVID-01'], ['verifiable', 'credential', 'cryptographic']),
  P('runtime-agent-controls', 'Runtime agent control hooks', 'cybersecurity', 'owasp-agent-control', 'Expose inspectable, traceable and enforceable runtime controls for agents.', 'GEAS runtime policy adapters', ['SEC-01', 'POL-01', 'OBS-01'], ['agent', 'runtime', 'control', 'traceable']),
  P('adversarial-ai-controls', 'Adversarial AI threat-informed controls', 'cybersecurity', 'mitre-atlas', 'Use threat-informed adversarial AI knowledge to identify and prioritize defensive controls.', 'Code Sentinel + agent threat model', ['SEC-01'], ['attack', 'adversarial', 'machine learning']),
  P('provenance-graph', 'Cryptographically linked provenance', 'data', 'nist-traceability', 'Link traceability events into a verifiable provenance chain while enabling selective disclosure.', 'Evidence Graph + provider/model/software provenance', ['EVID-01', 'SUPPLY-01'], ['provenance', 'traceability', 'cryptographic', 'selective disclosure']),
  P('token-lifecycle-protection', 'Token lifecycle protection', 'cybersecurity', 'nist-token-protection', 'Protect tokens and assertions against forgery, theft and misuse with verification, key management and lifecycle controls.', 'Token lifecycle contract + GEAS authorization gates', ['AUTH-01', 'SEC-01'], ['token', 'assertion', 'verification', 'key management']),
  P('genai-agent-telemetry', 'GenAI agent telemetry semantics', 'observability', 'otel-genai-agents', 'Use common spans and attributes for agent creation, invocation, planning and tool execution.', 'Versioned GEAS agent telemetry contract', ['OBS-01', 'EVID-01'], ['agent', 'invoke', 'tool', 'span']),
  P('zero-trust-resource-access', 'Resource-centric zero trust access', 'networking', 'nist-zero-trust', 'Authenticate and authorize subjects and devices before resource access without implicit trust from network location.', 'Per-resource GEAS capability and authorization gates', ['SEC-01', 'AUTH-01'], ['zero trust', 'resource', 'authorization', 'authentication']),
  P('federated-data-access', 'Federated data access', 'data', 'google-architecture', 'Use fit-for-purpose governed data access rather than assuming all workloads require centralized movement.', 'Data governance + provider-neutral connectors', ['DATA-01'], ['data', 'access', 'architecture']),
];

const CONTROLS: ArchitectureControl[] = [
  { id: 'AI-01', name: 'AI lifecycle assessment', family: 'ai-governance', requirement: 'AI systems and agents have lifecycle impact/risk assessment and reassessment triggers.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'GOV-01', name: 'Human final authority', family: 'governance', requirement: 'Irreversible external actions require explicit human authorization.', enforcement: 'human-approval', irreversibleChangeAllowed: false },
  { id: 'SEC-01', name: 'Scoped agent authority', family: 'security', requirement: 'Agent identity, tools, data scope and risk must be explicitly bounded.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'AUTH-01', name: 'Identity and delegation', family: 'identity', requirement: 'Agent identity, delegation scope, audience, expiration and revocation are explicit.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'OBS-01', name: 'Correlated telemetry', family: 'observability', requirement: 'Agent, model, tool, deployment and outcome telemetry uses stable correlation identifiers.', enforcement: 'observe', irreversibleChangeAllowed: false },
  { id: 'EVID-01', name: 'Evidence integrity and minimization', family: 'evidence', requirement: 'Evidence has provenance, integrity, classification, retention and disclosure controls.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'FIN-01', name: 'Architecture-aware FinOps', family: 'finops', requirement: 'Material architecture and placement decisions record cost, value, reliability and sovereignty tradeoffs.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'POL-01', name: 'Policy-as-code', family: 'platform-governance', requirement: 'Applicable controls are machine-evaluable before governed execution.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'FED-01', name: 'Federated interoperability', family: 'integration', requirement: 'External resources are accessed through explicit contracts, scopes and replaceable adapters.', enforcement: 'observe', irreversibleChangeAllowed: false },
  { id: 'DATA-01', name: 'Data boundary awareness', family: 'data-governance', requirement: 'Data movement and residency/control boundaries are explicitly recorded.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'REL-01', name: 'Agent reliability contract', family: 'reliability', requirement: 'Timeouts, bounded retries, validation, idempotency, isolation and graceful degradation are defined.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'STATE-01', name: 'Durable execution state', family: 'reliability', requirement: 'Long-running governed work has durable ownership, checkpoint and recovery semantics.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'SUPPLY-01', name: 'Software and provider provenance', family: 'supply-chain', requirement: 'Material software, model, provider and deployment dependencies have traceable provenance.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'TRACE-01', name: 'Five-state architecture reconciliation', family: 'architecture-state', requirement: 'Desired, declared, deployed, observed and verified states are separately recorded; missing evidence remains UNKNOWN.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'LEASE-01', name: 'Durable scanner ownership', family: 'reliability', requirement: 'Architecture scanning uses durable database-backed ownership to prevent overlapping multi-instance scans.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'TEL-01', name: 'Agent telemetry contract', family: 'observability', requirement: 'Agent, model, tool, policy and evidence correlation follows a versioned vendor-neutral telemetry contract.', enforcement: 'observe', irreversibleChangeAllowed: false },
  { id: 'ECO-01', name: 'FOCUS-aligned economic evidence', family: 'finops', requirement: 'Cost and usage evidence can correlate workload, provider, billing/invoice context and verified outcomes.', enforcement: 'gate', irreversibleChangeAllowed: false },
];

const RECOMMENDATIONS = [
  'Use a durable database-backed lease for the architecture scientist so multiple application instances cannot perform overlapping scans.',
  'Adopt the five-state architecture reconciliation contract: desired → declared → deployed → observed → verified; missing proof remains UNKNOWN.',
  'Adopt the OpenTelemetry GenAI agent vocabulary for create_agent, invoke_agent, plan, workflow and execute_tool traces while retaining GEAS governance identifiers.',
  'Classify architecture evidence, minimize raw payloads, retain only what policy permits, and support selective disclosure.',
  'Normalize economic evidence against FOCUS 1.4 concepts and correlate cost/usage with workload, invoice/billing context and verified outcomes.',
  'Treat identity and authorization as resource-centric controls consistent with zero-trust architecture; never infer authority from network location.',
  'Make the Architecture Evidence Graph canonical: source → observation → evidence → pattern → control → component → runtime evidence → drift → recommendation → authorization → outcome.',
  'Do not promote source availability or keyword matches into claim verification; require claim-specific support before emitting an observed architecture pattern.',
  'Add first-class agent identity, delegated authority, capability scope, expiration and revocation semantics.',
  'Represent governed actions as evidence packages binding identity, authority, policy, action hash, execution identity, telemetry and outcome.',
  'Adopt a versioned OpenTelemetry-compatible execution trace contract while minimizing sensitive GenAI payloads.',
  'Normalize technology cost and usage and correlate it with verified outcomes; preserve estimated, observed and verified economic states.',
  'Represent architecture drift as desired → declared → deployed → observed → verified, with UNKNOWN when evidence is missing.',
  'Use durable coordination for multi-instance Daemon/workflow ownership rather than process-local overlap guards as the only HA mechanism.',
  'Record software, model, provider and deployment provenance as a linked graph with selective disclosure where appropriate.',
  'Use policy-as-code adapters while retaining human approval for irreversible external actions.',
  'Represent sovereignty boundaries explicitly across data, inference, infrastructure, operator, jurisdiction, key custody and control-plane dependencies.',
  'Keep blockchain optional and use it only for justified multi-party integrity/proof anchoring.',
  'Monitor emerging agent protocols and credentials as compatibility candidates rather than hard dependencies.',
  'Do not autonomously implement irreversible production changes from architecture-science findings.',
];

const RELIABILITY_CONTRACT: AgentReliabilityContract = {
  timeoutMs: 30000,
  maxRetries: 2,
  circuitBreakerFailures: 5,
  gracefulDegradation: true,
  outputValidationRequired: true,
  idempotencyRequired: true,
  isolationRequired: true,
  humanEscalationForRisk: 'high',
};

const SOVEREIGNTY_DEFAULTS: SovereigntyBoundary = {
  data: 'explicit-resource-policy',
  modelInference: 'provider-and-region-specific',
  infrastructure: 'deployment-specific',
  operator: 'human-owner-controlled',
  jurisdiction: 'explicit-required',
  keyCustody: 'explicit-required',
  controlPlaneDependencies: [],
  evidenceRetention: 'authoritative-application-store',
  portability: 'unknown',
  exitStrategy: 'document-before-material-provider-commitment',
};

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, ' and ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractEvidence(body: string, keywords: string[]) {
  const text = stripHtml(body);
  const lower = text.toLowerCase();
  let index = -1;
  for (const keyword of keywords) {
    const needle = keyword.toLowerCase();
    const i = lower.indexOf(needle);
    if (i >= 0 && (index === -1 || i < index)) index = i;
  }
  if (index < 0) return null;
  const start = Math.max(0, index - 240);
  const end = Math.min(text.length, index + 760);
  return text.slice(start, end).trim();
}

async function fetchSource(source: ArchitectureSource): Promise<SourceObservation> {
  const observedAt = new Date().toISOString();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(source.url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'GLORIFIER-GEAS-Architecture-Scientist/2.0', Accept: 'text/html,application/xhtml+xml,text/plain' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await response.text();
    const normalizedText = stripHtml(body).replace(/\s+/g, ' ').trim();
    const hash = createHash('sha256').update(normalizedText).digest('hex');
    const keywords = PATTERN_DEFINITIONS.filter((pattern) => pattern.sourceId === source.id).flatMap((pattern) => pattern.keywords);
    const excerpt = response.ok ? extractEvidence(body, keywords) : null;
    return {
      sourceId: source.id,
      ok: response.ok,
      status: response.status,
      contentHash: hash,
      observedAt,
      finalUrl: response.url || source.url,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      evidenceExcerpt: excerpt,
      evidenceStatus: excerpt ? 'content-matched' : response.ok ? 'source-available' : 'not-observed',
      error: response.ok ? undefined : `source fetch returned ${response.status}`,
    };
  } catch (error) {
    return {
      sourceId: source.id,
      ok: false,
      status: null,
      contentHash: null,
      observedAt,
      evidenceExcerpt: null,
      evidenceStatus: 'unavailable',
      error: error instanceof Error ? error.message : 'source fetch failed',
    };
  }
}

function observedPatterns(results: SourceObservation[], reviewedAt: string): ArchitecturePattern[] {
  const map = new Map(results.map((result) => [result.sourceId, result]));
  return PATTERN_DEFINITIONS.flatMap((pattern) => {
    const source = map.get(pattern.sourceId);
    if (!source || !source.ok || source.evidenceStatus !== 'claim-supported' || !source.evidenceExcerpt) {
      return [] as ArchitecturePattern[];
    }
    return [{
      id: pattern.id,
      title: pattern.title,
      domain: pattern.domain,
      evidenceClass: 'observed-fact',
      sourceId: source.sourceId,
      evidenceUrl: SOURCES.find((item) => item.id === source.sourceId)?.url ?? '',
      evidenceExcerpt: source.evidenceExcerpt,
      pattern: pattern.pattern,
      GLORIFIERMapping: pattern.GLORIFIERMapping,
      controlIds: pattern.controlIds,
      lastReviewed: reviewedAt,
    }];
  });
}

function buildEvidence(results: SourceObservation[], patterns: ArchitecturePattern[]): ArchitectureEvidence[] {
  const ids = new Map<string, string[]>();
  for (const pattern of patterns) {
    const arr = ids.get(pattern.sourceId) ?? [];
    arr.push(pattern.id);
    ids.set(pattern.sourceId, arr);
  }

  return results.flatMap((result) => {
    if (!result.ok || !result.evidenceExcerpt || !['content-matched', 'claim-supported'].includes(result.evidenceStatus)) return [] as ArchitectureEvidence[];
    return [{
      id: `evidence-${result.sourceId}-${result.contentHash?.slice(0, 16) ?? 'unknown'}`,
      sourceId: result.sourceId,
      sourceUrl: SOURCES.find((source) => source.id === result.sourceId)?.url ?? '',
      observedAt: result.observedAt,
      contentHash: result.contentHash ?? 'unknown',
      excerpt: result.evidenceExcerpt,
      evidenceClass: 'observed-fact',
      sourceStatus: result.status ?? 0,
      patternIds: ids.get(result.sourceId) ?? [],
    }];
  });
}

function coverage(results: SourceObservation[], patterns: ArchitecturePattern[]): ArchitectureScanResult['coverage'] {
  const out = {} as ArchitectureScanResult['coverage'];
  for (const domain of [...new Set(SOURCES.map((source) => source.domain))] as ArchitectureDomain[]) {
    const domainSources = results.filter((result) => SOURCES.some((source) => source.id === result.sourceId && source.domain === domain));
    const observedPatterns = patterns.filter((pattern) => pattern.domain === domain).length;
    const status = !domainSources.length
      ? 'source-unavailable'
      : observedPatterns > 0
        ? 'covered'
        : 'no-observed-pattern';

    out[domain] = {
      sources: domainSources.length,
      observedPatterns,
      status,
    };
  }
  return out;
}

function drift(): DriftFinding[] {
  const ts = new Date().toISOString();
  return [
    {
      id: 'drift-agent-identity',
      controlId: 'AUTH-01',
      status: 'unknown',
      severity: 'high',
      intended: 'Agents have explicit identity, delegation scope, audience, expiration and revocation semantics.',
      observed: 'No fresh runtime comparison evidence was supplied to this baseline assessment; implementation state is UNKNOWN.',
      evidenceRefs: [],
      recommendation: 'Adopt AgentIdentityContract for governed agent actions.',
      createdAt: ts,
    },
    {
      id: 'drift-telemetry-contract',
      controlId: 'OBS-01',
      status: 'unknown',
      severity: 'medium',
      intended: 'Agent/model/tool/deployment/outcome events share stable correlation semantics.',
      observed: 'No fresh runtime comparison evidence was supplied to this baseline assessment; implementation state is UNKNOWN.',
      evidenceRefs: [],
      recommendation: 'Adopt a versioned GEAS telemetry contract.',
      createdAt: ts,
    },
    {
      id: 'drift-evidence-minimization',
      controlId: 'EVID-01',
      status: 'unknown',
      severity: 'medium',
      intended: 'Evidence has integrity, classification, retention and disclosure controls.',
      observed: 'No fresh runtime comparison evidence was supplied to this baseline assessment; implementation state is UNKNOWN.',
      evidenceRefs: [],
      recommendation: 'Add classification, redaction, retention and selective-disclosure metadata.',
      createdAt: ts,
    },
    {
      id: 'drift-policy-enforcement',
      controlId: 'POL-01',
      status: 'unknown',
      severity: 'medium',
      intended: 'Applicable policies are machine-evaluable before governed execution.',
      observed: 'No fresh runtime comparison evidence was supplied to this baseline assessment; implementation state is UNKNOWN.',
      evidenceRefs: [],
      recommendation: 'Publish versioned policies and add enforcement adapters.',
      createdAt: ts,
    },
    {
      id: 'drift-provenance',
      controlId: 'SUPPLY-01',
      status: 'unknown',
      severity: 'high',
      intended: 'Software, model, provider and deployment dependencies have traceable provenance.',
      observed: 'No fresh runtime comparison evidence was supplied to this baseline assessment; implementation state is UNKNOWN.',
      evidenceRefs: [],
      recommendation: 'Link provider/model/software/deployment provenance into one evidence graph.',
      createdAt: ts,
    },
    {
      id: 'drift-finops',
      controlId: 'FIN-01',
      status: 'unknown',
      severity: 'low',
      intended: 'Material architecture choices record cost, value and placement tradeoffs.',
      observed: 'No fresh runtime comparison evidence was supplied to this baseline assessment; implementation state is UNKNOWN.',
      evidenceRefs: [],
      recommendation: 'Add normalized cost/usage attribution and verified-outcome correlation.',
      createdAt: ts,
    },
    {
      id: 'drift-daemon-ha',
      controlId: 'STATE-01',
      status: 'unknown',
      severity: 'high',
      intended: 'Long-running governed work has durable ownership, checkpoint and recovery semantics.',
      observed: 'No fresh runtime comparison evidence was supplied to this baseline assessment; implementation state is UNKNOWN.',
      evidenceRefs: [],
      recommendation: 'Evaluate durable lease/checkpoint coordination before claiming HA.',
      createdAt: ts,
    },
    {
      id: 'drift-architecture-reconciliation',
      controlId: 'GOV-01',
      status: 'unknown',
      severity: 'high',
      intended: 'Desired, declared, deployed, observed and verified states are reconciled.',
      observed: 'No fresh runtime comparison evidence was supplied to this baseline assessment; implementation state is UNKNOWN.',
      evidenceRefs: [],
      recommendation: 'Persist the five-state reconciliation and never infer compliance from missing evidence.',
      createdAt: ts,
    },
  ];
}

export async function initializeGeasArchitectureScientist() {
  const db = getPostgresPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS geas_architecture_scans (
      scan_id TEXT PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ NOT NULL,
      result JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS geas_source_observations (
      source_id TEXT PRIMARY KEY,
      observed_at TIMESTAMPTZ NOT NULL,
      ok BOOLEAN NOT NULL,
      status INTEGER,
      content_hash TEXT,
      evidence_excerpt TEXT,
      evidence_status TEXT NOT NULL DEFAULT 'unavailable',
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS geas_architecture_evidence (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      source_url TEXT NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL,
      content_hash TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      evidence_class TEXT NOT NULL DEFAULT 'observed-fact',
      source_status INTEGER NOT NULL,
      pattern_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    );

    CREATE TABLE IF NOT EXISTS geas_agent_identity_contracts (
      subject TEXT PRIMARY KEY,
      contract JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS geas_governed_action_evidence (
      id TEXT PRIMARY KEY,
      action_hash TEXT NOT NULL,
      actor_identity TEXT,
      authority_ref TEXT,
      capability TEXT,
      policy_decision_ref TEXT,
      execution_identity TEXT,
      provider TEXT,
      model TEXT,
      tool TEXT,
      trace_id TEXT,
      evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
      outcome_ref TEXT,
      economic_impact_ref TEXT,
      verification_status TEXT NOT NULL DEFAULT 'UNKNOWN',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS geas_architecture_scan_leases (
      lease_name TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      acquired_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS geas_agent_telemetry_contracts (
      trace_id TEXT PRIMARY KEY,
      contract JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS geas_finops_evidence (
      id TEXT PRIMARY KEY,
      contract JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS geas_evidence_governance (
      evidence_id TEXT PRIMARY KEY,
      governance JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS geas_architecture_reconciliations (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL,
      desired JSONB NOT NULL,
      declared JSONB NOT NULL,
      deployed JSONB NOT NULL,
      observed JSONB NOT NULL,
      verified JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'UNKNOWN',
      evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function acquireArchitectureScanLease(ownerId: string, ttlMinutes = 30): Promise<boolean> {
  try {
    await initializeGeasArchitectureScientist();
    const db = getPostgresPool();
    const result = await db.query(
      "INSERT INTO geas_architecture_scan_leases(lease_name, owner_id, acquired_at, expires_at) VALUES($1, $2, NOW(), NOW() + ($3 || ' minutes')::interval) ON CONFLICT(lease_name) DO UPDATE SET owner_id = EXCLUDED.owner_id, acquired_at = EXCLUDED.acquired_at, expires_at = EXCLUDED.expires_at WHERE geas_architecture_scan_leases.expires_at < NOW() RETURNING owner_id",
      ['global', ownerId, String(ttlMinutes)],
    );
    return result.rowCount === 1;
  } catch {
    return false;
  }
}

async function releaseArchitectureScanLease(ownerId: string): Promise<void> {
  try {
    const db = getPostgresPool();
    await db.query('DELETE FROM geas_architecture_scan_leases WHERE lease_name = $1 AND owner_id = $2', ['global', ownerId]);
  } catch {
    // Expiration provides recovery if cleanup cannot run.
  }
}

export async function runGeasArchitectureScan(): Promise<ArchitectureScanResult> {
  const persist = String(process.env.GEAS_SCAN_PERSIST ?? 'true').toLowerCase() !== 'false';
  const ownerId = `geas-scanner-${randomUUID()}`;
  const leaseAcquired = persist ? await acquireArchitectureScanLease(ownerId) : true;
  if (!leaseAcquired) throw new Error('GEAS architecture scan lease is held by another instance');

  const scanId = `geas-scan-${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const sources = await Promise.all(SOURCES.map(fetchSource));
  const completedAt = new Date().toISOString();
  const patterns = observedPatterns(sources, completedAt);
  const evidence = buildEvidence(sources, patterns);
  const result: ArchitectureScanResult = {
    scanId,
    startedAt,
    completedAt,
    sources,
    evidence,
    patterns,
    drift: drift(),
    recommendations: [...RECOMMENDATIONS],
    coverage: coverage(sources, patterns),
    irreversibleChangesExecuted: false,
    architectureStateModel: ['desired', 'declared', 'deployed', 'observed', 'verified'],
    sourcePolicyVersion: 'GEAS-AUTHORITY-1',
  };

  if (persist) try {
    await initializeGeasArchitectureScientist();
    const db = getPostgresPool();
    await db.query('INSERT INTO geas_architecture_scans(scan_id, started_at, completed_at, result) VALUES($1, $2, $3, $4)', [scanId, startedAt, completedAt, result]);
    for (const source of sources) {
      await db.query(
        'INSERT INTO geas_source_observations(source_id, observed_at, ok, status, content_hash, evidence_excerpt, evidence_status, error) VALUES($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT(source_id) DO UPDATE SET observed_at = EXCLUDED.observed_at, ok = EXCLUDED.ok, status = EXCLUDED.status, content_hash = EXCLUDED.content_hash, evidence_excerpt = EXCLUDED.evidence_excerpt, evidence_status = EXCLUDED.evidence_status, error = EXCLUDED.error',
        [source.sourceId, source.observedAt, source.ok, source.status, source.contentHash, source.evidenceExcerpt, source.evidenceStatus, source.error ?? null],
      );
    }
    for (const item of evidence) {
      await db.query(
        'INSERT INTO geas_architecture_evidence(id, source_id, source_url, observed_at, content_hash, excerpt, evidence_class, source_status, pattern_ids) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT(id) DO UPDATE SET source_id = EXCLUDED.source_id, source_url = EXCLUDED.source_url, observed_at = EXCLUDED.observed_at, content_hash = EXCLUDED.content_hash, excerpt = EXCLUDED.excerpt, evidence_class = EXCLUDED.evidence_class, source_status = EXCLUDED.source_status, pattern_ids = EXCLUDED.pattern_ids',
        [item.id, item.sourceId, item.sourceUrl, item.observedAt, item.contentHash, item.excerpt, item.evidenceClass, item.sourceStatus, JSON.stringify(item.patternIds)],
      );
    }
  } catch (error) {
    console.warn('[GEAS] architecture scan persistence deferred:', error instanceof Error ? error.message : error);
  }

  if (persist) await releaseArchitectureScanLease(ownerId);
  return result;
}

export async function persistEvidenceGovernance(evidenceId: string, governance: EvidenceGovernance) {
  await initializeGeasArchitectureScientist();
  const db = getPostgresPool();
  await db.query('INSERT INTO geas_evidence_governance(evidence_id, governance, updated_at) VALUES($1, $2, NOW()) ON CONFLICT(evidence_id) DO UPDATE SET governance = EXCLUDED.governance, updated_at = NOW()', [evidenceId, JSON.stringify(governance)]);
  return governance;
}

export async function persistAgentTelemetryContract(contract: AgentTelemetryContract) {
  await initializeGeasArchitectureScientist();
  const db = getPostgresPool();
  await db.query('INSERT INTO geas_agent_telemetry_contracts(trace_id, contract) VALUES($1, $2) ON CONFLICT(trace_id) DO UPDATE SET contract = EXCLUDED.contract', [contract.traceId, JSON.stringify(contract)]);
  return contract;
}

export async function persistFinOpsEvidence(contract: FinOpsEvidenceContract) {
  await initializeGeasArchitectureScientist();
  const db = getPostgresPool();
  const id = 'finops-evidence-' + createHash('sha256').update(JSON.stringify(contract)).digest('hex');
  await db.query('INSERT INTO geas_finops_evidence(id, contract) VALUES($1, $2) ON CONFLICT(id) DO UPDATE SET contract = EXCLUDED.contract', [id, JSON.stringify(contract)]);
  return { id, ...contract };
}

const memory: { last?: ArchitectureScanResult } = {};

export async function getLatestGeasArchitectureScan() {
  try {
    if (memory.last) return memory.last;
    await initializeGeasArchitectureScientist();
    const db = getPostgresPool();
    const result = await db.query('SELECT result FROM geas_architecture_scans ORDER BY started_at DESC LIMIT 1');
    const row = result.rows[0];
    if (!row) return null;
    memory.last = row.result as ArchitectureScanResult;
    return memory.last;
  } catch {
    return memory.last ?? null;
  }
}

export function getGeasArchitectureModel() {
  return {
    version: 'GEAS-ARCHITECTURE-SCIENTIST-2.0',
    operatingRule: 'GEAS may observe, compare, explain, prioritize and recommend; it must not autonomously apply irreversible production changes.',
    sourcePolicy: 'Only curated authoritative public sources are accepted as architecture evidence.',
    sourcePolicyVersion: 'GEAS-AUTHORITY-1',
    evidencePolicy: 'Source availability and keyword matches are not claim verification. A pattern is labeled observed-fact only when its evidence status is claim-supported; absent claim-validation evidence remains UNKNOWN.',
    unknownPolicy: 'Missing or unavailable evidence remains UNKNOWN; no compliance is inferred from absence of evidence.',
    architectureStateModel: ['desired', 'declared', 'deployed', 'observed', 'verified'],
    domains: [...new Set(SOURCES.map((source) => source.domain))],
    sources: SOURCES,
    patterns: PATTERN_DEFINITIONS,
    controls: CONTROLS,
    drift: drift(),
    reliabilityContract: RELIABILITY_CONTRACT,
    sovereigntyDefaults: SOVEREIGNTY_DEFAULTS,
    aiLifecycle: ['design', 'build', 'evaluate', 'deploy', 'operate', 'monitor', 'retire'],
    architectureBaseline: GLORIFIER_ARCHITECTURE_MODEL,
    recommendations: RECOMMENDATIONS,
  };
}

export function getGeasArchitectureSources() {
  return SOURCES;
}

export function getGeasArchitecturePatterns() {
  return PATTERN_DEFINITIONS;
}

export function getGeasArchitectureControls() {
  return CONTROLS;
}

export function getGeasArchitectureReliabilityContract() {
  return RELIABILITY_CONTRACT;
}

export function getGeasSovereigntyDefaults() {
  return SOVEREIGNTY_DEFAULTS;
}

export function createAgentIdentityContract(input: Omit<AgentIdentityContract, 'identityType'> & { identityType?: AgentIdentityContract['identityType'] }): AgentIdentityContract {
  return {
    identityType: input.identityType ?? 'agent',
    ...input,
  };
}

export async function persistAgentIdentityContract(contract: AgentIdentityContract) {
  await initializeGeasArchitectureScientist();
  const db = getPostgresPool();
  await db.query(
    'INSERT INTO geas_agent_identity_contracts(subject, contract, updated_at) VALUES($1, $2, NOW()) ON CONFLICT(subject) DO UPDATE SET contract = EXCLUDED.contract, updated_at = NOW()',
    [contract.subject, JSON.stringify(contract)],
  );
  return contract;
}

export function createTokenLifecycleContract(input: Omit<TokenLifecycleContract, 'verificationRequired' | 'replayProtectionRequired'> & Partial<Pick<TokenLifecycleContract, 'verificationRequired' | 'replayProtectionRequired'>>): TokenLifecycleContract {
  return {
    verificationRequired: true,
    replayProtectionRequired: true,
    ...input,
  };
}

export function createGovernedActionEvidencePackage(input: Omit<GovernedActionEvidencePackage, 'id' | 'actionHash' | 'createdAt' | 'verificationStatus'> & { verificationStatus?: GovernedActionEvidencePackage['verificationStatus'] }): GovernedActionEvidencePackage {
  const canonical = JSON.stringify({
    actorIdentity: input.actorIdentity,
    authorityRef: input.authorityRef,
    capability: input.capability,
    policyDecisionRef: input.policyDecisionRef,
    executionIdentity: input.executionIdentity,
    provider: input.provider,
    model: input.model,
    tool: input.tool,
    traceId: input.traceId,
    evidenceRefs: input.evidenceRefs,
    outcomeRef: input.outcomeRef,
    economicImpactRef: input.economicImpactRef,
  });

  return {
    ...input,
    id: `gaep-${randomUUID()}`,
    actionHash: createHash('sha256').update(canonical).digest('hex'),
    verificationStatus: input.verificationStatus ?? 'UNKNOWN',
    createdAt: new Date().toISOString(),
  };
}

export async function persistGovernedActionEvidencePackage(pkg: GovernedActionEvidencePackage) {
  await initializeGeasArchitectureScientist();
  const db = getPostgresPool();
  await db.query(
    'INSERT INTO geas_governed_action_evidence(id, action_hash, actor_identity, authority_ref, capability, policy_decision_ref, execution_identity, provider, model, tool, trace_id, evidence_refs, outcome_ref, economic_impact_ref, verification_status, created_at) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()) ON CONFLICT(id) DO UPDATE SET action_hash = EXCLUDED.action_hash, actor_identity = EXCLUDED.actor_identity, authority_ref = EXCLUDED.authority_ref, capability = EXCLUDED.capability, policy_decision_ref = EXCLUDED.policy_decision_ref, execution_identity = EXCLUDED.execution_identity, provider = EXCLUDED.provider, model = EXCLUDED.model, tool = EXCLUDED.tool, trace_id = EXCLUDED.trace_id, evidence_refs = EXCLUDED.evidence_refs, outcome_ref = EXCLUDED.outcome_ref, economic_impact_ref = EXCLUDED.economic_impact_ref, verification_status = EXCLUDED.verification_status, created_at = EXCLUDED.created_at',
    [pkg.id, pkg.actionHash, pkg.actorIdentity, pkg.authorityRef, pkg.capability, pkg.policyDecisionRef, pkg.executionIdentity, pkg.provider ?? null, pkg.model ?? null, pkg.tool ?? null, pkg.traceId ?? null, JSON.stringify(pkg.evidenceRefs), pkg.outcomeRef ?? null, pkg.economicImpactRef ?? null, pkg.verificationStatus],
  );
  return pkg;
}

export function createAIImpactAssessment(input: Omit<AIImpactAssessment, 'id' | 'createdAt'>): AIImpactAssessment {
  return {
    ...input,
    id: `impact-${randomUUID()}`,
    createdAt: new Date().toISOString(),
  };
}

export function createFinOpsArchitectureDecision(input: Omit<FinOpsArchitectureDecision, 'id'>): FinOpsArchitectureDecision {
  return {
    ...input,
    id: `finops-${randomUUID()}`,
  };
}

export async function persistArchitectureReconciliation(input: {
  id?: string;
  resourceId: string;
  desired: Record<string, unknown>;
  declared: Record<string, unknown>;
  deployed: Record<string, unknown>;
  observed: Record<string, unknown>;
  verified: Record<string, unknown>;
  status?: string;
  evidenceRefs?: string[];
}) {
  await initializeGeasArchitectureScientist();
  const db = getPostgresPool();
  const id = input.id ?? `reconcile-${randomUUID()}`;
  await db.query(
    'INSERT INTO geas_architecture_reconciliations(id, resource_id, desired, declared, deployed, observed, verified, status, evidence_refs) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT(id) DO UPDATE SET resource_id = EXCLUDED.resource_id, desired = EXCLUDED.desired, declared = EXCLUDED.declared, deployed = EXCLUDED.deployed, observed = EXCLUDED.observed, verified = EXCLUDED.verified, status = EXCLUDED.status, evidence_refs = EXCLUDED.evidence_refs',
    [id, input.resourceId, JSON.stringify(input.desired), JSON.stringify(input.declared), JSON.stringify(input.deployed), JSON.stringify(input.observed), JSON.stringify(input.verified), input.status ?? 'UNKNOWN', JSON.stringify(input.evidenceRefs ?? [])],
  );
  return { ...input, id };
}

let scannerTimer: ReturnType<typeof setInterval> | undefined;

export function startGeasArchitectureScientistDaemon() {
  if (scannerTimer) return;
  const enabled = String(process.env.GEAS_ARCHITECTURE_SCAN_ENABLED ?? 'true').toLowerCase() !== 'false';
  if (!enabled) return;

  const hours = Math.max(1, Number(process.env.GEAS_ARCHITECTURE_SCAN_INTERVAL_HOURS ?? 24));
  void runGeasArchitectureScan().catch((error) => {
    console.warn('[GEAS] initial architecture scan deferred:', error instanceof Error ? error.message : error);
  });

  scannerTimer = setInterval(() => {
    void runGeasArchitectureScan().catch((error) => {
      console.warn('[GEAS] scheduled architecture scan deferred:', error instanceof Error ? error.message : error);
    });
  }, hours * 60 * 60 * 1000);

  scannerTimer.unref?.();
}
