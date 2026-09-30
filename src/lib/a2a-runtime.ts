import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { listAgentCards, routeAgentCapability } from './agent-runtime';

export type A2ATaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'blocked' | 'degraded';
export type A2AProtocol = 'A2A' | 'MCP' | 'GLORIFIER-A2A-v1';

export interface A2ATask {
  id: string;
  parentTaskId: string | null;
  requesterAgentId: string;
  targetAgentId: string | null;
  capability: string;
  objective: string;
  input: unknown;
  status: A2ATaskStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  result?: unknown;
  error?: string;
  evidenceId?: string;
}

export interface A2AHandoff {
  protocol: A2AProtocol;
  version: '1';
  handoffId: string;
  taskId: string;
  fromAgentId: string;
  toAgentId: string;
  capability: string;
  objective: string;
  payload: unknown;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  signature: string;
  signatureAlgorithm: 'HMAC-SHA256';
}

const memoryTasks = new Map<string, A2ATask>();
const memoryHandoffs = new Map<string, A2AHandoff>();
let initialized = false;

function signingSecret() {
  return String(process.env.GLORIFIER_A2A_SIGNING_SECRET || '').trim();
}

function canonical(value: unknown) {
  return JSON.stringify(value);
}

function signatureInput(h: Omit<A2AHandoff, 'signature'>) {
  return canonical({
    protocol: h.protocol, version: h.version, handoffId: h.handoffId, taskId: h.taskId,
    fromAgentId: h.fromAgentId, toAgentId: h.toAgentId, capability: h.capability,
    objective: h.objective, payload: h.payload, issuedAt: h.issuedAt, expiresAt: h.expiresAt, nonce: h.nonce,
    signatureAlgorithm: h.signatureAlgorithm
  });
}

function sign(h: Omit<A2AHandoff, 'signature'>) {
  const secret = signingSecret();
  if (!secret) throw new Error('A2A signing is not configured');
  return crypto.createHmac('sha256', secret).update(signatureInput(h)).digest('base64url');
}

export function initializeA2ARuntime() {
  if (initialized) return;
  initialized = true;
  const db = getPostgresPool();
  void db.query(`
    CREATE TABLE IF NOT EXISTS a2a_tasks (
      id TEXT PRIMARY KEY,
      parent_task_id TEXT,
      requester_agent_id TEXT NOT NULL,
      target_agent_id TEXT,
      capability TEXT NOT NULL,
      objective TEXT NOT NULL,
      input JSONB,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      result JSONB,
      error TEXT,
      evidence_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_a2a_tasks_status ON a2a_tasks(status);
    CREATE TABLE IF NOT EXISTS a2a_handoffs (
      handoff_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      from_agent_id TEXT NOT NULL,
      to_agent_id TEXT NOT NULL,
      envelope JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(error => console.warn('[A2A] persistence initialization deferred:', error?.message));
}

function persistTask(task: A2ATask) {
  memoryTasks.set(task.id, task);
  const db = getPostgresPool();
  void db.query(
    `INSERT INTO a2a_tasks(id,parent_task_id,requester_agent_id,target_agent_id,capability,objective,input,status,attempts,max_attempts,result,error,evidence_id,created_at,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,attempts=EXCLUDED.attempts,result=EXCLUDED.result,error=EXCLUDED.error,evidence_id=EXCLUDED.evidence_id,updated_at=EXCLUDED.updated_at`,
    [task.id, task.parentTaskId, task.requesterAgentId, task.targetAgentId, task.capability, task.objective,
      task.input ?? null, task.status, task.attempts, task.maxAttempts, task.result ?? null, task.error ?? null,
      task.evidenceId ?? null, task.createdAt, task.updatedAt]
  ).catch(error => console.warn('[A2A] task persistence deferred:', error?.message));
}

function persistHandoff(h: A2AHandoff) {
  memoryHandoffs.set(h.handoffId, h);
  const db = getPostgresPool();
  void db.query(
    'INSERT INTO a2a_handoffs(handoff_id,task_id,from_agent_id,to_agent_id,envelope) VALUES($1,$2,$3,$4,$5) ON CONFLICT(handoff_id) DO NOTHING',
    [h.handoffId, h.taskId, h.fromAgentId, h.toAgentId, h]
  ).catch(error => console.warn('[A2A] handoff persistence deferred:', error?.message));
}

export function getA2AProtocolManifest() {
  return {
    protocol: 'GLORIFIER-A2A-v1',
    interoperableProtocols: ['A2A', 'MCP'],
    discovery: '/.well-known/glorifier-agent.json',
    taskEndpoint: '/api/a2a/tasks',
    handoffEndpoint: '/api/a2a/handoffs',
    lifecycle: ['queued','running','completed','failed','blocked','degraded'],
    security: ['agent-identity','capability-authorization','HMAC-SHA256-signed-handoffs','expiry','nonce','audit-trail'],
    truthBoundary: 'A task result is not verified truth until linked to qualifying external evidence.',
    financialBoundary: 'No autonomous trading, withdrawal, transfer, or fund movement.',
    humanAuthority: true
  } as const;
}

export function discoverA2ACapabilities() {
  return listAgentCards().map(agent => ({
    agentId: agent.id,
    name: agent.name,
    role: agent.role,
    capabilities: agent.capabilities,
    protocol: agent.protocol,
    endpoint: agent.endpoint,
    status: agent.status
  }));
}

export function createA2ATask(input: {
  requesterAgentId: string;
  targetAgentId?: string;
  capability: string;
  objective: string;
  input?: unknown;
  parentTaskId?: string;
  maxAttempts?: number;
}) {
  const now = new Date().toISOString();
  const task: A2ATask = {
    id: `a2a-${crypto.randomUUID()}`,
    parentTaskId: input.parentTaskId || null,
    requesterAgentId: input.requesterAgentId,
    targetAgentId: input.targetAgentId || null,
    capability: input.capability.trim().toLowerCase(),
    objective: input.objective,
    input: input.input ?? null,
    status: 'queued',
    attempts: 0,
    maxAttempts: Math.max(1, Math.min(5, input.maxAttempts || 3)),
    createdAt: now,
    updatedAt: now
  };
  persistTask(task);
  return task;
}

export function getA2ATask(id: string) {
  return memoryTasks.get(id) || null;
}

export function listA2ATasks(limit = 50) {
  return [...memoryTasks.values()].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, Math.min(100, limit));
}

export function createSignedHandoff(task: A2ATask, toAgentId: string, payload: unknown, ttlSeconds = 300) {
  if (!signingSecret()) throw new Error('A2A signing is not configured');
  const issuedAt = new Date();
  const unsigned: Omit<A2AHandoff, 'signature'> = {
    protocol: 'GLORIFIER-A2A-v1',
    version: '1',
    handoffId: `handoff-${crypto.randomUUID()}`,
    taskId: task.id,
    fromAgentId: task.requesterAgentId,
    toAgentId,
    capability: task.capability,
    objective: task.objective,
    payload,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + ttlSeconds * 1000).toISOString(),
    nonce: crypto.randomBytes(18).toString('base64url'),
    signatureAlgorithm: 'HMAC-SHA256'
  };
  const handoff = { ...unsigned, signature: sign(unsigned) };
  persistHandoff(handoff);
  return handoff;
}

export function verifySignedHandoff(handoff: A2AHandoff) {
  try {
    if (!signingSecret()) return { valid: false, reason: 'signing_not_configured' as const };
    if (new Date(handoff.expiresAt).getTime() <= Date.now()) return { valid: false, reason: 'expired' as const };
    const { signature, ...unsigned } = handoff;
    const expected = sign(unsigned);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valid: false, reason: 'invalid_signature' as const };
    return { valid: true, reason: 'verified' as const };
  } catch {
    return { valid: false, reason: 'verification_error' as const };
  }
}

export async function executeA2ATask(
  task: A2ATask,
  executor: (prompt: string, options?: Record<string, unknown>) => Promise<{ text: string; model: string } | null>,
) {
  const route = routeAgentCapability(task.capability);
  const candidates = task.targetAgentId ? [task.targetAgentId] : route.specialists.length ? route.specialists : ['ai-ceo'];
  let lastError = 'No eligible agent/provider available';

  for (let attempt = 1; attempt <= task.maxAttempts; attempt += 1) {
    task.attempts = attempt;
    task.status = 'running';
    task.updatedAt = new Date().toISOString();
    persistTask(task);

    const target = candidates[(attempt - 1) % candidates.length];
    try {
      const handoff = createSignedHandoff(task, target, task.input);
      const verified = verifySignedHandoff(handoff);
      if (!verified.valid) throw new Error(`Handoff rejected: ${verified.reason}`);

      const prompt = [
        'You are an authorized GLORIFIER A2A specialist.',
        `Agent identity: ${target}`,
        `Capability: ${task.capability}`,
        `Objective: ${task.objective}`,
        task.input ? `Input: ${JSON.stringify(task.input)}` : '',
        'Return an evidence-aware artifact. Never claim an external action happened unless external evidence proves it.',
        'Explicitly distinguish observation, inference, proposed action, and verification.'
      ].filter(Boolean).join('\\n');

      const result = await executor(prompt, { taskId: task.id, agentId: target, capability: task.capability });
      if (!result) throw new Error('No configured provider available for this agent task');

      const evidenceId = `a2a-evidence-${crypto.randomUUID()}`;
      task.status = 'completed';
      task.result = { agentId: target, model: result.model, artifact: result.text, handoffId: handoff.handoffId };
      task.evidenceId = evidenceId;
      task.error = undefined;
      task.updatedAt = new Date().toISOString();
      persistTask(task);
      return task;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      task.error = lastError;
      task.status = attempt === task.maxAttempts ? 'failed' : 'degraded';
      task.updatedAt = new Date().toISOString();
      persistTask(task);
    }
  }
  return task;
}

export async function runA2AE2ETest(
  executor: (prompt: string, options?: Record<string, unknown>) => Promise<{ text: string; model: string } | null>,
) {
  const startedAt = new Date().toISOString();
  const root = createA2ATask({
    requesterAgentId: 'ai-ceo',
    capability: 'research',
    objective: 'Produce a compact factual research artifact for A2A handoff verification.',
    input: { test: true, scope: 'GLORIFIER A2A runtime' },
    maxAttempts: 2
  });
  const first = await executeA2ATask(root, executor);
  if (first.status !== 'completed') {
    return { ok: false, status: 'degraded', startedAt, completedAt: new Date().toISOString(), stage: 'first-agent', task: first,
      evidenceRule: 'No successful external inference means no successful E2E verification.' };
  }

  const second = createA2ATask({
    requesterAgentId: String(first.result && typeof first.result === 'object' ? (first.result as any).agentId || 'research-agent' : 'research-agent'),
    capability: 'synthesis',
    objective: 'Synthesize the preceding agent artifact and preserve its evidence boundary.',
    input: { previousTaskId: first.id, previousArtifact: first.result },
    parentTaskId: first.id,
    maxAttempts: 2
  });
  const secondResult = await executeA2ATask(second, executor);
  return {
    ok: secondResult.status === 'completed',
    status: secondResult.status === 'completed' ? 'verified-runtime-path' : 'degraded',
    startedAt,
    completedAt: new Date().toISOString(),
    stages: [first, secondResult],
    verification: {
      identity: Boolean(first.requesterAgentId && second.requesterAgentId),
      capabilityDiscovery: Boolean(routeAgentCapability('research').specialists.length),
      signedHandoff: Boolean(first.result && (first.result as any).handoffId),
      taskLifecycle: ['queued','running',first.status,secondResult.status],
      externalInferenceEvidence: secondResult.status === 'completed',
      economicTruth: 'No revenue is inferred or created by this test.'
    }
  };
}
