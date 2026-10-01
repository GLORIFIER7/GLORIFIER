import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { listRegisteredAgents } from './agent-registry';
import { getModelNetworkSnapshot, runModelNetworkDiscovery } from './model-network';
import { getInternetDiscoveryFabricSnapshot, runInternetDiscoveryFabricCycle } from './internet-discovery-fabric';
import { discoverA2ACapabilities } from './a2a-runtime';
import { get24x7OpportunityDiscoveryStatus, run24x7OpportunityDiscoveryCycle } from './24x7-opportunity-discovery';
import { listVerifiedOutcomes } from './verified-outcomes';

export const GLORIFIER_AI_WEB_NETWORK_VERSION = 'G-AI-WEB-2.0';

export type AIWebNodeType = 'agent' | 'model' | 'provider' | 'endpoint';
export type AIWebEdgeType = 'capability' | 'protocol' | 'provider' | 'evidence' | 'execution';

export interface AIWebNetworkNode {
  id: string;
  type: AIWebNodeType;
  name: string;
  provider: string;
  capabilities: string[];
  status: string;
  protocol: string | null;
  evidenceRefs: string[];
  observedAt: string;
}

const NODE_TABLE = 'glorifier_ai_web_nodes';
const EDGE_TABLE = 'glorifier_ai_web_edges';
const SYNC_TABLE = 'glorifier_ai_web_sync_runs';

export async function initializeAIWebNetwork() {
  const db = getPostgresPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${NODE_TABLE} (
      id TEXT PRIMARY KEY,
      node_type TEXT NOT NULL,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL,
      protocol TEXT,
      evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
      observed_at TIMESTAMPTZ NOT NULL,
      observation_hash TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_web_nodes_type_status ON ${NODE_TABLE}(node_type, status);
    CREATE INDEX IF NOT EXISTS idx_ai_web_nodes_observed ON ${NODE_TABLE}(observed_at DESC);
    CREATE TABLE IF NOT EXISTS ${EDGE_TABLE} (
      id TEXT PRIMARY KEY,
      from_node TEXT NOT NULL,
      to_node TEXT NOT NULL,
      edge_type TEXT NOT NULL,
      capability TEXT,
      evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
      observed_at TIMESTAMPTZ NOT NULL,
      observation_hash TEXT NOT NULL,
      UNIQUE(from_node, to_node, edge_type, capability)
    );
    CREATE INDEX IF NOT EXISTS idx_ai_web_edges_from ON ${EDGE_TABLE}(from_node, observed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_web_edges_capability ON ${EDGE_TABLE}(capability, observed_at DESC);
    CREATE TABLE IF NOT EXISTS ${SYNC_TABLE} (id TEXT PRIMARY KEY, actor TEXT NOT NULL, status TEXT NOT NULL, node_count INTEGER NOT NULL, edge_count INTEGER NOT NULL, errors JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS idx_ai_web_sync_runs_created ON ${SYNC_TABLE}(created_at DESC);
  `);
}

function hash(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function upsertNode(node: AIWebNetworkNode) {
  const observationHash = hash(node);
  await getPostgresPool().query(`
    INSERT INTO ${NODE_TABLE}(id,node_type,name,provider,capabilities,status,protocol,evidence_refs,observed_at,observation_hash)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9,$10)
    ON CONFLICT(id) DO UPDATE SET
      name=EXCLUDED.name, provider=EXCLUDED.provider, capabilities=EXCLUDED.capabilities,
      status=EXCLUDED.status, protocol=EXCLUDED.protocol, evidence_refs=EXCLUDED.evidence_refs,
      observed_at=EXCLUDED.observed_at, observation_hash=EXCLUDED.observation_hash
  `, [node.id,node.type,node.name,node.provider,JSON.stringify(node.capabilities),node.status,node.protocol,JSON.stringify(node.evidenceRefs),node.observedAt,observationHash]);
  return { ...node, observationHash };
}

async function upsertEdge(fromNode: string, toNode: string, edgeType: AIWebEdgeType, capability: string | null, evidenceRefs: string[], observedAt: string) {
  const base = { fromNode, toNode, edgeType, capability, evidenceRefs, observedAt };
  const id = 'edge-' + hash({ fromNode, toNode, edgeType, capability }).slice(0, 32);
  await getPostgresPool().query(`
    INSERT INTO ${EDGE_TABLE}(id,from_node,to_node,edge_type,capability,evidence_refs,observed_at,observation_hash)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
    ON CONFLICT(from_node,to_node,edge_type,capability) DO UPDATE SET
      evidence_refs=EXCLUDED.evidence_refs, observed_at=EXCLUDED.observed_at, observation_hash=EXCLUDED.observation_hash
  `, [id,fromNode,toNode,edgeType,capability,JSON.stringify(evidenceRefs),observedAt,hash(base)]);
}

export async function synchronizeAIWebNetwork(actor = 'glorifier-daemon') {
  await initializeAIWebNetwork();
  const observedAt = new Date().toISOString();
  const nodes: AIWebNetworkNode[] = [];
  const edges: Array<{fromNode:string;toNode:string;edgeType:AIWebEdgeType;capability:string|null;evidenceRefs:string[]}> = [];

  const agents = await listRegisteredAgents();
  const errors: string[] = [];
  for (const agent of agents) {
    const node: AIWebNetworkNode = {
      id: `agent:${agent.id}`, type: 'agent', name: agent.name, provider: agent.provider,
      capabilities: agent.capabilities, status: agent.status, protocol: agent.protocol,
      evidenceRefs: agent.lastVerifiedAt ? [`agent-verified:${agent.id}:${agent.lastVerifiedAt}`] : [], observedAt
    };
    nodes.push(await upsertNode(node));
    for (const capability of agent.capabilities) {
      const edge = { fromNode: node.id, toNode: `capability:${capability.toLowerCase()}`, edgeType: 'capability' as const, capability: capability.toLowerCase(), evidenceRefs: node.evidenceRefs };
      edges.push(edge);
      await upsertEdge(edge.fromNode, edge.toNode, edge.edgeType, edge.capability, edge.evidenceRefs, observedAt);
    }
  }

  const models = await getModelNetworkSnapshot(1000);
  for (const model of models) {
    const node: AIWebNetworkNode = {
      id: `model:${model.providerId}:${model.model}`, type: 'model', name: model.model, provider: model.providerName,
      capabilities: model.capabilities, status: model.state, protocol: null, evidenceRefs: model.evidenceRefs, observedAt
    };
    nodes.push(await upsertNode(node));
    const providerNode = `provider:${model.providerId}`;
    for (const capability of model.capabilities) {
      const edge = { fromNode: node.id, toNode: `capability:${capability.toLowerCase()}`, edgeType: 'capability' as const, capability: capability.toLowerCase(), evidenceRefs: model.evidenceRefs };
      edges.push(edge);
      await upsertEdge(edge.fromNode, edge.toNode, edge.edgeType, edge.capability, edge.evidenceRefs, observedAt);
    }
    await upsertEdge(node.id, providerNode, 'provider', null, model.evidenceRefs, observedAt);
  }

  for (const capability of discoverA2ACapabilities()) {
    await upsertEdge(`agent:${capability.agentId}`, `protocol:${capability.protocol}`, 'protocol', null, [], observedAt);
  }

  const result = {
    ok: errors.length === 0, version: GLORIFIER_AI_WEB_NETWORK_VERSION, actor, observedAt,
    nodeCount: nodes.length, edgeCount: edges.length,
    nodes,
    protocolSurface: ['/\.well-known/glorifier-agent.json','/api/a2a/manifest','/api/a2a/capabilities'],
    truthBoundary: 'Network presence, discovery, or registration does not prove authorization, reachability, execution, settlement, ownership, or revenue.',
    executionRule: 'Only explicitly authorized capabilities and connections may execute; high-risk and irreversible actions remain human-governed.',
    errors
  };
  await getPostgresPool().query(`INSERT INTO ${SYNC_TABLE}(id,actor,status,node_count,edge_count,errors) VALUES($1,$2,$3,$4,$5,$6::jsonb)`, ['sync-' + crypto.randomUUID(), actor, result.ok ? 'completed' : 'degraded', result.nodeCount, result.edgeCount, JSON.stringify(errors)]);
  return result;
}

export async function runAIWebNetworkCycle(actor = 'glorifier-daemon') {
  const discovery = await runInternetDiscoveryFabricCycle(actor);
  const models = await runModelNetworkDiscovery(actor);
  const opportunities = await run24x7OpportunityDiscoveryCycle(actor);
  const network = await synchronizeAIWebNetwork(actor);
  const outcomes = await listVerifiedOutcomes(100);
  return {
    ok: true, version: GLORIFIER_AI_WEB_NETWORK_VERSION, actor,
    stages: {
      persistentDiscovery: { ok: true, observationCount: discovery.observationCount },
      modelIdentityDiscovery: { ok: true, nodeCount: models.nodeCount },
      capabilityAndAgentNetwork: { ok: true, nodeCount: network.nodeCount, edgeCount: network.edgeCount },
      governedOpportunityDiscovery: { ok: true, opportunitiesCreated: opportunities.opportunitiesCreated, findingsObserved: opportunities.findingsObserved },
      verifiedOutcomes: { count: outcomes.filter((x:any) => x.verificationStatus === 'verified').length }
    },
    network,
    truthBoundary: network.truthBoundary
  };
}

export async function getAIWebNetworkSnapshot(limit = 250) {
  await initializeAIWebNetwork();
  const safe = Math.max(1, Math.min(1000, limit));
  const [nodes, edges, opportunities, outcomes] = await Promise.all([
    getPostgresPool().query(`SELECT * FROM ${NODE_TABLE} ORDER BY observed_at DESC LIMIT $1`, [safe]),
    getPostgresPool().query(`SELECT * FROM ${EDGE_TABLE} ORDER BY observed_at DESC LIMIT $1`, [safe * 2]),
    get24x7OpportunityDiscoveryStatus(),
    listVerifiedOutcomes(100)
  ]);
  return {
    ok: true, version: GLORIFIER_AI_WEB_NETWORK_VERSION,
    nodes: nodes.rows, edges: edges.rows,
    opportunities: opportunities.recentRuns,
    opportunityFreshness: opportunities.freshness,
    verifiedOutcomeCount: outcomes.filter((x:any) => x.verificationStatus === 'verified').length,
    evidenceBackedOutcomeCount: outcomes.filter((x:any) => x.verificationStatus === 'evidence_backed').length,
    truthBoundary: 'No evidence means UNKNOWN / NOT VERIFIED. Verified economic outcomes require qualifying external evidence and an external reference.'
  };
}

export function getAIWebNetworkPolicy() {
  return {
    architecture: 'GLORIFIER_AI_WEB_NETWORK',
    version: GLORIFIER_AI_WEB_NETWORK_VERSION,
    identity: 'stable provider/model/agent node identities',
    discovery: 'persistent Internet Discovery Fabric + Model Network',
    capabilities: 'capability-indexed routing and discovery',
    collaboration: 'GLORIFIER-A2A-v1 with interoperable A2A/MCP surfaces',
    evidence: 'provenance and evidence before verification',
    opportunities: 'discovery-only until authorization and execution controls pass',
    outcomes: 'external evidence required for VERIFIED',
    humanAuthorityRemainsHighest: true,
    automaticIrreversibleProductionChanges: false,
    automaticFinancialTransfers: false,
    automaticCredentialRotation: false,
    universalInternetControlClaim: false,
    lifecycle: ['OBSERVED','IDENTIFIED','AUTHORIZED','VERIFIED','AVAILABLE','EXECUTABLE','SETTLED'],
    truthStates: ['UNKNOWN','NOT_VERIFIED','DEGRADED','NOT_OBSERVABLE']
  } as const;
}
