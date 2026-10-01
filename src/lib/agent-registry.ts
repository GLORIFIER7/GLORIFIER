import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { listConnections, registerConnection, recordConnectionEvent } from './connection-registry';

export type AgentProtocol = 'GLORIFIER-A2A-v1' | 'MCP' | 'A2A' | 'HTTP';
export type AgentStatus = 'discovered' | 'authorized' | 'active' | 'degraded' | 'offline' | 'revoked';

export interface RegisteredAgent {
  id: string;
  name: string;
  provider: string;
  role: string;
  protocol: AgentProtocol;
  capabilities: string[];
  endpoint: string;
  authType: string;
  status: AgentStatus;
  risk: 'low' | 'medium' | 'high' | 'critical';
  scopes: string[];
  connectionId: string | null;
  requiresHumanApproval: boolean;
  lastVerifiedAt: string | null;
  metadata: Record<string, unknown>;
}

const seedAgents: Omit<RegisteredAgent, 'connectionId' | 'lastVerifiedAt'>[] = [
  {
    id: 'glorifier-ai-ceo', name: 'GLORIFIER AI CEO', provider: 'glorifier', role: 'orchestrator',
    protocol: 'GLORIFIER-A2A-v1', capabilities: ['delegate','prioritize','synthesize','govern'],
    endpoint: '/api/agents/ai-ceo', authType: 'internal', status: 'active', risk: 'high', scopes: ['orchestration'],
    requiresHumanApproval: true, metadata: { local: true }
  },
  {
    id: 'openai-gpt', name: 'OpenAI GPT', provider: 'openai', role: 'reasoning',
    protocol: 'HTTP', capabilities: ['reason','code-review','synthesis'],
    endpoint: 'server://openai', authType: 'api_key', status: process.env.OPENAI_API_KEY ? 'authorized' : 'discovered',
    risk: 'medium', scopes: ['model-inference'], requiresHumanApproval: true, metadata: { configured: Boolean(process.env.OPENAI_API_KEY) }
  },
  {
    id: 'google-gemini', name: 'Google Gemini', provider: 'gemini', role: 'engineering-collaborator',
    protocol: 'HTTP', capabilities: ['research','code-analysis','recovery','multimodal'],
    endpoint: 'server://gemini-interactions', authType: 'api_key', status: process.env.GEMINI_API_KEY ? 'authorized' : 'discovered',
    risk: 'medium', scopes: ['model-inference'], requiresHumanApproval: true, metadata: { configured: Boolean(process.env.GEMINI_API_KEY), interface: 'Interactions API' }
  },
  {
    id: 'hugging-face', name: 'Hugging Face', provider: 'hugging-face', role: 'model-and-dataset-ecosystem',
    protocol: 'HTTP', capabilities: ['model-discovery','dataset-discovery','paper-search','space-discovery','jobs'],
    endpoint: 'https://huggingface.co/', authType: 'oauth2', status: 'discovered', risk: 'medium', scopes: [],
    requiresHumanApproval: true, metadata: { external: true }
  },
  {
    id: 'meta-ai', name: 'Meta AI / Llama', provider: 'meta', role: 'ai-platform',
    protocol: 'HTTP', capabilities: ['llama-research','developer-platform','facebook-pages','instagram','messenger'],
    endpoint: 'https://developers.facebook.com/', authType: 'oauth2', status: 'discovered', risk: 'high', scopes: [],
    requiresHumanApproval: true, metadata: { external: true }
  }
];

const AGENT_TABLE = 'glorifier_registered_agents';
function connectionId(agentId: string) { return `agent-${agentId}`; }
async function ensureAgentTable() { await getPostgresPool().query(`CREATE TABLE IF NOT EXISTS ${AGENT_TABLE} (id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL, role TEXT NOT NULL, protocol TEXT NOT NULL, capabilities JSONB NOT NULL DEFAULT '[]'::jsonb, endpoint TEXT NOT NULL, auth_type TEXT NOT NULL, risk TEXT NOT NULL, scopes JSONB NOT NULL DEFAULT '[]'::jsonb, requires_human_approval BOOLEAN NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`); }

export async function initializeAgentRegistry() {
  await ensureAgentTable();
  for (const agent of seedAgents) {
    await registerConnection({
      id: connectionId(agent.id),
      provider: agent.provider,
      displayName: agent.name,
      authType: agent.authType as any,
      status: agent.status === 'authorized' ? 'authorized' : 'discovered',
      scopes: agent.scopes,
      risk: agent.risk,
      accountRef: null,
      expiresAt: null,
      lastVerifiedAt: null,
      requiresHumanApproval: agent.requiresHumanApproval,
      metadata: { ...agent.metadata, registryType: 'agent', protocol: agent.protocol, role: agent.role, capabilities: agent.capabilities, endpoint: agent.endpoint }
    });
  }
}

export async function listRegisteredAgents(): Promise<RegisteredAgent[]> {
  await initializeAgentRegistry();
  const connections = await listConnections();
  const stored = await getPostgresPool().query(`SELECT * FROM ${AGENT_TABLE} ORDER BY created_at ASC`);
  const dynamicAgents: Omit<RegisteredAgent, 'connectionId' | 'lastVerifiedAt'>[] = stored.rows.map((row: any) => ({ id: row.id, name: row.name, provider: row.provider, role: row.role, protocol: row.protocol, capabilities: row.capabilities || [], endpoint: row.endpoint, authType: row.auth_type, status: 'discovered', risk: row.risk, scopes: row.scopes || [], requiresHumanApproval: row.requires_human_approval, metadata: row.metadata || {} }));
  return [...seedAgents, ...dynamicAgents].map(agent => {
    const c = connections.find(x => x.id === connectionId(agent.id));
    return {
      ...agent,
      connectionId: c?.id || null,
      status: c?.status === 'authorized' ? 'authorized' : agent.status,
      lastVerifiedAt: c?.lastVerifiedAt || null
    };
  });
}

export async function registerExternalAgent(input: {
  name: string; provider: string; role?: string; protocol?: AgentProtocol;
  capabilities?: string[]; endpoint: string; authType?: string;
  risk?: RegisteredAgent['risk']; scopes?: string[]; metadata?: Record<string, unknown>;
}) {
  await initializeAgentRegistry();
  const id = `agent-${crypto.randomUUID()}`;
  const agent = {
    id, name: input.name, provider: input.provider, role: input.role || 'external-agent',
    protocol: input.protocol || 'HTTP', capabilities: input.capabilities || [], endpoint: input.endpoint,
    authType: input.authType || 'oauth2', status: 'discovered' as const,
    risk: input.risk || 'medium', scopes: input.scopes || [], connectionId: id, requiresHumanApproval: true,
    lastVerifiedAt: null, metadata: { ...(input.metadata || {}), registryType: 'agent' }
  };
  await registerConnection({
    id, provider: agent.provider, displayName: agent.name, authType: agent.authType as any,
    status: 'discovered', scopes: agent.scopes, risk: agent.risk, accountRef: null, expiresAt: null,
    lastVerifiedAt: null, requiresHumanApproval: true, metadata: agent.metadata
  });
  await getPostgresPool().query(`INSERT INTO ${AGENT_TABLE}(id,name,provider,role,protocol,capabilities,endpoint,auth_type,risk,scopes,requires_human_approval,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11,$12::jsonb) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,provider=EXCLUDED.provider,role=EXCLUDED.role,protocol=EXCLUDED.protocol,capabilities=EXCLUDED.capabilities,endpoint=EXCLUDED.endpoint,auth_type=EXCLUDED.auth_type,risk=EXCLUDED.risk,scopes=EXCLUDED.scopes,requires_human_approval=EXCLUDED.requires_human_approval,metadata=EXCLUDED.metadata`, [id,agent.name,agent.provider,agent.role,agent.protocol,JSON.stringify(agent.capabilities),agent.endpoint,agent.authType,agent.risk,JSON.stringify(agent.scopes),agent.requiresHumanApproval,JSON.stringify(agent.metadata)]);
  await recordConnectionEvent(id, 'agent_registered', 'human-owner', { protocol: agent.protocol, endpoint: agent.endpoint, scopes: agent.scopes });
  return agent;
}

export async function synchronizeRegisteredAgents(actor = 'human-owner') {
  const agents = await listRegisteredAgents();
  const results = [];
  for (const agent of agents) {
    const event = await recordConnectionEvent(agent.connectionId!, 'agent_synchronization_snapshot', actor, {
      agentId: agent.id, provider: agent.provider, protocol: agent.protocol,
      status: agent.status, capabilities: agent.capabilities, scopes: agent.scopes,
      endpoint: agent.endpoint, synchronizedAt: new Date().toISOString()
    });
    results.push({ agentId: agent.id, eventId: event.id, status: agent.status, authorized: agent.status === 'authorized' || agent.status === 'active' });
  }
  return results;
}
