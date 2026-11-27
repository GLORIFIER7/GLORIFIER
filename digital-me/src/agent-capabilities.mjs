// Digital Me collaborator registry. Entries describe where each AI is wired into this
// repository; they never grant write access, approval, spending or live execution.
export const INTENTS = Object.freeze(['plan', 'explain', 'fix', 'review']);
export const EVIDENCE_STATES = Object.freeze(['VERIFIED', 'PARTIALLY VERIFIED', 'NOT VERIFIED', 'DEGRADED', 'NOT OBSERVABLE']);
const REPO = 'GLORIFIER7/GLORIFIER';

const entry = (value) => Object.freeze({
  ...value,
  intents: Object.freeze([...value.intents]),
  sources: Object.freeze([...value.sources]),
  credentialEnv: Object.freeze([...value.credentialEnv]),
  writeAuthority: 'none',
  defaultEvidence: 'NOT VERIFIED',
});

export const COLLABORATORS = Object.freeze([
  entry({ id: 'claude', name: 'Anthropic Claude', kind: 'model-provider', providerId: 'anthropic', integration: 'source-integrated',
    intents: INTENTS, credentialEnv: ['ANTHROPIC_API_KEY'],
    sources: ['src/lib/ai/providers/anthropic.ts', '.github/workflows/claude-development.yml'] }),
  entry({ id: 'codex', name: 'OpenAI Codex', kind: 'coding-agent', providerId: 'openai', integration: 'source-integrated',
    intents: ['plan', 'fix', 'review'], credentialEnv: ['OPENAI_API_KEY'],
    sources: ['.github/workflows/ai-coding-fleet.yml', '.github/workflows/codex-gemini-review.yml'] }),
  entry({ id: 'gpt', name: 'OpenAI GPT', kind: 'model-provider', providerId: 'openai', integration: 'source-integrated',
    intents: ['plan', 'explain', 'review'], credentialEnv: ['OPENAI_API_KEY'],
    sources: ['src/lib/ai/providers/openai-compatible.ts', 'src/lib/ai/provider-discovery.ts'] }),
  entry({ id: 'gemini', name: 'Google Gemini', kind: 'model-provider', providerId: 'gemini', integration: 'source-integrated',
    intents: INTENTS, credentialEnv: ['GEMINI_API_KEY'],
    sources: ['src/lib/ai/providers/gemini.ts', '.github/workflows/gemini-pr-review.yml', '.github/workflows/gemini-collaborator.yml'] }),
  entry({ id: 'nemotron', name: 'NVIDIA NIM / Nemotron', kind: 'model-provider', providerId: 'nvidia', integration: 'source-integrated',
    intents: INTENTS, credentialEnv: ['NVIDIA_API_KEY'],
    sources: ['src/lib/ai/providers/openai-compatible.ts', 'src/lib/ai/provider-discovery.ts', '.github/workflows/nvidia-ci-triage.yml', '.github/workflows/nvidia-assisted-maintenance-pr.yml'] }),
  // External agents: no adapter in this repository, so they are never selected for execution.
  entry({ id: 'copilot', name: 'GitHub Copilot coding agent', kind: 'coding-agent', providerId: null, integration: 'not-integrated',
    intents: ['fix', 'review'], credentialEnv: [], sources: [] }),
  entry({ id: 'devin', name: 'Devin (Cognition)', kind: 'review-agent', providerId: null, integration: 'advisory-link-only',
    intents: ['review'], credentialEnv: [], sources: [] }),
  entry({ id: 'neon', name: 'Neon PostgreSQL mission ledger', kind: 'data-store', providerId: null, integration: 'source-integrated',
    intents: [], credentialEnv: ['DIGITAL_ME_ADMISSION_DATABASE_URL'], sources: ['.github/workflows/digital-me-coding-plan.yml'] }),
]);

const BY_ID = new Map(COLLABORATORS.map((c) => [c.id, c]));
export const getCollaborator = (id) => BY_ID.get(id) ?? null;

const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function denialReason(collaborator, intent, observation) {
  if (!collaborator.intents.includes(intent)) return 'intent-unsupported';
  if (collaborator.integration !== 'source-integrated') return collaborator.integration;
  if (!isRecord(observation)) return 'not-observed';
  if (observation.credentialConfigured !== true) return 'credential-not-configured';
  if (observation.paidInferenceRequired !== false) return 'zero-budget-not-proven';
  if (observation.evidence !== 'VERIFIED') return 'evidence-not-verified';
  return null;
}

// observations: { [collaboratorId]: { credentialConfigured, paidInferenceRequired, evidence } }
// Missing or partial observations fail closed. The result is a routing proposal only.
export function selectCollaborators(intent, observations = {}) {
  if (!INTENTS.includes(intent)) return Object.freeze({ status: 'IGNORED' });
  const obs = isRecord(observations) ? observations : {};
  const selected = [];
  const denied = [];
  for (const collaborator of COLLABORATORS) {
    if (collaborator.kind === 'data-store') continue;
    const observation = Object.hasOwn(obs, collaborator.id) ? obs[collaborator.id] : undefined;
    const reason = denialReason(collaborator, intent, observation);
    if (reason) denied.push({ id: collaborator.id, reason });
    else selected.push(collaborator.id);
  }
  return {
    status: selected.length > 0 ? 'ROUTING_PROPOSAL' : 'NO_ELIGIBLE_COLLABORATOR',
    intent, selected, denied,
    writeIdentity: 'glorifier-digital-me',
    executionAuthorized: false, paidInferenceAuthorized: false, approvalAuthorized: false, mergeAuthorized: false,
  };
}

// Advisory Devin Review link for a public GLORIFIER PR (#1070). No fetch, no credentials;
// findings are untrusted input and never a GitHub approval.
export function devinReviewLink({ repository, pullNumber, headSha } = {}) {
  if (repository !== REPO || !Number.isSafeInteger(pullNumber) || pullNumber <= 0 ||
      typeof headSha !== 'string' || !/^[a-f0-9]{40}$/.test(headSha)) return null;
  return {
    url: `https://devinreview.com/${REPO}/pull/${pullNumber}`,
    pullNumber, headSha, advisory: true, approval: false, evidence: 'NOT VERIFIED',
  };
}
