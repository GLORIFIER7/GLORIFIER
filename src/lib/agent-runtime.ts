import { getCapabilityPolicy, listCapabilityPolicies } from './capability-authorization';
import { newId } from './new-id';
import { getPostgresPool } from './db/postgres';
import { PostgresAgentStateStore } from './agent-state-store';

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
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
};

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

const tasks = new Map<string, AgentTask>();
let persistence: PostgresAgentStateStore | null = null;
let persistenceMode: 'uninitialized' | 'postgres' | 'memory-fallback' = 'uninitialized';

export async function initializeAgentRuntimePersistence(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    persistence = null;
    persistenceMode = 'memory-fallback';
    return false;
  }

  const store = new PostgresAgentStateStore(async (sql, values) => {
    const result = await getPostgresPool().query(sql, values as any[]);
    return { rows: result.rows as Array<Record<string, unknown>>, rowCount: result.rowCount };
  });
  await store.initialize();
  const recovered = await store.recoverInterruptedTasks();
  const restored = await store.list<AgentTask>('task', 500);
  tasks.clear();
  for (const task of restored) tasks.set(task.id, task);
  persistence = store;
  persistenceMode = 'postgres';
  if (recovered > 0) {
    console.warn(`[AgentRuntime] marked ${recovered} interrupted task(s) failed; automatic replay is disabled.`);
  }
  return true;
}

export function getAgentRuntimePersistenceStatus() {
  return { mode: persistenceMode, durable: persistenceMode === 'postgres' };
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
  const task: AgentTask = {
    id: newId('task'),
    ...input,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'queued'
  };
  // Persist before exposing a newly accepted task to the caller.
  if (persistence) await persistence.save('task', task);
  tasks.set(task.id, task);
  return task;
}

export async function updateAgentTask(id: string, patch: Partial<AgentTask>): Promise<AgentTask | null> {
  const current = tasks.get(id) || (persistence ? await persistence.get<AgentTask>('task', id) : null);
  if (!current) return null;
  const updated = { ...current, ...patch, id: current.id, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
  // A database failure is returned to the route; uncommitted state is not reported as durable.
  if (persistence) await persistence.save('task', updated);
  tasks.set(id, updated);
  return updated;
}

export async function getAgentTask(id: string): Promise<AgentTask | null> {
  const cached = tasks.get(id);
  if (cached) return cached;
  const restored = persistence ? await persistence.get<AgentTask>('task', id) : null;
  if (restored) tasks.set(id, restored);
  return restored;
}

export async function listAgentTasks(limit = 50): Promise<AgentTask[]> {
  if (persistence) {
    const durableTasks = await persistence.list<AgentTask>('task', limit);
    for (const task of durableTasks) tasks.set(task.id, task);
    return durableTasks;
  }
  return [...tasks.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0, Math.max(1, Math.min(500, limit)));
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
