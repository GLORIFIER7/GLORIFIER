import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';

export const GLR_ECONOMIC_LAYER_VERSION = 'GLR-EAL-1.1';

export type GLREconomicStatus =
  | 'PROPOSED'
  | 'AUTHORIZED'
  | 'COMMITTED'
  | 'EVIDENCE_PENDING'
  | 'SETTLED'
  | 'REJECTED'
  | 'EXPIRED';

export type GLRSettlementRail = 'evm' | 'solana' | 'internal_ledger' | 'external';
export type GLRTruthStatus = 'NOT VERIFIED' | 'EVIDENCE-BACKED' | 'VERIFIED';

export interface GLRPaymentIntent {
  id: string;
  payerAgentId: string;
  payeeAgentId: string;
  amount: string;
  network?: string | null;
  rail: GLRSettlementRail;
  taskRef: string;
  evidenceRef?: string | null;
  status: GLREconomicStatus;
  humanAuthorized: boolean;
  createdAt: string;
  settlementTxRef: string | null;
  truthStatus: GLRTruthStatus;
}

export interface GLRSettlementEvidenceInput {
  intentId: string;
  settlementTxRef: string;
  evidenceRef: string;
  network?: string | null;
  externallyVerified?: boolean;
  verificationMethod?: 'chain-rpc' | 'explorer' | 'authoritative-ledger' | 'authorized-provider';
  verifierRef?: string | null;
}

export function normalizeGLRAmount(value: string | number): string {
  const raw = String(value ?? '').trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) {
    throw new Error('GLR amount must be a non-negative decimal string');
  }
  const [whole, fraction = ''] = raw.split('.');
  const normalizedFraction = fraction.replace(/0+$/, '');
  return normalizedFraction ? `${whole}.${normalizedFraction}` : whole;
}

export function canMarkGLRSettled(input: {
  humanAuthorized: boolean;
  settlementTxRef?: string | null;
  evidenceRef?: string | null;
  externallyVerified?: boolean;
  verificationMethod?: GLRSettlementEvidenceInput['verificationMethod'];
  verifierRef?: string | null;
}) {
  const hasEvidence = Boolean(input.settlementTxRef && input.evidenceRef);
  const hasExternalVerification =
    input.externallyVerified === true &&
    Boolean(input.verificationMethod) &&
    Boolean(input.verifierRef);
  return {
    settled: Boolean(input.humanAuthorized && hasEvidence && hasExternalVerification),
    evidenceBacked: Boolean(input.humanAuthorized && hasEvidence),
    externallyVerified: hasExternalVerification,
  };
}

export function glrEconomicPolicy() {
  return {
    version: GLR_ECONOMIC_LAYER_VERSION,
    positioning: 'GLORIFIER (GLR) — The native economic unit for governed AI-agent commerce.',
    asset: {
      name: 'GLORIFIER',
      symbol: 'GLR',
      role: 'agent-economic-settlement-unit',
      authority: 'economic-unit-only'
    },
    thesis: 'AI intelligence produces actions; governance controls actions; evidence proves outcomes; GLR provides the economic settlement layer.',
    principles: [
      'GLR is not a grant of authority.',
      'Agent identity, capability, policy and budget are evaluated before economic commitment.',
      'Model output is never economic proof.',
      'Amounts are represented as decimal strings to avoid floating-point token precision loss.',
      'Human authority remains highest for consequential economic actions.',
      'No autonomous trading, withdrawal, redemption or irreversible financial action.',
      'No payment is VERIFIED without an authoritative external verifier reference.',
      'Evidence-backed settlement and verified settlement are separate truth states.',
      'Failed components degrade to UNKNOWN/NOT VERIFIED rather than fabricated success.'
    ],
    truthStates: ['NOT VERIFIED', 'EVIDENCE-BACKED', 'VERIFIED'],
    stateMachine: {
      PROPOSED: 'economic intent exists; no authorization or settlement claim',
      AUTHORIZED: 'human authorization recorded; execution is still not settlement',
      COMMITTED: 'authorized execution commitment exists; settlement is not yet proven',
      EVIDENCE_PENDING: 'execution reference exists but authoritative evidence is incomplete',
      SETTLED: 'authoritative external verification has confirmed settlement',
      REJECTED: 'governance rejected the intent',
      EXPIRED: 'intent expired before settlement'
    },
    settlementRule: 'SETTLED only after human authorization plus authoritative external verification.',
    custody: 'GLORIFIER does not custody user private keys or silently move user funds.',
    supply: 'The token contract defines supply; this economic layer does not mint or burn GLR.',
    authorityBoundary: 'Owning or transferring GLR never grants an agent capability, permission, identity, or policy bypass.'
  } as const;
}

export async function initializeGLREconomicLayer() {
  const db = getPostgresPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS glorifier_glr_payment_intents (
      id TEXT PRIMARY KEY,
      payer_agent_id TEXT NOT NULL,
      payee_agent_id TEXT NOT NULL,
      amount NUMERIC NOT NULL CHECK (amount >= 0),
      network TEXT,
      rail TEXT NOT NULL CHECK (rail IN ('evm','solana','internal_ledger','external')),
      task_ref TEXT NOT NULL,
      evidence_ref TEXT,
      status TEXT NOT NULL DEFAULT 'PROPOSED',
      human_authorized BOOLEAN NOT NULL DEFAULT FALSE,
      settlement_tx_ref TEXT,
      truth_status TEXT NOT NULL DEFAULT 'NOT VERIFIED',
      verification_method TEXT,
      verifier_ref TEXT,
      verified_externally BOOLEAN NOT NULL DEFAULT FALSE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      authorized_at TIMESTAMPTZ,
      committed_at TIMESTAMPTZ,
      evidence_pending_at TIMESTAMPTZ,
      settled_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE glorifier_glr_payment_intents ADD COLUMN IF NOT EXISTS verification_method TEXT;
    ALTER TABLE glorifier_glr_payment_intents ADD COLUMN IF NOT EXISTS verifier_ref TEXT;
    ALTER TABLE glorifier_glr_payment_intents ADD COLUMN IF NOT EXISTS verified_externally BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE glorifier_glr_payment_intents ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ;
    ALTER TABLE glorifier_glr_payment_intents ADD COLUMN IF NOT EXISTS evidence_pending_at TIMESTAMPTZ;
    ALTER TABLE glorifier_glr_payment_intents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS idx_glorifier_glr_intents_agents
      ON glorifier_glr_payment_intents(payer_agent_id, payee_agent_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_glorifier_glr_intents_status
      ON glorifier_glr_payment_intents(status, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_glorifier_glr_settlement_tx
      ON glorifier_glr_payment_intents(settlement_tx_ref)
      WHERE settlement_tx_ref IS NOT NULL;
  `);
}

export async function createGLRPaymentIntent(input: {
  payerAgentId: string;
  payeeAgentId: string;
  amount: string | number;
  rail?: GLRSettlementRail;
  network?: string | null;
  taskRef: string;
  metadata?: Record<string, unknown>;
}) {
  if (!input.payerAgentId || !input.payeeAgentId || !input.taskRef) {
    throw new Error('payerAgentId, payeeAgentId and taskRef are required');
  }
  const amount = normalizeGLRAmount(input.amount);
  await initializeGLREconomicLayer();

  const rail = input.rail || 'internal_ledger';
  if (!['evm', 'solana', 'internal_ledger', 'external'].includes(rail)) {
    throw new Error('Unsupported GLR settlement rail');
  }

  const id = `glr-intent-${crypto.randomUUID()}`;
  const r = await getPostgresPool().query(
    `INSERT INTO glorifier_glr_payment_intents
      (id,payer_agent_id,payee_agent_id,amount,network,rail,task_ref,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, input.payerAgentId, input.payeeAgentId, amount, input.network || null,
      rail, input.taskRef, JSON.stringify(input.metadata || {})]
  );
  return mapIntent(r.rows[0]);
}

export async function authorizeGLRPaymentIntent(id: string, humanAuthorized: boolean) {
  await initializeGLREconomicLayer();
  if (!humanAuthorized) throw new Error('Human authorization is required for consequential GLR settlement');
  const r = await getPostgresPool().query(
    `UPDATE glorifier_glr_payment_intents
     SET status='AUTHORIZED', human_authorized=TRUE, authorized_at=NOW(), updated_at=NOW()
     WHERE id=$1 AND status='PROPOSED'
     RETURNING *`, [id]
  );
  if (!r.rows[0]) throw new Error('GLR intent not found or not in PROPOSED state');
  return mapIntent(r.rows[0]);
}

export async function commitGLRPaymentIntent(id: string) {
  await initializeGLREconomicLayer();
  const r = await getPostgresPool().query(
    `UPDATE glorifier_glr_payment_intents
     SET status='COMMITTED', committed_at=NOW(), updated_at=NOW()
     WHERE id=$1 AND status='AUTHORIZED' AND human_authorized=TRUE
     RETURNING *`, [id]
  );
  if (!r.rows[0]) throw new Error('GLR intent must be human-authorized before commitment');
  return mapIntent(r.rows[0]);
}

export async function recordGLRSettlementEvidence(input: GLRSettlementEvidenceInput) {
  await initializeGLREconomicLayer();
  if (!input.settlementTxRef || !input.evidenceRef) {
    throw new Error('Settlement transaction and evidence references are required');
  }

  const verification = canMarkGLRSettled(input);
  const nextStatus = verification.settled ? 'SETTLED' : 'EVIDENCE_PENDING';
  const nextTruth: GLRTruthStatus = verification.settled ? 'VERIFIED' : 'EVIDENCE-BACKED';

  const r = await getPostgresPool().query(
    `UPDATE glorifier_glr_payment_intents
     SET status=$2,
         truth_status=$3,
         settlement_tx_ref=$4,
         evidence_ref=$5,
         network=COALESCE($6,network),
         verification_method=$7,
         verifier_ref=$8,
         verified_externally=$9,
         evidence_pending_at=CASE WHEN $2='EVIDENCE_PENDING' THEN NOW() ELSE evidence_pending_at END,
         settled_at=CASE WHEN $2='SETTLED' THEN NOW() ELSE settled_at END,
         updated_at=NOW()
     WHERE id=$1
       AND status IN ('AUTHORIZED','COMMITTED','EVIDENCE_PENDING')
       AND human_authorized=TRUE
     RETURNING *`,
    [
      input.intentId,
      nextStatus,
      nextTruth,
      input.settlementTxRef,
      input.evidenceRef,
      input.network || null,
      input.verificationMethod || null,
      input.verifierRef || null,
      verification.externallyVerified
    ]
  );
  if (!r.rows[0]) throw new Error('Settlement evidence requires an authorized GLR intent');
  return mapIntent(r.rows[0]);
}

export async function getGLRPaymentIntent(id: string) {
  await initializeGLREconomicLayer();
  const r = await getPostgresPool().query(
    'SELECT * FROM glorifier_glr_payment_intents WHERE id=$1', [id]
  );
  return r.rows[0] ? mapIntent(r.rows[0]) : null;
}

export async function listGLRPaymentIntents(limit = 100) {
  await initializeGLREconomicLayer();
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
  const r = await getPostgresPool().query(
    'SELECT * FROM glorifier_glr_payment_intents ORDER BY created_at DESC LIMIT $1', [safeLimit]
  );
  return r.rows.map(mapIntent);
}

export async function getGLREconomicSnapshot() {
  const intents = await listGLRPaymentIntents(500);
  return {
    version: GLR_ECONOMIC_LAYER_VERSION,
    positioning: 'GLORIFIER (GLR) — The native economic unit for governed AI-agent commerce.',
    generatedAt: new Date().toISOString(),
    counts: {
      total: intents.length,
      proposed: intents.filter(x => x.status === 'PROPOSED').length,
      authorized: intents.filter(x => x.status === 'AUTHORIZED').length,
      committed: intents.filter(x => x.status === 'COMMITTED').length,
      evidencePending: intents.filter(x => x.status === 'EVIDENCE_PENDING').length,
      settled: intents.filter(x => x.status === 'SETTLED').length,
      verified: intents.filter(x => x.truthStatus === 'VERIFIED').length
    },
    policy: glrEconomicPolicy()
  };
}

function mapIntent(x: any): GLRPaymentIntent {
  return {
    id: x.id,
    payerAgentId: x.payer_agent_id,
    payeeAgentId: x.payee_agent_id,
    amount: String(x.amount),
    network: x.network || null,
    rail: x.rail,
    taskRef: x.task_ref,
    evidenceRef: x.evidence_ref || null,
    status: x.status,
    humanAuthorized: Boolean(x.human_authorized),
    createdAt: x.created_at,
    settlementTxRef: x.settlement_tx_ref || null,
    truthStatus: x.truth_status as GLRTruthStatus
  };
}
