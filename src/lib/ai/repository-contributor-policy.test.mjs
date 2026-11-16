import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRepositoryCouncilAssignments,
  evaluateRepositoryProviderAttestation,
  getRepositoryFreeContributorPolicy,
  listEligibleRepositoryContributors,
  normalizeRepositoryProviderId,
  normalizeRepositoryProviderEndpoint,
  isSafeRepositoryContributionInput,
  isRepositoryMissionPublicContentApproved
} from './repository-contributor-policy.mjs';

const NOW = '2026-11-16T15:00:00.000Z';
const BASE = {
  status: 'owner-attested',
  planName: 'Free',
  evidenceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  attestedAt: '2026-11-16T14:00:00.000Z',
  expiresAt: '2026-11-16T16:00:00.000Z',
  monthlyPaidSpendLimitUsd: 0,
  autoTopUpEnabled: false,
  payAsYouGoEnabled: false,
  paidFallbackEnabled: false,
  monthlyInvoicingEnabled: false,
  requestsPerMinute: 10,
  requestsPerDay: 100,
  maxTokensPerDay: 60000,
  maxInputTokens: 12000,
  maxOutputTokens: 2048
};

const PROVIDER_ENDPOINTS = Object.freeze({
  gemini: 'https://generativelanguage.googleapis.com',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  anthropic: 'https://api.anthropic.com',
  xai: 'https://api.x.ai/v1',
  meta: 'http://127.0.0.1:8000/v1',
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  huggingface: 'https://router.huggingface.co/v1',
  ollama: 'http://127.0.0.1:11434/v1',
  mistral: 'https://api.mistral.ai/v1',
  qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  deepseek: 'https://api.deepseek.com/v1',
  together: 'https://api.together.ai/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  llmsrelay: 'https://api.llmsrelay.com/v1',
  cloudflare_workers_ai: 'https://api.cloudflare.com/client/v4'
});

function attestation(providerId, mode, overrides = {}) {
  return {
    ...BASE,
    providerId,
    mode,
    endpointUrl: PROVIDER_ENDPOINTS[providerId],
    modelId: providerId + '-free-model',
    ...overrides
  };
}

test('normalizes common provider aliases without inventing unknown providers', () => {
  assert.equal(normalizeRepositoryProviderId('GPT'), 'openai');
  assert.equal(normalizeRepositoryProviderId('Grok'), 'xai');
  assert.equal(normalizeRepositoryProviderId('Llama'), 'meta');
  assert.equal(normalizeRepositoryProviderId('NVIDIA'), 'nvidia');
  assert.equal(normalizeRepositoryProviderId('Gemini'), 'gemini');
  assert.equal(normalizeRepositoryProviderId('not-a-provider'), null);
});

test('accepts Gemini only with current free-tier proof and billing disabled', () => {
  const valid = attestation('gemini', 'vendor-free-tier', {
    evidenceUrl: 'https://ai.google.dev/gemini-api/docs/rate-limits',
    billingEnabled: false,
    modelFree: true
  });
  assert.equal(evaluateRepositoryProviderAttestation('gemini', valid, NOW).eligible, true);

  assert.match(
    evaluateRepositoryProviderAttestation('gemini', { ...valid, billingEnabled: true }, NOW).reasons.join(' '),
    /billing/i
  );
  assert.match(
    evaluateRepositoryProviderAttestation('gemini', { ...valid, modelFree: false }, NOW).reasons.join(' '),
    /Free Tier eligible model/i
  );
});

test('accepts NVIDIA only for an active developer program and prototype scope', () => {
  const valid = attestation('nvidia', 'developer-program', {
    evidenceUrl: 'https://docs.api.nvidia.com/nim/docs/product',
    planName: 'NVIDIA Developer Program',
    developerProgramActive: true,
    nonProduction: true,
    billingEnabled: false
  });
  assert.equal(evaluateRepositoryProviderAttestation('nvidia', valid, NOW).eligible, true);
  assert.match(
    evaluateRepositoryProviderAttestation('nvidia', { ...valid, nonProduction: false }, NOW).reasons.join(' '),
    /prototype|non-production/i
  );
});

test('requires a positive promotional grant and a hard no-billing boundary for GPT, Claude and Grok', () => {
  for (const providerId of ['openai', 'anthropic', 'xai']) {
    const valid = attestation(providerId, 'promotional-credits', {
      evidenceUrl: providerId === 'openai'
        ? 'https://platform.openai.com/settings/organization/billing'
        : providerId === 'anthropic'
          ? 'https://platform.claude.com/settings/billing'
          : 'https://console.x.ai/team/default/billing',
      planName: 'Promotional API credits',
      billingEnabled: false,
      remainingFreeCreditsUsd: 2
    });
    assert.equal(evaluateRepositoryProviderAttestation(providerId, valid, NOW).eligible, true);
    assert.match(
      evaluateRepositoryProviderAttestation(providerId, { ...valid, remainingFreeCreditsUsd: 0 }, NOW).reasons.join(' '),
      /credit|grant/i
    );
  }
});

test('blocks Grok, GPT or Claude when invoicing, top-up, pay-as-you-go or fallback is enabled', () => {
  const valid = attestation('xai', 'promotional-credits', {
    evidenceUrl: 'https://console.x.ai/team/default/billing',
    remainingFreeCreditsUsd: 2,
    billingEnabled: false
  });
  for (const override of [
    { autoTopUpEnabled: true },
    { payAsYouGoEnabled: true },
    { paidFallbackEnabled: true },
    { monthlyInvoicingEnabled: true },
    { monthlyPaidSpendLimitUsd: 1 }
  ]) {
    assert.equal(evaluateRepositoryProviderAttestation('xai', { ...valid, ...override }, NOW).eligible, false);
  }
});

test('allows Llama only on an existing local runtime with no paid compute or network egress', () => {
  const valid = attestation('meta', 'local-self-hosted', {
    evidenceUrl: 'https://ai.meta.com/resources/models-and-libraries/llama-downloads/',
    planName: 'Local Llama runtime',
    localExecution: true,
    endpointKind: 'loopback',
    cloudComputePaid: false,
    incrementalComputeCostUsd: 0,
    modelLicenseReviewed: true,
    networkEgress: false,
    billingEnabled: false
  });
  assert.equal(evaluateRepositoryProviderAttestation('meta', valid, NOW).eligible, true);
  assert.equal(
    evaluateRepositoryProviderAttestation('meta', { ...valid, endpointKind: 'public-cloud' }, NOW).eligible,
    false
  );
});

test('enforces OpenRouter free-model identifiers and documented free-plan request ceilings', () => {
  const valid = attestation('openrouter', 'free-model', {
    evidenceUrl: 'https://openrouter.ai/pricing',
    modelId: 'meta-llama/llama-3.3-70b-instruct:free',
    planName: 'Free',
    billingEnabled: false,
    creditsPurchased: false,
    requestsPerMinute: 20,
    requestsPerDay: 50
  });
  assert.equal(evaluateRepositoryProviderAttestation('openrouter', valid, NOW).eligible, true);
  assert.equal(evaluateRepositoryProviderAttestation('openrouter', { ...valid, modelId: 'openai/gpt-4o' }, NOW).eligible, false);
  assert.equal(evaluateRepositoryProviderAttestation('openrouter', { ...valid, requestsPerDay: 51 }, NOW).eligible, false);
  assert.equal(evaluateRepositoryProviderAttestation('openrouter', { ...valid, requestsPerMinute: 21 }, NOW).eligible, false);
});

test('caps Hugging Face monthly free grant at ten cents and disables pay-as-you-go', () => {
  const valid = attestation('huggingface', 'monthly-credit-grant', {
    evidenceUrl: 'https://huggingface.co/docs/inference-providers/pricing',
    planName: 'Free user monthly grant',
    monthlyFreeGrantUsd: 0.1,
    remainingFreeCreditsUsd: 0.05,
    billingEnabled: false
  });
  assert.equal(evaluateRepositoryProviderAttestation('huggingface', valid, NOW).eligible, true);
  assert.equal(evaluateRepositoryProviderAttestation('huggingface', { ...valid, monthlyFreeGrantUsd: 0.11 }, NOW).eligible, false);
  assert.equal(evaluateRepositoryProviderAttestation('huggingface', { ...valid, payAsYouGoEnabled: true }, NOW).eligible, false);
});

test('rejects stale, expired, unpinned, unsupported and over-budget attestations', () => {
  const valid = attestation('gemini', 'vendor-free-tier', {
    evidenceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
    billingEnabled: false,
    modelFree: true
  });
  assert.equal(evaluateRepositoryProviderAttestation('gemini', { ...valid, attestedAt: '2026-11-15T10:00:00.000Z' }, NOW).eligible, false);
  assert.equal(evaluateRepositoryProviderAttestation('gemini', { ...valid, expiresAt: '2026-11-16T14:59:00.000Z' }, NOW).eligible, false);
  assert.equal(evaluateRepositoryProviderAttestation('gemini', { ...valid, evidenceUrl: 'https://example.com/claims' }, NOW).eligible, false);
  assert.equal(evaluateRepositoryProviderAttestation('gemini', { ...valid, monthlyPaidSpendLimitUsd: 0.01 }, NOW).eligible, false);
  assert.equal(evaluateRepositoryProviderAttestation('gemini', { ...valid, status: 'verified-by-model' }, NOW).eligible, false);
});

test('only configured providers with valid attestations enter the repository contribution pool', () => {
  const attestations = [
    attestation('gemini', 'vendor-free-tier', {
      evidenceUrl: 'https://ai.google.dev/gemini-api/docs/rate-limits',
      billingEnabled: false,
      modelFree: true
    }),
    attestation('nvidia', 'developer-program', {
      evidenceUrl: 'https://docs.api.nvidia.com/nim/docs/product',
      developerProgramActive: true,
      nonProduction: true,
      billingEnabled: false
    }),
    attestation('xai', 'promotional-credits', {
      evidenceUrl: 'https://console.x.ai/team/default/billing',
      remainingFreeCreditsUsd: 0
    })
  ];
  const configured = [
    { id: 'gemini', status: 'connected', models: ['gemini-free-model'] },
    { id: 'nvidia', status: 'connected', models: ['nvidia-free-model'] },
    { id: 'xai', status: 'connected', models: ['xai-free-model'] },
    { id: 'openai', status: 'disconnected', models: ['gpt-4o'] }
  ];
  const pool = listEligibleRepositoryContributors({ attestations, configuredProviders: configured, now: NOW });
  assert.deepEqual(pool.map((entry) => entry.providerId), ['gemini', 'nvidia']);
});


test('assigns every eligible provider an explicit model and a review role without duplication', () => {
  const providers = [
    { providerId: 'gemini', modelId: 'gemini-flash' },
    { providerId: 'nvidia', modelId: 'nemotron' },
    { providerId: 'anthropic', modelId: 'claude-haiku' },
    { providerId: 'xai', modelId: 'grok-mini' },
    { providerId: 'openai', modelId: 'gpt-mini' },
    { providerId: 'meta', modelId: 'llama-local' },
    { providerId: 'groq', modelId: 'llama-fast' },
    { providerId: 'openrouter', modelId: 'provider/free' },
    { providerId: 'huggingface', modelId: 'hf-free' },
    { providerId: 'ollama', modelId: 'llama3-local' },
    { providerId: 'mistral', modelId: 'mistral-free' },
    { providerId: 'qwen', modelId: 'qwen-free' },
    { providerId: 'deepseek', modelId: 'deepseek-credit' },
    { providerId: 'together', modelId: 'together-credit' },
    { providerId: 'fireworks', modelId: 'fireworks-credit' },
    { providerId: 'llmsrelay', modelId: 'llmsrelay-credit' },
    { providerId: 'cloudflare_workers_ai', modelId: 'workers-ai-free' }
  ];
  const roles = [
    { id: 'engineering-scientist' },
    { id: 'software-architect' }
  ];
  const assignments = buildRepositoryCouncilAssignments(providers, roles);
  assert.equal(assignments.length, 16);
  assert.deepEqual(assignments.map((entry) => entry.providerId), providers.slice(0, 16).map((entry) => entry.providerId));
  assert.deepEqual(assignments.map((entry) => entry.role.id), [
    'engineering-scientist', 'software-architect',
    'engineering-scientist', 'software-architect',
    'engineering-scientist', 'software-architect',
    'engineering-scientist', 'software-architect',
    'engineering-scientist', 'software-architect',
    'engineering-scientist', 'software-architect',
    'engineering-scientist', 'software-architect',
    'engineering-scientist', 'software-architect'
  ]);
  assert.equal(new Set(assignments.map((entry) => entry.providerId)).size, assignments.length);
});

test('requires an explicit repository-only free mode and $0 paid-inference policy', () => {
  const env = {
    GLORIFIER_REPOSITORY_AI_FREE_ONLY: 'true',
    GLORIFIER_REPOSITORY_PUBLIC_CODE_EGRESS: 'true',
    GLORIFIER_MONTHLY_AI_BUDGET_USD: '0',
    GLORIFIER_PAID_INFERENCE_AUTHORIZED: 'false',
    GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'false'
  };
  assert.equal(getRepositoryFreeContributorPolicy({ env, configuredProviders: [], now: NOW }).authorized, true);
  assert.equal(getRepositoryFreeContributorPolicy({ env: { ...env, GLORIFIER_PAID_INFERENCE_AUTHORIZED: 'true' }, configuredProviders: [], now: NOW }).authorized, false);
  assert.equal(getRepositoryFreeContributorPolicy({ env: { ...env, GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'true' }, configuredProviders: [], now: NOW }).authorized, false);
  assert.equal(getRepositoryFreeContributorPolicy({ env: { ...env, GLORIFIER_MONTHLY_AI_BUDGET_USD: '1' }, configuredProviders: [], now: NOW }).authorized, false);
});

test('does not expose provider API keys or secrets in contributor status', () => {
  const env = {
    GLORIFIER_REPOSITORY_AI_FREE_ATTESTATIONS_JSON: JSON.stringify([
      attestation('gemini', 'vendor-free-tier', {
        evidenceUrl: 'https://ai.google.dev/gemini-api/docs/rate-limits',
        billingEnabled: false,
        modelFree: true
      })
    ]),
    GEMINI_API_KEY: 'must-never-be-returned'
  };
  const result = getRepositoryFreeContributorPolicy({
    env: { ...env, GLORIFIER_REPOSITORY_AI_FREE_ONLY: 'true', GLORIFIER_REPOSITORY_PUBLIC_CODE_EGRESS: 'true', GLORIFIER_MONTHLY_AI_BUDGET_USD: '0', GLORIFIER_PAID_INFERENCE_AUTHORIZED: 'false', GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'false' },
    configuredProviders: [{ id: 'gemini', status: 'connected', models: ['gemini-free-model'] }],
    now: NOW
  });
  assert.doesNotMatch(JSON.stringify(result), /must-never-be-returned/);
});


test('Mistral and Qwen promotional-credit attestations require a positive remaining grant', () => {
  for (const [providerId, evidenceUrl] of [
    ['mistral', 'https://console.mistral.ai/billing/'],
    ['qwen', 'https://dashscope.console.aliyun.com/billing'],
  ]) {
    const funded = attestation(providerId, 'promotional-credits', {
      evidenceUrl,
      planName: 'Promotional API credits',
      billingEnabled: false,
      remainingFreeCreditsUsd: 0.25,
    });
    assert.equal(evaluateRepositoryProviderAttestation(providerId, funded, NOW).eligible, true);
    for (const invalidGrant of [0, null, undefined, Number.NaN, -0.01]) {
      const result = evaluateRepositoryProviderAttestation(
        providerId,
        { ...funded, remainingFreeCreditsUsd: invalidGrant },
        NOW,
      );
      assert.equal(result.eligible, false);
      assert.match(result.reasons.join(' '), /positive promotional API credit grant/i);
    }
  }
});

test('OpenRouter fails closed when request ceilings are missing, null, zero, or unsafe', () => {
  const valid = attestation('openrouter', 'free-model', {
    evidenceUrl: 'https://openrouter.ai/pricing',
    modelId: 'meta-llama/llama-3.3-70b-instruct:free',
    planName: 'Free',
    billingEnabled: false,
    creditsPurchased: false,
    requestsPerMinute: 20,
    requestsPerDay: 50,
  });
  for (const override of [
    { requestsPerMinute: undefined },
    { requestsPerMinute: null },
    { requestsPerDay: undefined },
    { requestsPerDay: null },
    { requestsPerMinute: 0 },
    { requestsPerDay: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.equal(evaluateRepositoryProviderAttestation('openrouter', { ...valid, ...override }, NOW).eligible, false);
  }
});

test('Cloudflare Workers AI stays excluded without the approved authoritative billing-read mechanism', () => {
  const attestationValue = attestation('cloudflare_workers_ai', 'cloudflare-workers-free', {
    evidenceUrl: 'https://developers.cloudflare.com/workers-ai/platform/pricing/',
    planName: 'Free',
    authoritativeWorkersFreePlanRead: true,
    modelFree: true,
    accountQuotaHardCapEnforced: true,
  });
  assert.equal(evaluateRepositoryProviderAttestation('cloudflare_workers_ai', attestationValue, NOW).eligible, false);
});


test('attestation endpoint must match the provider host and local modes must use loopback HTTP only', () => {
  assert.equal(
    normalizeRepositoryProviderEndpoint('gemini', 'https://generativelanguage.googleapis.com/v1beta'),
    'https://generativelanguage.googleapis.com/v1beta',
  );
  assert.equal(
    normalizeRepositoryProviderEndpoint('ollama', 'http://127.0.0.1:11434/v1'),
    'http://127.0.0.1:11434/v1',
  );
  assert.equal(normalizeRepositoryProviderEndpoint('ollama', 'https://ollama.example/v1'), null);
  assert.equal(normalizeRepositoryProviderEndpoint('ollama', 'http://192.168.1.10:11434/v1'), null);
  assert.equal(normalizeRepositoryProviderEndpoint('gemini', 'https://api.openai.com/v1'), null);
  assert.equal(normalizeRepositoryProviderEndpoint('gemini', 'https://user@generativelanguage.googleapis.com'), null);
  assert.equal(normalizeRepositoryProviderEndpoint('gemini', 'https://generativelanguage.googleapis.com?redirect=1'), null);
});

test('owner attestation endpoint URL is required and normalized before provider eligibility', () => {
  const valid = attestation('gemini', 'vendor-free-tier', {
    evidenceUrl: 'https://ai.google.dev/gemini-api/docs/rate-limits',
    billingEnabled: false,
    modelFree: true,
  });
  assert.equal(evaluateRepositoryProviderAttestation('gemini', valid, NOW).eligible, true);
  const mismatch = evaluateRepositoryProviderAttestation(
    'gemini',
    { ...valid, endpointUrl: 'https://api.openai.com/v1' },
    NOW,
  );
  assert.equal(mismatch.eligible, false);
  assert.match(mismatch.reasons.join(' '), /provider-endpoint/i);
});


test('screens the combined provider conversation for split credentials and bearer tokens', () => {
  const githubToken = 'ghp_' + 'A'.repeat(24);
  assert.equal(isSafeRepositoryContributionInput([
    { role: 'system', content: 'Public repository maintenance.' },
    { role: 'user', content: githubToken.slice(0, 4) },
    { role: 'assistant', content: githubToken.slice(4) },
  ]), false);
  const bearer = 'Authorization: ' + 'Bearer ' + 'opaque-token-value-123456789';
  assert.equal(isSafeRepositoryContributionInput([
    { role: 'system', content: bearer.slice(0, 14) },
    { role: 'user', content: bearer.slice(14) },
  ]), false);
  assert.equal(isSafeRepositoryContributionInput([
    { role: 'user', content: 'x'.repeat(12_500) },
    { role: 'assistant', content: 'y'.repeat(12_500) },
  ]), false);
});

test('only exact owner-approved public mission IDs authorize mission-content egress', () => {
  const env = {
    GLORIFIER_REPOSITORY_PUBLIC_CONTENT_APPROVED_MISSION_IDS_JSON: JSON.stringify(['mission-public-1']),
  };
  assert.equal(isRepositoryMissionPublicContentApproved(env, 'mission-public-1'), true);
  assert.equal(isRepositoryMissionPublicContentApproved(env, 'mission-private-2'), false);
  assert.equal(isRepositoryMissionPublicContentApproved({}, 'mission-public-1'), false);
  assert.equal(isRepositoryMissionPublicContentApproved({
    GLORIFIER_REPOSITORY_PUBLIC_CONTENT_APPROVED_MISSION_IDS_JSON: '{"mission-public-1":true}',
  }, 'mission-public-1'), false);
});


test('requires the exact attested model ID to be present in the configured provider catalog', () => {
  const valid = attestation('gemini', 'vendor-free-tier', {
    evidenceUrl: 'https://ai.google.dev/gemini-api/docs/rate-limits',
    billingEnabled: false,
    modelFree: true,
  });
  const eligible = listEligibleRepositoryContributors({
    attestations: [valid],
    configuredProviders: [{ id: 'gemini', status: 'connected', models: ['different-model'] }],
    now: NOW,
  });
  assert.deepEqual(eligible, []);
});
