import { createHash, randomUUID } from 'node:crypto';
import { getPostgresPool } from '../db/postgres';
import { GLORIFIER_ARCHITECTURE_MODEL } from './glorifier-architecture';

export type ArchitectureDomain =
  | 'enterprise-architecture' | 'cloud' | 'ai' | 'data' | 'cybersecurity'
  | 'networking' | 'software' | 'platform-engineering' | 'observability'
  | 'reliability' | 'finops' | 'iot' | 'edge' | 'blockchain'
  | 'integration' | 'governance' | 'emerging-technology';

export type EvidenceClass = 'observed-fact' | 'analysis' | 'recommendation';
export type DriftStatus = 'aligned' | 'partial' | 'drift' | 'unknown';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ArchitectureSource {
  id: string;
  authority: string;
  domain: ArchitectureDomain;
  url: string;
  patternIds: string[];
  cadenceHours: number;
}

export interface ArchitecturePattern {
  id: string;
  title: string;
  domain: ArchitectureDomain;
  evidenceClass: 'observed-fact';
  sourceId: string;
  evidenceUrl: string;
  pattern: string;
  GLORIFIERMapping: string;
  controlIds: string[];
  lastReviewed: string;
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

export interface ArchitectureScanResult {
  scanId: string;
  startedAt: string;
  completedAt: string;
  sources: Array<{
    sourceId: string;
    ok: boolean;
    status: number | null;
    contentHash: string | null;
    observedAt: string;
    error?: string;
  }>;
  patterns: ArchitecturePattern[];
  drift: DriftFinding[];
  recommendations: string[];
  irreversibleChangesExecuted: false;
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

const SOURCES: ArchitectureSource[] = [
  { id: 'nist-ai-rmf', authority: 'NIST', domain: 'ai', url: 'https://www.nist.gov/itl/ai-risk-management-framework', patternIds: ['ai-lifecycle-risk'], cadenceHours: 168 },
  { id: 'nist-ai-critical-infra', authority: 'NIST', domain: 'cybersecurity', url: 'https://www.nist.gov/programs-projects/concept-note-ai-rmf-profile-trustworthy-ai-critical-infrastructure', patternIds: ['ai-agent-lifecycle-risk'], cadenceHours: 168 },
  { id: 'opentelemetry-semconv', authority: 'OpenTelemetry', domain: 'observability', url: 'https://opentelemetry.io/docs/concepts/semantic-conventions/', patternIds: ['vendor-neutral-telemetry'], cadenceHours: 168 },
  { id: 'finops-architecting', authority: 'FinOps Foundation', domain: 'finops', url: 'https://www.finops.org/framework/capabilities/architecting-workload-placement/', patternIds: ['architecture-aware-finops'], cadenceHours: 168 },
  { id: 'cncf-kyverno', authority: 'CNCF', domain: 'platform-engineering', url: 'https://www.cncf.io/projects/kyverno/', patternIds: ['policy-as-code'], cadenceHours: 168 },
  { id: 'etsi-net', authority: 'ETSI', domain: 'networking', url: 'https://www.etsi.org/technical-groups/net/', patternIds: ['federated-continuum'], cadenceHours: 168 },
  { id: 'aws-well-architected', authority: 'AWS', domain: 'cloud', url: 'https://aws.amazon.com/architecture/well-architected/', patternIds: ['cross-cutting-cloud-controls'], cadenceHours: 168 },
  { id: 'microsoft-architecture', authority: 'Microsoft', domain: 'enterprise-architecture', url: 'https://learn.microsoft.com/en-us/azure/architecture/', patternIds: ['cross-cutting-cloud-controls'], cadenceHours: 168 },
  { id: 'google-architecture', authority: 'Google Cloud', domain: 'cloud', url: 'https://cloud.google.com/architecture', patternIds: ['federated-data-access'], cadenceHours: 168 }
];

const PATTERNS: ArchitecturePattern[] = [
  { id: 'ai-lifecycle-risk', title: 'Continuous AI risk lifecycle', domain: 'ai', evidenceClass: 'observed-fact', sourceId: 'nist-ai-rmf', evidenceUrl: SOURCES[0].url, pattern: 'Govern, map, measure and manage AI risk continuously across the AI lifecycle.', GLORIFIERMapping: 'GEAS + GATS + AI impact assessment', controlIds: ['AI-01', 'GOV-01'], lastReviewed: new Date().toISOString() },
  { id: 'ai-agent-lifecycle-risk', title: 'AI agent lifecycle and supply-chain risk', domain: 'cybersecurity', evidenceClass: 'observed-fact', sourceId: 'nist-ai-critical-infra', evidenceUrl: SOURCES[1].url, pattern: 'Assess trustworthy AI capabilities, agents, tools and supply-chain concerns across lifecycle stages.', GLORIFIERMapping: 'GATS + agent control plane + provenance', controlIds: ['AI-01', 'SEC-01'], lastReviewed: new Date().toISOString() },
  { id: 'vendor-neutral-telemetry', title: 'Common telemetry semantics', domain: 'observability', evidenceClass: 'observed-fact', sourceId: 'opentelemetry-semconv', evidenceUrl: SOURCES[2].url, pattern: 'Use common semantic conventions so telemetry can be correlated across languages, services and platforms.', GLORIFIERMapping: 'Agent observability + evidence graph', controlIds: ['OBS-01'], lastReviewed: new Date().toISOString() },
  { id: 'architecture-aware-finops', title: 'Cost-aware architecture and placement', domain: 'finops', evidenceClass: 'observed-fact', sourceId: 'finops-architecting', evidenceUrl: SOURCES[3].url, pattern: 'Evaluate cost, value, reliability, security, sovereignty and placement during architecture decisions and revisit them continuously.', GLORIFIERMapping: 'GEAS + Revenue Control Plane + economic operating system', controlIds: ['FIN-01'], lastReviewed: new Date().toISOString() },
  { id: 'policy-as-code', title: 'Declarative policy enforcement', domain: 'platform-engineering', evidenceClass: 'observed-fact', sourceId: 'cncf-kyverno', evidenceUrl: SOURCES[4].url, pattern: 'Encode guardrails as versioned, testable policies and enforce them at platform control points.', GLORIFIERMapping: 'GEAS policy engine + deployment gates', controlIds: ['POL-01'], lastReviewed: new Date().toISOString() },
  { id: 'federated-continuum', title: 'Federated cloud-network-edge-device continuum', domain: 'networking', evidenceClass: 'observed-fact', sourceId: 'etsi-net', evidenceUrl: SOURCES[5].url, pattern: 'Use open APIs, data models and interoperability to consume resources across cloud, network, edge and device domains.', GLORIFIERMapping: 'Connection Registry + provider-neutral orchestration', controlIds: ['FED-01'], lastReviewed: new Date().toISOString() },
  { id: 'cross-cutting-cloud-controls', title: 'Cross-cutting architecture controls', domain: 'cloud', evidenceClass: 'observed-fact', sourceId: 'aws-well-architected', evidenceUrl: SOURCES[6].url, pattern: 'Treat operational excellence, security, reliability, performance and cost as architecture concerns rather than isolated implementation details.', GLORIFIERMapping: 'GEAS architecture evidence and drift model', controlIds: ['REL-01', 'SEC-01', 'FIN-01'], lastReviewed: new Date().toISOString() },
  { id: 'federated-data-access', title: 'Federated data access', domain: 'data', evidenceClass: 'observed-fact', sourceId: 'google-architecture', evidenceUrl: SOURCES[8].url, pattern: 'Prefer governed interoperability and fit-for-purpose data access over assuming every workload requires centralized data movement.', GLORIFIERMapping: 'Data governance + provider-neutral connectors', controlIds: ['DATA-01'], lastReviewed: new Date().toISOString() }
];

const CONTROLS: ArchitectureControl[] = [
  { id: 'AI-01', name: 'AI lifecycle assessment', family: 'ai-governance', requirement: 'AI systems and agents have lifecycle impact/risk assessment and reassessment triggers.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'GOV-01', name: 'Human final authority', family: 'governance', requirement: 'Irreversible external actions require explicit human authorization.', enforcement: 'human-approval', irreversibleChangeAllowed: false },
  { id: 'SEC-01', name: 'Scoped agent authority', family: 'security', requirement: 'Agent identity, tools, data scope and risk must be explicitly bounded.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'OBS-01', name: 'Correlated telemetry', family: 'observability', requirement: 'Agent, model, tool, deployment and outcome telemetry uses stable correlation identifiers.', enforcement: 'observe', irreversibleChangeAllowed: false },
  { id: 'FIN-01', name: 'Architecture-aware FinOps', family: 'finops', requirement: 'Material architecture and placement decisions record cost, value, reliability and sovereignty tradeoffs.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'POL-01', name: 'Policy-as-code', family: 'platform-governance', requirement: 'Applicable controls are machine-evaluable before governed execution.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'FED-01', name: 'Federated interoperability', family: 'integration', requirement: 'External resources are accessed through explicit contracts, scopes and replaceable adapters.', enforcement: 'observe', irreversibleChangeAllowed: false },
  { id: 'DATA-01', name: 'Data boundary awareness', family: 'data-governance', requirement: 'Data movement and residency/control boundaries are explicitly recorded.', enforcement: 'gate', irreversibleChangeAllowed: false },
  { id: 'REL-01', name: 'Agent reliability contract', family: 'reliability', requirement: 'Timeouts, bounded retries, validation, idempotency, isolation and graceful degradation are defined for agent workflows.', enforcement: 'gate', irreversibleChangeAllowed: false }
];

const memory: { last?: ArchitectureScanResult; sources: Record<string, ArchitectureScanResult['sources'][number]> } = { sources: {} };

function normalizeUrl(url: string) {
  return new URL(url).toString();
}

async function fetchSource(source: ArchitectureSource) {
  const observedAt = new Date().toISOString();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(normalizeUrl(source.url), {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'GLORIFIER-GEAS-Architecture-Scientist/1.0', Accept: 'text/html,application/xhtml+xml,text/plain' },
      signal: controller.signal
    });
    clearTimeout(timer);
    const body = await response.text();
    const contentHash = createHash('sha256').update(body).digest('hex');
    return { sourceId: source.id, ok: response.ok, status: response.status, contentHash, observedAt, ...(response.ok ? {} : { error: 'authoritative source returned non-2xx' }) };
  } catch (error) {
    return { sourceId: source.id, ok: false, status: null, contentHash: null, observedAt, error: error instanceof Error ? error.message : 'source fetch failed' };
  }
}

function buildDrift(): DriftFinding[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'drift-telemetry-contract',
      controlId: 'OBS-01',
      status: 'partial',
      severity: 'medium',
      intended: 'All agent/model/tool/deployment/outcome events share stable correlation semantics.',
      observed: 'GLORIFIER has agent observability and provenance, but the architecture-wide OTel-compatible contract is not yet universal.',
      evidenceRefs: ['opentelemetry-semconv'],
      recommendation: 'Adopt a versioned GEAS telemetry contract using OpenTelemetry semantic conventions and preserve GLORIFIER-specific attributes.',
      createdAt: now
    },
    {
      id: 'drift-policy-enforcement',
      controlId: 'POL-01',
      status: 'partial',
      severity: 'medium',
      intended: 'Applicable architecture policies are machine-evaluable before governed execution.',
      observed: 'GEAS policy evaluation exists; universal deployment/runtime policy gates are not established across every execution surface.',
      evidenceRefs: ['cncf-kyverno'],
      recommendation: 'Publish versioned policy definitions and add enforcement adapters without bypassing the existing human-approval rule.',
      createdAt: now
    },
    {
      id: 'drift-ai-impact',
      controlId: 'AI-01',
      status: 'partial',
      severity: 'medium',
      intended: 'AI agents and models have lifecycle impact/risk records with reassessment triggers.',
      observed: 'GATS and agent governance exist, but a unified lifecycle impact record is not yet exposed as a first-class GEAS artifact.',
      evidenceRefs: ['nist-ai-rmf', 'nist-ai-critical-infra'],
      recommendation: 'Add the AI impact assessment lifecycle and require reassessment on material architecture/model/tool changes.',
      createdAt: now
    },
    {
      id: 'drift-sovereignty',
      controlId: 'DATA-01',
      status: 'partial',
      severity: 'medium',
      intended: 'Data, inference, infrastructure, operator, key and control-plane boundaries are explicit.',
      observed: 'GLORIFIER records provider and connection governance, but a complete sovereignty boundary object is not yet standardized across resources.',
      evidenceRefs: ['etsi-net', 'google-architecture'],
      recommendation: 'Record sovereignty boundaries as architecture metadata and include them in placement and provider-substitution decisions.',
      createdAt: now
    },
    {
      id: 'drift-finops',
      controlId: 'FIN-01',
      status: 'partial',
      severity: 'low',
      intended: 'Architecture decisions capture cost, value, placement and second-order impacts before commitment.',
      observed: 'GLORIFIER has economic and revenue controls, but GEAS does not yet require a structured architecture decision record for material placement choices.',
      evidenceRefs: ['finops-architecting'],
      recommendation: 'Add architecture decision records with cost/value/unit-economics fields and post-change outcome validation.',
      createdAt: now
    }
  ];
}

const RECOMMENDATIONS = [
  'Make the Architecture Pattern Registry the canonical GEAS source for provider-neutral architectural evidence.',
  'Use an Architecture Evidence Graph linking source → pattern → control → component → runtime evidence → drift → recommendation → authorization → outcome.',
  'Compare intended architecture, deployed architecture, observed behavior and approved exceptions; unknown evidence must remain UNKNOWN.',
  'Adopt a versioned OpenTelemetry-compatible execution trace contract for agents, models, tools, deployments and outcomes.',
  'Use policy-as-code adapters as enforcement points while retaining human approval for irreversible external actions.',
  'Represent sovereignty as explicit data, inference, infrastructure, operator, jurisdiction, key-custody and control-plane boundaries.',
  'Require AI impact assessment across design, build, evaluate, deploy, operate, monitor and retire.',
  'Record cost, value, reliability, sustainability, sovereignty and reversibility in material architecture decisions.',
  'Keep blockchain optional: use it only as a possible trust anchor, never as the authoritative application state.',
  'Never let a source outage or missing telemetry imply compliance; record UNKNOWN and surface the evidence gap.'
];

const RELIABILITY_CONTRACT: AgentReliabilityContract = {
  timeoutMs: 30000,
  maxRetries: 2,
  circuitBreakerFailures: 5,
  gracefulDegradation: true,
  outputValidationRequired: true,
  idempotencyRequired: true,
  isolationRequired: true,
  humanEscalationForRisk: 'high'
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
  exitStrategy: 'document-before-material-provider-commitment'
};

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
      error TEXT
    );
  `);
}

export async function runGeasArchitectureScan(): Promise<ArchitectureScanResult> {
  const scanId = `geas-scan-${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const sourceResults = await Promise.all(SOURCES.map(fetchSource));
  for (const item of sourceResults) memory.sources[item.sourceId] = item;
  const completedAt = new Date().toISOString();
  const result: ArchitectureScanResult = {
    scanId, startedAt, completedAt, sources: sourceResults,
    patterns: PATTERNS.map(p => ({ ...p, lastReviewed: completedAt })),
    drift: buildDrift(),
    recommendations: [...RECOMMENDATIONS],
    irreversibleChangesExecuted: false
  };
  memory.last = result;
  try {
    const db = getPostgresPool();
    await initializeGeasArchitectureScientist();
    await db.query('INSERT INTO geas_architecture_scans(scan_id,started_at,completed_at,result) VALUES($1,$2,$3,$4)', [scanId, startedAt, completedAt, result]);
    for (const source of sourceResults) {
      await db.query('INSERT INTO geas_source_observations(source_id,observed_at,ok,status,content_hash,error) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_id) DO UPDATE SET observed_at=EXCLUDED.observed_at,ok=EXCLUDED.ok,status=EXCLUDED.status,content_hash=EXCLUDED.content_hash,error=EXCLUDED.error', [source.sourceId, source.observedAt, source.ok, source.status, source.contentHash, source.error || null]);
    }
  } catch {
    // Read-only architecture intelligence must remain available even when persistence is temporarily unavailable.
  }
  return result;
}

export async function getLatestGeasArchitectureScan() {
  if (memory.last) return memory.last;
  try {
    const db = getPostgresPool();
    await initializeGeasArchitectureScientist();
    const r = await db.query('SELECT result FROM geas_architecture_scans ORDER BY completed_at DESC LIMIT 1');
    if (r.rows[0]?.result) {
      memory.last = r.rows[0].result as ArchitectureScanResult;
      return memory.last;
    }
  } catch {}
  return null;
}

export function getGeasArchitectureModel() {
  return {
    version: 'GEAS-ARCHITECTURE-SCIENTIST-1.0',
    operatingRule: 'GEAS may observe, compare, explain, prioritize and recommend; it must not autonomously apply irreversible production changes.',
    sourcePolicy: 'Only curated authoritative public sources are accepted as architecture evidence.',
    evidencePolicy: 'Observed facts, analysis and recommendations are distinct records.',
    unknownPolicy: 'Missing or unavailable evidence remains UNKNOWN.',
    domains: [...new Set(SOURCES.map(s => s.domain)), 'enterprise-architecture', 'software', 'data', 'cybersecurity', 'reliability', 'iot', 'edge', 'blockchain', 'integration', 'governance', 'emerging-technology'],
    sources: SOURCES,
    patterns: PATTERNS,
    controls: CONTROLS,
    drift: buildDrift(),
    reliabilityContract: RELIABILITY_CONTRACT,
    sovereigntyDefaults: SOVEREIGNTY_DEFAULTS,
    aiLifecycle: ['design', 'build', 'evaluate', 'deploy', 'operate', 'monitor', 'retire'],
    architectureBaseline: GLORIFIER_ARCHITECTURE_MODEL,
    recommendations: RECOMMENDATIONS
  };
}

export function getGeasArchitectureSources() { return SOURCES; }
export function getGeasArchitecturePatterns() { return PATTERNS; }
export function getGeasArchitectureControls() { return CONTROLS; }
export function getGeasArchitectureReliabilityContract() { return RELIABILITY_CONTRACT; }
export function getGeasSovereigntyDefaults() { return SOVEREIGNTY_DEFAULTS; }
export function createAIImpactAssessment(input: Omit<AIImpactAssessment, 'id' | 'createdAt'>): AIImpactAssessment {
  return { ...input, id: `impact-${randomUUID()}`, createdAt: new Date().toISOString() };
}
export function createFinOpsArchitectureDecision(input: Omit<FinOpsArchitectureDecision, 'id'>): FinOpsArchitectureDecision {
  return { ...input, id: `finops-${randomUUID()}`, approvalRequired: input.approvalRequired || input.reversibility !== 'high' };
}

let scannerTimer: ReturnType<typeof setInterval> | undefined;
export function startGeasArchitectureScientistDaemon() {
  if (scannerTimer) return;
  const enabled = String(process.env.GEAS_ARCHITECTURE_SCAN_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) return;
  const hours = Math.max(1, Number(process.env.GEAS_ARCHITECTURE_SCAN_INTERVAL_HOURS || 24));
  void runGeasArchitectureScan().catch(error => console.warn('[GEAS] initial architecture scan deferred:', error instanceof Error ? error.message : error));
  scannerTimer = setInterval(() => {
    void runGeasArchitectureScan().catch(error => console.warn('[GEAS] scheduled architecture scan deferred:', error instanceof Error ? error.message : error));
  }, hours * 60 * 60 * 1000);
  scannerTimer.unref?.();
}
