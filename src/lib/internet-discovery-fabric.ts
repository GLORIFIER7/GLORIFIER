import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { getGlobalProviderDiscoverySnapshot } from './ai/provider-discovery';
import { listRegisteredAgents } from './agent-registry';
import { canonicalInternetNodes, getLatestGlobalSyncManifest } from './global-sync';

export type WorldGraphLifecycle =
  | 'OBSERVED'
  | 'IDENTIFIED'
  | 'AUTHORIZED'
  | 'VERIFIED'
  | 'AVAILABLE'
  | 'EXECUTABLE'
  | 'SETTLED'
  | 'UNKNOWN'
  | 'NOT_VERIFIED'
  | 'DEGRADED'
  | 'NOT_OBSERVABLE';

export interface WorldGraphObservation {
  id: string;
  subjectId: string;
  subjectType: 'provider' | 'agent' | 'endpoint' | 'ecosystem';
  name: string;
  source: string;
  endpoint: string | null;
  observedAt: string;
  lifecycle: WorldGraphLifecycle;
  authorization: 'authorized' | 'configured' | 'pending' | 'not-authorized' | 'unknown';
  availability: string;
  capabilities: string[];
  evidenceRefs: string[];
  metadata: Record<string, unknown>;
  observationHash: string;
}

const TABLE = 'glorifier_world_graph_observations';

export async function initializeInternetDiscoveryFabric() {
  const db = getPostgresPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      endpoint TEXT,
      observed_at TIMESTAMPTZ NOT NULL,
      lifecycle TEXT NOT NULL,
      authorization TEXT NOT NULL,
      availability TEXT NOT NULL,
      capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
      evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      observation_hash TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_world_graph_observed
      ON ${TABLE}(observed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_world_graph_subject
      ON ${TABLE}(subject_id, observed_at DESC);
  `);
}

function lifecycleFor(authorization: WorldGraphObservation['authorization'], availability: string): WorldGraphLifecycle {
  if (authorization === 'authorized' && availability === 'available') return 'VERIFIED';
  if (authorization === 'authorized' && availability === 'configured') return 'AUTHORIZED';
  if (availability === 'available') return 'AVAILABLE';
  if (availability === 'unconfigured') return 'IDENTIFIED';
  if (availability === 'unreachable' || availability === 'error') return 'DEGRADED';
  return 'NOT_VERIFIED';
}

function hashObservation(input: Omit<WorldGraphObservation, 'id' | 'observationHash'>) {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

async function persist(observation: Omit<WorldGraphObservation, 'id' | 'observationHash'>) {
  const id = `wgo-${crypto.randomUUID()}`;
  const observationHash = hashObservation(observation);
  await getPostgresPool().query(
    `INSERT INTO ${TABLE}
      (id,subject_id,subject_type,name,source,endpoint,observed_at,lifecycle,authorization,availability,capabilities,evidence_refs,metadata,observation_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14)`,
    [
      id, observation.subjectId, observation.subjectType, observation.name, observation.source,
      observation.endpoint, observation.observedAt, observation.lifecycle, observation.authorization,
      observation.availability, JSON.stringify(observation.capabilities), JSON.stringify(observation.evidenceRefs),
      JSON.stringify(observation.metadata), observationHash
    ]
  );
  return { ...observation, id, observationHash };
}

export async function runInternetDiscoveryFabricCycle(actor = 'internet-discovery-fabric') {
  await initializeInternetDiscoveryFabric();
  const observedAt = new Date().toISOString();
  const results: WorldGraphObservation[] = [];

  // Provider registry: server-side probes are the authoritative availability signal.
  for (const provider of getGlobalProviderDiscoverySnapshot()) {
    results.push(await persist({
      subjectId: `provider:${provider.id}`,
      subjectType: 'provider',
      name: provider.name,
      source: 'GLORIFIER Provider Registry',
      endpoint: provider.endpoint || null,
      observedAt,
      lifecycle: lifecycleFor(provider.authorization === 'configured' ? 'authorized' : provider.authorization, provider.availability),
      authorization: provider.authorization === 'configured' ? 'authorized' : provider.authorization,
      availability: provider.availability,
      capabilities: provider.capabilities,
      evidenceRefs: provider.lastCheckedAt ? [`provider-probe:${provider.id}:${provider.lastCheckedAt}`] : [],
      metadata: { actor, authenticated: provider.authenticated, configured: provider.configured, models: provider.models, latencyMs: provider.latencyMs, reason: provider.reason }
    }));
  }

  // Agent registry: discovery is not authorization and registration is not proof of reachability.
  const agents = await listRegisteredAgents();
  for (const agent of agents) {
    results.push(await persist({
      subjectId: `agent:${agent.id}`,
      subjectType: 'agent',
      name: agent.name,
      source: 'GLORIFIER Agent Registry',
      endpoint: agent.endpoint,
      observedAt,
      lifecycle: agent.status === 'active' || agent.status === 'authorized' ? 'AUTHORIZED' : 'IDENTIFIED',
      authorization: agent.status === 'active' || agent.status === 'authorized' ? 'authorized' : 'pending',
      availability: agent.status,
      capabilities: agent.capabilities,
      evidenceRefs: agent.lastVerifiedAt ? [`agent-verified:${agent.id}:${agent.lastVerifiedAt}`] : [],
      metadata: { provider: agent.provider, protocol: agent.protocol, role: agent.role, scopes: agent.scopes, requiresHumanApproval: agent.requiresHumanApproval }
    }));
  }

  // Configured ecosystem endpoints are observations, not claims of universal Internet coverage.
  for (const node of canonicalInternetNodes) {
    results.push(await persist({
      subjectId: `endpoint:${node.id}`,
      subjectType: 'endpoint',
      name: node.name,
      source: 'GLORIFIER Canonical Ecosystem Registry',
      endpoint: node.url,
      observedAt,
      lifecycle: node.status === 'reachable' ? 'AVAILABLE' : 'IDENTIFIED',
      authorization: node.status === 'configured' ? 'configured' : 'unknown',
      availability: node.status,
      capabilities: [],
      evidenceRefs: [],
      metadata: { category: node.category, lastPingAt: node.lastPingAt }
    }));
  }

  const manifest = getLatestGlobalSyncManifest();
  return {
    ok: true,
    actor,
    cycleAt: observedAt,
    observationCount: results.length,
    observations: results,
    truthBoundary: 'Public discovery and registry presence do not prove authorization, reachability, execution, settlement, ownership, or revenue.',
    nextStateRule: 'OBSERVED → IDENTIFIED → AUTHORIZED → VERIFIED → AVAILABLE → EXECUTABLE → SETTLED; insufficient evidence remains UNKNOWN / NOT_VERIFIED.',
    globalSyncManifestId: manifest?.id || null
  };
}

export async function getInternetDiscoveryFabricSnapshot(limit = 100) {
  await initializeInternetDiscoveryFabric();
  const safeLimit = Math.max(1, Math.min(500, limit));
  const r = await getPostgresPool().query(
    `SELECT * FROM ${TABLE} ORDER BY observed_at DESC LIMIT $1`, [safeLimit]
  );
  return r.rows.map((x: any) => ({
    id: x.id, subjectId: x.subject_id, subjectType: x.subject_type, name: x.name,
    source: x.source, endpoint: x.endpoint, observedAt: x.observed_at, lifecycle: x.lifecycle,
    authorization: x.authorization, availability: x.availability,
    capabilities: x.capabilities || [], evidenceRefs: x.evidence_refs || [],
    metadata: x.metadata || {}, observationHash: x.observation_hash
  }));
}

export function getInternetDiscoveryFabricPolicy() {
  return {
    architecture: 'INTERNET_DISCOVERY_FABRIC_WORLD_GRAPH',
    scope: 'authorized digital ecosystem plus explicitly public discovery metadata',
    internetIsEnvironment: true,
    daemonIsPersistentNervousSystem: true,
    identityResolutionRequired: true,
    provenanceRequired: true,
    evidenceRequiredForVerification: true,
    authorizationRequiredForExecution: true,
    humanAuthorityRemainsHighest: true,
    automaticIrreversibleProductionChanges: false,
    automaticFinancialTransfers: false,
    automaticCredentialRotation: false,
    noUniversalInternetCoverageClaim: true,
    lifecycle: ['OBSERVED','IDENTIFIED','AUTHORIZED','VERIFIED','AVAILABLE','EXECUTABLE','SETTLED'],
    truthStates: ['UNKNOWN','NOT_VERIFIED','DEGRADED','NOT_OBSERVABLE']
  } as const;
}
