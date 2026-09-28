import { randomUUID } from 'node:crypto';

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

export function createAgentSession(
  agentId: string,
  options: { maxContextTokens?: number; sessionId?: string } = {},
): AgentSession {
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
  sessions.set(session.id, session);
  return session;
}

export function getAgentSession(sessionId: string): AgentSession | null {
  return sessions.get(sessionId) || null;
}

export function recordAgentTurn(sessionId: string, contextTokens: number): AgentSession {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Unknown agent session: ${sessionId}`);

  const nextContextTokens = Math.max(0, Math.floor(contextTokens));
  const updated: AgentSession = {
    ...session,
    updatedAt: new Date().toISOString(),
    turnCount: session.turnCount + 1,
    contextTokens: nextContextTokens,
    compactionRecommended: nextContextTokens >= Math.floor(session.maxContextTokens * 0.8),
  };

  sessions.set(sessionId, updated);
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

export function boundSubagentCount(requested: number, maximum = 4): number {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return Math.min(Math.floor(requested), Math.max(1, Math.floor(maximum)));
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
      sessions.set(session.id, session);
      throw new Error(`${decision.requiresHumanApproval ? 'Tool approval required' : 'Tool authorization denied'}: ${tool.name} — ${decision.reason}`);
    }
  }

  // The harness never receives secrets as part of this interface. Provider
  // credentials remain in the provider/connection layer.
  const result = await options.run();
  if (options.humanApproval) {
    const approvedSession = sessions.get(options.session.id) || options.session;
    sessions.set(options.session.id, {
      ...approvedSession,
      lastHumanApproval: options.humanApproval,
    });
  }
  const session = recordAgentTurn(options.session.id, options.contextTokens);
  return { result, session };
}
