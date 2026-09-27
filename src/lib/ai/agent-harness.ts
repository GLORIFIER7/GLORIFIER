/**
 * GLORIFIER Agent Harness
 *
 * A provider-neutral execution boundary informed by the useful parts of
 * TrueForge: sessions, tool approvals, subagents, context control and
 * sandbox-aware execution.
 *
 * This is intentionally an internal GLORIFIER abstraction. It does not make
 * GLORIFIER dependent on TrueForge or any single execution vendor.
 */

export type AgentHarnessCapability =
  | 'model'
  | 'mcp-tool'
  | 'skill'
  | 'sandbox'
  | 'approval'
  | 'subagent'
  | 'session';

export type ToolRisk = 'low' | 'medium' | 'high' | 'irreversible';

export interface AgentToolRequest {
  id: string;
  name: string;
  risk: ToolRisk;
  capability: string;
  requiresApproval?: boolean;
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
}

export interface AgentHarnessPolicy {
  enabled: true;
  providerNeutral: true;
  humanApprovalForIrreversibleActions: true;
  toolAccessIsCapabilityScoped: true;
  sandboxIsOptionalAndExplicit: true;
  subagentsAreBounded: true;
  contextCompactionIsAllowed: true;
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
    subagentsAreBounded: true,
    contextCompactionIsAllowed: true,
    sessionsAreStateful: true,
    noSyntheticSuccess: true,
  };
}

export function createAgentSession(
  agentId: string,
  options: { maxContextTokens?: number; sessionId?: string } = {},
): AgentSession {
  const now = new Date().toISOString();
  const session: AgentSession = {
    id: options.sessionId || `session-${crypto.randomUUID()}`,
    agentId,
    createdAt: now,
    updatedAt: now,
    turnCount: 0,
    contextTokens: 0,
    maxContextTokens: options.maxContextTokens || 32_000,
    status: 'active',
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

  const updated: AgentSession = {
    ...session,
    updatedAt: new Date().toISOString(),
    turnCount: session.turnCount + 1,
    contextTokens: Math.max(0, contextTokens),
  };

  sessions.set(sessionId, updated);
  return updated;
}

export function shouldCompactContext(session: AgentSession): boolean {
  return session.contextTokens >= Math.floor(session.maxContextTokens * 0.8);
}

export function authorizeToolRequest(
  request: AgentToolRequest,
  approvedCapabilities: Set<string>,
): { allowed: boolean; requiresHumanApproval: boolean; reason: string } {
  if (!approvedCapabilities.has(request.capability)) {
    return {
      allowed: false,
      requiresHumanApproval: true,
      reason: `Capability not granted: ${request.capability}`,
    };
  }

  const requiresHumanApproval =
    request.requiresApproval === true ||
    request.risk === 'high' ||
    request.risk === 'irreversible';

  return {
    allowed: !requiresHumanApproval,
    requiresHumanApproval,
    reason: requiresHumanApproval
      ? 'Human approval required before tool execution.'
      : 'Capability-scoped tool execution permitted.',
  };
}

export function boundSubagentCount(requested: number, maximum = 4): number {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return Math.min(Math.floor(requested), Math.max(1, maximum));
}

export async function executeAgentTurn<T>(options: {
  session: AgentSession;
  contextTokens: number;
  tools?: AgentToolRequest[];
  approvedCapabilities?: Set<string>;
  run: () => Promise<T>;
}): Promise<{ result: T; session: AgentSession }> {
  const approvedCapabilities = options.approvedCapabilities || new Set<string>();
  const toolRequests = options.tools || [];

  for (const tool of toolRequests) {
    const decision = authorizeToolRequest(tool, approvedCapabilities);
    if (!decision.allowed) {
      const session = {
        ...options.session,
        updatedAt: new Date().toISOString(),
        status: 'waiting-approval' as const,
      };
      sessions.set(session.id, session);
      throw new Error(`Tool approval required: ${tool.name} — ${decision.reason}`);
    }
  }

  const result = await options.run();
  const session = recordAgentTurn(options.session.id, options.contextTokens);
  return { result, session };
}
