import { getCapabilityPolicy, listCapabilityPolicies } from './capability-authorization';
import { newId } from './new-id';
import { createPostgresAgentStateStore } from './agent-state-store';
import type { PostgresAgentStateStore } from './agent-state-store';
import { initializeOptionalPostgresAgentStore } from './agent-persistence-bootstrap';

export type AgentCard = {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
  endpoint: string;
  protocol: 'GLORIFIER-A2A-v1';
  status: 'active' | 'offline' | 'degraded';
};

export type AgentTask = {
  economicIntentId?: string;
  economicStatus?: 'NONE' | 'PROPOSED' | 'AUTHORIZED' | 'COMMITTED' | 'EVIDENCE_PENDING' | 'SETTLED' | 'REJECTED' | 'EXPIRED';
  id: string;
  capability: string;
  objective: string;
  input?: unknown;
  requester: string;
  connectionId?: string;
  approvalRequired?: boolean;
  createdAt: string;
  updatedAt: string;
  status: 'queued' | 'awaiting-approval' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
};

/**
 * Agent task records are private to their authenticated requester by default.
 * Only a verified owner or authenticated internal service may bypass this scope.
 */
export type RequesterScopedAgentTask = {
  requester?: unknown;
  requesterAgentId?: unknown;
};

function taskRequesterIdentity(task: RequesterScopedAgentTask): string {
  const requester = typeof task.requester === 'string' ? task.requester.trim() : '';
  if (requester) return requester;
  return typeof task.requesterAgentId === 'string' ? task.requesterAgentId.trim() : '';
}

export function canAccessAgentTask(
  task: RequesterScopedAgentTask,
  requesterUid?: string,
  allowAll = false,
): boolean {
  if (allowAll) return true;
  const requester = typeof requesterUid === 'string' ? requesterUid.trim() : '';
  const owner = taskRequesterIdentity(task);
  return Boolean(requester && owner && owner === requester);
}

export function filterAgentTasksByRequester<T extends RequesterScopedAgentTask>(
  tasks: readonly T[],
  requesterUid?: string,
  allowAll = false,
): T[] {
  if (allowAll) return [...tasks];
  const requester = typeof requesterUid === 'string' ? requesterUid.trim() : '';
  if (!requester) return [];
  return tasks.filter((task) => taskRequesterIdentity(task) === requester);
}

/**
 * Ignore caller-supplied attribution unless the request is backed by a verified
 * owner identity or the shared internal-service credential.
 */
export function resolveAgentTaskRequester(
  authenticatedUid?: string,
  requestedRequester?: unknown,
  allowOverride = false,
): string | null {
  const uid = typeof authenticatedUid === 'string' ? authenticatedUid.trim() : '';
  const requested = typeof requestedRequester === 'string' ? requestedRequester.trim() : '';
  if (allowOverride && requested) return requested;
  return uid || null;
}


const agents: AgentCard[] = [
  { id: 'ai-ceo', name: 'GLORIFIER AI CEO', role: 'orchestrator', capabilities: ['delegate', 'prioritize', 'synthesize', 'govern', 'governed-agent-commerce', 'economic-routing'], endpoint: '/api/agents/ai-ceo', protocol: 'GLORIFIER-A2A-v1', status: 'active' },
  { id: 'gpt', name: 'GPT', role: 'reasoning', capabilities: ['reason', 'code-review', 'synthesis'], endpoint: '/api/agents/gpt', protocol: 'GLORIFIER-A2A-v1', status: 'active' },
  { id: 'gemini', name: 'Gemini', role: 'engineering-collaborator', capabilities: ['research', 'code-analysis', 'recovery'], endpoint: '/api/agents/gemini', protocol: 'GLORIFIER-A2A-v1', status: 'active' },
  { id: 'specialists', name: 'Specialist Council', role: 'domain-agents', capabilities: ['security', 'data', 'revenue-analysis', 'operations', 'research'], endpoint: '/api/agents/specialists', protocol: 'GLORIFIER-A2A-v1', status: 'active' },
  { id: 'uspto-ai-attorney-scientist', name: 'GLORIFIER USPTO AI Attorney/Scientist', role: 'ip-research', capabilities: ['ip-research', 'prior-art-analysis', 'invention-provenance', 'patent-preparation'], endpoint: '/api/agents/uspto-ai-attorney-scientist', protocol: 'GLORIFIER-A2A-v1', status: 'active' },
  { id: 'iso-ai-scientist', name: 'GLORIFIER ISO AI Scientist', role: 'ai-standards-research', capabilities: ['iso-alignment', 'ai-governance', 'ai-risk', 'lifecycle-assessment', 'continual-improvement'], endpoint: '/api/agents/iso-ai-scientist', protocol: 'GLORIFIER-A2A-v1', status: 'active' },
  { id: 'assets-scientist', name: 'GLORIFIER Assets Scientist', role: 'asset-intelligence', capabilities: ['asset-intelligence', 'asset-lifecycle', 'asset-valuation', 'asset-risk', 'asset-evidence'], endpoint: '/api/agents/assets-scientist', protocol: 'GLORIFIER-A2A-v1', status: 'active' },
  { id: 'enterprise-architecture-scientist', name: 'GLORIFIER Enterprise Architecture Scientist', role: 'enterprise-architecture-intelligence', capabilities: ['architecture-review','well-architected-assessment','ai-architecture','data-architecture','cloud-architecture','integration-architecture','resilience-architecture','finops-architecture'], endpoint: '/api/agents/enterprise-architecture-scientist', protocol: 'GLORIFIER-A2A-v1', status: 'active' },
  { id: 'business-intelligence-scientist', name: 'GLORIFIER Business Intelligence Scientist', role: 'continuous-business-intelligence', capabilities: ['market-intelligence','competitive-intelligence','customer-intelligence','product-intelligence','sales-intelligence','marketing-intelligence','operations-intelligence','pricing-intelligence','technology-intelligence','data-intelligence','regulatory-intelligence','opportunity-intelligence','early-warning','decision-intelligence'], endpoint: '/api/agents/business-intelligence-scientist', protocol: 'GLORIFIER-A2A-v1', status: 'active' },
  { id: 'finance-scientist', name: 'GLORIFIER Finance Scientist', role: 'institutional-finance-intelligence', capabilities: ['portfolio-intelligence', 'multi-asset-risk', 'scenario-analysis', 'stress-testing', 'capital-allocation', 'valuation', 'financial-forensics', 'liquidity-analysis'], endpoint: '/api/agents/finance-scientist', protocol: 'GLORIFIER-A2A-v1', status: 'active' }
];

type AgentRuntimePersistence = Pick<PostgresAgentStateStore, 'initialize' | 'get' | 'list' | 'save' | 'recoverInterruptedTasks' | 'heartbeatRunningTask'>;

const TASK_HEARTBEAT_INTERVAL_MS = 60_000;
const TASK_STALE_AFTER_MS = 30 * 60_000;

export type AgentTaskRecoveryObservation = {
  state: 'not-running' | 'heartbeat-current' | 'heartbeat-overdue' | 'startup-recovery-eligible' | 'unknown';
  lastUpdatedAt: string;
  ageMs: number | null;
};

const tasks = new Map<string, AgentTask>();
let persistence: AgentRuntimePersistence | null = null;
let persistenceMode: 'uninitialized' | 'postgres' | 'memory-fallback' = 'uninitialized';

export async function initializeAgentRuntimePersistence(storeOverride?: AgentRuntimePersistence): Promise<boolean> {
  persistenceMode = 'uninitialized';
  const store = await initializeOptionalPostgresAgentStore(
    process.env.DATABASE_URL,
    storeOverride,
    createPostgresAgentStateStore,
  );
  if (!store) {
    persistence = null;
    persistenceMode = 'memory-fallback';
    return false;
  }
  const recovered = await store.recoverInterruptedTasks(TASK_STALE_AFTER_MS / 60_000);
  // PostgreSQL is the durable source of truth; avoid retaining a duplicate
  // in-process copy of every task after persistence is enabled.
  tasks.clear();
  persistence = store;
  persistenceMode = 'postgres';
  if (recovered > 0) {
    console.warn(`[AgentRuntime] marked ${recovered} interrupted task(s) failed; automatic replay is disabled.`);
  }
  return true;
}

export function getAgentRuntimePersistenceStatus() {
  return {
    mode: persistenceMode,
    durable: persistenceMode === 'postgres',
    cachedTasks: persistence ? 0 : tasks.size,
    recoveryPolicy: {
      staleAfterMinutes: TASK_STALE_AFTER_MS / 60_000,
      heartbeatIntervalMs: TASK_HEARTBEAT_INTERVAL_MS,
      heartbeatCoverage: ['agent-task-inference', 'governance-cycle'],
      startupRecoveryOnly: true,
      interruptedWithinGracePeriodMayRemainRunning: true,
      automaticReplay: false,
    },
  };
}

function assertAgentRuntimeReady(): void {
  if (persistenceMode === 'uninitialized') {
    throw new Error('Agent task persistence is still initializing; retry after backend readiness.');
  }
}
const capabilityOwners: Record<string, string[]> = {
  research: ['research-scientist','market-scientist'],
  engineering: ['engineering-scientist','software-architect','api-scientist'],
  security: ['cybersecurity-scientist','threat-intelligence-scientist','privacy-scientist'],
  finance: ['finance-scientist','revenue-scientist','risk-scientist','economics-scientist','market-scientist'],
  'portfolio-intelligence': ['finance-scientist','assets-scientist','risk-scientist'],
  'capital-allocation': ['finance-scientist','economics-scientist','risk-scientist'],
  'financial-forensics': ['finance-scientist','data-scientist','compliance-scientist'],
  'scenario-analysis': ['finance-scientist','economics-scientist','risk-scientist'],
  'stress-testing': ['finance-scientist','risk-scientist','data-scientist'],
  data: ['data-scientist','database-scientist'],
  product: ['product-scientist','ux-scientist','growth-scientist'],
  infrastructure: ['cloud-scientist','ai-infrastructure-scientist','operations-scientist'],
  assets: ['assets-scientist','blockchain-scientist','game-technology-scientist','economics-scientist'],
  'asset-intelligence': ['assets-scientist','data-scientist','finance-scientist'],
  'asset-risk': ['assets-scientist','risk-scientist','compliance-scientist'],
  'ip-research': ['uspto-ai-attorney-scientist'],
  'iso-alignment': ['iso-ai-scientist'],
  'ai-governance': ['iso-ai-scientist'],
  'ai-risk': ['iso-ai-scientist'],
  'business-intelligence': ['business-intelligence-scientist','data-scientist','market-scientist','competitive-intelligence-scientist'],
  'market-intelligence': ['business-intelligence-scientist','market-scientist','competitive-intelligence-scientist'],
  'competitive-intelligence': ['business-intelligence-scientist','competitive-intelligence-scientist','market-scientist'],
  'customer-intelligence': ['business-intelligence-scientist','product-scientist','growth-scientist'],
  'opportunity-intelligence': ['business-intelligence-scientist','revenue-scientist','market-scientist'],
  'decision-intelligence': ['business-intelligence-scientist','finance-scientist','risk-scientist'],
  'early-warning': ['business-intelligence-scientist','risk-scientist','threat-intelligence-scientist']
};

export function listAgentCards() { return agents; }

export function routeAgentCapability(capability: string) {
  const normalized = capability.trim().toLowerCase();
  const policy = getCapabilityPolicy(normalized);
  return {
    capability: normalized,
    specialists: capabilityOwners[normalized] || [],
    fallback: 'ai-ceo',
    humanApprovalDefault: policy?.requiresHumanApproval ?? true,
    risk: policy?.risk ?? 'high',
    governed: Boolean(policy)
  };
}

export function orchestrationPolicy() {
  return {
    routing: 'capability-first',
    resilience: 'provider-fallback',
    disagreement: 'surface-for-reconciliation',
    evidence: 'required-for-verification',
    economicModel: 'GLR-native governed agent commerce',
    economicSettlement: 'GLR-intent-first; verified external evidence required before SETTLED',
    humanAuthority: true,
    irreversibleActions: 'approval-gated',
    capabilityAuthorization: 'default-deny-for-privileged-actions',
    capabilityPolicies: listCapabilityPolicies().map(p => p.id)
  };
}

export function evaluateAgentCapability(capability: string, humanApproved = false) {
  const policy = getCapabilityPolicy(capability);
  if (!policy) return { allowed: false, requiresHumanApproval: true, reason: 'unknown_capability' as const };
  if (policy.requiresHumanApproval && !humanApproved) {
    return { allowed: false, requiresHumanApproval: true, reason: 'human_approval_required' as const, policy };
  }
  return { allowed: true, requiresHumanApproval: policy.requiresHumanApproval, reason: 'policy_allowed' as const, policy };
}

export async function createAgentTask(input: Pick<AgentTask, 'capability'|'objective'|'input'|'requester'|'connectionId'|'approvalRequired'>): Promise<AgentTask> {
  assertAgentRuntimeReady();
  if (typeof input.requester !== 'string' || !input.requester.trim()) {
    throw new Error('requester must be a non-empty string.');
  }
  const task: AgentTask = {
    id: newId('task'),
    ...input,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'queued'
  };
  // Persist before exposing a newly accepted task to the caller.
  if (persistence) await persistence.save('task', task);
  else tasks.set(task.id, task);
  return task;
}

export async function updateAgentTask(id: string, patch: Partial<AgentTask>): Promise<AgentTask | null> {
  assertAgentRuntimeReady();
  const current = persistence
    ? await persistence.get<AgentTask>('task', id)
    : tasks.get(id) || null;
  if (!current) return null;
  const updated = { ...current, ...patch, ...(patch.status === 'completed' ? { error: undefined } : {}), id: current.id, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
  // A database failure is returned to the route; uncommitted state is not reported as durable.
  if (persistence) {
    await persistence.save('task', updated);
    return updated;
  }
  tasks.set(id, updated);
  return updated;
}

export function getAgentTaskRecoveryObservation(
  task: Pick<AgentTask, 'status' | 'updatedAt'>,
  now = Date.now(),
): AgentTaskRecoveryObservation {
  if (task.status !== 'running') {
    return { state: 'not-running', lastUpdatedAt: task.updatedAt, ageMs: null };
  }
  const updatedAt = Date.parse(task.updatedAt);
  if (!Number.isFinite(updatedAt)) {
    return { state: 'unknown', lastUpdatedAt: task.updatedAt, ageMs: null };
  }
  const ageMs = Math.max(0, now - updatedAt);
  const state = ageMs <= TASK_HEARTBEAT_INTERVAL_MS * 2
    ? 'heartbeat-current'
    : ageMs < TASK_STALE_AFTER_MS
      ? 'heartbeat-overdue'
      : 'startup-recovery-eligible';
  return { state, lastUpdatedAt: task.updatedAt, ageMs };
}

export async function heartbeatAgentTask(id: string): Promise<boolean> {
  assertAgentRuntimeReady();
  if (persistence) return persistence.heartbeatRunningTask(id);
  const current = tasks.get(id);
  if (!current || current.status !== 'running') return false;
  tasks.set(id, { ...current, updatedAt: new Date().toISOString() });
  return true;
}

/**
 * Keeps a running task's lease fresh while its work is active. Heartbeat
 * failures are logged but do not interrupt the work being monitored.
 */
export async function withAgentTaskHeartbeat<T>(
  taskId: string,
  operation: () => Promise<T>,
  intervalMs = 60_000,
): Promise<T> {
  let pendingHeartbeat: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (pendingHeartbeat) return;
    pendingHeartbeat = heartbeatAgentTask(taskId)
      .then(() => undefined)
      .catch((error) => {
        console.warn(`[AgentRuntime] heartbeat failed for running task ${taskId}:`, error);
      })
      .finally(() => {
        pendingHeartbeat = null;
      });
  }, Math.max(5, intervalMs));
  timer.unref?.();

  try {
    return await operation();
  } finally {
    clearInterval(timer);
    // Do not hold completed work open on a slow database request. The heartbeat
    // handler is already rejection-safe, and SQL only updates tasks still running.
  }
}

export async function requireAgentTaskUpdate(id: string, patch: Partial<AgentTask>): Promise<AgentTask> {
  const updated = await updateAgentTask(id, patch);
  if (!updated) throw new Error(`Agent task ${id} no longer exists; refusing to continue.`);
  return updated;
}

export async function getAgentTask(id: string): Promise<AgentTask | null> {
  assertAgentRuntimeReady();
  if (persistence) return persistence.get<AgentTask>('task', id);
  return tasks.get(id) || null;
}

export async function listAgentTasks(limit = 50, requester?: string, allowAll = false): Promise<AgentTask[]> {
  assertAgentRuntimeReady();
  const normalizedRequester = typeof requester === 'string' ? requester.trim() : undefined;
  if (requester !== undefined && !normalizedRequester) return [];
  if (!normalizedRequester && !allowAll) return [];
  if (persistence) {
    return persistence.list<AgentTask>('task', limit, normalizedRequester, allowAll);
  }
  return [...tasks.values()]
    .filter((task) => allowAll || task.requester === normalizedRequester)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, Math.max(1, Math.min(500, limit)));
}

export function agentManifest() {
  return {
    protocol: 'GLORIFIER-A2A-v1',
    description: 'Agent-to-agent task protocol for GLORIFIER autonomous AI collaboration.',
    discovery: '/api/agents',
    taskEndpoint: '/api/agents/tasks',
    taskStatus: '/api/agents/tasks/:id',
    humanAuthority: {
      finalAuthority: true,
      autonomousProductionDeploy: false,
      autonomousMerge: false,
      autonomousFinancialCommitment: false,
      glrSettlement: 'human-authorized-and-evidence-gated',
      autonomousLegalCommitment: false
    },
    agents
  };
}
