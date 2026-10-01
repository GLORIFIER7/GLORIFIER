import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { getGlobalProviderDiscoverySnapshot } from './ai/provider-discovery';

export type ModelNetworkState = 'DISCOVERED' | 'AUTHORIZED' | 'AVAILABLE' | 'NOT_VERIFIED' | 'DEGRADED';

export interface ModelNetworkNode {
  id: string;
  providerId: string;
  providerName: string;
  model: string;
  capabilities: string[];
  state: ModelNetworkState;
  observedAt: string;
  evidenceRefs: string[];
  metadata: Record<string, unknown>;
  observationHash: string;
}

const TABLE = 'glorifier_model_network_nodes';

export async function initializeModelNetwork() {
  await getPostgresPool().query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      model TEXT NOT NULL,
      capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
      state TEXT NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL,
      evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      observation_hash TEXT NOT NULL,
      UNIQUE(provider_id, model)
    );
    CREATE INDEX IF NOT EXISTS idx_model_network_observed ON ${TABLE}(observed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_model_network_provider ON ${TABLE}(provider_id, model);
  `);
}

function stateFor(provider: any): ModelNetworkState {
  if (provider.availability === 'error' || provider.availability === 'unreachable') return 'DEGRADED';
  if (provider.authorization === 'configured' && provider.authenticated && provider.availability === 'available') return 'AVAILABLE';
  if (provider.authorization === 'configured') return 'AUTHORIZED';
  if (provider.models?.length) return 'DISCOVERED';
  return 'NOT_VERIFIED';
}

export async function runModelNetworkDiscovery(actor = 'glorifier-daemon') {
  await initializeModelNetwork();
  const observedAt = new Date().toISOString();
  const nodes: ModelNetworkNode[] = [];

  for (const provider of getGlobalProviderDiscoverySnapshot()) {
    const models = Array.isArray(provider.models) ? provider.models : [];
    for (const model of models) {
      const base = {
        providerId: String(provider.id),
        providerName: provider.name,
        model: String(model),
        capabilities: Array.isArray(provider.capabilities) ? provider.capabilities : [],
        state: stateFor(provider),
        observedAt,
        evidenceRefs: provider.lastCheckedAt ? [`provider-probe:${provider.id}:${provider.lastCheckedAt}`] : [],
        metadata: {
          actor,
          authenticated: Boolean(provider.authenticated),
          configured: Boolean(provider.configured),
          availability: provider.availability,
          authorization: provider.authorization,
          endpoint: provider.endpoint || null,
          reason: provider.reason || null
        }
      };
      const hash = crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex');
      const id = `model-${crypto.createHash('sha256').update(`${base.providerId}:${base.model}`).digest('hex').slice(0, 32)}`;
      await getPostgresPool().query(
        `INSERT INTO ${TABLE}
          (id,provider_id,provider_name,model,capabilities,state,observed_at,evidence_refs,metadata,observation_hash)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9::jsonb,$10)
         ON CONFLICT(provider_id, model) DO UPDATE SET
           provider_name=EXCLUDED.provider_name,
           capabilities=EXCLUDED.capabilities,
           state=EXCLUDED.state,
           observed_at=EXCLUDED.observed_at,
           evidence_refs=EXCLUDED.evidence_refs,
           metadata=EXCLUDED.metadata,
           observation_hash=EXCLUDED.observation_hash`,
        [id, base.providerId, base.providerName, base.model, JSON.stringify(base.capabilities), base.state,
          base.observedAt, JSON.stringify(base.evidenceRefs), JSON.stringify(base.metadata), hash]
      );
      nodes.push({ ...base, id, observationHash: hash });
    }
  }

  return {
    ok: true,
    actor,
    cycleAt: observedAt,
    nodeCount: nodes.length,
    nodes,
    truthBoundary: 'A discovered model is not proof of authorization, availability, execution capability, ownership, or revenue.',
    routingRule: 'Select only from authorized and currently available nodes; preserve provider neutrality and evidence provenance.'
  };
}

export async function getModelNetworkSnapshot(limit = 200) {
  await initializeModelNetwork();
  const safeLimit = Math.max(1, Math.min(1000, limit));
  const result = await getPostgresPool().query(
    `SELECT * FROM ${TABLE} ORDER BY observed_at DESC LIMIT $1`, [safeLimit]
  );
  return result.rows.map((row: any) => ({
    id: row.id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    model: row.model,
    capabilities: row.capabilities || [],
    state: row.state,
    observedAt: row.observed_at,
    evidenceRefs: row.evidence_refs || [],
    metadata: row.metadata || {},
    observationHash: row.observation_hash
  }));
}

export function getModelNetworkPolicy() {
  return {
    architecture: 'GLORIFIER_MODEL_NETWORK',
    providerNeutral: true,
    discoverySource: 'GLORIFIER Provider Registry',
    identityRequired: true,
    provenanceRequired: true,
    evidenceRequiredForVerification: true,
    authorizationRequiredForExecution: true,
    humanAuthorityRemainsHighest: true,
    automaticFinancialTransfers: false,
    automaticCredentialRotation: false,
    universalInternetControlClaim: false,
    states: ['DISCOVERED', 'AUTHORIZED', 'AVAILABLE', 'NOT_VERIFIED', 'DEGRADED']
  } as const;
}
