import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';

export const GLR_ECONOMIC_LAYER_VERSION = 'GLR-EAL-1.0';

export type GLREconomicStatus =
  | 'PROPOSED'
  | 'AUTHORIZED'
  | 'COMMITTED'
  | 'EVIDENCE_PENDING'
  | 'SETTLED'
  | 'REJECTED'
  | 'EXPIRED';

export type GLRSettlementRail = 'evm' | 'solana' | 'internal_ledger' | 'external';

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
}

export function glrEconomicPolicy() {
  return {
    version: GLR_ECONOMIC_LAYER_VERSION,
    asset: { name: 'GLORIFIER', symbol: 'GLR', role: 'agent-economic-settlement-unit' },
    thesis: 'AI intelligence produces actions; governance controls actions; evidence proves outcomes; GLR provides the economic settlement layer.',
    principles: [
      'GLR is not a grant of authority.',
      'Agent identity, capability, policy and budget are evaluated before economic commitment.',
      'No model output is economic proof.',
      'No payment is marked SETTLED without qualifying external evidence.',
      'Human authority remains highest for consequential economic actions.',
      'No autonomous trading, withdrawal, redemption or irreversible financial action.',
      'Failed components degrade to UNKNOWN/NOT VERIFIED rather than fabricated success.'
    ],
    truthStates: ['NOT VERIFIED', 'EVIDENCE-BACKED', 'VERIFIED'],
    settlementRule: 'SETTLED only after authoritative external settlement evidence is recorded.',
    custody: 'GLORIFIER does not custody user private keys or silently move user funds.',
    supply: 'The token contract defines supply; this economic layer does not mint or burn GLR.'
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
      rail TEXT NOT NULL,
      task_ref TEXT NOT NULL,
      evidence_ref TEXT,
      status TEXT NOT NULL DEFAULT 'PROPOSED',
      human_authorized BOOLEAN NOT NULL DEFAULT FALSE,
      settlement_tx_ref TEXT,
      truth_status TEXT NOT NULL DEFAULT 'NOT VERIFIED',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      authorized_at TIMESTAMPTZ,
      settled_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_glorifier_glr_intents_agents
      ON glorifier_glr_payment_intents(payer_agent_id, payee_agent_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_glorifier_glr_intents_status
      ON glorifier_glr_payment_intents(status, created_at DESC);
  `);
}

export async function createGLRPaymentIntent(input: {
  payerAgentId: string;
  payeeAgentId: string;
  amount: number;
  rail?: GLRSettlementRail;
  network?: string | null;
  taskRef: string;
  metadata?: Record<string, unknown>;
}) {
  if (!input.payerAgentId || !input.payeeAgentId || !input.taskRef) {
    throw new Error('payerAgentId, payeeAgentId and taskRef are required');
  }
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error('GLR amount must be a finite non-negative number');
  }
  await initializeGLREconomicLayer();
  const id = `glr-intent-${crypto.randomUUID()}`;
  const r = await getPostgresPool().query(
    `INSERT INTO glorifier_glr_payment_intents
      (id,payer_agent_id,payee_agent_id,amount,network,rail,task_ref,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, input.payerAgentId, input.payeeAgentId, input.amount, input.network || null,
      input.rail || 'internal_ledger', input.taskRef, JSON.stringify(input.metadata || {})]
  );
  return mapIntent(r.rows[0]);
}

export async function authorizeGLRPaymentIntent(id: string, humanAuthorized: boolean) {
  await initializeGLREconomicLayer();
  if (!humanAuthorized) throw new Error('Human authorization is required for consequential GLR settlement');
  const r = await getPostgresPool().query(
    `UPDATE glorifier_glr_payment_intents
     SET status='AUTHORIZED', human_authorized=TRUE, authorized_at=NOW()
     WHERE id=$1 AND status='PROPOSED'
     RETURNING *`, [id]
  );
  if (!r.rows[0]) throw new Error('GLR intent not found or not in PROPOSED state');
  return mapIntent(r.rows[0]);
}

export async function recordGLRSettlementEvidence(input: {
  intentId: string;
  settlementTxRef: string;
  evidenceRef: string;
  network?: string | null;
}) {
  await initializeGLREconomicLayer();
  if (!input.settlementTxRef || !input.evidenceRef) {
    throw new Error('Authoritative settlement transaction and evidence references are required');
  }
  const r = await getPostgresPool().query(
    `UPDATE glorifier_glr_payment_intents
     SET status='SETTLED', truth_status='VERIFIED', settlement_tx_ref=$2,
         evidence_ref=$3, network=COALESCE($4,network), settled_at=NOW()
     WHERE id=$1 AND status IN ('AUTHORIZED','COMMITTED','EVIDENCE_PENDING')
       AND human_authorized=TRUE
     RETURNING *`,
    [input.intentId, input.settlementTxRef, input.evidenceRef, input.network || null]
  );
  if (!r.rows[0]) throw new Error('Settlement cannot be verified: authorized intent not found');
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
    `SELECT * FROM glorifier_glr_payment_intents ORDER BY created_at DESC LIMIT $1`, [safeLimit]
  );
  return r.rows.map(mapIntent);
}

function mapIntent(x: any): GLRPaymentIntent & {
  settlementTxRef: string | null;
  truthStatus: string;
} {
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
    truthStatus: x.truth_status
  };
}
