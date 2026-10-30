import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { aiOrchestrator } from './ai/orchestrator';
import { runSpecialistCouncil } from './ai/specialist-council';
import { routeAgentCapability, createAgentTask, updateAgentTask, withAgentTaskHeartbeat } from './agent-runtime';
import { withGovernanceTaskFailureRecovery } from './governance-task-failure';
import { getGlorifierAiTrustStandard, evaluateGlorifierAiTrustConformance } from './ai/trust-standard';
import { getWindsorSocialGatewayStatus, getWindsorSocialData } from './windsor-social-gateway';
import { buildComplianceAssessment } from './compliance-policy';
import { getAssetsScientistPolicy, buildAssetAssessment } from './assets-scientist';
import { getGlorifierCoherentSystemPolicy } from './gats-policy';

const query = (text: string, values?: unknown[]) => getPostgresPool().query(text, values);

/** Treat missing and whitespace-only governance requesters as the human owner fallback. */
export function normalizeGovernanceRequester(requester?: string): string {
  return typeof requester === 'string' ? requester.trim() || 'human-owner' : 'human-owner';
}

export type GovernanceStage = 'ceo' | 'policy' | 'compliance' | 'assets' | 'specialists' | 'trust' | 'evidence' | 'governed-action' | 'completed' | 'blocked';

export interface GovernanceCycle {
  id: string;
  taskId: string;
  objective: string;
  capability: string;
  stage: GovernanceStage;
  executive: unknown;
  policy: unknown;
  routing: unknown;
  council: unknown;
  trust: unknown;
  compliance: unknown;
  assets: unknown;
  evidence: { id: string; status: 'recorded' | 'missing'; references: string[] };
  action: {
    status: 'approval-required' | 'blocked';
    reversible: boolean;
    executionEnabled: false;
    humanApprovalRequired: true;
  };
  createdAt: string;
}

let initialized = false;

export async function initializeGovernanceLoop() {
  if (initialized) return;
  await query(`
    CREATE TABLE IF NOT EXISTS glorifier_governance_cycles (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      objective TEXT NOT NULL,
      capability TEXT NOT NULL,
      stage TEXT NOT NULL,
      executive JSONB NOT NULL DEFAULT '{}'::jsonb,
      routing JSONB NOT NULL DEFAULT '{}'::jsonb,
      council JSONB NOT NULL DEFAULT '{}'::jsonb,
      policy JSONB NOT NULL DEFAULT '{}'::jsonb,
      trust JSONB NOT NULL DEFAULT '{}'::jsonb,
      compliance JSONB NOT NULL DEFAULT '{}'::jsonb,
      assets JSONB NOT NULL DEFAULT '{}'::jsonb,
      evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
      action JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE glorifier_governance_cycles ADD COLUMN IF NOT EXISTS policy JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE glorifier_governance_cycles ADD COLUMN IF NOT EXISTS compliance JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE glorifier_governance_cycles ADD COLUMN IF NOT EXISTS assets JSONB NOT NULL DEFAULT '{}'::jsonb;
    CREATE INDEX IF NOT EXISTS idx_glorifier_governance_cycles_created ON glorifier_governance_cycles(created_at DESC);
  `);
  initialized = true;
}

export async function runGovernanceCycle(input: {
  objective: string;
  capability?: string;
  roles?: string[];
  evidenceRefs?: string[];
  reversible?: boolean;
  requester?: string;
}) {
  await initializeGovernanceLoop();
  const objective = String(input.objective || '').trim();
  if (!objective) throw new Error('objective is required');
  const capability = String(input.capability || 'research').trim().toLowerCase();
  const evidenceRefs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map(String).filter(Boolean) : [];
  const windsorEnabled = capability === 'social-intelligence' || capability === 'social-monitoring' || objective.toLowerCase().includes('windsor');
  const windsor = windsorEnabled ? getWindsorSocialGatewayStatus() : null;
  const reversible = input.reversible === true;

  const task = await createAgentTask({
    capability,
    objective,
    input: { evidenceRefs, reversible },
    requester: normalizeGovernanceRequester(input.requester),
    approvalRequired: true
  });
  await updateAgentTask(task.id, { status: 'running' });

  const executeGovernanceCycle = async (): Promise<GovernanceCycle> => {
    // 1. AI CEO selects the executive/provider context.
    const executive = aiOrchestrator.executive();

    // 2. Policy Scientist establishes the policy/governance interpretation.
    const coherentPolicy = getGlorifierCoherentSystemPolicy();
    const policy = {
      status: 'policy-reviewed',
      source: 'GLORIFIER GATS Governance Policy + Policy Scientist',
      humanAuthority: true,
      irreversibleActionsApprovalGated: true,
      coherentSystem: coherentPolicy
    };

    // 3. Compliance Scientist maps requirements to controls and evidence.
    const compliance = buildComplianceAssessment({
      objective,
      evidenceRefs,
      applicableRequirements: ['GATS governance policy', 'applicable AI/data/security requirements']
    });

    // 4. Assets Scientist evaluates asset implications when the capability/objective is asset-related.
    const assetRelated = capability === 'assets' || capability === 'asset-intelligence' || capability === 'asset-risk' ||
      /asset|portfolio|holding|valuation|ownership|crypto|stock|bond|etf|gaming|iot/i.test(objective);
    const assets = assetRelated
      ? buildAssetAssessment({ assetRef: objective, assetClass: capability === 'assets' ? 'other' : capability, evidenceRefs })
      : { status: 'not-applicable', policy: getAssetsScientistPolicy().id };

    // 5. Capability-first delegation to the Specialist Council.
    const routing = routeAgentCapability(capability);
    const baseRoles = routing.specialists.length ? routing.specialists : [];
    const collaborationRoles = ['policy-scientist', 'compliance-scientist', ...(assetRelated ? ['assets-scientist'] : [])];
    const selectedRoles = input.roles?.length ? input.roles : [...new Set([...collaborationRoles, ...baseRoles])];
    const council = await runSpecialistCouncil({ objective, roles: selectedRoles, standingMission: false });

    // 6. GATS trust gate evaluates the governance state before any action proposal.
    const trust = evaluateGlorifierAiTrustConformance();
    const trustGatePassed = trust.status === 'conformant-self-attestation' && trust.controls.every((c) => c.status === 'implemented');

    // 7. Evidence is explicit. References are recorded, never inferred. Windsor observations are source evidence only.
    let windsorEvidence: unknown = null;
    if (windsorEnabled && windsor?.configured) {
      try {
        const platforms = ['facebook','linkedin','tiktok'] as const;
        const observations = [];
        for (const platform of platforms) {
          try { observations.push(await getWindsorSocialData(platform, ['date','source'], 'last_30d')); }
          catch (error: any) { observations.push({ platform, status: 'unavailable', error: error?.message || String(error) }); }
        }
        windsorEvidence = { source: 'windsor.ai', observations, economicTruth: 'NOT VERIFIED; source observations are not revenue evidence' };
      } catch (error: any) { windsorEvidence = { source: 'windsor.ai', status: 'error', error: error?.message || String(error) }; }
    }
    const evidenceId = `gev-${crypto.randomUUID()}`;
    const evidence = {
      id: evidenceId,
      status: (evidenceRefs.length || windsorEvidence) ? 'recorded' as const : 'missing' as const,
      references: [...evidenceRefs, ...(windsorEvidence ? ['windsor.ai:social-observations'] : [])],
      windsor: windsorEvidence
    };

    // 6. Governed action is a proposal only. No irreversible execution is performed here.
    const actionStatus = trustGatePassed && evidence.references.length ? 'approval-required' as const : 'blocked' as const;
    const action = {
      status: actionStatus,
      reversible,
      executionEnabled: false as const,
      humanApprovalRequired: true as const
    };

    const stage: GovernanceStage = actionStatus === 'approval-required' ? 'governed-action' : 'blocked';
    const cycle: GovernanceCycle = {
      id: `gcycle-${crypto.randomUUID()}`,
      taskId: task.id,
      objective,
      capability,
      stage,
      executive,
      policy,
      routing,
      council,
      trust: {
        ...trust,
        gatePassed: trustGatePassed,
        rule: 'GATS trust controls gate consequential actions.'
      },
      compliance,
      assets,
      evidence,
      action,
      createdAt: new Date().toISOString()
    };

    await query(
      `INSERT INTO glorifier_governance_cycles
        (id,task_id,objective,capability,stage,executive,policy,routing,council,trust,compliance,assets,evidence,action)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb)`,
      [cycle.id, cycle.taskId, cycle.objective, cycle.capability, cycle.stage,
        JSON.stringify(cycle.executive), JSON.stringify(cycle.policy), JSON.stringify(cycle.routing), JSON.stringify(cycle.council),
        JSON.stringify(cycle.trust), JSON.stringify(cycle.compliance), JSON.stringify(cycle.assets), JSON.stringify({ ...cycle.evidence, windsor: windsorEvidence }), JSON.stringify(cycle.action)]
    );

    await updateAgentTask(task.id, {
      status: actionStatus === 'blocked' ? 'failed' : 'completed',
      result: cycle
    });

    return cycle;
  };

  return withAgentTaskHeartbeat(task.id, () =>
    withGovernanceTaskFailureRecovery(
      task.id,
      executeGovernanceCycle,
      (taskId, message) => updateAgentTask(taskId, { status: 'failed', error: message }),
    ),
  );
}

export async function listGovernanceCycles(limit = 50) {
  const result = await query(
    `SELECT id,task_id AS "taskId",objective,capability,stage,executive,policy,routing,council,trust,compliance,assets,evidence,action,created_at AS "createdAt"
     FROM glorifier_governance_cycles ORDER BY created_at DESC LIMIT $1`,
    [Math.max(1, Math.min(100, limit))]
  );
  return result.rows;
}

export function getGovernanceLoopPolicy() {
  return {
    name: 'GLORIFIER Continuous Governance Orchestration Loop',
    flow: ['AI CEO', 'Policy Scientist', 'Compliance Scientist', 'Assets Scientist', 'Specialist Council', 'GATS Trust Layer', 'Evidence Layer', 'Governed Action Layer', 'Human Authority'],
    humanAuthority: true,
    evidenceRequiredBeforeVerification: true,
    missingEvidenceIsNotZero: true,
    consequentialActionsRequireHumanApproval: true,
    autonomousIrreversibleExecution: false,
    executionEnabled: false,
    trustStandard: getGlorifierAiTrustStandard().version,
    coherentSystem: getGlorifierCoherentSystemPolicy(),
    architecturePrinciple: 'All GLORIFIER capabilities share one governance, evidence, authorization and improvement lifecycle.'
  };
}
