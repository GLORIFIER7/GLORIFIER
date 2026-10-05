import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { runGovernanceCycle, getGovernanceLoopPolicy } from './governance-loop';
import { buildMonetizationDashboard, listMonetizationOpportunities } from './monetization-engine';
import { scanClaimableFocus } from './claimable-assets';
import { listSaasOverview } from './saas-registry';
import { getWorkUnitSummary } from './business-model';
import { listConnections } from './connection-registry';
import { getGLREconomicSnapshot } from './glr-economic-layer';

export const GLORIFIER_REVENUE_CONTROL_PLANE_VERSION = 'GRCP-1.0';

export type RevenueMachine =
  | 'saas' | 'work-units' | 'business-intelligence' | 'data-products'
  | 'integrations' | 'iot' | 'social-intelligence' | 'claimable-assets'
  | 'marketplace' | 'opportunity-engine' | 'other';

export type GovernedActionType =
  | 'observe' | 'discover' | 'qualify' | 'estimate' | 'propose'
  | 'publish' | 'negotiate' | 'contract' | 'invoice' | 'collect'
  | 'claim' | 'redeem' | 'transfer' | 'withdraw' | 'trade' | 'other';

export interface RevenueGovernanceRequest {
  machine: RevenueMachine;
  actionType: GovernedActionType;
  objective: string;
  capability?: string;
  evidenceRefs?: string[];
  reversible?: boolean;
  amount?: number | null;
  currency?: string | null;
  actor?: string;
}

export async function initializeRevenueControlPlane() {
  const db = getPostgresPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS glorifier_revenue_governance_events (
      id TEXT PRIMARY KEY,
      machine TEXT NOT NULL,
      action_type TEXT NOT NULL,
      objective TEXT NOT NULL,
      governance_cycle_id TEXT,
      status TEXT NOT NULL,
      evidence_status TEXT NOT NULL DEFAULT 'missing',
      evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
      amount NUMERIC,
      currency TEXT,
      human_approval_required BOOLEAN NOT NULL DEFAULT TRUE,
      execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      actor TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_revenue_governance_events_created
      ON glorifier_revenue_governance_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_revenue_governance_events_machine
      ON glorifier_revenue_governance_events(machine, action_type, created_at DESC);
  `);
}

export function getRevenueControlPlanePolicy() {
  return {
    version: GLORIFIER_REVENUE_CONTROL_PLANE_VERSION,
    identity: 'Common governance and economic-truth control plane for GLORIFIER value-creation and revenue machines',
    flow: [
      'AI CEO',
      'Policy Scientist',
      'Compliance Scientist',
      'Assets Scientist',
      'Specialist Council',
      'GATS Trust',
      'Evidence',
      'Governed Action',
      'Human Authority',
      'Execution',
      'Outcome Evidence'
    ],
    machines: [
      'saas','work-units','business-intelligence','data-products','integrations',
      'iot','social-intelligence','claimable-assets','marketplace','opportunity-engine'
    ],
    glr: {
      nativeEconomicUnit: 'GLR',
      positioning: 'The native economic unit for governed AI-agent commerce.',
      settlementIsEvidenceGated: true,
      verifiedSettlementIsNotTheSameAsEstimatedValue: true
    },
    economicTruth: {
      estimatedValue: 'NOT VERIFIED',
      expectedValue: 'NOT VERIFIED',
      marketValueIsNotRevenue: true,
      missingEvidenceIsNotZero: true,
      verifiedRevenueRequiresQualifyingEvidence: true,
      contractsRequireEvidence: true,
      paymentsRequireExternalReference: true
    },
    authority: {
      humanAuthority: true,
      autonomousContracting: false,
      autonomousPaymentMovement: false,
      autonomousTrading: false,
      autonomousWithdrawal: false,
      autonomousRedemption: false,
      irreversibleActionsRequireHumanApproval: true,
      executionEnabledByDefault: false
    },
    governance: getGovernanceLoopPolicy()
  };
}

export async function governRevenueAction(input: RevenueGovernanceRequest) {
  await initializeRevenueControlPlane();
  const actionType = input.actionType || 'other';
  const consequential = ['contract','invoice','collect','claim','redeem','transfer','withdraw','trade'].includes(actionType);
  const evidenceRefs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map(String).filter(Boolean) : [];
  const cycle = await runGovernanceCycle({
    objective: input.objective,
    capability: input.capability || 'opportunity-analysis',
    evidenceRefs,
    reversible: input.reversible === true,
    requester: input.actor || 'human-owner'
  });
  const evidenceStatus = cycle.evidence.status;
  const autonomousPayoutRequest =
    input.actor === 'ai-ceo-autonomous' &&
    input.capability === 'move.funds' &&
    actionType === 'propose' &&
    input.amount != null &&
    evidenceRefs.includes('neon:verified-revenue-ledger') &&
    evidenceRefs.includes('neon:verified-available-balance') &&
    evidenceStatus === 'recorded';

  const blocked = cycle.stage === 'blocked' || (consequential && !autonomousPayoutRequest && evidenceStatus !== 'recorded');
  const status = blocked ? 'blocked' : (autonomousPayoutRequest ? 'autonomous-approved' : 'approval-required');
  const id = `rgev-${crypto.randomUUID()}`;
  await getPostgresPool().query(
    `INSERT INTO glorifier_revenue_governance_events
      (id,machine,action_type,objective,governance_cycle_id,status,evidence_status,evidence_refs,amount,currency,human_approval_required,execution_enabled,actor)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,FALSE,$11)`,
    [
      id, input.machine, actionType, input.objective, cycle.id, status, evidenceStatus,
      JSON.stringify(evidenceRefs), input.amount ?? null, input.currency || null,
      input.actor || 'human-owner'
    ]
  );
  return {
    id,
    machine: input.machine,
    actionType,
    status,
    governanceCycleId: cycle.id,
    evidenceStatus,
    estimatedValueLabel: 'NOT VERIFIED',
    verifiedRevenue: false,
    humanApprovalRequired: !autonomousPayoutRequest,
    executionEnabled: false,
    autonomousRoutine: autonomousPayoutRequest,
    consequentialAction: consequential,
    cycle
  };
}

export async function listRevenueGovernanceEvents(limit = 100) {
  await initializeRevenueControlPlane();
  const r = await getPostgresPool().query(
    'SELECT * FROM glorifier_revenue_governance_events ORDER BY created_at DESC LIMIT $1',
    [Math.max(1, Math.min(500, limit))]
  );
  return r.rows.map((x: any) => ({
    id: x.id,
    machine: x.machine,
    actionType: x.action_type,
    objective: x.objective,
    governanceCycleId: x.governance_cycle_id,
    status: x.status,
    evidenceStatus: x.evidence_status,
    evidenceRefs: x.evidence_refs || [],
    amount: x.amount == null ? null : Number(x.amount),
    currency: x.currency || null,
    humanApprovalRequired: Boolean(x.human_approval_required),
    executionEnabled: Boolean(x.execution_enabled),
    actor: x.actor,
    createdAt: x.created_at
  }));
}

export async function buildRevenueControlPlaneSnapshot() {
  const [monetization, opportunities, claimable, saas, workUnits, connections, events, glr] = await Promise.all([
    buildMonetizationDashboard(),
    listMonetizationOpportunities(),
    scanClaimableFocus(),
    listSaasOverview(),
    getWorkUnitSummary(),
    listConnections(),
    listRevenueGovernanceEvents(50),
    getGLREconomicSnapshot()
  ]);
  const verifiedRevenue = monetization.verifiedPaid.reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const pendingApprovals = events.filter(x => x.status === 'approval-required').length;
  const blockedActions = events.filter(x => x.status === 'blocked').length;
  return {
    version: GLORIFIER_REVENUE_CONTROL_PLANE_VERSION,
    generatedAt: new Date().toISOString(),
    machines: {
      monetization: monetization,
      opportunityCount: opportunities.length,
      claimable,
      saas: { tenants: saas.tenants.length, plans: saas.plans.length, subscriptions: saas.subscriptions.length },
      workUnits,
      connections: {
        total: connections.length,
        authorized: connections.filter((x: any) => x.status === 'authorized').length,
        pendingAuthorization: connections.filter((x: any) => x.status === 'pending_authorization').length
      }
    },
    glr,
    governance: {
      pendingApprovals,
      blockedActions,
      recentEvents: events
    },
    economicTruth: {
      verifiedRevenue,
      verifiedRevenueLabel: 'VERIFIED',
      estimatedPipelineLabel: 'NOT VERIFIED',
      marketValueIsNotRevenue: true,
      missingEvidenceIsNotZero: true
    },
    policy: getRevenueControlPlanePolicy()
  };
}
