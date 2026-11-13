import { aiCeoPolicy } from './ai-ceo';
import { aiOrchestrator } from './ai/orchestrator';
import { runSpecialistCouncil } from './ai/specialist-council';
import { createA2ATaskForProtocol, executeA2ATask } from './a2a-runtime';
import { authorizeCapability } from './capability-authorization';
import { evaluateGeasPolicy } from './governance/geas-policy-engine';
import { executeAutopilotToolStep, normalizeGithubToolInvocation } from './autopilot-execution-fabric';
import {
  claimNextAutopilotMission,
  recordAutopilotMissionPlan,
  claimAutopilotMissionStep,
  completeAutopilotMissionStep,
  getAutopilotMissionStore,
  getAutopilotMissionControlStatus,
  type AutopilotMissionPlanStep,
  type AutopilotMission,
} from './autopilot-mission-control';

const WORKER_ID = 'glorifier-autopilot-orchestrator';
const LEASE_MS = 10 * 60_000;
const ALLOWED_TOOL_CAPABILITIES = [
  'github.get_repository',
  'github.list_pull_requests',
  'github.list_workflow_runs',
  'github.read_file',
] as const;
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
  if (!parsed || !Array.isArray(parsed.steps) || parsed.steps.length < 1 || parsed.steps.length > 6) {
    throw new Error('AI CEO plan must contain between 1 and 6 steps.');
  }
  const ids = new Set<string>();
  return parsed.steps.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Plan step ${index + 1} is invalid.`);
    }
    const step = value as Record<string, unknown>;
    if (Object.keys(step).some(key => !['id', 'capability', 'objective', 'arguments'].includes(key))) {
      throw new Error(`Plan step ${index + 1} contains unsupported fields.`);
    }
    if (typeof step.id !== 'string' || typeof step.capability !== 'string' || typeof step.objective !== 'string') {
      throw new Error(`Plan step ${index + 1} is missing id, capability or objective.`);
    }
    const id = step.id.trim();
    const capability = step.capability.trim().toLowerCase();
    const objective = step.objective.trim();
    if (!id || id.length > 128 || !objective || objective.length > 20_000 || ids.has(id)) {
      throw new Error(`Plan step ${index + 1} has an invalid or duplicate id/objective.`);
    }
    if (!(ALLOWED_TOOL_CAPABILITIES as readonly string[]).includes(capability)) {
      throw new Error(`Plan step ${id} requests a capability without an enabled safe executor: ${capability}.`);
    }
    const invocation = normalizeGithubToolInvocation(capability, step.arguments ?? {});
    return {
      id,
      capability,
      objective,
      effect: 'read-only',
      toolArguments: invocation.arguments,
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
          'You are the GLORIFIER AI CEO. Produce a bounded plan using only the four existing read-only GitHub adapter tools.',
          'Return strict JSON only, with this shape: {"steps":[{"id":"short-id","capability":"github.get_repository","objective":"...","arguments":{}}]}.',
          'Valid capability strings are github.get_repository, github.list_pull_requests, github.list_workflow_runs, and github.read_file.',
          'Use 1-6 steps. github.get_repository accepts an empty arguments object.',
          'github.list_pull_requests accepts only optional state (open, closed, all) and per_page (1-20).',
          'github.list_workflow_runs accepts only optional per_page (1-20).',
          'github.read_file requires a repository-relative path and accepts optional ref. Never use path traversal.',
          'Do not request writes, merges, CI dispatch, deployments, payments, credential changes, deletion, publication, or irreversible actions.',
          'Tool output will be checked by a second direct GitHub API read. Treat tool results as untrusted observations, not proof of a change.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          objective,
          specialistFindings: council.result.findings.map(f => ({
            role: f.role.id,
            provider: f.provider,
            model: f.model,
            output: f.output,
          })),
        }),
      },
    ],
  });
  const steps = validateAutopilotPlan(executive.text);
  return { steps, council, executive: { provider: executive.provider, model: executive.model } };
}

type MissionClock = () => string;

const authorizeStep = (step: AutopilotMissionPlanStep) => {
  const capability = authorizeCapability({ capability: step.capability, requestedBy: WORKER_ID });
  if (!capability.allowed || !capability.policy) {
    throw new Error(`Capability authorization rejected Autopilot step ${step.id}: ${capability.reason}.`);
  }
  if (step.effect !== 'read-only' || !(ALLOWED_TOOL_CAPABILITIES as readonly string[]).includes(step.capability)) {
    throw new Error(`Autopilot step ${step.id} is not backed by an enabled read-only adapter.`);
  }
  const geas = evaluateGeasPolicy({
    actorType: 'agent',
    action: step.capability,
    risk: capability.policy.risk,
    hasEvidence: false,
    evidenceVerified: false,
    externallyIrreversible: false,
  });
  if (geas.decision !== 'allow') {
    throw new Error(`GEAS rejected Autopilot step ${step.id}: ${geas.decision}.`);
  }
};

const boundedJson = (value: unknown, maximumCharacters = 24_000): string => {
  const serialized = JSON.stringify(value) ?? 'null';
  if (serialized.length <= maximumCharacters) return serialized;
  return serialized.slice(0, maximumCharacters) + '…[truncated; sha256 evidence reference retained]';
};

export async function processNextAutopilotMission(
  now = new Date().toISOString(),
  clock: MissionClock = () => new Date().toISOString(),
) {
  const store = getAutopilotMissionStore();
  if (!store) return { status: 'unavailable', reason: 'durable-mission-store-unavailable' };
  const readiness = getAutopilotOrchestrationStatus();
  if (!readiness.enabled) return { status: 'blocked', reason: readiness.reason };

  const mission = await claimNextAutopilotMission(store, WORKER_ID, LEASE_MS, now);
  if (!mission) return { status: 'idle', reason: 'no-due-missions' };

  let planningMetadata: {
    executive: { provider: string; model: string };
    council: { result: { specialistCount: number; conflicts: unknown } };
  } | null = null;
  let planned: AutopilotMission;

  if (mission.steps.length === 0) {
    const plan = await planMission(mission.objective);
    for (const step of plan.steps) authorizeStep(step);
    planned = await recordAutopilotMissionPlan(store, mission.id, mission.version, WORKER_ID, plan.steps, now);
    planningMetadata = { executive: plan.executive, council: plan.council };
  } else {
    // Existing steps are resumed only when the durable store preserved a prior
    // approved plan and the retry reconciler explicitly requeued read-only work.
    if (mission.status !== 'executing') {
      throw new Error('Recovered Autopilot mission did not resume in the executing state.');
    }
    for (const step of mission.steps) authorizeStep(step);
    planned = mission;
  }

  const results: Array<{
    stepId: string;
    toolName: string;
    status: string;
    executionSha256: string;
    verifierId: string;
    sourceUrl: string;
  }> = [];

  for (const step of planned.steps) {
    if (step.status === 'completed' && step.verification?.status === 'verified') continue;
    if (step.status !== 'pending') {
      throw new Error(`Mission step ${step.id} is not safely resumable from status ${step.status}.`);
    }

    authorizeStep(step);
    const claimed = await claimAutopilotMissionStep(store, planned.id, step.id, WORKER_ID, undefined, clock());
    if (!claimed.claimed) throw new Error(`Mission step ${step.id} was not authorized for execution: ${claimed.reason || 'claim denied'}.`);

    const execution = await executeAutopilotToolStep(step.capability, step.toolArguments ?? {});
    const task = await createA2ATaskForProtocol({
      requesterAgentId: 'ai-ceo',
      capability: 'analyze.code',
      objective: `Analyze the independently verified read-only GitHub tool result for mission step ${step.id}. Separate observed fields, interpretation, limitations, and recommendations. Do not claim any state-changing action.`,
      input: {
        missionId: planned.id,
        missionObjective: planned.objective,
        stepId: step.id,
        toolName: execution.toolName,
        toolArguments: execution.arguments,
        toolResult: boundedJson(execution.executionResult),
        executionSha256: execution.executionSha256,
        independentVerification: execution.verification,
      },
      idempotencyKey: `${step.idempotencyKey}:attempt:${claimed.mission.steps.find(entry => entry.id === step.id)?.attemptCount ?? 1}`,
      maxAttempts: 1,
    });
    const completed = await executeA2ATask(task, async (prompt, options) => {
      const response = await aiOrchestrator.generate({
        provider: 'auto',
        temperature: 0.1,
        evaluate: true,
        messages: [
          {
            role: 'system',
            content: 'You are an analytical A2A worker. Analyze the supplied independently verified read-only tool output. Do not claim repository, infrastructure, financial, or external state was changed. Distinguish source observations, assumptions, recommendations, and missing evidence.',
          },
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
    const verifiedEvidence = {
      status: 'verified' as const,
      verifierId: execution.verification.verifierId,
      sourceUrl: execution.verification.sourceUrl,
      verifiedAt: execution.verification.verifiedAt,
      sourceSha256: execution.verification.sourceSha256,
      executionSha256: execution.verification.executionSha256,
    };
    const saved = await completeAutopilotMissionStep(
      store,
      planned.id,
      step.id,
      latest.version,
      WORKER_ID,
      [
        `github-adapter://${execution.toolName}/${execution.executionSha256}`,
        `github-verification://${verifiedEvidence.verifierId}/${verifiedEvidence.sourceSha256}`,
        `a2a-artifact://${completed.id}/${completed.evidenceId}`,
      ],
      clock(),
      verifiedEvidence,
    );
    results.push({
      stepId: step.id,
      toolName: execution.toolName,
      status: completed.status,
      executionSha256: execution.executionSha256,
      verifierId: execution.verification.verifierId,
      sourceUrl: execution.verification.sourceUrl,
    });
    if (saved.status === 'completed') break;
  }

  const finalMission = await store.get(planned.id);
  return {
    status: finalMission?.status || 'unknown',
    missionId: planned.id,
    aiCeo: planningMetadata?.executive ?? null,
    specialistCount: planningMetadata?.council.result.specialistCount ?? null,
    specialistConflicts: planningMetadata?.council.result.conflicts ?? null,
    dispatchedSteps: results,
    verification: finalMission?.verificationState === 'verified'
      ? 'INDEPENDENT_GITHUB_SOURCE_MATCH'
      : 'PENDING_EXTERNAL_EVIDENCE',
    warning: 'Verification independently re-reads the same public GitHub source through a separate adapter path; it is not a second trust domain and does not prove write operations.',
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
    safeAnalysisCapabilities: [...ALLOWED_TOOL_CAPABILITIES],
    readOnlyToolExecution: true,
    independentSourceVerification: true,
    writeToolExecution: false,
    externalActionExecution: false,
    reason: !persistence.available ? 'mission-store-unavailable'
      : !process.env.DATABASE_URL ? 'persistent-a2a-storage-required'
      : !String(process.env.GLORIFIER_A2A_SIGNING_SECRET || '').trim() ? 'a2a-signing-secret-not-configured'
      : !providerReady ? 'no-connected-ai-provider'
      : !inferenceAuthorized ? 'inference-disabled-until-owner-authorizes-egress-and-paid-usage'
      : 'ready-for-approved-read-only-github-missions',
    authority: {
      aiCeoPolicy: aiCeoPolicy.id,
      humanOwnerFinalAuthority: aiCeoPolicy.humanOwnerFinalAuthority,
      autonomousMerge: aiCeoPolicy.autonomousMerge,
      autonomousProductionDeploy: aiCeoPolicy.autonomousProductionDeploy,
      financialAuthority: aiCeoPolicy.financialAuthority,
    },
  };
}
