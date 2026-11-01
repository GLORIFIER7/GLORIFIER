import { createHash, randomUUID } from 'node:crypto';
import { getPostgresPool } from '../db/postgres';
import { GLORIFIER_ARCHITECTURE_MODEL } from './glorifier-architecture';
import type { StateEvidence as ReconciliationStateEvidence } from './geas-architecture-reconciliation';

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
export interface ArchitectureReconciliationContract {
  resourceId: string;
  desired: Record<string, unknown>;
  declared: Record<string, unknown>;
  deployed: Record<string, unknown>;
  observed: Record<string, unknown>;
  verified: Record<string, unknown>;
  status: 'ALIGNED' | 'PARTIALLY_VERIFIED' | 'DRIFT' | 'UNKNOWN';
  /** Aggregate references are traceability-only; every state also needs snapshot-bound evidence. */
  evidenceRefs: string[];
  evidenceByState: Record<ArchitectureState, ReconciliationStateEvidence>;
}

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
  reusedCachedObservation?: boolean;
  revalidatedNotModified?: boolean;
  evidenceExcerpt: string | null;
  evidenceStatus: EvidenceStatus;
  error?: string;
}

export interface CachedSourceObservation {
  observed_at: string | Date;
  ok: boolean;
  status: number | null;
  content_hash: string | null;
  evidence_excerpt: string | null;
  evidence_status: EvidenceStatus;
  error?: string | null;
  final_url?: string | null;
  etag?: string | null;
  last_modified?: string | null;
  source_url?: string | null;
}

export interface ArchitecturePattern {
  id: string;
  title: string;
  domain: ArchitectureDomain;
  evidenceClass: EvidenceClass;
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
  evidenceClass: EvidenceClass;
  sourceStatus: number;
  patternIds: string[];
}

export interface ArchitectureScanResult {
  scanId: string;
  repositoryRevision: string;
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
  sourcePolicyVersion: 'GEAS-AUTHORITY-2';
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

const createArchitectureSource = (
  id: string,
  authority: string,
  domain: ArchitectureDomain,
  url: string,
  patternIds: string[],
  cadenceHours: number,
): ArchitectureSource => ({ id, authority, domain, url, patternIds, cadenceHours });

const SOURCES: ArchitectureSource[] = [
  createArchitectureSource('microsoft-architecture', 'Microsoft', 'enterprise-architecture', 'https://learn.microsoft.com/en-us/azure/architecture/', ['cross-cutting-cloud-controls'], 336),
  createArchitectureSource('aws-well-architected', 'AWS', 'cloud', 'https://aws.amazon.com/architecture/well-architected/', ['cross-cutting-cloud-controls', 'durable-agent-execution'], 336),
  createArchitectureSource('google-architecture', 'Google Cloud', 'cloud', 'https://docs.cloud.google.com/architecture/', ['federated-data-access'], 336),
  createArchitectureSource('nist-ai-rmf', 'NIST', 'ai', 'https://www.nist.gov/itl/ai-risk-management-framework', ['ai-lifecycle-risk'], 720),
  createArchitectureSource('nist-ai-rmf-playbook', 'NIST AI Resource Center', 'governance', 'https://airc.nist.gov/airmf-resources/playbook/', ['ai-governance-lifecycle'], 720),
  createArchitectureSource('nist-ai-agents', 'NIST', 'ai', 'https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative', ['agent-identity-delegation'], 336),
  createArchitectureSource('nist-csf', 'NIST', 'cybersecurity', 'https://www.nist.gov/cyberframework', ['identity-risk-controls'], 336),
  createArchitectureSource('nist-ssdf', 'NIST', 'software', 'https://csrc.nist.gov/Projects/ssdf', ['software-supply-chain'], 336),
  createArchitectureSource('opentelemetry-semconv', 'OpenTelemetry', 'observability', 'https://opentelemetry.io/docs/concepts/semantic-conventions/', ['vendor-neutral-telemetry', 'evidence-minimization'], 336),
  createArchitectureSource('finops-focus', 'FinOps Foundation', 'finops', 'https://focus.finops.org/', ['cost-outcome-accounting'], 336),
  createArchitectureSource('cncf-kyverno', 'CNCF', 'platform-engineering', 'https://www.cncf.io/projects/kyverno/', ['policy-as-code'], 336),
  createArchitectureSource('cncf-dapr-agents', 'CNCF', 'reliability', 'https://www.cncf.io/projects/dapr/', ['durable-agent-execution'], 336),
  createArchitectureSource('etsi-eni', 'ETSI', 'networking', 'https://www.etsi.org/technical-groups/eni/', ['federated-continuum', 'intent-closed-loop'], 336),
  createArchitectureSource('ietf-rfcs', 'IETF', 'integration', 'https://www.ietf.org/process/rfcs/', ['protocol-neutral-interoperability'], 336),
  createArchitectureSource('nist-iot', 'NIST', 'iot', 'https://www.nist.gov/itl/applied-cybersecurity/nist-cybersecurity-iot-program', ['iot-device-boundaries'], 336),
  createArchitectureSource('etsi-edge', 'ETSI', 'edge', 'https://www.etsi.org/technologies/multi-access-edge-computing', ['edge-degradation'], 336),
  createArchitectureSource('nist-blockchain', 'NIST', 'blockchain', 'https://csrc.nist.gov/pubs/ir/8202/final', ['selective-trust-anchoring'], 336),
  createArchitectureSource('iso-42001', 'ISO', 'governance', 'https://www.iso.org/standard/42001', ['ai-management-system'], 336),
  createArchitectureSource('w3c-vc', 'W3C', 'emerging-technology', 'https://www.w3.org/TR/vc-data-model-2.0/', ['verifiable-credentials'], 336),
  createArchitectureSource('owasp-agent-control', 'OWASP', 'cybersecurity', 'https://genai.owasp.org/resource/agent-control-standard-acs/', ['runtime-agent-controls'], 336),
  createArchitectureSource('owasp-agentic-asi01', 'OWASP GenAI Security Project', 'cybersecurity', 'https://raw.githubusercontent.com/GenAI-Security-Project/translations/main/owasp-top-10-for-agentic-applications-2026-12-6-1/_source/ASI01_Agent_Goal_Hijack.md', ['owasp-agentic-asi01'], 336),
  createArchitectureSource('owasp-agentic-asi02', 'OWASP GenAI Security Project', 'cybersecurity', 'https://raw.githubusercontent.com/GenAI-Security-Project/translations/main/owasp-top-10-for-agentic-applications-2026-12-6-1/_source/ASI02_Tool_Misuse_and_Exploitation.md', ['owasp-agentic-asi02'], 336),
  createArchitectureSource('owasp-agentic-asi03', 'OWASP GenAI Security Project', 'cybersecurity', 'https://raw.githubusercontent.com/GenAI-Security-Project/translations/main/owasp-top-10-for-agentic-applications-2026-12-6-1/_source/ASI03_Identity_and_Privilege_Abuse.md', ['owasp-agentic-asi03'], 336),
  createArchitectureSource('owasp-agentic-asi04', 'OWASP GenAI Security Project', 'cybersecurity', 'https://raw.githubusercontent.com/GenAI-Security-Project/translations/main/owasp-top-10-for-agentic-applications-2026-12-6-1/_source/ASI04_Agentic_Supply_Chain_Vulnerabilities.md', ['owasp-agentic-asi04'], 336),
  createArchitectureSource('owasp-agentic-asi05', 'OWASP GenAI Security Project', 'cybersecurity', 'https://raw.githubusercontent.com/GenAI-Security-Project/translations/main/owasp-top-10-for-agentic-applications-2026-12-6-1/_source/ASI05_Unexpected_Code_Execution_RCE.md', ['owasp-agentic-asi05'], 336),
  createArchitectureSource('owasp-agentic-asi06', 'OWASP GenAI Security Project', 'cybersecurity', 'https://raw.githubusercontent.com/GenAI-Security-Project/translations/main/owasp-top-10-for-agentic-applications-2026-12-6-1/_source/ASI06_Memory_Context_Poisoning.md', ['owasp-agentic-asi06'], 336),
  createArchitectureSource('owasp-agentic-asi07', 'OWASP GenAI Security Project', 'cybersecurity', 'https://raw.githubusercontent.com/GenAI-Security-Project/translations/main/owasp-top-10-for-agentic-applications-2026-12-6-1/_source/ASI07_Insecure_Inter_Agent_Communication.md', ['owasp-agentic-asi07'], 336),
  createArchitectureSource('owasp-agentic-asi08', 'OWASP GenAI Security Project', 'cybersecurity', 'https://raw.githubusercontent.com/GenAI-Security-Project/translations/main/owasp-top-10-for-agentic-applications-2026-12-6-1/_source/ASI08_Cascading_Failures.md', ['owasp-agentic-asi08'], 336),
  createArchitectureSource('owasp-agentic-asi09', 'OWASP GenAI Security Project', 'cybersecurity', 'https://raw.githubusercontent.com/GenAI-Security-Project/translations/main/owasp-top-10-for-agentic-applications-2026-12-6-1/_source/ASI09_Human_Agent_Trust_Exploitation.md', ['owasp-agentic-asi09'], 336),
  createArchitectureSource('owasp-agentic-asi10', 'OWASP GenAI Security Project', 'cybersecurity', 'https://raw.githubusercontent.com/GenAI-Security-Project/translations/main/owasp-top-10-for-agentic-applications-2026-12-6-1/_source/ASI10_Rogue_Agents.md', ['owasp-agentic-asi10'], 336),
  createArchitectureSource('mitre-atlas', 'MITRE', 'cybersecurity', 'https://atlas.mitre.org/', ['adversarial-ai-controls'], 336),
  createArchitectureSource('nist-token-protection', 'NIST', 'cybersecurity', 'https://www.nist.gov/publications/protecting-tokens-and-assertions-forgery-theft-and-misuse-implementation', ['token-lifecycle-protection'], 336),
  createArchitectureSource('otel-genai-agents', 'OpenTelemetry', 'observability', 'https://github.com/open-telemetry/semantic-conventions-genai', ['genai-agent-telemetry'], 336),
  createArchitectureSource('finops-focus-1-4', 'FinOps Foundation', 'finops', 'https://focus.finops.org/docs/specification/v1-4/', ['cost-outcome-accounting'], 336),
  createArchitectureSource('nist-zero-trust', 'NIST', 'networking', 'https://csrc.nist.gov/pubs/sp/800/207/final', ['zero-trust-resource-access'], 336),
  createArchitectureSource('nist-traceability', 'NIST', 'data', 'https://csrc.nist.gov/pubs/ir/8536/final', ['provenance-graph'], 336),
  { id: 'opengroup-togaf', authority: 'The Open Group', domain: 'enterprise-architecture', url: 'https://www.opengroup.org/togaf', patternIds: ['enterprise-architecture-traceability'], cadenceHours: 336 },
  { id: 'ietf-oauth-security', authority: 'IETF', domain: 'cybersecurity', url: 'https://datatracker.ietf.org/doc/html/rfc9700', patternIds: ['oauth-security-best-practice'], cadenceHours: 336 },
  { id: 'ietf-http-problem-details', authority: 'IETF', domain: 'integration', url: 'https://datatracker.ietf.org/doc/html/rfc9457', patternIds: ['standard-api-error-contracts'], cadenceHours: 336 },
  { id: 'slsa-v1-2', authority: 'SLSA', domain: 'software', url: 'https://slsa.dev/spec/v1.2/', patternIds: ['build-provenance'], cadenceHours: 336 },
  { id: 'openssf-scorecard', authority: 'OpenSSF', domain: 'software', url: 'https://securityscorecards.dev/', patternIds: ['open-source-supply-chain-risk'], cadenceHours: 336 },
  { id: 'google-sre-workbook', authority: 'Google SRE', domain: 'reliability', url: 'https://sre.google/workbook/table-of-contents/', patternIds: ['slo-error-budget-release-gates'], cadenceHours: 336 }
];

const definePattern = (
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

/** Shared OWASP ASI metadata keeps source-derived control mappings consistent. */
const OWASP_AGENTIC_PATTERN_INPUTS = [
  { id: 'owasp-agentic-asi01', label: 'ASI01', title: 'OWASP ASI01 — Agent Goal Hijack', controlIds: ['AI-01','SEC-01','POL-01','EVID-01'], keywords: ['goal hijack','task selection','decision pathways','prompt-based manipulation','deceptive tool outputs'] },
  { id: 'owasp-agentic-asi02', label: 'ASI02', title: 'OWASP ASI02 — Tool Misuse and Exploitation', controlIds: ['SEC-01','AUTH-01','POL-01','REL-01','OBS-01'], keywords: ['tool misuse','legitimate tools','unsafe delegation','data exfiltration','workflow hijacking'] },
  { id: 'owasp-agentic-asi03', label: 'ASI03', title: 'OWASP ASI03 — Identity and Privilege Abuse', controlIds: ['AUTH-01','FED-01','POL-01','EVID-01'], keywords: ['identity and privilege abuse','delegation chains','cached credentials','least privilege','agent-to-agent trust'] },
  { id: 'owasp-agentic-asi04', label: 'ASI04', title: 'OWASP ASI04 — Agentic Supply Chain Vulnerabilities', controlIds: ['SUPPLY-01','EVID-01','SEC-01','FED-01'], keywords: ['agentic supply chain vulnerabilities','third parties','model weights','MCP','A2A','update channels'] },
  { id: 'owasp-agentic-asi05', label: 'ASI05', title: 'OWASP ASI05 — Unexpected Code Execution', controlIds: ['SEC-01','POL-01','REL-01'], keywords: ['unexpected code execution','remote code execution','RCE','generated code','sandbox escape'] },
  { id: 'owasp-agentic-asi06', label: 'ASI06', title: 'OWASP ASI06 — Memory and Context Poisoning', controlIds: ['EVID-01','SEC-01','POL-01'], keywords: ['memory and context poisoning','stored and retrievable information','persistent corruption','RAG stores','conversation history'] },
  { id: 'owasp-agentic-asi07', label: 'ASI07', title: 'OWASP ASI07 — Insecure Inter-Agent Communication', controlIds: ['FED-01','AUTH-01','SEC-01','OBS-01'], keywords: ['insecure inter-agent communication','authentication','integrity','confidentiality','authorization','spoof'] },
  { id: 'owasp-agentic-asi08', label: 'ASI08', title: 'OWASP ASI08 — Cascading Failures', controlIds: ['REL-01','OBS-01','POL-01'], keywords: ['cascading failures','fault propagates','fan-out','feedback loops','queue storms'] },
  { id: 'owasp-agentic-asi09', label: 'ASI09', title: 'OWASP ASI09 — Human-Agent Trust Exploitation', controlIds: ['GOV-01','POL-01','EVID-01'], keywords: ['human-agent trust exploitation','over-rely','automation bias','perceived authority','human oversight'] },
  { id: 'owasp-agentic-asi10', label: 'ASI10', title: 'OWASP ASI10 — Rogue Agents', controlIds: ['GOV-01','SEC-01','OBS-01','POL-01'], keywords: ['rogue agents','deviate from their intended function','behavioral integrity','containment gap','unauthorized actions'] },
] as const;
const PATTERN_DEFINITIONS: PatternDefinition[] = [
  definePattern('cross-cutting-cloud-controls', 'Cross-cutting architecture controls', 'cloud', 'aws-well-architected', 'Treat operational excellence, security, reliability, performance and cost as architecture concerns.', 'GEAS architecture evidence and drift model', ['REL-01', 'SEC-01', 'FIN-01'], ['security', 'reliability', 'cost']),
  definePattern('ai-lifecycle-risk', 'Continuous AI risk lifecycle', 'ai', 'nist-ai-rmf', 'Manage AI trustworthiness and risk across design, development, use and evaluation.', 'GEAS + AI impact assessment', ['AI-01', 'GOV-01'], ['risk', 'design', 'development', 'evaluation']),
  definePattern(
    'ai-governance-lifecycle',
    'AI risk governance lifecycle',
    'governance',
    'nist-ai-rmf-playbook',
    'Use the NIST AI RMF Playbook to structure AI risk governance across the Govern, Map, Measure and Manage functions.',
    'GEAS governance evidence: named risk ownership, impact/context mapping, measurement, risk treatment, monitoring and continual improvement. The Playbook is voluntary guidance; it does not establish GLORIFIER implementation or conformance.',
    ['AI-01', 'GOV-01', 'POL-01', 'EVID-01'],
    ['four AI RMF functions', 'Govern 1.1', 'governance and oversight', 'risk management'],
  ),
  definePattern('agent-identity-delegation', 'Agent identity and authorization', 'ai', 'nist-ai-agents', 'Treat agent identity, authorization, auditing and non-repudiation as explicit architecture concerns.', 'Agent Identity + Delegation Plane', ['SEC-01', 'AUTH-01'], ['identity', 'authorization', 'auditing', 'agent']),
  definePattern('identity-risk-controls', 'Risk-based cybersecurity controls', 'cybersecurity', 'nist-csf', 'Organize cybersecurity outcomes around governance, identification, protection, detection, response and recovery.', 'GEAS security control crosswalk', ['SEC-01', 'REL-01'], ['governance', 'identify', 'protect', 'detect', 'respond', 'recover']),
  definePattern('software-supply-chain', 'Secure software supply chain', 'software', 'nist-ssdf', 'Integrate secure software practices throughout the software development lifecycle.', 'Code Sentinel + provenance graph + release gates', ['SUPPLY-01', 'POL-01'], ['software', 'secure', 'development', 'supply chain']),
  definePattern('vendor-neutral-telemetry', 'Common telemetry semantics', 'observability', 'opentelemetry-semconv', 'Use common semantic conventions so telemetry can be correlated across systems.', 'Agent observability + evidence graph', ['OBS-01'], ['semantic conventions', 'telemetry', 'traces', 'metrics']),
  definePattern('evidence-minimization', 'Sensitive telemetry minimization', 'observability', 'opentelemetry-semconv', 'Treat telemetry data as potentially sensitive and apply redaction and retention controls.', 'Evidence minimization policy', ['EVID-01'], ['sensitive', 'redact', 'privacy']),
  definePattern('cost-outcome-accounting', 'Standardized cost and usage accounting', 'finops', 'finops-focus', 'Normalize technology cost and usage data so architecture and economic decisions can be compared.', 'Revenue Control Plane + cost-per-verified-outcome', ['FIN-01'], ['cost', 'usage', 'standard']),
  definePattern('policy-as-code', 'Declarative policy enforcement', 'platform-engineering', 'cncf-kyverno', 'Encode guardrails as versioned policies and enforce them at platform control points.', 'GEAS policy engine + deployment gates', ['POL-01'], ['policy', 'enforce']),
  definePattern('durable-agent-execution', 'Durable agent execution', 'reliability', 'cncf-dapr-agents', 'Use durable state and recovery patterns for long-running agent workflows.', 'Daemon + durable work coordinator', ['REL-01', 'STATE-01'], ['durable', 'state', 'recovery', 'workflow']),
  definePattern('federated-continuum', 'Federated cloud-network-edge-device continuum', 'networking', 'etsi-eni', 'Use semantic interoperability and common information models across network, edge and compute domains.', 'Connection Registry + provider-neutral orchestration', ['FED-01'], ['interoperability', 'common information', 'edge']),
  definePattern('intent-closed-loop', 'Intent-driven closed-loop automation', 'networking', 'etsi-eni', 'Translate high-level intent into policy-driven automated actions with assurance.', 'GEAS policy → governed execution + verification', ['POL-01', 'GOV-01'], ['intent', 'policy', 'automated', 'assurance']),
  definePattern('protocol-neutral-interoperability', 'Protocol-neutral interoperability', 'integration', 'ietf-rfcs', 'Prefer explicit, versioned protocols and interoperable interfaces over provider-specific coupling.', 'A2A/MCP/API adapters + capability registry', ['FED-01'], ['protocol', 'interoperability', 'interface']),
  definePattern('iot-device-boundaries', 'Explicit IoT device security boundaries', 'iot', 'nist-iot', 'Treat device identity, security capabilities and lifecycle boundaries as explicit controls.', 'Device identity + capability + lifecycle governance', ['SEC-01'], ['device', 'identity', 'lifecycle']),
  definePattern('edge-degradation', 'Edge graceful degradation', 'edge', 'etsi-edge', 'Design edge systems around constrained connectivity, locality and resilient operation.', 'Degraded-mode contracts', ['REL-01', 'FED-01'], ['edge', 'connectivity', 'resilience']),
  definePattern('selective-trust-anchoring', 'Selective distributed trust anchoring', 'blockchain', 'nist-blockchain', 'Use distributed ledger concepts selectively where multi-party integrity or provenance requires them.', 'Optional external receipt/proof anchoring', ['EVID-01'], ['blockchain', 'distributed', 'ledger', 'trust']),
  definePattern('ai-management-system', 'AI management system', 'governance', 'iso-42001', 'Establish and continually improve a management system for responsible AI governance.', 'GEAS governance lifecycle + audit evidence', ['AI-01', 'GOV-01'], ['management system', 'AI', 'continuous', 'governance']),
  definePattern('verifiable-credentials', 'Machine-verifiable credentials', 'emerging-technology', 'w3c-vc', 'Use cryptographically secure, privacy-respecting, machine-verifiable credentials where portable trust is required.', 'Future portable agent/provider credentials', ['AUTH-01', 'EVID-01'], ['verifiable', 'credential', 'cryptographic']),
  definePattern('runtime-agent-controls', 'Runtime agent control hooks', 'cybersecurity', 'owasp-agent-control', 'Expose inspectable, traceable and enforceable runtime controls for agents.', 'GEAS runtime policy adapters', ['SEC-01', 'POL-01', 'OBS-01'], ['agent', 'runtime', 'control', 'traceable']),
  ...OWASP_AGENTIC_PATTERN_INPUTS.map((risk) => definePattern(
    risk.id,
    risk.title,
    'cybersecurity' as const,
    risk.id,
    `Analyze the ${risk.label} threat class from its dedicated OWASP source document. A source match is not evidence that the threat is present in GLORIFIER.`,
    'Map the threat to GEAS control recommendations and require separate implementation, runtime, and independent verification evidence before making a conformance claim.',
    [...risk.controlIds],
    [...risk.keywords],
  )),
  definePattern('adversarial-ai-controls', 'Adversarial AI threat-informed controls', 'cybersecurity', 'mitre-atlas', 'Use threat-informed adversarial AI knowledge to identify and prioritize defensive controls.', 'Code Sentinel + agent threat model', ['SEC-01'], ['attack', 'adversarial', 'machine learning']),
  definePattern('provenance-graph', 'Cryptographically linked provenance', 'data', 'nist-traceability', 'Link traceability events into a verifiable provenance chain while enabling selective disclosure.', 'Evidence Graph + provider/model/software provenance', ['EVID-01', 'SUPPLY-01'], ['provenance', 'traceability', 'cryptographic', 'selective disclosure']),
  definePattern('token-lifecycle-protection', 'Token lifecycle protection', 'cybersecurity', 'nist-token-protection', 'Protect tokens and assertions against forgery, theft and misuse with verification, key management and lifecycle controls.', 'Token lifecycle contract + GEAS authorization gates', ['AUTH-01', 'SEC-01'], ['token', 'assertion', 'verification', 'key management']),
  definePattern('genai-agent-telemetry', 'GenAI agent telemetry semantics', 'observability', 'otel-genai-agents', 'Use common spans and attributes for agent creation, invocation, planning and tool execution.', 'Versioned GEAS agent telemetry contract', ['OBS-01', 'EVID-01'], ['agent', 'invoke', 'tool', 'span']),
  definePattern('zero-trust-resource-access', 'Resource-centric zero trust access', 'networking', 'nist-zero-trust', 'Authenticate and authorize subjects and devices before resource access without implicit trust from network location.', 'Per-resource GEAS capability and authorization gates', ['SEC-01', 'AUTH-01'], ['zero trust', 'resource', 'authorization', 'authentication']),
  definePattern('federated-data-access', 'Federated data access', 'data', 'google-architecture', 'Use fit-for-purpose governed data access rather than assuming all workloads require centralized movement.', 'Data governance + provider-neutral connectors', ['DATA-01'], ['data', 'access', 'architecture']),
  definePattern('enterprise-architecture-traceability', 'Enterprise architecture traceability', 'enterprise-architecture', 'opengroup-togaf', 'Link business, information, application and technology architecture decisions to governed outcomes and traceable change.', 'GEAS architecture baseline and five-state reconciliation', ['TRACE-01', 'GOV-01'], ['architecture', 'capability', 'governance', 'traceability']),
  definePattern('oauth-security-best-practice', 'OAuth security best current practice', 'cybersecurity', 'ietf-oauth-security', 'Apply current OAuth security guidance including constrained authorization flows, secure redirect handling and token misuse defenses.', 'GEAS identity, delegation, audience and token lifecycle controls', ['AUTH-01', 'SEC-01'], ['OAuth', 'authorization', 'token', 'security']),
  definePattern('standard-api-error-contracts', 'Standard API error contracts', 'integration', 'ietf-http-problem-details', 'Use a consistent machine-readable HTTP API error representation without exposing sensitive implementation details.', 'Versioned API adapters and sanitized operational diagnostics', ['FED-01', 'OBS-01'], ['problem details', 'HTTP API', 'status', 'error']),
  definePattern('build-provenance', 'Verifiable build provenance', 'software', 'slsa-v1-2', 'Generate and verify provenance that identifies how software artifacts were built and which trusted process produced them.', 'Release evidence graph and artifact provenance gates', ['SUPPLY-01', 'EVID-01'], ['provenance', 'build', 'artifact', 'builder']),
  definePattern('open-source-supply-chain-risk', 'Open-source supply-chain risk signals', 'software', 'openssf-scorecard', 'Use transparent, repeatable security health checks as one signal in dependency and repository risk assessment.', 'Dependency review and repository security posture evidence', ['SUPPLY-01', 'SEC-01'], ['scorecard', 'security', 'dependency', 'branch protection']),
  definePattern('slo-error-budget-release-gates', 'SLO and error-budget release gates', 'reliability', 'google-sre-workbook', 'Use service-level objectives and error-budget policy to balance reliability with release velocity.', 'Release gates tied to verified service health and reliability evidence', ['REL-01', 'GOV-01'], ['SLO', 'error budget', 'release', 'reliability']),
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

export const stripHtml = (input: string): string => input
  .replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, ' and ')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim();

export const isClaimSupportedEvidence = (status: EvidenceStatus): boolean =>
  status === 'claim-supported';

export const classifyArchitectureEvidence = (status: EvidenceStatus): EvidenceClass =>
  status === 'claim-supported' ? 'observed-fact' : 'analysis';

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const isValidMonth = (month: number): boolean => month >= 1 && month <= 12;

const daysInCalendarMonth = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  const daysInMonth = [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return daysInMonth[month - 1] ?? 0;
};

const isValidCalendarDate = (year: number, month: number, day: number): boolean =>
  isValidMonth(month) && day >= 1 && day <= daysInCalendarMonth(year, month);

const isValidClockTime = (hour: number, minute: number, second: number): boolean =>
  hour <= 23 && minute <= 59 && second <= 59;

const isKnownUtcOffset = (offset: string): boolean => {
  if (offset === '-00:00') return false;
  if (offset === 'Z') return true;
  const [offsetHour, offsetMinute] = offset.slice(1).split(':').map(Number);
  return offsetHour <= 23 && offsetMinute <= 59;
};

const isValidSourceObservationTimestamp = (match: RegExpExecArray): boolean => {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  return isValidCalendarDate(year, month, day)
    && isValidClockTime(hour, minute, second)
    && isKnownUtcOffset(match[8]);
};

const parseSourceObservationTimestampText = (value: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !isValidSourceObservationTimestamp(match)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

/** Accept PostgreSQL TIMESTAMPTZ Date objects and the canonical persisted RFC 3339 text form. */
const parseSourceObservationTimestamp = (value: unknown): number | null => {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  return typeof value === 'string' ? parseSourceObservationTimestampText(value) : null;
};

const isValidSourceCadence = (cadenceHours: number, nowMs: number): boolean =>
  Number.isFinite(cadenceHours) && cadenceHours > 0 && Number.isFinite(nowMs);

const isSourceObservationExpired = (observedMs: number, cadenceHours: number, nowMs: number): boolean =>
  observedMs > nowMs || nowMs - observedMs >= cadenceHours * 60 * 60 * 1000;

export const isSourceObservationDue = (
  cadenceHours: number,
  observedAt: string | Date | null | undefined,
  nowMs = Date.now(),
): boolean => {
  if (!isValidSourceCadence(cadenceHours, nowMs)) return true;
  const observedMs = parseSourceObservationTimestamp(observedAt);
  return observedMs === null || isSourceObservationExpired(observedMs, cadenceHours, nowMs);
};

const FAILED_SOURCE_RETRY_HOURS = 1;

type CachedSourceEvidence = {
  ok: boolean;
  status: number | null;
  contentHash: string | null;
  evidenceExcerpt: string | null;
  evidenceStatus: string;
};

const isSuccessfulHttpStatus = (status: number | null): boolean =>
  Number.isInteger(status) && status !== null
    && ((status >= 200 && status < 300) || status === 304);

const hasValidSha256ContentHash = (contentHash: string | null): boolean =>
  typeof contentHash === 'string' && /^[a-f0-9]{64}$/i.test(contentHash);

const isValidContentMatchedExcerpt = (excerpt: string | null): boolean =>
  typeof excerpt === 'string' && excerpt.trim().length > 0;

const isValidSourceAvailableExcerpt = (excerpt: string | null): boolean =>
  excerpt === null || excerpt.trim().length === 0;

const isValidSuccessfulEvidenceShape = (input: CachedSourceEvidence): boolean =>
  (input.evidenceStatus === 'content-matched' && isValidContentMatchedExcerpt(input.evidenceExcerpt))
  || (input.evidenceStatus === 'source-available' && isValidSourceAvailableExcerpt(input.evidenceExcerpt));

const isAdmissibleSuccessfulCache = (input: CachedSourceEvidence): boolean =>
  isSuccessfulHttpStatus(input.status)
  && hasValidSha256ContentHash(input.contentHash)
  && isValidSuccessfulEvidenceShape(input);

const isAllowedFailedHttpStatus = (status: number | null): boolean =>
  status === null || (Number.isInteger(status) && !(status >= 200 && status < 300));

const isAdmissibleFailedCache = (input: CachedSourceEvidence): boolean => {
  if (input.evidenceStatus !== 'not-observed' && input.evidenceStatus !== 'unavailable') return false;
  if (!isAllowedFailedHttpStatus(input.status)) return false;
  return input.evidenceStatus !== 'not-observed' || input.status !== null;
};

const isAdmissibleCachedSourceObservation = (input: CachedSourceEvidence): boolean =>
  input.ok ? isAdmissibleSuccessfulCache(input) : isAdmissibleFailedCache(input);

const isMatchingCachedSourceUrl = (configuredUrl: string, cachedUrl: string | null | undefined): boolean =>
  typeof cachedUrl === 'string' && cachedUrl === configuredUrl;

const isFailedObservationRetryDue = (
  ok: boolean,
  observedAt: string | Date | null | undefined,
  nowMs: number,
): boolean => !ok && isSourceObservationDue(FAILED_SOURCE_RETRY_HOURS, observedAt, nowMs);

export const shouldReuseSourceObservation = (input: {
  configuredUrl: string;
  cachedUrl: string | null | undefined;
  ok: boolean;
  status: number | null;
  contentHash: string | null;
  evidenceExcerpt: string | null;
  evidenceStatus: string;
  cadenceHours: number;
  observedAt: string | Date | null | undefined;
  nowMs?: number;
}): boolean => {
  if (!isMatchingCachedSourceUrl(input.configuredUrl, input.cachedUrl)
      || !isAdmissibleCachedSourceObservation(input)) return false;
  const nowMs = input.nowMs ?? Date.now();
  return !isFailedObservationRetryDue(input.ok, input.observedAt, nowMs)
    && !isSourceObservationDue(input.cadenceHours, input.observedAt, nowMs);
};

const cachedSourceEvidence = (cached: CachedSourceObservation): CachedSourceEvidence => ({
  ok: cached.ok,
  status: cached.status,
  contentHash: cached.content_hash,
  evidenceExcerpt: cached.evidence_excerpt,
  evidenceStatus: cached.evidence_status,
});

const hasCurrentCacheObservationTimestamp = (cachedAt: number | null, nowMs: number): boolean =>
  Number.isFinite(nowMs) && cachedAt !== null && cachedAt <= nowMs;

const isConditionalRequestCacheUsable = (
  configuredUrl: string,
  cached: CachedSourceObservation,
  nowMs: number,
): boolean =>
  cached.source_url === configuredUrl
  && cached.ok
  && isAdmissibleCachedSourceObservation(cachedSourceEvidence(cached))
  && hasCurrentCacheObservationTimestamp(parseSourceObservationTimestamp(cached.observed_at), nowMs);

export const buildConditionalRequestHeaders = (
  configuredUrl: string,
  cached?: CachedSourceObservation | null,
  nowMs = Date.now(),
): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (!cached || !isConditionalRequestCacheUsable(configuredUrl, cached, nowMs)) return headers;
  if (cached.etag?.trim()) headers['If-None-Match'] = cached.etag;
  if (cached.last_modified?.trim()) headers['If-Modified-Since'] = cached.last_modified;
  return headers;
};

export interface SourceFetchContext {
  /** One clock snapshot shared by conditional request construction and 304 cache validation. */
  nowMs: number;
  observedAt: string;
  conditionalHeaders: Record<string, string>;
}

export const createSourceFetchContext = (
  sourceUrl: string,
  cached?: CachedSourceObservation | null,
  nowMs = Date.now(),
): SourceFetchContext => {
  if (!Number.isFinite(nowMs)) throw new TypeError('source fetch clock must be a finite timestamp');
  return {
    nowMs,
    observedAt: new Date(nowMs).toISOString(),
    conditionalHeaders: buildConditionalRequestHeaders(sourceUrl, cached, nowMs),
  };
};

const isCachedObservationForSource = (
  source: Pick<ArchitectureSource, 'url'>,
  cached: CachedSourceObservation,
  finalUrl: string,
): boolean =>
  cached.source_url === source.url
  && cached.ok
  && isAdmissibleCachedSourceObservation(cachedSourceEvidence(cached))
  && typeof cached.final_url === 'string'
  && cached.final_url === finalUrl;

const isMonotonicObservationWindow = (
  cachedAt: number | null,
  observedAt: number | null,
  nowMs: number,
): boolean =>
  Number.isFinite(nowMs)
  && cachedAt !== null
  && cachedAt <= nowMs
  && observedAt !== null
  && observedAt >= cachedAt
  && observedAt <= nowMs;

const buildRevalidatedSourceObservation = (
  source: Pick<ArchitectureSource, 'id'>,
  cached: CachedSourceObservation,
  response: { finalUrl: string; etag: string | null; lastModified: string | null },
  observedAt: string,
): SourceObservation => ({
  sourceId: source.id,
  ok: true,
  status: 304,
  contentHash: cached.content_hash,
  observedAt,
  finalUrl: response.finalUrl,
  etag: response.etag ?? cached.etag ?? null,
  lastModified: response.lastModified ?? cached.last_modified ?? null,
  revalidatedNotModified: true,
  evidenceExcerpt: cached.evidence_excerpt,
  evidenceStatus: cached.evidence_status,
});

export const reuseNotModifiedSourceObservation = (
  source: Pick<ArchitectureSource, 'id' | 'url'>,
  cached: CachedSourceObservation | null | undefined,
  response: { finalUrl: string; etag: string | null; lastModified: string | null },
  observedAt: string,
  nowMs = Date.now(),
): SourceObservation | null => {
  if (!cached || !isCachedObservationForSource(source, cached, response.finalUrl)) return null;
  const timeWindowIsValid = isMonotonicObservationWindow(
    parseSourceObservationTimestamp(cached.observed_at),
    parseSourceObservationTimestamp(observedAt),
    nowMs,
  );
  return timeWindowIsValid
    ? buildRevalidatedSourceObservation(source, cached, response, observedAt)
    : null;
};

const findEarliestKeywordIndex = (text: string, keywords: string[]): number => {
  const lower = text.toLowerCase();
  let firstIndex = -1;
  for (const keyword of keywords) {
    const matchIndex = lower.indexOf(keyword.toLowerCase());
    if (matchIndex >= 0 && (firstIndex < 0 || matchIndex < firstIndex)) firstIndex = matchIndex;
  }
  return firstIndex;
};

const createEvidenceExcerpt = (text: string, matchIndex: number): string =>
  text.slice(Math.max(0, matchIndex - 240), Math.min(text.length, matchIndex + 760)).trim();

const extractEvidence = (body: string, keywords: string[]): string | null => {
  const text = stripHtml(body);
  const matchIndex = findEarliestKeywordIndex(text, keywords);
  return matchIndex < 0 ? null : createEvidenceExcerpt(text, matchIndex);
};

const SOURCE_MAX_BYTES = 2 * 1024 * 1024;
const SOURCE_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const validateCuratedSourceUrl = (sourceUrl: string): URL => {
  const originalUrl = new URL(sourceUrl);
  if (originalUrl.protocol !== 'https:' || originalUrl.username || originalUrl.password) {
    throw new Error('curated source URL must use HTTPS without embedded credentials');
  }
  return originalUrl;
};

const isSafeCuratedRedirectTarget = (nextUrl: URL, originalUrl: URL): boolean =>
  nextUrl.protocol === 'https:'
  && nextUrl.hostname === originalUrl.hostname
  && !nextUrl.username
  && !nextUrl.password
  && (!nextUrl.port || nextUrl.port === '443');

const resolveCuratedRedirectTarget = async (
  response: Response,
  requestUrl: URL,
  originalUrl: URL,
  redirects: number,
): Promise<URL> => {
  const location = response.headers.get('location');
  await response.body?.cancel();
  if (!location) throw new Error('source redirect is missing a Location header');
  if (redirects === 10) throw new Error('source redirect limit exceeded');

  const nextUrl = new URL(location, requestUrl);
  if (!isSafeCuratedRedirectTarget(nextUrl, originalUrl)) {
    throw new Error('source redirect rejected: target must remain HTTPS on the curated hostname');
  }
  return nextUrl;
};

const fetchCuratedRedirectChain = async (
  originalUrl: URL,
  signal: AbortSignal,
  conditionalHeaders: Record<string, string>,
): Promise<{ response: Response; requestUrl: URL }> => {
  let requestUrl = originalUrl;
  for (let redirects = 0; redirects <= 10; redirects += 1) {
    const response = await fetch(requestUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'GLORIFIER-GEAS-Architecture-Scientist/2.0',
        Accept: 'text/html,application/xhtml+xml,text/plain',
        ...conditionalHeaders,
      },
      signal,
    });
    if (!SOURCE_REDIRECT_STATUSES.has(response.status)) return { response, requestUrl };
    requestUrl = await resolveCuratedRedirectTarget(response, requestUrl, originalUrl, redirects);
  }
  throw new Error('source redirect limit exceeded or no response returned');
};

const validateCuratedFinalUrl = (response: Response, requestUrl: URL, originalUrl: URL): URL => {
  const finalUrl = new URL(response.url || requestUrl.toString());
  if (finalUrl.protocol !== 'https:' || finalUrl.hostname !== originalUrl.hostname) {
    throw new Error('source redirect rejected: final host/protocol differs from curated source');
  }
  return finalUrl;
};

const readBoundedResponseBytes = async (response: Response): Promise<Uint8Array> => {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > SOURCE_MAX_BYTES) {
    await response.body?.cancel();
    throw new Error('source response exceeds 2 MiB limit');
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > SOURCE_MAX_BYTES) {
      await reader.cancel();
      throw new Error('source response exceeds 2 MiB limit');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const fetchCuratedSource = async (
  sourceUrl: string,
  signal: AbortSignal,
  conditionalHeaders: Record<string, string> = {},
): Promise<{ response: Response; finalUrl: URL; body: string }> => {
  const originalUrl = validateCuratedSourceUrl(sourceUrl);
  const { response, requestUrl } = await fetchCuratedRedirectChain(originalUrl, signal, conditionalHeaders);
  const finalUrl = validateCuratedFinalUrl(response, requestUrl, originalUrl);
  const body = response.status === 304
    ? ''
    : new TextDecoder().decode(await readBoundedResponseBytes(response));
  return { response, finalUrl, body };
};

const fetchSource = async (source: ArchitectureSource, cached?: CachedSourceObservation | null): Promise<SourceObservation> => {
  const fetchContext = createSourceFetchContext(source.url, cached);
  const { nowMs, observedAt, conditionalHeaders } = fetchContext;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const { response, finalUrl, body } = await fetchCuratedSource(
      source.url,
      controller.signal,
      conditionalHeaders,
    );
    if (response.status === 304) {
      const revalidated = reuseNotModifiedSourceObservation(
        source,
        cached,
        {
          finalUrl: finalUrl.toString(),
          etag: response.headers.get('etag'),
          lastModified: response.headers.get('last-modified'),
        },
        observedAt,
        nowMs,
      );
      if (revalidated) return revalidated;
      return {
        sourceId: source.id,
        ok: false,
        status: 304,
        contentHash: null,
        observedAt,
        finalUrl: finalUrl.toString(),
        evidenceExcerpt: null,
        evidenceStatus: 'unavailable',
        error: 'source returned 304 without valid cached evidence for the exact configured URL',
      };
    }
    const normalizedText = stripHtml(body);
    const contentHash = createHash('sha256').update(normalizedText).digest('hex');
    const keywords = PATTERN_DEFINITIONS
      .filter((pattern) => pattern.sourceId === source.id)
      .flatMap((pattern) => pattern.keywords);
    const excerpt = response.ok ? extractEvidence(body, keywords) : null;
    return {
      sourceId: source.id,
      ok: response.ok,
      status: response.status,
      contentHash,
      observedAt,
      finalUrl: finalUrl.toString(),
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
  } finally {
    clearTimeout(timer);
  }
};

function observedPatterns(results: SourceObservation[], _scanCompletedAt: string): ArchitecturePattern[] {
  const map = new Map(results.map((result) => [result.sourceId, result]));
  return PATTERN_DEFINITIONS.flatMap((pattern) => {
    const source = map.get(pattern.sourceId);
    if (!source || !source.ok || !['content-matched', 'claim-supported'].includes(source.evidenceStatus) || !source.evidenceExcerpt) {
      return [] as ArchitecturePattern[];
    }
    return [{
      id: pattern.id,
      title: pattern.title,
      domain: pattern.domain,
      evidenceClass: source.evidenceStatus === 'claim-supported' ? 'observed-fact' : 'analysis',
      sourceId: source.sourceId,
      evidenceUrl: SOURCES.find((item) => item.id === source.sourceId)?.url ?? '',
      evidenceExcerpt: source.evidenceExcerpt,
      pattern: pattern.pattern,
      GLORIFIERMapping: pattern.GLORIFIERMapping,
      controlIds: pattern.controlIds,
      lastReviewed: source.observedAt,
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
      evidenceClass: classifyArchitectureEvidence(result.evidenceStatus),
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

const UNKNOWN_DRIFT_OBSERVATION = 'No fresh runtime comparison evidence was supplied to this baseline assessment; implementation state is UNKNOWN.';

const createUnknownDriftFinding = (
  id: string,
  controlId: string,
  severity: RiskLevel,
  intended: string,
  recommendation: string,
  createdAt: string,
): DriftFinding => ({
  id,
  controlId,
  status: 'unknown',
  severity,
  intended,
  observed: UNKNOWN_DRIFT_OBSERVATION,
  evidenceRefs: [],
  recommendation,
  createdAt,
});

const drift = (): DriftFinding[] => {
  const ts = new Date().toISOString();
  return [
    createUnknownDriftFinding(
      'drift-agent-identity',
      'AUTH-01',
      'high',
      'Agents have explicit identity, delegation scope, audience, expiration and revocation semantics.',
      'Adopt AgentIdentityContract for governed agent actions.',
      ts,
    ),
    createUnknownDriftFinding(
      'drift-telemetry-contract',
      'OBS-01',
      'medium',
      'Agent/model/tool/deployment/outcome events share stable correlation semantics.',
      'Adopt a versioned GEAS telemetry contract.',
      ts,
    ),
    createUnknownDriftFinding(
      'drift-evidence-minimization',
      'EVID-01',
      'medium',
      'Evidence has integrity, classification, retention and disclosure controls.',
      'Add classification, redaction, retention and selective-disclosure metadata.',
      ts,
    ),
    createUnknownDriftFinding(
      'drift-policy-enforcement',
      'POL-01',
      'medium',
      'Applicable policies are machine-evaluable before governed execution.',
      'Publish versioned policies and add enforcement adapters.',
      ts,
    ),
    createUnknownDriftFinding(
      'drift-provenance',
      'SUPPLY-01',
      'high',
      'Software, model, provider and deployment dependencies have traceable provenance.',
      'Link provider/model/software/deployment provenance into one evidence graph.',
      ts,
    ),
    createUnknownDriftFinding(
      'drift-finops',
      'FIN-01',
      'low',
      'Material architecture choices record cost, value and placement tradeoffs.',
      'Add normalized cost/usage attribution and verified-outcome correlation.',
      ts,
    ),
    createUnknownDriftFinding(
      'drift-daemon-ha',
      'STATE-01',
      'high',
      'Long-running governed work has durable ownership, checkpoint and recovery semantics.',
      'Evaluate durable lease/checkpoint coordination before claiming HA.',
      ts,
    ),
    createUnknownDriftFinding(
      'drift-architecture-reconciliation',
      'GOV-01',
      'high',
      'Desired, declared, deployed, observed and verified states are reconciled.',
      'Persist the five-state reconciliation and never infer compliance from missing evidence.',
      ts,
    ),
  ];
};

export const initializeGeasArchitectureScientist = async (): Promise<void> => {
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
      error TEXT,
      final_url TEXT,
      etag TEXT,
      last_modified TEXT,
      source_url TEXT
    );
    -- CREATE TABLE IF NOT EXISTS does not add columns to pre-existing legacy tables.
    -- Add every column consumed by GEAS reads/writes using safe, idempotent migrations.
    ALTER TABLE geas_source_observations ADD COLUMN IF NOT EXISTS status INTEGER;
    ALTER TABLE geas_source_observations ADD COLUMN IF NOT EXISTS content_hash TEXT;
    ALTER TABLE geas_source_observations ADD COLUMN IF NOT EXISTS evidence_status TEXT NOT NULL DEFAULT 'unavailable';
    ALTER TABLE geas_source_observations ADD COLUMN IF NOT EXISTS error TEXT;
    ALTER TABLE geas_source_observations ADD COLUMN IF NOT EXISTS evidence_excerpt TEXT;
    ALTER TABLE geas_source_observations ADD COLUMN IF NOT EXISTS final_url TEXT;
    ALTER TABLE geas_source_observations ADD COLUMN IF NOT EXISTS etag TEXT;
    ALTER TABLE geas_source_observations ADD COLUMN IF NOT EXISTS last_modified TEXT;
    ALTER TABLE geas_source_observations ADD COLUMN IF NOT EXISTS source_url TEXT;

    CREATE TABLE IF NOT EXISTS geas_architecture_evidence (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      source_url TEXT NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL,
      content_hash TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      evidence_class TEXT NOT NULL DEFAULT 'analysis',
      source_status INTEGER NOT NULL,
      pattern_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    );

    ALTER TABLE geas_architecture_evidence ALTER COLUMN evidence_class SET DEFAULT 'analysis';
    UPDATE geas_architecture_evidence SET evidence_class = 'analysis' WHERE evidence_class = 'observed-fact';

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
};

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

  try {
  const scanId = `geas-scan-${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const previous = new Map<string, { observed_at: string; ok: boolean; status: number | null; content_hash: string | null; evidence_excerpt: string | null; evidence_status: EvidenceStatus; error: string | null; final_url?: string | null; etag?: string | null; last_modified?: string | null; source_url?: string | null }>();
  if (persist) {
    try {
      const db = getPostgresPool();
      const prior = await db.query('SELECT source_id, observed_at, ok, status, content_hash, evidence_excerpt, evidence_status, error, final_url, etag, last_modified, source_url FROM geas_source_observations');
      for (const row of prior.rows) previous.set(String(row.source_id), row);
    } catch (error) {
      console.warn('[GEAS] source cadence cache unavailable; scanning all sources:', error instanceof Error ? error.message : error);
    }
  }
  const nowMs = Date.now();
  const sources = await Promise.all(SOURCES.map(async (source) => {
    const cached = previous.get(source.id);
    if (cached && shouldReuseSourceObservation({
      configuredUrl: source.url,
      cachedUrl: cached.source_url,
      ok: cached.ok,
      status: cached.status,
      contentHash: cached.content_hash,
      evidenceExcerpt: cached.evidence_excerpt,
      evidenceStatus: cached.evidence_status,
      cadenceHours: source.cadenceHours,
      observedAt: cached.observed_at,
      nowMs,
    })) {
      return {
        sourceId: source.id,
        ok: cached.ok,
        status: cached.status,
        contentHash: cached.content_hash,
        observedAt: new Date(cached.observed_at).toISOString(),
        reusedCachedObservation: true,
        finalUrl: cached.final_url ?? undefined,
        etag: cached.etag ?? null,
        lastModified: cached.last_modified ?? null,
        evidenceExcerpt: cached.evidence_excerpt,
        evidenceStatus: cached.evidence_status,
        error: cached.error ?? undefined,
      } satisfies SourceObservation;
    }
    return fetchSource(source, cached);
  }));
  const completedAt = new Date().toISOString();
  const patterns = observedPatterns(sources, completedAt);
  const evidence = buildEvidence(sources, patterns);
  const result: ArchitectureScanResult = {
    scanId,
    repositoryRevision: process.env.GITHUB_SHA ?? 'unknown',
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
    sourcePolicyVersion: 'GEAS-AUTHORITY-2',
  };

  if (persist) try {
    await initializeGeasArchitectureScientist();
    const db = getPostgresPool();
    await db.query('INSERT INTO geas_architecture_scans(scan_id, started_at, completed_at, result) VALUES($1, $2, $3, $4)', [scanId, startedAt, completedAt, result]);
    for (const source of sources) {
      await db.query(
        'INSERT INTO geas_source_observations(source_id, observed_at, ok, status, content_hash, evidence_excerpt, evidence_status, error, final_url, etag, last_modified, source_url) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT(source_id) DO UPDATE SET observed_at = EXCLUDED.observed_at, ok = EXCLUDED.ok, status = EXCLUDED.status, content_hash = EXCLUDED.content_hash, evidence_excerpt = EXCLUDED.evidence_excerpt, evidence_status = EXCLUDED.evidence_status, error = EXCLUDED.error, final_url = EXCLUDED.final_url, etag = EXCLUDED.etag, last_modified = EXCLUDED.last_modified, source_url = EXCLUDED.source_url',
        [source.sourceId, source.observedAt, source.ok, source.status, source.contentHash, source.evidenceExcerpt, source.evidenceStatus, source.error ?? null, source.finalUrl ?? null, source.etag ?? null, source.lastModified ?? null, SOURCES.find((candidate) => candidate.id === source.sourceId)?.url ?? null],
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

  return result;
  } finally {
    if (persist) await releaseArchitectureScanLease(ownerId);
  }
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
  const id = `finops-evidence-${createHash('sha256').update(JSON.stringify(contract)).digest('hex')}`;
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
    sourcePolicyVersion: 'GEAS-AUTHORITY-2',
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

  const configuredHours = Number(process.env.GEAS_ARCHITECTURE_SCAN_INTERVAL_HOURS ?? 1);
  const hours = Number.isFinite(configuredHours) ? Math.max(1, configuredHours) : 1;
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
