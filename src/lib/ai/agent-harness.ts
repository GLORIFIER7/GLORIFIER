import { randomUUID } from 'node:crypto';
import { createPostgresAgentStateStore } from '../agent-state-store';
import type { PostgresAgentStateStore } from '../agent-state-store';
import { initializeOptionalPostgresAgentStore } from '../agent-persistence-bootstrap';

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

type AgentHarnessPersistence = Pick<PostgresAgentStateStore, 'initialize' | 'get' | 'save' | 'incrementSessionTurn'>;

/**
 * An action completed, but the resulting session state could not be persisted.
 * Callers must preserve the result and must not retry the external action blindly.
 */
export class AgentTurnPersistenceError<T = unknown> extends Error {
  readonly persisted = false;
  readonly actionCompleted = true;

  constructor(
    readonly sessionId: string,
    readonly result: T,
    readonly persistenceError: unknown,
  ) {
    super('Agent action completed, but session state could not be persisted. Do not retry the action blindly.');
    this.name = 'AgentTurnPersistenceError';
  }
}

function normalizeContextTokens(contextTokens: number): number {
  if (!Number.isFinite(contextTokens) || contextTokens < 0) {
    throw new Error('contextTokens must be a finite, non-negative number.');
  }
  const normalized = Math.floor(contextTokens);
  if (!Number.isSafeInteger(normalized)) {
    throw new Error('contextTokens must normalize to a safe integer.');
  }
  return normalized;
}

const sessions = new Map<string, AgentSession>();
const sessionTurnLocks = new Map<string, Promise<void>>();

async function withSessionTurnLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
  const previous = sessionTurnLocks.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => gate);
  sessionTurnLocks.set(sessionId, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (sessionTurnLocks.get(sessionId) === queued) sessionTurnLocks.delete(sessionId);
  }
}
let persistence: AgentHarnessPersistence | null = null;
let persistenceMode: 'uninitialized' | 'postgres' | 'memory-fallback' = 'uninitialized';

export async function initializeAgentHarnessPersistence(storeOverride?: AgentHarnessPersistence): Promise<boolean> {
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
  // Durable reads are served directly from PostgreSQL; do not hydrate a second
  // unbounded in-process copy of every persisted session.
  sessions.clear();
  persistence = store;
  persistenceMode = 'postgres';
  return true;
}

export function getAgentHarnessPersistenceStatus() {
  return {
    mode: persistenceMode,
    durable: persistenceMode === 'postgres',
    cachedSessions: persistence ? 0 : sessions.size,
  };
}

function assertAgentHarnessReady(): void {
  if (persistenceMode === 'uninitialized') {
    throw new Error('Agent harness persistence is still initializing; retry after backend readiness.');
  }
}

async function saveSession(session: AgentSession): Promise<void> {
  assertAgentHarnessReady();
  if (persistence) {
    await persistence.save('session', session);
    return;
  }
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

  const sessionId = options.sessionId || `session-${randomUUID()}`;
  if (options.sessionId && await getAgentSession(sessionId)) {
    throw new Error(`Agent session already exists: ${sessionId}`);
  }

  const session: AgentSession = {
    id: sessionId,
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
  assertAgentHarnessReady();
  if (persistence) return persistence.get<AgentSession>('session', sessionId);
  return sessions.get(sessionId) || null;
}

export async function recordAgentTurn(sessionId: string, contextTokens: number): Promise<AgentSession> {
  assertAgentHarnessReady();
  const nextContextTokens = normalizeContextTokens(contextTokens);

  if (persistence) {
    const updated = await persistence.incrementSessionTurn<AgentSession>(sessionId, nextContextTokens);
    if (!updated) throw new Error(`Unknown agent session: ${sessionId}`);
    return updated;
  }

  return withSessionTurnLock(sessionId, async () => {
    const session = await getAgentSession(sessionId);
    if (!session) throw new Error(`Unknown agent session: ${sessionId}`);
    const updated: AgentSession = {
      ...session,
      updatedAt: new Date().toISOString(),
      turnCount: session.turnCount + 1,
      contextTokens: nextContextTokens,
      status: 'active',
      compactionRecommended: nextContextTokens >= Math.floor(session.maxContextTokens * 0.8),
    };
    await saveSession(updated);
    return updated;
  });
}

export function shouldCompactContext(session: AgentSession): boolean {
  return session.compactionRecommended || session.contextTokens >= Math.floor(session.maxContextTokens * 0.8);
}

function requiresHumanApprovalForTool(request: AgentToolRequest): boolean {
  return request.requiresApproval === true || request.risk === 'high' || request.risk === 'irreversible';
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

  const requiresHumanApproval = requiresHumanApprovalForTool(request);

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
  // Fail closed before authorizing or starting any side effect.
  assertAgentHarnessReady();
  const normalizedContextTokens = normalizeContextTokens(options.contextTokens);
  const approvedCapabilities = options.approvedCapabilities || new Set<string>();
  const toolRequests = filterDeferredTools(options.tools || []);

  for (const tool of toolRequests) {
    const decision = authorizeToolRequest(tool, approvedCapabilities, options.humanApproval);
    if (!decision.allowed) {
      const current = await getAgentSession(options.session.id) || options.session;
      const session = {
        ...current,
        updatedAt: new Date().toISOString(),
        status: 'waiting-approval' as const,
      };
      await saveSession(session);
      throw new Error(`${decision.requiresHumanApproval ? 'Tool approval required' : 'Tool authorization denied'}: ${tool.name} — ${decision.reason}`);
    }
  }

  // Persist the approval before invoking the tool/model. If execution fails or
  // the process exits mid-run, the durable session still records who authorized it.
  const verifiedApproval = options.humanApproval && toolRequests.some((tool) =>
    requiresHumanApprovalForTool(tool) &&
    authorizeToolRequest(tool, approvedCapabilities, options.humanApproval).allowed
  ) ? options.humanApproval : undefined;
  if (verifiedApproval) {
    const approvedSession = await getAgentSession(options.session.id) || options.session;
    await saveSession({
      ...approvedSession,
      updatedAt: new Date().toISOString(),
      status: 'active',
      lastHumanApproval: verifiedApproval,
    });
  }

  // The harness never receives secrets as part of this interface. Provider
  // credentials remain in the provider/connection layer.
  let result: T;
  try {
    result = await options.run();
  } catch (error) {
    try {
      const current = await getAgentSession(options.session.id) || options.session;
      await saveSession({
        ...current,
        updatedAt: new Date().toISOString(),
        status: 'failed',
      });
    } catch (persistenceError) {
      console.error('[AgentHarness] Could not persist failed session state; preserving original execution error.', {
        executionError: error instanceof Error ? error.message : String(error),
        persistenceError: persistenceError instanceof Error ? persistenceError.message : String(persistenceError),
      });
    }
    throw error;
  }

  try {
    const session = await recordAgentTurn(options.session.id, normalizedContextTokens);
    return { result, session };
  } catch (error) {
    // The external action already completed. Surface its result explicitly so
    // an API caller can reconcile state instead of blindly repeating a side effect.
    throw new AgentTurnPersistenceError(options.session.id, result, error);
  }
}
