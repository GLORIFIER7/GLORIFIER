import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { governRevenueAction } from './revenue-control-plane';

export const GLORIFIER_MONETIZATION_SPRINT_VERSION = 'GMS-1.1';

export type MonetizationPricingModel = 'fractional_pay_per_token' | 'outcome_based';

export type MonetizationPricingPolicy = {
  model: MonetizationPricingModel;
  tokenUnit: '1K_tokens';
  tokenRateUsd: number | null;
  outcomeFeePercent: number | null;
  outcomeEvidenceRequired: boolean;
  settlementOnly: boolean;
  humanApprovalRequired: boolean;
};

export const FRACTIONAL_PAY_PER_TOKEN_OUTCOME_POLICY: MonetizationPricingPolicy[] = [
  {
    model: 'fractional_pay_per_token',
    tokenUnit: '1K_tokens',
    tokenRateUsd: null,
    outcomeFeePercent: null,
    outcomeEvidenceRequired: false,
    settlementOnly: true,
    humanApprovalRequired: true,
  },
  {
    model: 'outcome_based',
    tokenUnit: '1K_tokens',
    tokenRateUsd: null,
    outcomeFeePercent: null,
    outcomeEvidenceRequired: true,
    settlementOnly: true,
    humanApprovalRequired: true,
  },
];

export type MonetizationStage =
  | 'observed'
  | 'qualified'
  | 'buyer_targeted'
  | 'deliverable_ready'
  | 'offer_ready'
  | 'accepted'
  | 'revenue_verified'
  | 'settlement_confirmed'
  | 'payout_ready'
  | 'closed'
  | 'blocked';

export type PayoutRail = 'voucher' | 'crypto' | 'fiat' | 'gcash';

export type MonetizationScientist = {
  id: string;
  name: string;
  specialties: string[];
};

export type MonetizationOpportunity = {
  id: string;
  title: string;
  scientistId: string;
  stage: MonetizationStage;
  estimatedAmountUsd: number | null;
  buyerReference: string | null;
  deliverable: string | null;
  evidenceRefs: string[];
  acceptedAt: string | null;
  revenueEventRef: string | null;
  settlementRef: string | null;
  payoutRail: PayoutRail | null;
  pricingModel?: MonetizationPricingModel | null;
  tokenUsage?: number | null;
  outcomeMetric?: string | null;
  outcomeValue?: number | null;
  createdAt: string;
  updatedAt: string;
};

export const MONETIZATION_SCIENTISTS: MonetizationScientist[] = [
  { id: 'business-intelligence-scientist', name: 'Business Intelligence Scientist', specialties: ['market intelligence', 'competitive intelligence', 'opportunity intelligence'] },
  { id: 'data-scientist', name: 'Data Scientist', specialties: ['data products', 'analysis', 'datasets'] },
  { id: 'finance-scientist', name: 'Finance Scientist', specialties: ['pricing', 'unit economics', 'settlement reconciliation'] },
  { id: 'security-scientist', name: 'Security Scientist', specialties: ['security intelligence', 'risk evidence', 'privacy'] },
  { id: 'engineering-scientist', name: 'Engineering Scientist', specialties: ['software deliverables', 'automation', 'technical services'] },
  { id: 'compliance-scientist', name: 'Compliance Scientist', specialties: ['compliance evidence', 'governance', 'assurance'] },
];

export async function initializeMonetizationSprint() {
  // This table is shared with the legacy Monetization Engine. Never recreate it
  // with a different schema: migrate additive sprint fields in place instead.
  await getPostgresPool().query(`
    CREATE TABLE IF NOT EXISTS monetization_opportunities (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT '7-day-monetization-sprint',
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'discovered',
      estimated_value NUMERIC,
      currency TEXT,
      probability NUMERIC DEFAULT 0,
      expected_value NUMERIC,
      customer_ref TEXT,
      evidence_ref TEXT,
      next_action TEXT,
      requires_human_approval BOOLEAN NOT NULL DEFAULT TRUE,
      metadata JSONB NOT NULL DEFAULT '{}',
      scientist_id TEXT NOT NULL DEFAULT 'business-intelligence-scientist',
      stage TEXT NOT NULL DEFAULT 'observed',
      estimated_amount_minor BIGINT,
      buyer_reference TEXT,
      deliverable TEXT,
      evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
      accepted_at TIMESTAMPTZ,
      revenue_event_ref TEXT,
      settlement_ref TEXT,
      payout_rail TEXT,
      pricing_model TEXT,
      token_usage NUMERIC,
      outcome_metric TEXT,
      outcome_value NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE monetization_opportunities
      ADD COLUMN IF NOT EXISTS scientist_id TEXT,
      ADD COLUMN IF NOT EXISTS stage TEXT,
      ADD COLUMN IF NOT EXISTS estimated_amount_minor BIGINT,
      ADD COLUMN IF NOT EXISTS buyer_reference TEXT,
      ADD COLUMN IF NOT EXISTS deliverable TEXT,
      ADD COLUMN IF NOT EXISTS evidence_refs JSONB,
      ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS revenue_event_ref TEXT,
      ADD COLUMN IF NOT EXISTS settlement_ref TEXT,
      ADD COLUMN IF NOT EXISTS payout_rail TEXT,
      ADD COLUMN IF NOT EXISTS pricing_model TEXT,
      ADD COLUMN IF NOT EXISTS token_usage NUMERIC,
      ADD COLUMN IF NOT EXISTS outcome_metric TEXT,
      ADD COLUMN IF NOT EXISTS outcome_value NUMERIC;

    UPDATE monetization_opportunities
      SET scientist_id=COALESCE(NULLIF(scientist_id,''),'business-intelligence-scientist'),
          stage=COALESCE(NULLIF(stage,''),CASE
            WHEN status='paid' THEN 'revenue_verified'
            WHEN status='contracted' THEN 'accepted'
            WHEN status='qualified' THEN 'qualified'
            WHEN status='proposed' THEN 'offer_ready'
            WHEN status='negotiation' THEN 'offer_ready'
            ELSE 'observed'
          END),
          evidence_refs=COALESCE(evidence_refs,'[]'::jsonb),
          updated_at=NOW()
      WHERE scientist_id IS NULL OR scientist_id='' OR stage IS NULL OR stage='' OR evidence_refs IS NULL;

    ALTER TABLE monetization_opportunities
      ALTER COLUMN scientist_id SET DEFAULT 'business-intelligence-scientist',
      ALTER COLUMN scientist_id SET NOT NULL,
      ALTER COLUMN stage SET DEFAULT 'observed',
      ALTER COLUMN stage SET NOT NULL,
      ALTER COLUMN evidence_refs SET DEFAULT '[]'::jsonb,
      ALTER COLUMN evidence_refs SET NOT NULL;

    CREATE INDEX IF NOT EXISTS monetization_opportunities_stage_idx
      ON monetization_opportunities(stage, updated_at DESC);

    CREATE TABLE IF NOT EXISTS monetization_evidence (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL REFERENCES monetization_opportunities(id) ON DELETE CASCADE,
      evidence_type TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('observed','verified','rejected')),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS monetization_evidence_opportunity_idx
      ON monetization_evidence(opportunity_id, created_at DESC);
  `);
}

function stageToLegacyStatus(stage: MonetizationStage): string {
  switch (stage) {
    case 'qualified': return 'qualified';
    case 'buyer_targeted':
    case 'deliverable_ready':
    case 'offer_ready': return 'proposed';
    case 'accepted': return 'contracted';
    case 'revenue_verified':
    case 'settlement_confirmed':
    case 'payout_ready': return 'paid';
    case 'closed': return 'paid';
    case 'blocked': return 'rejected';
    default: return 'discovered';
  }
}

function mapOpportunity(row: any): MonetizationOpportunity {
  return {
    id: row.id,
    title: row.title,
    scientistId: row.scientist_id,
    stage: row.stage,
    estimatedAmountUsd: row.estimated_amount_minor == null ? null : Number(row.estimated_amount_minor) / 100,
    buyerReference: row.buyer_reference || null,
    deliverable: row.deliverable || null,
    evidenceRefs: Array.isArray(row.evidence_refs) ? row.evidence_refs : [],
    acceptedAt: row.accepted_at || null,
    revenueEventRef: row.revenue_event_ref || null,
    settlementRef: row.settlement_ref || null,
    payoutRail: row.payout_rail || null,
    pricingModel: row.pricing_model || null,
    tokenUsage: row.token_usage == null ? null : Number(row.token_usage),
    outcomeMetric: row.outcome_metric || null,
    outcomeValue: row.outcome_value == null ? null : Number(row.outcome_value),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listMonetizationSprintOpportunities(limit = 100) {
  await initializeMonetizationSprint();
  const result = await getPostgresPool().query(
    'SELECT * FROM monetization_opportunities ORDER BY updated_at DESC LIMIT $1',
    [Math.max(1, Math.min(500, limit))]
  );
  return result.rows.map(mapOpportunity);
}

export async function createMonetizationOpportunity(input: {
  title: string;
  scientistId: string;
  estimatedAmountUsd?: number | null;
  buyerReference?: string | null;
  deliverable?: string | null;
  evidenceRefs?: string[];
}) {
  await initializeMonetizationSprint();
  const title = String(input.title || '').trim();
  const scientistId = String(input.scientistId || '').trim();
  if (!title || !scientistId) throw new Error('title and scientistId are required');
  if (!MONETIZATION_SCIENTISTS.some(s => s.id === scientistId)) throw new Error('Unknown monetization scientist');
  const estimate = input.estimatedAmountUsd == null ? null : Number(input.estimatedAmountUsd);
  if (estimate != null && (!Number.isFinite(estimate) || estimate < 0)) throw new Error('Estimated amount must be a non-negative number');

  const id = `mopp-${crypto.randomUUID()}`;
  const evidenceRefs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map(String).filter(Boolean).slice(0, 50) : [];
  const result = await getPostgresPool().query(
    `INSERT INTO monetization_opportunities
      (id,source,title,status,scientist_id,stage,estimated_value,estimated_amount_minor,buyer_reference,customer_ref,deliverable,evidence_refs,requires_human_approval)
     VALUES ($1,'7-day-monetization-sprint',$2,'discovered',$3,'observed',$4,$5,$6,$6,$7,$8,TRUE)
     RETURNING *`,
    [
      id, title, scientistId, estimate == null ? null : estimate,
      estimate == null ? null : Math.round(estimate * 100),
      input.buyerReference ? String(input.buyerReference).slice(0, 300) : null,
      input.deliverable ? String(input.deliverable).slice(0, 2000) : null,
      JSON.stringify(evidenceRefs),
    ]
  );
  return mapOpportunity(result.rows[0]);
}

export async function addMonetizationEvidence(input: {
  opportunityId: string;
  evidenceType: string;
  sourceRef: string;
  status?: 'observed' | 'verified' | 'rejected';
  notes?: string | null;
}) {
  await initializeMonetizationSprint();
  const opportunity = await getPostgresPool().query('SELECT id FROM monetization_opportunities WHERE id=$1', [input.opportunityId]);
  if (!opportunity.rowCount) throw new Error('Opportunity not found');
  const sourceRef = String(input.sourceRef || '').trim();
  if (!sourceRef) throw new Error('sourceRef is required');
  const id = `mev-${crypto.randomUUID()}`;
  const status = input.status || 'observed';
  await getPostgresPool().query(
    `INSERT INTO monetization_evidence (id,opportunity_id,evidence_type,source_ref,status,notes)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, input.opportunityId, String(input.evidenceType || 'source'), sourceRef.slice(0, 1000), status, input.notes ? String(input.notes).slice(0, 2000) : null]
  );
  await getPostgresPool().query(
    `UPDATE monetization_opportunities
     SET evidence_refs = CASE
       WHEN evidence_refs @> $2::jsonb THEN evidence_refs
       ELSE evidence_refs || $2::jsonb
     END,
     updated_at=NOW()
     WHERE id=$1`,
    [input.opportunityId, JSON.stringify([sourceRef])]
  );
  return { id, opportunityId: input.opportunityId, evidenceType: String(input.evidenceType || 'source'), sourceRef, status };
}

export async function advanceMonetizationOpportunity(input: {
  opportunityId: string;
  stage: MonetizationStage;
  actor?: string;
  evidenceRefs?: string[];
  buyerReference?: string | null;
  deliverable?: string | null;
  payoutRail?: PayoutRail | null;
  revenueEventRef?: string | null;
  settlementRef?: string | null;
}) {
  await initializeMonetizationSprint();
  const allowed: Record<MonetizationStage, MonetizationStage[]> = {
    observed: ['qualified','blocked'],
    qualified: ['buyer_targeted','blocked'],
    buyer_targeted: ['deliverable_ready','blocked'],
    deliverable_ready: ['offer_ready','blocked'],
    offer_ready: ['accepted','blocked'],
    accepted: ['revenue_verified','blocked'],
    revenue_verified: ['settlement_confirmed','blocked'],
    settlement_confirmed: ['payout_ready','blocked'],
    payout_ready: ['closed','blocked'],
    closed: [],
    blocked: ['qualified'],
  };
  const currentResult = await getPostgresPool().query('SELECT * FROM monetization_opportunities WHERE id=$1', [input.opportunityId]);
  if (!currentResult.rowCount) throw new Error('Opportunity not found');
  const current = mapOpportunity(currentResult.rows[0]);
  if (!allowed[current.stage]?.includes(input.stage)) throw new Error(`Invalid stage transition: ${current.stage} -> ${input.stage}`);

  const refs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map(String).filter(Boolean).slice(0, 50) : current.evidenceRefs;
  const needsEvidence = ['qualified','buyer_targeted','deliverable_ready','offer_ready','accepted','revenue_verified','settlement_confirmed','payout_ready'].includes(input.stage);
  if (needsEvidence && refs.length === 0) throw new Error('Evidence references are required for this stage');

  if (input.stage === 'accepted' && !input.buyerReference && !current.buyerReference) throw new Error('Buyer reference is required for acceptance');

  if (['accepted','revenue_verified','settlement_confirmed','payout_ready'].includes(input.stage)) {
    const evidenceRows = await getPostgresPool().query(
      'SELECT evidence_type,status,source_ref FROM monetization_evidence WHERE opportunity_id=$1 AND status=\'verified\' ORDER BY created_at DESC',
      [input.opportunityId]
    );
    if (!evidenceRows.rowCount) throw new Error('Verified evidence is required for this stage');
    if (input.stage === 'accepted' && !evidenceRows.rows.some((x:any) => ['acceptance','contract','offer'].includes(String(x.evidence_type)))) {
      throw new Error('Verified buyer acceptance or contract evidence is required');
    }
    if (input.stage === 'revenue_verified') {
      if (!input.revenueEventRef) throw new Error('Verified revenue event reference is required');
      await getPostgresPool().query('SELECT 1 FROM revenue_ledger WHERE event_id=$1 AND status=\'paid\' LIMIT 1', [input.revenueEventRef]).then((r:any) => {
        if (!r.rowCount) throw new Error('Revenue event reference is not a paid event in the authoritative revenue ledger');
      });
      if (!evidenceRows.rows.some((x:any) => ['payment','revenue','settlement'].includes(String(x.evidence_type)))) {
        throw new Error('Verified payment/revenue evidence is required');
      }
    }
    if (input.stage === 'settlement_confirmed') {
      if (!input.settlementRef) throw new Error('Settlement reference is required');
      if (!evidenceRows.rows.some((x:any) => ['settlement','payment'].includes(String(x.evidence_type)) && String(x.source_ref) === String(input.settlementRef))) {
        throw new Error('Verified settlement evidence must match the settlement reference');
      }
    }
  }
  if (input.stage === 'payout_ready' && !current.settlementRef && !input.settlementRef) throw new Error('Settlement confirmation is required before payout readiness');
  if (input.stage === 'payout_ready' && !current.settlementRef && !input.settlementRef) throw new Error('Settlement confirmation is required before payout readiness');

  const governance = await governRevenueAction({
    machine: 'opportunity-engine',
    actionType: input.stage === 'payout_ready' ? 'withdraw' : 'qualify',
    objective: `Advance monetization opportunity ${input.opportunityId} from ${current.stage} to ${input.stage}.`,
    evidenceRefs: refs,
    reversible: input.stage !== 'payout_ready',
    actor: input.actor || 'human-owner',
  });
  if (governance.status === 'blocked') throw new Error('Governance blocked this stage transition');

  const next = await getPostgresPool().query(
    `UPDATE monetization_opportunities
     SET stage=$2,
         status=$9,
         buyer_reference=COALESCE($3,buyer_reference),
         deliverable=COALESCE($4,deliverable),
         payout_rail=COALESCE($5,payout_rail),
         revenue_event_ref=COALESCE($6,revenue_event_ref),
         settlement_ref=COALESCE($7,settlement_ref),
         evidence_refs=$8::jsonb,
         accepted_at=CASE WHEN $2='accepted' THEN NOW() ELSE accepted_at END,
         updated_at=NOW()
     WHERE id=$1
     RETURNING *`,
    [
      input.opportunityId, input.stage,
      input.buyerReference ?? null, input.deliverable ?? null, input.payoutRail ?? null,
      input.revenueEventRef ?? null, input.settlementRef ?? null, JSON.stringify(refs),
      stageToLegacyStatus(input.stage)
    ]
  );
  return { opportunity: mapOpportunity(next.rows[0]), governance };
}

export async function getMonetizationSprintSnapshot() {
  const opportunities = await listMonetizationSprintOpportunities(200);
  const byStage = opportunities.reduce<Record<string, number>>((acc, x) => {
    acc[x.stage] = (acc[x.stage] || 0) + 1;
    return acc;
  }, {});
  const payoutReady = opportunities.filter(x => x.stage === 'payout_ready');
  const estimatedPipelineUsd = opportunities.reduce((sum, x) => sum + (x.estimatedAmountUsd || 0), 0);
  return {
    version: GLORIFIER_MONETIZATION_SPRINT_VERSION,
    target: '7-day monetization execution',
    targetIsNotGuaranteed: true,
    scientists: MONETIZATION_SCIENTISTS,
    opportunities,
    counts: byStage,
    estimatedPipelineUsd,
    payoutReadyCount: payoutReady.length,
    payoutReady,
    pricingModels: FRACTIONAL_PAY_PER_TOKEN_OUTCOME_POLICY,
    monetizationScientistRule: 'Scientists may propose fractional token pricing or outcome-based pricing, but rates, outcomes, acceptance, invoices, and settlement must be backed by external evidence and authorized by the human owner.',
    truthBoundary: {
      estimatedPipeline: 'NOT VERIFIED',
      acceptedOffer: 'NOT REVENUE',
      verifiedRevenue: 'requires revenue event reference',
      settlementConfirmed: 'requires external settlement reference',
      payoutReady: 'requires verified revenue + settlement evidence',
    },
    payoutRails: {
      voucher: 'supported only when a real buyer/provider supplies a valid settlement mechanism',
      crypto: 'requires verified destination and authorized execution',
      fiat: 'requires supported payout provider/account and settlement confirmation',
      gcash: 'requires supported business/provider onboarding and authorization',
    },
  };
}
