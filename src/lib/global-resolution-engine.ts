import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';

export const GLOBAL_RESOLUTION_VERSION = 'GRI-1.0';

export type ResolutionStage =
  | 'OBSERVED'
  | 'EVIDENCE_PENDING'
  | 'QUALIFIED'
  | 'AUTHORIZATION_PENDING'
  | 'EXECUTION_READY'
  | 'IN_PROGRESS'
  | 'DELIVERY_PENDING'
  | 'ACCEPTANCE_PENDING'
  | 'SETTLEMENT_PENDING'
  | 'RESOLVED'
  | 'REJECTED';

const TRANSITIONS: Record<ResolutionStage, ResolutionStage[]> = {
  OBSERVED: ['EVIDENCE_PENDING', 'REJECTED'],
  EVIDENCE_PENDING: ['QUALIFIED', 'REJECTED'],
  QUALIFIED: ['AUTHORIZATION_PENDING', 'REJECTED'],
  AUTHORIZATION_PENDING: ['EXECUTION_READY', 'REJECTED'],
  EXECUTION_READY: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['DELIVERY_PENDING', 'REJECTED'],
  DELIVERY_PENDING: ['ACCEPTANCE_PENDING', 'REJECTED'],
  ACCEPTANCE_PENDING: ['SETTLEMENT_PENDING', 'REJECTED'],
  SETTLEMENT_PENDING: ['RESOLVED', 'REJECTED'],
  RESOLVED: [],
  REJECTED: []
};

export async function initializeGlobalResolutionEngine() {
  const db = getPostgresPool();
  await db.query([
    'CREATE TABLE IF NOT EXISTS glorifier_global_resolution_cases (id TEXT PRIMARY KEY, source_finding_id TEXT, source_url TEXT NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL, stage TEXT NOT NULL, estimated_value_minor BIGINT, currency TEXT, funding_verified BOOLEAN NOT NULL DEFAULT FALSE, eligibility_verified BOOLEAN NOT NULL DEFAULT FALSE, payout_path_verified BOOLEAN NOT NULL DEFAULT FALSE, authorization_observed BOOLEAN NOT NULL DEFAULT FALSE, acceptance_observed BOOLEAN NOT NULL DEFAULT FALSE, settlement_verified BOOLEAN NOT NULL DEFAULT FALSE, evidence JSONB NOT NULL DEFAULT \'{}\'::jsonb, metadata JSONB NOT NULL DEFAULT \'{}\'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    'CREATE UNIQUE INDEX IF NOT EXISTS glorifier_global_resolution_source_idx ON glorifier_global_resolution_cases(source_finding_id) WHERE source_finding_id IS NOT NULL',
    'CREATE INDEX IF NOT EXISTS glorifier_global_resolution_stage_idx ON glorifier_global_resolution_cases(stage, updated_at DESC)'
  ].join(';'));
}

export function getGlobalResolutionPolicy() {
  return {
    version: GLOBAL_RESOLUTION_VERSION,
    objective: 'DISCOVER → EVIDENCE → VERIFY → QUALIFY → AUTHORIZE → EXECUTE → DELIVER → ACCEPT → SETTLE → RESOLVE → LEARN → REPEAT',
    continuous: true,
    global: true,
    execution: 'Preparation and verification may be automated; external consequential actions require explicit authorization.',
    nonFabrication: 'No opportunity, authorization, acceptance, contract, earnings, payment, or settlement may be inferred without evidence.',
    economicTruth: 'Estimated opportunity value is never posted as verified revenue.',
    resolutionDefinition: 'A case is resolved only after the external issue/work owner has accepted the deliverable and settlement evidence is independently recorded.',
    safety: 'No unauthorized access, exploitation, spam, impersonation, evasion, or irreversible financial action.'
  };
}

export async function runGlobalResolutionCycle(actor = 'ai-ceo-autonomous', limit = 100) {
  await initializeGlobalResolutionEngine();
  const db = getPostgresPool();
  const findings = await db.query(
    'SELECT id, source_id, title, url, category, evidence FROM glorifier_discovery_findings WHERE status IN ($1,$2,$3) ORDER BY created_at DESC LIMIT $4',
    ['observed', 'qualified-for-review', 'qualified', Math.min(Math.max(limit, 1), 500)]
  );
  let created = 0;
  for (const f of findings.rows) {
    await db.query(
      'INSERT INTO glorifier_global_resolution_cases (id,source_finding_id,source_url,title,category,stage,evidence,metadata) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) ON CONFLICT(source_finding_id) WHERE source_finding_id IS NOT NULL DO NOTHING',
      [
        'resolution-' + crypto.randomUUID(), f.id, f.url, f.title, f.category, 'EVIDENCE_PENDING',
        JSON.stringify({ discoveryFindingId: f.id, source: f.source_id, status: 'observed', evidence: f.evidence || {} }),
        JSON.stringify({ actor, economicTruth: 'OBSERVED — NOT VERIFIED', externalExecution: 'authorization-required' })
      ]
    ).then(r => { if (r.rowCount) created += r.rowCount; });
  }
  return {
    version: GLOBAL_RESOLUTION_VERSION,
    actor,
    casesCreated: created,
    candidatesReviewed: findings.rowCount,
    completedAt: new Date().toISOString(),
    policy: getGlobalResolutionPolicy()
  };
}

export async function listGlobalResolutionCases(stage?: ResolutionStage, limit = 100) {
  await initializeGlobalResolutionEngine();
  const db = getPostgresPool();
  const params: any[] = [];
  let sql = 'SELECT * FROM glorifier_global_resolution_cases';
  if (stage) { params.push(stage); sql += ' WHERE stage=$1'; }
  params.push(Math.min(Math.max(limit, 1), 500));
  sql += ' ORDER BY updated_at DESC LIMIT $' + params.length;
  const result = await db.query(sql, params);
  return result.rows;
}

export async function advanceGlobalResolutionCase(input: {
  id: string;
  stage: ResolutionStage;
  actor: string;
  evidence?: Record<string, unknown>;
  authorizationObserved?: boolean;
  acceptanceObserved?: boolean;
  fundingVerified?: boolean;
  eligibilityVerified?: boolean;
  payoutPathVerified?: boolean;
  settlementVerified?: boolean;
}) {
  await initializeGlobalResolutionEngine();
  const db = getPostgresPool();
  const current = await db.query('SELECT * FROM glorifier_global_resolution_cases WHERE id=$1', [input.id]);
  if (!current.rowCount) throw new Error('Resolution case not found');
  const row = current.rows[0];
  const from = row.stage as ResolutionStage;
  if (!TRANSITIONS[from].includes(input.stage)) throw new Error('Invalid resolution transition: ' + from + ' -> ' + input.stage);

  if (['EXECUTION_READY', 'IN_PROGRESS', 'DELIVERY_PENDING'].includes(input.stage) && !input.authorizationObserved && !row.authorization_observed) {
    throw new Error('Explicit authorization evidence is required before execution stages');
  }
  if (input.stage === 'SETTLEMENT_PENDING' && !input.acceptanceObserved && !row.acceptance_observed) {
    throw new Error('External acceptance evidence is required before settlement');
  }
  if (input.stage === 'RESOLVED' && !input.settlementVerified && !row.settlement_verified) {
    throw new Error('Verified settlement evidence is required before RESOLVED');
  }

  const evidence = { ...(row.evidence || {}), ...(input.evidence || {}), lastTransition: { from, to: input.stage, actor: input.actor, at: new Date().toISOString() } };
  const updated = await db.query(
    'UPDATE glorifier_global_resolution_cases SET stage=$2,funding_verified=$3,eligibility_verified=$4,payout_path_verified=$5,authorization_observed=$6,acceptance_observed=$7,settlement_verified=$8,evidence=$9::jsonb,updated_at=NOW() WHERE id=$1 RETURNING *',
    [input.id, input.stage, Boolean(input.fundingVerified ?? row.funding_verified), Boolean(input.eligibilityVerified ?? row.eligibility_verified), Boolean(input.payoutPathVerified ?? row.payout_path_verified), Boolean(input.authorizationObserved ?? row.authorization_observed), Boolean(input.acceptanceObserved ?? row.acceptance_observed), Boolean(input.settlementVerified ?? row.settlement_verified), JSON.stringify(evidence)]
  );
  return updated.rows[0];
}

export async function getGlobalResolutionStatus() {
  await initializeGlobalResolutionEngine();
  const db = getPostgresPool();
  const counts = await db.query('SELECT stage, COUNT(*)::int AS count FROM glorifier_global_resolution_cases GROUP BY stage ORDER BY stage');
  return { version: GLOBAL_RESOLUTION_VERSION, policy: getGlobalResolutionPolicy(), queue: counts.rows };
}
