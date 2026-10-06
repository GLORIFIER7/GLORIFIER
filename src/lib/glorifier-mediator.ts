import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { listConnections } from './connection-registry';

export const GLORIFIER_MEDIATOR_VERSION = 'G-MEDIATOR-1.0';

export type MediatorNodeType =
  | 'ai_provider'
  | 'specialist'
  | 'demand_source'
  | 'marketplace'
  | 'execution_connector'
  | 'settlement_rail'
  | 'evidence_system'
  | 'revenue_ledger';

export type MediatorNodeStatus = 'discovered' | 'configured' | 'authorized' | 'degraded' | 'revoked';

export interface MediatorNode {
  id: string;
  nodeType: MediatorNodeType;
  provider: string;
  capability: string;
  status: MediatorNodeStatus;
  connectionId?: string | null;
  authorizationRequired: boolean;
  metadata?: Record<string, unknown>;
}

export function getGlorifierMediatorPolicy() {
  return {
    version: GLORIFIER_MEDIATOR_VERSION,
    identity: 'GLORIFIER Mediator — provider-neutral coordination layer across AI architectures, business models, value networks and settlement systems',
    mission: 'Mediate capabilities, demand, execution, evidence, outcomes and settlement without requiring GLORIFIER to own or replace every external system.',
    topology: [
      'Human Owner',
      'GLORIFIER AI CEO',
      'GLORIFIER Mediator',
      'AI Providers + Specialist Agents',
      'Authenticated Demand + Marketplaces',
      'Authorized Execution Connectors',
      'External Acceptance / Outcome Systems',
      'GLR Agent Economic Layer',
      'Settlement Rails',
      'Authoritative Revenue Ledger',
      'Learning / Improvement'
    ],
    valueUnits: ['GLR', 'token', 'task', 'deliverable', 'dataset', 'api_call', 'analysis', 'security_finding', 'workflow_execution', 'measurable_outcome'],
    mediationFunctions: ['discover', 'translate', 'match', 'route', 'verify', 'authorize', 'execute', 'deliver', 'measure', 'reconcile', 'settle', 'learn'],
    authorization: {
      externalAccessRequiresExplicitAuthorization: true,
      consequentialActionsRequireHumanApproval: true,
      authorizationDoesNotImplyActionPermission: true,
      credentialsNeverReturnedToBrowser: true
    },
    evidence: {
      opportunityMustOriginateFromEvidence: true,
      acceptanceMustBeExternallyObserved: true,
      settlementMustHaveQualifyingExternalEvidence: true,
      estimatesNeverBecomeRevenueAutomatically: true
    },
    economicArchitecture: {
      nativeEconomicUnit: 'GLR',
      positioning: 'The native economic unit for governed AI-agent commerce.',
      flow: ['agent-identity','capability-policy','task','GLR-intent','human-authority','execution','external-evidence','settlement','reconciliation'],
      authorityBoundary: 'GLR ownership never grants agent authority or policy bypass.'
    },
    economicTruth: {
      estimatedValue: 'NOT VERIFIED',
      pipelineValue: 'NOT VERIFIED',
      invoice: 'NOT VERIFIED REVENUE',
      accountBalance: 'NOT VERIFIED REVENUE',
      verifiedRevenue: 'Qualifying external settlement evidence only'
    },
    safety: ['no unauthorized access', 'no credential abuse', 'no exploitation', 'no spam', 'no impersonation', 'no evasion', 'no irreversible financial action without authorization'],
    glr: { nativeEconomicUnit: 'GLR', settlementEvidenceRequired: true, tokenContractDoesNotGrantAgentAuthority: true, positioning: 'The native economic unit for governed AI-agent commerce.', truthStates: ['NOT VERIFIED','EVIDENCE-BACKED','VERIFIED'] },
    providerNeutrality: true
  };
}

export async function initializeGlorifierMediator() {
  const db = getPostgresPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS glorifier_mediator_nodes (
      id TEXT PRIMARY KEY,
      node_type TEXT NOT NULL,
      provider TEXT NOT NULL,
      capability TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'discovered',
      connection_id TEXT,
      authorization_required BOOLEAN NOT NULL DEFAULT TRUE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_glorifier_mediator_nodes_type_status
      ON glorifier_mediator_nodes(node_type,status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_glorifier_mediator_nodes_identity
      ON glorifier_mediator_nodes(provider,node_type,capability);
  `);
}


export async function ensureCoreMediatorNodes() {
  await initializeGlorifierMediator();
  const nodes: Array<Omit<MediatorNode,'id'>> = [
    { nodeType:'ai_provider', provider:'OpenAI', capability:'model-inference', status:'configured', authorizationRequired:true },
    { nodeType:'ai_provider', provider:'Google Gemini', capability:'model-inference', status:'configured', authorizationRequired:true },
    { nodeType:'ai_provider', provider:'Meta', capability:'model-inference', status:'discovered', authorizationRequired:true },
    { nodeType:'ai_provider', provider:'Anthropic', capability:'model-inference', status:'discovered', authorizationRequired:true },
    { nodeType:'specialist', provider:'GLORIFIER Specialist Council', capability:'domain-analysis', status:'configured', authorizationRequired:true },
    { nodeType:'demand_source', provider:'GitHub', capability:'bounty-and-work-discovery', status:'configured', authorizationRequired:true },
    { nodeType:'demand_source', provider:'Public Web Intelligence', capability:'opportunity-discovery', status:'configured', authorizationRequired:true },
    { nodeType:'marketplace', provider:'GLORIFIER Marketplace', capability:'offers-and-bids', status:'configured', authorizationRequired:true },
    { nodeType:'marketplace', provider:'External Marketplaces', capability:'authorized-market-access', status:'discovered', authorizationRequired:true },
    { nodeType:'execution_connector', provider:'GitHub Actions', capability:'governed-code-execution', status:'configured', authorizationRequired:true },
    { nodeType:'execution_connector', provider:'Railway/Vercel', capability:'application-deployment', status:'configured', authorizationRequired:true },
    { nodeType:'settlement_rail', provider:'GLORIFIER GLR Economic Layer', capability:'agent-economic-intents', status:'configured', authorizationRequired:true },
    { nodeType:'settlement_rail', provider:'Authorized Payment Providers', capability:'payment-settlement', status:'discovered', authorizationRequired:true },
    { nodeType:'settlement_rail', provider:'Binance', capability:'public-asset-observation', status:'discovered', authorizationRequired:true },
    { nodeType:'evidence_system', provider:'GLORIFIER Evidence Layer', capability:'provenance-and-verification', status:'configured', authorizationRequired:false },
    { nodeType:'revenue_ledger', provider:'Neon', capability:'authoritative-verified-revenue', status:'configured', authorizationRequired:true }
  ];
  for (const node of nodes) await registerMediatorNode(node);
}

export async function registerMediatorNode(input: Omit<MediatorNode, 'id'> & { id?: string }) {
  await initializeGlorifierMediator();
  const id = input.id || `mediator-${crypto.randomUUID()}`;
  const r = await getPostgresPool().query(
    `INSERT INTO glorifier_mediator_nodes
      (id,node_type,provider,capability,status,connection_id,authorization_required,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(provider,node_type,capability) DO UPDATE SET
       status=EXCLUDED.status, connection_id=EXCLUDED.connection_id,
       authorization_required=EXCLUDED.authorization_required, metadata=EXCLUDED.metadata, updated_at=NOW()
     RETURNING *`,
    [id,input.nodeType,input.provider,input.capability,input.status,input.connectionId || null,input.authorizationRequired,JSON.stringify(input.metadata || {})]
  );
  return mapNode(r.rows[0]);
}

export async function listMediatorNodes(nodeType?: MediatorNodeType) {
  await initializeGlorifierMediator();
  const r = nodeType
    ? await getPostgresPool().query('SELECT * FROM glorifier_mediator_nodes WHERE node_type=$1 ORDER BY provider,capability',[nodeType])
    : await getPostgresPool().query('SELECT * FROM glorifier_mediator_nodes ORDER BY node_type,provider,capability');
  return r.rows.map(mapNode);
}

export async function buildGlorifierMediatorSnapshot() {
  const [nodes, connections] = await Promise.all([listMediatorNodes(), listConnections()]);
  const byType = Object.fromEntries(
    ['ai_provider','specialist','demand_source','marketplace','execution_connector','settlement_rail','evidence_system','revenue_ledger']
      .map(type => [type, nodes.filter(n => n.nodeType === type)])
  ) as Record<MediatorNodeType, MediatorNode[]>;
  const authorizedConnections = connections.filter((c: any) => c.status === 'authorized').length;
  return {
    version: GLORIFIER_MEDIATOR_VERSION,
    generatedAt: new Date().toISOString(),
    mediator: 'GLORIFIER',
    role: 'Provider-neutral mediation and coordination layer',
    nodeCounts: Object.fromEntries(Object.entries(byType).map(([k,v]) => [k,v.length])),
    authorizedConnections,
    totalConnections: connections.length,
    nodes,
    policy: getGlorifierMediatorPolicy()
  };
}

function mapNode(x: any): MediatorNode {
  return {
    id:x.id,
    nodeType:x.node_type,
    provider:x.provider,
    capability:x.capability,
    status:x.status,
    connectionId:x.connection_id || null,
    authorizationRequired:Boolean(x.authorization_required),
    metadata:x.metadata || {}
  };
}
