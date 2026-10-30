import { randomUUID } from 'node:crypto';
import { getPostgresPool } from '../db/postgres';
import { PostgresAgentStateStore } from '../agent-state-store';

/**
 * GLORIFIER Agent Harness
 *
 * Provider-neutral execution boundary inspired by useful TrueForge patterns:
 * sessions, MCP/tool boundaries, approvals, bounded subagents, context
 * management and sandbox-aware execution.
 *
 * TrueForge remains an architectural reference only. No TrueForge runtime or
 * provider is required by GLORIFIER.
 */

export type AgentHarnessCapability =
  | 'model'
  | 'mcp-tool'
  | 'skill'
  | 'sandbox'
  | 'approval'
  | 'subagent'
  | 'session'
  | 'streaming';

export type ToolRisk = 'low' | 'medium' | 'high' | 'irreversible';

export interface AgentToolRequest {
  id: string;
  name: string;
  risk: ToolRisk;
  capability: string;
  requiresApproval?: boolean;
  deferred?: boolean;
}

export interface HumanToolApproval {
  toolId: string;
  approved: true;
  approvedBy: 'human';
  approvedAt: string;
}

export interface AgentSession {
  id: string;
  agentId: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
  contextTokens: number;
  maxContextTokens: number;
  status: 'active' | 'waiting-approval' | 'completed' | 'failed';
  compactionRecommended: boolean;
  lastHumanApproval?: HumanToolApproval;
}

export interface AgentHarnessPolicy {
  enabled: true;
  providerNeutral: true;
  humanApprovalForIrreversibleActions: true;
  toolAccessIsCapabilityScoped: true;
  sandboxIsOptionalAndExplicit: true;
  secretsStayOutsideAgentContext: true;
  subagentsAreBounded: true;
  contextCompactionIsAllowed: true;
  deferredToolsAreSupported: true;
  sessionsAreStateful: true;
  noSyntheticSuccess: true;
}

const sessions = new Map<string, AgentSession>();
let persistence: PostgresAgentStateStore | null = null;
let persistenceMode: 'uninitialized' | 'postgres' | 'memory-fallback' = 'uninitialized';

export async function initializeAgentHarnessPersistence(): Promise<boolean> {
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
  const restored = await store.list<AgentSession>('session', 500);
  sessions.clear();
  for (const session of restored) sessions.set(session.id, session);
  persistence = store;
  persistenceMode = 'postgres';
  return true;
}

export function getAgentHarnessPersistenceStatus() {
  return { mode: persistenceMode, durable: persistenceMode === 'postgres' };
}

async function saveSession(session: AgentSession): Promise<void> {
  if (persistence) await persistence.save('session', session);
  sessions.set(session.id, session);
}

export function getAgentHarnessPolicy(): AgentHarnessPolicy {
  return {
    enabled: true,
    providerNeutral: true,
    humanApprovalForIrreversibleActions: true,
    toolAccessIsCapabilityScoped: true,
    sandboxIsOptionalAndExplicit: true,
    secretsStayOutsideAgentContext: true,
    subagentsAreBounded: true,
    contextCompactionIsAllowed: true,
    deferredToolsAreSupported: true,
    sessionsAreStateful: true,
    noSyntheticSuccess: true,
  };
}

export async function createAgentSession(
  agentId: string,
  options: { maxContextTokens?: number; sessionId?: string } = {},
): Promise<AgentSession> {
  const now = new Date().toISOString();
  const maxContextTokens = Number.isFinite(options.maxContextTokens)
    ? Math.max(1_000, Math.floor(options.maxContextTokens as number))
    : 32_000;

  const session: AgentSession = {
    id: options.sessionId || `session-${randomUUID()}`,
    agentId,
    createdAt: now,
    updatedAt: now,
    turnCount: 0,
    contextTokens: 0,
    maxContextTokens,
    status: 'active',
    compactionRecommended: false,
  };
  await saveSession(session);
  return session;
}

export async function getAgentSession(sessionId: string): Promise<AgentSession | null> {
  if (persistence) {
    const restored = await persistence.get<AgentSession>('session', sessionId);
    if (restored) sessions.set(sessionId, restored);
    else sessions.delete(sessionId);
    return restored;
  }
  return sessions.get(sessionId) || null;
}

export async function recordAgentTurn(sessionId: string, contextTokens: number): Promise<AgentSession> {
  const session = await getAgentSession(sessionId);
  if (!session) throw new Error(`Unknown agent session: ${sessionId}`);

  const nextContextTokens = Number.isFinite(contextTokens) ? Math.max(0, Math.floor(contextTokens)) : 0;
  const updated: AgentSession = {
    ...session,
    updatedAt: new Date().toISOString(),
    turnCount: session.turnCount + 1,
    contextTokens: nextContextTokens,
    compactionRecommended: nextContextTokens >= Math.floor(session.maxContextTokens * 0.8),
  };

  await saveSession(updated);
  return updated;
}

export function shouldCompactContext(session: AgentSession): boolean {
  return session.compactionRecommended || session.contextTokens >= Math.floor(session.maxContextTokens * 0.8);
}

export function authorizeToolRequest(
  request: AgentToolRequest,
  approvedCapabilities: Set<string>,
  humanApproval?: HumanToolApproval,
): { allowed: boolean; requiresHumanApproval: boolean; reason: string } {
  if (!approvedCapabilities.has(request.capability)) {
    return {
      allowed: false,
      requiresHumanApproval: false,
      reason: `Capability not granted: ${request.capability}`,
    };
  }

  const requiresHumanApproval =
    request.requiresApproval === true ||
    request.risk === 'high' ||
    request.risk === 'irreversible';

  const approvalMatches =
    humanApproval?.toolId === request.id &&
    humanApproval.approved === true &&
    humanApproval.approvedBy === 'human' &&
    Number.isFinite(Date.parse(humanApproval.approvedAt));

  return {
    allowed: !requiresHumanApproval || approvalMatches,
    requiresHumanApproval: requiresHumanApproval && !approvalMatches,
    reason:
      !requiresHumanApproval
        ? 'Capability-scoped tool execution permitted.'
        : approvalMatches
          ? 'Explicit human approval verified.'
          : 'Human approval required before tool execution.',
  };
}

export function filterDeferredTools(
  tools: AgentToolRequest[],
  includeDeferred = false,
): AgentToolRequest[] {
  return includeDeferred ? tools : tools.filter((tool) => !tool.deferred);
}

export function sandboxRequired(
  tools: AgentToolRequest[],
  sandboxCapabilities = new Set(['sandbox', 'code-execution', 'filesystem']),
): boolean {
  return tools.some((tool) => sandboxCapabilities.has(tool.capability));
}

export async function executeAgentTurn<T>(options: {
  session: AgentSession;
  contextTokens: number;
  tools?: AgentToolRequest[];
  approvedCapabilities?: Set<string>;
  humanApproval?: HumanToolApproval;
  run: () => Promise<T>;
}): Promise<{ result: T; session: AgentSession }> {
  const approvedCapabilities = options.approvedCapabilities || new Set<string>();
  const toolRequests = filterDeferredTools(options.tools || []);

  for (const tool of toolRequests) {
    const decision = authorizeToolRequest(tool, approvedCapabilities, options.humanApproval);
    if (!decision.allowed) {
      const session = {
        ...options.session,
        updatedAt: new Date().toISOString(),
        status: 'waiting-approval' as const,
      };
      await saveSession(session);
      throw new Error(`${decision.requiresHumanApproval ? 'Tool approval required' : 'Tool authorization denied'}: ${tool.name} — ${decision.reason}`);
    }
  }

  // The harness never receives secrets as part of this interface. Provider
  // credentials remain in the provider/connection layer.
  let result: T;
  try {
    result = await options.run();
  } catch (error) {
    const current = await getAgentSession(options.session.id) || options.session;
    await saveSession({
      ...current,
      updatedAt: new Date().toISOString(),
      status: 'failed',
    });
    throw error;
  }

  if (options.humanApproval) {
    const approvedSession = await getAgentSession(options.session.id) || options.session;
    await saveSession({
      ...approvedSession,
      lastHumanApproval: options.humanApproval,
    });
  }
  const session = await recordAgentTurn(options.session.id, options.contextTokens);
  return { result, session };
}
