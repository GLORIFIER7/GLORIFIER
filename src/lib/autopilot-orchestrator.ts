import { aiCeoPolicy } from './ai-ceo';
import { aiOrchestrator } from './ai/orchestrator';
import { runSpecialistCouncil } from './ai/specialist-council';
import { createA2ATaskForProtocol, executeA2ATask } from './a2a-runtime';
import { authorizeCapability } from './capability-authorization';
import { evaluateGeasPolicy } from './governance/geas-policy-engine';
import {
  claimNextAutopilotMission,
  recordAutopilotMissionPlan,
  claimAutopilotMissionStep,
  completeAutopilotMissionStep,
  getAutopilotMissionStore,
  getAutopilotMissionControlStatus,
  type AutopilotMissionPlanStep,
} from './autopilot-mission-control';

const WORKER_ID = 'glorifier-autopilot-orchestrator';
const LEASE_MS = 10 * 60_000;
const ALLOWED_ANALYSIS_CAPABILITIES = new Set(['read.repository', 'repository.search', 'analyze.code', 'knowledge.search']);
const COUNCIL_ROLES = ['engineering-scientist', 'software-architect', 'cybersecurity-scientist', 'operations-scientist'];

type PlannedStep = AutopilotMissionPlanStep;

export function isAutopilotInferenceAuthorized(env: Record<string, string | undefined> = process.env): boolean {
  return env.GLORIFIER_ENABLE_INFERENCE === 'true'
    && env.GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS === 'true'
    && env.GLORIFIER_PAID_INFERENCE_AUTHORIZED === 'true';
}

export function validateAutopilotPlan(text: string): PlannedStep[] {
  const source = text.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
  const parsed = JSON.parse(source) as { steps?: unknown };
  if (!parsed || !Array.isArray(parsed.steps) || parsed.steps.length < 1 || parsed.steps.length > 12) {
    throw new Error('AI CEO plan must contain between 1 and 12 steps.');
  }
  return parsed.steps.map((value, index) => {
    if (!value || typeof value !== 'object') throw new Error(`Plan step ${index + 1} is invalid.`);
    const step = value as Record<string, unknown>;
    if (typeof step.id !== 'string' || typeof step.capability !== 'string' || typeof step.objective !== 'string') {
      throw new Error(`Plan step ${index + 1} is missing id, capability or objective.`);
    }
    if (!ALLOWED_ANALYSIS_CAPABILITIES.has(step.capability.trim().toLowerCase())) {
      throw new Error(`Plan step ${step.id} requests a capability without an enabled safe executor: ${String(step.capability)}.`);
    }
    return {
      id: step.id.trim(),
      capability: step.capability.trim().toLowerCase(),
      objective: step.objective.trim(),
      effect: 'read-only',
    };
  });
}

async function planMission(objective: string) {
  const council = await runSpecialistCouncil({
    objective: `Analyze this mission and identify constraints, risks, and acceptance criteria: ${objective}`,
    roles: COUNCIL_ROLES,
    temperature: 0.1,
  });
  if (council.result.findings.length === 0) throw new Error('Specialist Council returned no findings; planning is blocked.');
  const executive = await aiOrchestrator.generate({
    provider: 'auto',
    temperature: 0.1,
    evaluate: true,
    messages: [
      {
        role: 'system',
        content: [
          'You are the GLORIFIER AI CEO. Produce a bounded, read-only analysis plan.',
          'Return strict JSON only: {"steps":[{"id":"short-id","capability":"read.repository|repository.search|analyze.code|knowledge.search","objective":"..."}]}.',
          'Use 1-6 steps. Only use the listed capabilities. Never request writes, deployments, payments, credential changes, deletion, publication, or irreversible actions.',
          'The plan is a proposal for A2A analytical artifacts, not permission to perform external side effects.',
          'Use specialist findings as advisory inputs, not as proof.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({ objective, specialistFindings: council.result.findings.map(f => ({ role: f.role.id, provider: f.provider, model: f.model, output: f.output })) }),
      },
    ],
  });
  const steps = validateAutopilotPlan(executive.text);
  return { steps, council, executive: { provider: executive.provider, model: executive.model } };
}

export async function processNextAutopilotMission(now = new Date().toISOString()) {
  const store = getAutopilotMissionStore();
  if (!store) return { status: 'unavailable', reason: 'durable-mission-store-unavailable' };
  const readiness = getAutopilotOrchestrationStatus();
  if (!readiness.enabled) return { status: 'blocked', reason: readiness.reason };

  const mission = await claimNextAutopilotMission(store, WORKER_ID, LEASE_MS, now);
  if (!mission) return { status: 'idle', reason: 'no-due-missions' };

  const plan = await planMission(mission.objective);
  const authorizedPlan = plan.steps.filter(step => {
    const capability = authorizeCapability({ capability: step.capability, requestedBy: WORKER_ID });
    const geas = evaluateGeasPolicy({
      actorType: 'agent',
      action: step.capability,
      risk: 'low',
      hasEvidence: false,
      evidenceVerified: false,
      externallyIrreversible: false,
    });
    return capability.allowed && geas.decision === 'allow';
  });
  if (authorizedPlan.length !== plan.steps.length || authorizedPlan.length === 0) {
    throw new Error('GEAS or capability authorization rejected one or more proposed steps; no plan was dispatched.');
  }

  const planned = await recordAutopilotMissionPlan(store, mission.id, mission.version, WORKER_ID, authorizedPlan, now);
  const results: Array<{ stepId: string; a2aTaskId: string; status: string; artifactEvidenceId?: string }> = [];

  for (const step of planned.steps) {
    const claimed = await claimAutopilotMissionStep(store, planned.id, step.id, WORKER_ID, undefined, now);
    if (!claimed.claimed) throw new Error(`Mission step ${step.id} was not authorized for execution.`);
    const task = await createA2ATaskForProtocol({
      requesterAgentId: 'ai-ceo',
      capability: step.capability,
      objective: step.objective,
      input: { missionId: planned.id, missionObjective: planned.objective, stepId: step.id },
      idempotencyKey: step.idempotencyKey,
      maxAttempts: 1,
    });
    const completed = await executeA2ATask(task, async (prompt, options) => {
      const response = await aiOrchestrator.generate({
        provider: 'auto',
        temperature: 0.1,
        evaluate: true,
        messages: [
          { role: 'system', content: 'You are an analytical A2A worker. Produce a read-only analysis artifact. Do not claim that repository, infrastructure, financial, or external state was changed. Separate observations, assumptions, recommendations, and missing evidence.' },
          { role: 'user', content: prompt + '\nExecution context: ' + JSON.stringify(options || {}) },
        ],
      });
      return { text: response.text, model: `${response.provider}:${response.model}` };
    });
    if (completed.status !== 'completed' || !completed.evidenceId) {
      throw new Error(`A2A analytical task ${task.id} did not complete: ${completed.error || completed.status}.`);
    }
    const latest = await store.get(planned.id);
    if (!latest) throw new Error('Mission disappeared during A2A execution.');
    const saved = await completeAutopilotMissionStep(
      store,
      planned.id,
      step.id,
      latest.version,
      WORKER_ID,
      [`a2a-artifact://${completed.id}/${completed.evidenceId}`],
      new Date().toISOString(),
    );
    results.push({ stepId: step.id, a2aTaskId: completed.id, status: completed.status, artifactEvidenceId: completed.evidenceId });
    if (saved.status === 'completed') break;
  }

  const finalMission = await store.get(planned.id);
  return {
    status: finalMission?.status || 'unknown',
    missionId: planned.id,
    aiCeo: plan.executive,
    specialistCount: plan.council.result.specialistCount,
    specialistConflicts: plan.council.result.conflicts,
    dispatchedSteps: results,
    verification: 'PENDING_EXTERNAL_EVIDENCE',
    warning: 'A2A artifacts are internal analytical outputs, not proof of external state changes or independently verified outcomes.',
  };
}

export function getAutopilotOrchestrationStatus() {
  const persistence = getAutopilotMissionControlStatus();
  const executive = aiOrchestrator.executive();
  const providerReady = executive.status === 'active';
  const inferenceAuthorized = isAutopilotInferenceAuthorized();
  return {
    enabled: persistence.available && Boolean(process.env.DATABASE_URL) && Boolean(String(process.env.GLORIFIER_A2A_SIGNING_SECRET || '').trim()) && providerReady && inferenceAuthorized,
    aiCeoConnected: true,
    specialistCouncilConnected: true,
    providerOrchestratorConnected: providerReady,
    inferenceAuthorized,
    inferenceMode: inferenceAuthorized ? 'owner-authorized-provider-inference' : 'disabled-zero-budget-default',
    selectedProvider: executive.provider,
    selectedModel: executive.model,
    a2aConnected: true,
    geasAuthorizationConnected: true,
    safeAnalysisCapabilities: [...ALLOWED_ANALYSIS_CAPABILITIES],
    externalActionExecution: false,
    independentExternalVerification: false,
    reason: !persistence.available ? 'mission-store-unavailable'
      : !process.env.DATABASE_URL ? 'persistent-a2a-storage-required'
      : !String(process.env.GLORIFIER_A2A_SIGNING_SECRET || '').trim() ? 'a2a-signing-secret-not-configured'
      : !providerReady ? 'no-connected-ai-provider'
      : !inferenceAuthorized ? 'inference-disabled-until-owner-authorizes-egress-and-paid-usage'
      : 'ready-for-read-only-analysis-missions',
    authority: {
      aiCeoPolicy: aiCeoPolicy.id,
      humanOwnerFinalAuthority: aiCeoPolicy.humanOwnerFinalAuthority,
      autonomousMerge: aiCeoPolicy.autonomousMerge,
      autonomousProductionDeploy: aiCeoPolicy.autonomousProductionDeploy,
      financialAuthority: aiCeoPolicy.financialAuthority,
    },
  };
}
