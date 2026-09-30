import crypto from 'node:crypto';
import { listRegisteredAgents, type RegisteredAgent } from './agent-registry';

export interface AgentDiscoveryQuery {
  capabilities?: string[];
  protocol?: string;
  role?: string;
  limit?: number;
}

export interface AgentRecommendation {
  agentId: string;
  name: string;
  provider: string;
  score: number;
  reasons: string[];
  capabilities: string[];
  protocol: string;
  status: RegisteredAgent['status'];
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

function tokenSet(values: string[] = []) {
  return new Set(values.flatMap(v => v.toLowerCase().split(/[^a-z0-9_-]+/).filter(Boolean)));
}

function overlap(a: string[], b: string[]) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let hits = 0;
  for (const value of left) if (right.has(value)) hits++;
  return hits / Math.max(left.size, 1);
}

function evidenceScore(agent: RegisteredAgent) {
  const verified = agent.lastVerifiedAt ? 1 : 0;
  const authorized = agent.status === 'authorized' || agent.status === 'active' ? 1 : 0;
  const healthy = agent.status === 'active' ? 1 : agent.status === 'authorized' ? 0.8 : agent.status === 'discovered' ? 0.45 : 0;
  return clamp(0.45 * verified + 0.35 * authorized + 0.20 * healthy);
}

function noveltyScore(agent: RegisteredAgent, all: RegisteredAgent[]) {
  const sameProvider = all.filter(x => x.provider === agent.provider).length;
  return 1 / Math.sqrt(Math.max(1, sameProvider));
}

function stableJitter(id: string) {
  const digest = crypto.createHash('sha256').update(id).digest().readUInt32BE(0);
  return (digest % 1000) / 1000;
}

/**
 * Facebook-like discovery mechanics for an AI-agent network:
 * optimize for useful connections, verified reliability, protocol compatibility,
 * exploration and ecosystem diversity — never raw popularity alone.
 */
export async function recommendAgents(query: AgentDiscoveryQuery = {}): Promise<AgentRecommendation[]> {
  const agents = await listRegisteredAgents();
  const requested = query.capabilities || [];
  const limit = Math.min(50, Math.max(1, query.limit || 12));

  const scored = agents
    .filter(agent => !['revoked', 'offline'].includes(agent.status))
    .filter(agent => !query.protocol || agent.protocol.toLowerCase() === query.protocol.toLowerCase())
    .filter(agent => !query.role || agent.role.toLowerCase().includes(query.role.toLowerCase()))
    .map(agent => {
      const relevance = requested.length ? overlap(requested, agent.capabilities) : 0.5;
      const protocol = query.protocol ? 1 : ['GLORIFIER-A2A-v1', 'A2A', 'MCP'].includes(agent.protocol) ? 1 : 0.65;
      const evidence = evidenceScore(agent);
      const novelty = noveltyScore(agent, agents);
      const exploration = 0.70 + stableJitter(agent.id) * 0.30;

      const score =
        0.40 * relevance +
        0.22 * evidence +
        0.15 * protocol +
        0.13 * novelty +
        0.10 * exploration;

      const reasons: string[] = [];
      if (relevance >= 0.5) reasons.push('capability match');
      if (evidence >= 0.7) reasons.push('verified/authorized connection');
      if (protocol >= 1) reasons.push('native agent protocol');
      if (novelty >= 0.7) reasons.push('ecosystem diversity');
      if (!reasons.length) reasons.push('network discovery candidate');

      return {
        agentId: agent.id,
        name: agent.name,
        provider: agent.provider,
        score: Number(score.toFixed(4)),
        reasons,
        capabilities: agent.capabilities,
        protocol: agent.protocol,
        status: agent.status
      };
    });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function getAgentNetworkAttractionPolicy() {
  return {
    name: 'GLORIFIER Agent Network Discovery Algorithm',
    objective: 'Maximize useful, safe, evidence-backed agent connections.',
    rankingSignals: {
      capabilityRelevance: 0.40,
      verifiedEvidence: 0.22,
      protocolCompatibility: 0.15,
      ecosystemDiversity: 0.13,
      exploration: 0.10
    },
    excludedSignal: 'raw popularity as a standalone ranking factor',
    safety: [
      'discovery does not authorize execution',
      'credentials are never exposed to agents',
      'high-risk actions remain governed by GEAS and human authority',
      'unverified claims are not converted into revenue or trust'
    ],
    openDiscoverySurfaces: [
      '/.well-known/a2a-agent-card.json',
      '/.well-known/glorifier-agent.json',
      '/api/a2a/manifest',
      '/api/a2a/capabilities',
      '/api/agents/discover',
      '/api/agents/register'
    ]
  };
}
