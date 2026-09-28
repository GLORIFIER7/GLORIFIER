import { createHash, randomUUID } from 'node:crypto';
import { getPostgresPool } from '../db/postgres';

export type GeasTruthState = 'intended' | 'deployed' | 'observed' | 'approved-exception' | 'executed-outcome';
export type GeasEvidenceState = 'pass' | 'fail' | 'missing' | 'stale' | 'contradicted' | 'requires-human-decision' | 'waived';
export type GeasReconciliationState = 'aligned' | 'partial' | 'drift' | 'unknown';

export interface ArchitectureManifestNode {
  id: string;
  type: 'system' | 'service' | 'provider' | 'model' | 'agent' | 'tool' | 'data' | 'deployment' | 'policy' | 'control' | 'resource';
  name: string;
  version?: string;
  owner?: string;
  capabilities?: string[];
  dataClass?: string;
  region?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
}

export interface ArchitectureManifestEdge {
  from: string;
  to: string;
  relation: 'depends-on' | 'uses' | 'deployed-as' | 'observed-by' | 'governed-by' | 'authorized-by' | 'costs' | 'supersedes' | 'produces';
}

export interface ArchitectureManifest {
  schemaVersion: 'GEAS-ARCH-1.0';
  manifestId: string;
  revision: string;
  generatedAt: string;
  nodes: ArchitectureManifestNode[];
  edges: ArchitectureManifestEdge[];
}

export interface AuthorityEnvelope {
  delegationId: string;
  contextId: string;
  delegator: string;
  principal: string;
  capabilities: string[];
  resourceScopes: string[];
  dataScopes: string[];
  maxRisk: 'low' | 'medium' | 'high' | 'critical';
  maxValue?: number;
  currency?: string;
  expiresAt: string;
  revocable: boolean;
  humanApprovalRequired: boolean;
  parentDelegationId?: string;
}

export interface AuthorityEvaluation {
  allowed: boolean;
  reasons: string[];
  effectiveCapabilities: string[];
  effectiveScopes: string[];
  requiresHumanApproval: boolean;
}

export interface TelemetryEnvelope {
  schemaVersion: 'GEAS-OTEL-1.0';
  contextId: string;
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  actorId: string;
  agentId?: string;
  modelId?: string;
  toolId?: string;
  deploymentId?: string;
  policyVersion?: string;
  decision?: 'allow' | 'deny' | 'conditional';
  action?: string;
  outcome?: 'success' | 'failure' | 'unknown';
  startedAt: string;
  endedAt?: string;
  attributes: Record<string, string | number | boolean>;
}

export interface DegradedModeContract {
  id: string;
  component: string;
  trigger: string;
  allowedActions: string[];
  forbiddenActions: string[];
  fallback: string;
  evidenceRequired: string[];
  humanEscalation: string;
  recoveryVerification: string;
}

export interface FinOpsArchitectureRecord {
  id: string;
  contextId: string;
  workload: string;
  options: string[];
  unitMetric?: string;
  expectedCost?: Record<string, number>;
  valueMetric?: string;
  reliabilityImpact?: string;
  sovereigntyImpact?: string;
  sustainabilityImpact?: string;
  reversibility: 'high' | 'medium' | 'low' | 'unknown';
  selectedOption?: string;
  outcomeEvidenceRefs: string[];
  approvalRequired: boolean;
  status: 'proposed' | 'approved' | 'executed' | 'verified' | 'superseded';
}

export interface ReconciliationResult {
  reconciliationId: string;
  manifestRevision: string;
  generatedAt: string;
  state: GeasReconciliationState;
  counts: Record<GeasTruthState, number>;
  findings: Array<{
    id: string;
    subjectId: string;
    intended: string;
    deployed: string;
    observed: string;
    exception?: string;
    state: GeasReconciliationState;
    evidenceRefs: string[];
    requiresHumanDecision: boolean;
  }>;
}

const DEFAULT_DEGRADED_CONTRACTS: DegradedModeContract[] = [
  {
    id: 'geas-provider-degraded',
    component: 'provider-orchestration',
    trigger: 'No provider satisfies the required capability, authorization, policy, and availability constraints.',
    allowedActions: ['return truthful unavailable/degraded status', 'record evidence gap', 'request human review'],
    forbiddenActions: ['fabricate provider success', 'route around authorization', 'execute irreversible external action'],
    fallback: 'Try only independently authorized providers that satisfy the same policy and capability contract.',
    evidenceRequired: ['provider health observation', 'authorization result', 'policy evaluation'],
    humanEscalation: 'high-risk or consequential actions require Human Authority.',
    recoveryVerification: 'Re-run provider capability and authorization checks before restoring normal state.'
  },
  {
    id: 'geas-evidence-store-degraded',
    component: 'evidence-store',
    trigger: 'Authoritative evidence persistence is unavailable or integrity verification fails.',
    allowedActions: ['read cached non-authoritative state', 'surface degraded status', 'queue non-consequential observation for retry'],
    forbiddenActions: ['claim verification', 'claim verified revenue', 'execute irreversible action'],
    fallback: 'Fail closed for consequential verification-dependent operations.',
    evidenceRequired: ['store health', 'integrity verification', 'freshness state'],
    humanEscalation: 'Escalate any consequential action whose evidence cannot be persisted or verified.',
    recoveryVerification: 'Verify the evidence chain and reconcile queued observations before returning to normal.'
  },
  {
    id: 'geas-identity-degraded',
    component: 'identity-and-authorization',
    trigger: 'Authentication or authorization state cannot be established with required confidence.',
    allowedActions: ['deny protected action', 'surface authentication/authorization unavailable', 'record observation'],
    forbiddenActions: ['treat authentication as authorization', 'reuse expired/revoked authorization', 'execute consequential action'],
    fallback: 'Deny by default until identity and scoped authorization are re-established.',
    evidenceRequired: ['identity status', 'authorization envelope', 'policy decision'],
    humanEscalation: 'Consequential actions remain blocked until an authorized human can restore the trust boundary.',
    recoveryVerification: 'Perform a fresh authenticated authorization check and verify expiry/revocation state.'
  }
];

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validateManifest(manifest: ArchitectureManifest) {
  if (manifest.schemaVersion !== 'GEAS-ARCH-1.0') throw new Error('Unsupported GEAS architecture manifest schema');
  if (!manifest.manifestId || !manifest.revision) throw new Error('manifestId and revision are required');
  const ids = new Set<string>();
  for (const node of manifest.nodes) {
    if (!node.id || ids.has(node.id)) throw new Error('Duplicate or missing architecture node id: ' + node.id);
    ids.add(node.id);
  }
  for (const edge of manifest.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error('Architecture edge references unknown node: ' + edge.from + ' -> ' + edge.to);
  }
  return true;
}

export function getGeasArchitectureManifest(): ArchitectureManifest {
  return {
    schemaVersion: 'GEAS-ARCH-1.0',
    manifestId: 'glorifier-core',
    revision: '2026-09-28.geas-v1',
    generatedAt: new Date().toISOString(),
    nodes: [
      { id: 'human-authority', type: 'system', name: 'Human Authority' },
      { id: 'governance-kernel', type: 'system', name: 'Governance Kernel' },
      { id: 'provider-registry', type: 'system', name: 'Provider Registry' },
      { id: 'capability-registry', type: 'system', name: 'Capability Registry' },
      { id: 'ai-ceo', type: 'agent', name: 'AI CEO' },
      { id: 'specialist-council', type: 'system', name: 'Specialist Council' },
      { id: 'geas', type: 'agent', name: 'GEAS Enterprise Architecture Scientist' },
      { id: 'orchestration', type: 'system', name: 'Permanent Orchestrator' },
      { id: 'execution', type: 'system', name: 'Governed Execution' },
      { id: 'verification', type: 'system', name: 'Verification' },
      { id: 'evidence-graph', type: 'system', name: 'Architecture Evidence Graph' },
      { id: 'economic-truth', type: 'system', name: 'Economic Truth' },
      { id: 'neon', type: 'resource', name: 'Neon/PostgreSQL Authoritative State' }
    ],
    edges: [
      { from: 'human-authority', to: 'governance-kernel', relation: 'governed-by' },
      { from: 'governance-kernel', to: 'provider-registry', relation: 'governed-by' },
      { from: 'governance-kernel', to: 'capability-registry', relation: 'governed-by' },
      { from: 'ai-ceo', to: 'specialist-council', relation: 'uses' },
      { from: 'ai-ceo', to: 'orchestration', relation: 'uses' },
      { from: 'geas', to: 'evidence-graph', relation: 'produces' },
      { from: 'orchestration', to: 'execution', relation: 'uses' },
      { from: 'execution', to: 'verification', relation: 'produces' },
      { from: 'verification', to: 'evidence-graph', relation: 'produces' },
      { from: 'evidence-graph', to: 'neon', relation: 'uses' },
      { from: 'economic-truth', to: 'evidence-graph', relation: 'governed-by' },
      { from: 'execution', to: 'human-authority', relation: 'authorized-by' }
    ]
  };
}

export function validateGeasArchitectureManifest(manifest: ArchitectureManifest) {
  validateManifest(manifest);
  return { valid: true, nodeCount: manifest.nodes.length, edgeCount: manifest.edges.length, hash: hash(manifest) };
}

const riskOrder = { low: 1, medium: 2, high: 3, critical: 4 };

export function evaluateAuthorityChain(
  envelope: AuthorityEnvelope,
  requested: { capability: string; resourceScope?: string; dataScope?: string; risk: AuthorityEnvelope['maxRisk']; irreversible?: boolean }
): AuthorityEvaluation {
  const reasons: string[] = [];
  const effectiveCapabilities = envelope.capabilities.filter(Boolean);
  const effectiveScopes = envelope.resourceScopes.filter(Boolean);
  if (Date.parse(envelope.expiresAt) <= Date.now()) reasons.push('delegation expired');
  if (!envelope.revocable) reasons.push('delegation must be revocable for governed execution');
  if (!effectiveCapabilities.includes('*') && !effectiveCapabilities.includes(requested.capability)) reasons.push('capability is outside delegated authority');
  if (requested.resourceScope && !effectiveScopes.includes('*') && !effectiveScopes.includes(requested.resourceScope)) reasons.push('resource scope is outside delegated authority');
  if (requested.dataScope && !envelope.dataScopes.includes('*') && !envelope.dataScopes.includes(requested.dataScope)) reasons.push('data scope is outside delegated authority');
  if (riskOrder[requested.risk] > riskOrder[envelope.maxRisk]) reasons.push('requested risk exceeds delegated risk ceiling');
  const requiresHumanApproval = Boolean(requested.irreversible || envelope.humanApprovalRequired);
  if (requiresHumanApproval) reasons.push('human approval required before consequential execution');
  return {
    allowed: reasons.filter(r => r !== 'human approval required before consequential execution').length === 0 && !requiresHumanApproval,
    reasons,
    effectiveCapabilities,
    effectiveScopes,
    requiresHumanApproval
  };
}

export function attenuateAuthority(parent: AuthorityEnvelope, child: Omit<AuthorityEnvelope, 'delegationId' | 'parentDelegationId'>): AuthorityEnvelope {
  const capabilities = child.capabilities.filter(c => parent.capabilities.includes('*') || parent.capabilities.includes(c));
  const resourceScopes = child.resourceScopes.filter(s => parent.resourceScopes.includes('*') || parent.resourceScopes.includes(s));
  const dataScopes = child.dataScopes.filter(s => parent.dataScopes.includes('*') || parent.dataScopes.includes(s));
  const expiry = Math.min(Date.parse(parent.expiresAt), Date.parse(child.expiresAt));
  const maxRisk = riskOrder[child.maxRisk] <= riskOrder[parent.maxRisk] ? child.maxRisk : parent.maxRisk;
  return {
    ...child,
    delegationId: 'delegation-' + randomUUID(),
    parentDelegationId: parent.delegationId,
    capabilities,
    resourceScopes,
    dataScopes,
    maxRisk,
    expiresAt: new Date(expiry).toISOString(),
    revocable: true,
    humanApprovalRequired: parent.humanApprovalRequired || child.humanApprovalRequired
  };
}

export function createTelemetryEnvelope(input: Omit<TelemetryEnvelope, 'schemaVersion' | 'traceId'> & { traceId?: string }): TelemetryEnvelope {
  return { schemaVersion: 'GEAS-OTEL-1.0', traceId: input.traceId || randomUUID(), ...input };
}

export function getGeasDegradedModeContracts() {
  return DEFAULT_DEGRADED_CONTRACTS;
}

export function reconcileGeasArchitecture(
  manifest: ArchitectureManifest,
  deployed: Map<string, Record<string, unknown>>,
  observed: Map<string, Record<string, unknown>>,
  exceptions: Map<string, Record<string, unknown>> = new Map()
): ReconciliationResult {
  validateManifest(manifest);
  const findings: ReconciliationResult['findings'] = [];
  const counts: Record<GeasTruthState, number> = { intended: manifest.nodes.length, deployed: 0, observed: 0, 'approved-exception': 0, 'executed-outcome': 0 };
  for (const node of manifest.nodes) {
    const dep = deployed.get(node.id);
    const obs = observed.get(node.id);
    const exception = exceptions.get(node.id);
    if (dep) counts.deployed++;
    if (obs) counts.observed++;
    if (exception) counts['approved-exception']++;
    const evidenceRefs: string[] = [];
    let state: GeasReconciliationState = 'unknown';
    if (!dep && !obs && !exception) state = 'unknown';
    else if (exception) { state = 'partial'; evidenceRefs.push('exception:' + node.id); }
    else if (dep && obs) {
      const intendedComparable = JSON.stringify({ version: node.version, provider: node.provider, region: node.region });
      const deployedComparable = JSON.stringify({ version: dep.version, provider: dep.provider, region: dep.region });
      const observedComparable = JSON.stringify({ version: obs.version, provider: obs.provider, region: obs.region });
      state = intendedComparable === deployedComparable && deployedComparable === observedComparable ? 'aligned' : 'drift';
      evidenceRefs.push('deployed:' + node.id, 'observed:' + node.id);
    } else {
      state = 'partial';
      if (dep) evidenceRefs.push('deployed:' + node.id);
      if (obs) evidenceRefs.push('observed:' + node.id);
    }
    findings.push({
      id: 'reconcile-' + node.id,
      subjectId: node.id,
      intended: JSON.stringify(node),
      deployed: dep ? JSON.stringify(dep) : 'UNKNOWN',
      observed: obs ? JSON.stringify(obs) : 'UNKNOWN',
      exception: exception ? JSON.stringify(exception) : undefined,
      state,
      evidenceRefs,
      requiresHumanDecision: state === 'drift' || state === 'unknown'
    });
  }
  const state = findings.some(f => f.state === 'drift') ? 'drift' : findings.some(f => f.state === 'unknown') ? 'unknown' : findings.some(f => f.state === 'partial') ? 'partial' : 'aligned';
  return { reconciliationId: 'geas-reconcile-' + randomUUID(), manifestRevision: manifest.revision, generatedAt: new Date().toISOString(), state, counts, findings };
}

export async function initializeGeasReconciliation() {
  const db = getPostgresPool();
  await db.query(
    "CREATE TABLE IF NOT EXISTS geas_architecture_manifests (manifest_id TEXT NOT NULL, revision TEXT NOT NULL, manifest JSONB NOT NULL, content_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(manifest_id, revision));" +
    "CREATE TABLE IF NOT EXISTS geas_authority_envelopes (delegation_id TEXT PRIMARY KEY, context_id TEXT NOT NULL, envelope JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());" +
    "CREATE TABLE IF NOT EXISTS geas_telemetry_envelopes (context_id TEXT NOT NULL, trace_id TEXT NOT NULL, span_id TEXT NOT NULL DEFAULT '', envelope JSONB NOT NULL, observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(context_id, trace_id, span_id));" +
    "CREATE TABLE IF NOT EXISTS geas_reconciliations (reconciliation_id TEXT PRIMARY KEY, manifest_revision TEXT NOT NULL, result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());" +
    "CREATE TABLE IF NOT EXISTS geas_finops_architecture_records (id TEXT PRIMARY KEY, context_id TEXT NOT NULL, record JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());"
  );
}

export async function persistGeasManifest(manifest: ArchitectureManifest) {
  validateManifest(manifest);
  const db = getPostgresPool();
  await initializeGeasReconciliation();
  await db.query('INSERT INTO geas_architecture_manifests(manifest_id,revision,manifest,content_hash) VALUES($1,$2,$3,$4) ON CONFLICT(manifest_id,revision) DO NOTHING', [manifest.manifestId, manifest.revision, manifest, hash(manifest)]);
  return { manifestId: manifest.manifestId, revision: manifest.revision, contentHash: hash(manifest) };
}

export async function persistGeasAuthorityEnvelope(envelope: AuthorityEnvelope) {
  const db = getPostgresPool();
  await initializeGeasReconciliation();
  await db.query('INSERT INTO geas_authority_envelopes(delegation_id,context_id,envelope) VALUES($1,$2,$3) ON CONFLICT(delegation_id) DO UPDATE SET envelope=EXCLUDED.envelope', [envelope.delegationId, envelope.contextId, envelope]);
  return envelope;
}

export async function persistGeasTelemetryEnvelope(envelope: TelemetryEnvelope) {
  const db = getPostgresPool();
  await initializeGeasReconciliation();
  await db.query('INSERT INTO geas_telemetry_envelopes(context_id,trace_id,span_id,envelope) VALUES($1,$2,$3,$4) ON CONFLICT(context_id,trace_id,span_id) DO NOTHING', [envelope.contextId, envelope.traceId, envelope.spanId || '', envelope]);
  return envelope;
}

export async function persistGeasReconciliation(result: ReconciliationResult) {
  const db = getPostgresPool();
  await initializeGeasReconciliation();
  await db.query('INSERT INTO geas_reconciliations(reconciliation_id,manifest_revision,result) VALUES($1,$2,$3)', [result.reconciliationId, result.manifestRevision, result]);
  return result;
}

export async function persistGeasFinOpsRecord(record: FinOpsArchitectureRecord) {
  const db = getPostgresPool();
  await initializeGeasReconciliation();
  await db.query('INSERT INTO geas_finops_architecture_records(id,context_id,record) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET record=EXCLUDED.record', [record.id, record.contextId, record]);
  return record;
}
