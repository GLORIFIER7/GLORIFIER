const ATTESTATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ATTESTATION_MAX_FUTURE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_REPOSITORY_CONTRIBUTOR_PROVIDERS = 16;
export const REPOSITORY_AI_PAID_BUDGET_USD = 0;

const PROVIDER_ALIASES = Object.freeze({
  gpt: 'openai',
  grock: 'xai',
  grok: 'xai',
  llama: 'meta',
  'google-gemini': 'gemini',
  claude: 'anthropic',
  'nvidia-nim': 'nvidia'
});

const EVIDENCE_HOSTS = Object.freeze({
  openai: ['platform.openai.com', 'help.openai.com'],
  gemini: ['ai.google.dev', 'aistudio.google.com', 'console.cloud.google.com'],
  anthropic: ['platform.claude.com', 'console.anthropic.com', 'support.claude.com'],
  xai: ['console.x.ai', 'docs.x.ai'],
  meta: ['ai.meta.com', 'llama.com'],
  nvidia: ['build.nvidia.com', 'docs.api.nvidia.com', 'developer.nvidia.com'],
  groq: ['console.groq.com', 'groq.com'],
  openrouter: ['openrouter.ai'],
  huggingface: ['huggingface.co'],
  ollama: ['ollama.com'],
  mistral: ['console.mistral.ai', 'docs.mistral.ai'],
  qwen: ['modelstudio.console.aliyun.com', 'help.aliyun.com', 'dashscope.console.aliyun.com'],
  deepseek: ['platform.deepseek.com', 'api-docs.deepseek.com'],
  together: ['api.together.ai', 'docs.together.ai'],
  fireworks: ['fireworks.ai', 'docs.fireworks.ai'],
  llmsrelay: ['llmsrelay.com'],
  cloudflare_workers_ai: ['developers.cloudflare.com', 'dash.cloudflare.com']
});

const PROVIDER_PROFILES = Object.freeze([
  { id: 'gemini', name: 'Google Gemini', modes: ['vendor-free-tier'], note: 'Use only a model and project confirmed on the Gemini API Free Tier; billing must be disabled for this project.' },
  { id: 'nvidia', name: 'NVIDIA NIM / Nemotron', modes: ['developer-program'], note: 'NVIDIA Developer Program access is for prototyping and development; production use is excluded.' },
  { id: 'anthropic', name: 'Anthropic Claude', modes: ['promotional-credits'], note: 'Claude API calls require a current promotional-credit grant; Claude Free/Pro app access is not an API entitlement.' },
  { id: 'xai', name: 'xAI Grok', modes: ['promotional-credits'], note: 'The default xAI API tier is not a free allowance; require a documented promotional grant and $0 invoicing.' },
  { id: 'meta', name: 'Meta Llama', modes: ['local-self-hosted'], note: 'Use an already-owned local runtime only; model access, license, and compute cost must be reviewed.' },
  { id: 'openai', name: 'OpenAI GPT', modes: ['promotional-credits'], note: 'OpenAI API access is separate from ChatGPT app usage; require an actual API credit grant.' },
  { id: 'groq', name: 'Groq', modes: ['vendor-free-tier'], note: 'Use only the account-specific free developer plan and its current model limits.' },
  { id: 'openrouter', name: 'OpenRouter free models', modes: ['free-model'], note: 'Only model IDs ending in :free or the free router are allowed; never route to paid models.' },
  { id: 'huggingface', name: 'Hugging Face Inference Providers', modes: ['monthly-credit-grant'], note: 'Use only the documented free-user monthly credit grant; pay-as-you-go and credit purchases are disabled.' },
  { id: 'ollama', name: 'Ollama / local Llama runtime', modes: ['local-self-hosted'], note: 'Use an already-owned loopback runtime only; no rented GPU or cloud inference endpoint.' },
  { id: 'mistral', name: 'Mistral AI', modes: ['vendor-free-tier', 'promotional-credits'], note: 'Free eligibility and quotas must be attested from the current account.' },
  { id: 'qwen', name: 'Alibaba Qwen', modes: ['vendor-free-tier', 'promotional-credits'], note: 'Free eligibility and quotas must be attested from the current account.' },
  { id: 'deepseek', name: 'DeepSeek', modes: ['promotional-credits'], note: 'Require a current promotional grant and an enforceable $0 invoicing boundary.' },
  { id: 'together', name: 'Together AI', modes: ['promotional-credits'], note: 'Require a current promotional grant and an enforceable $0 invoicing boundary.' },
  { id: 'fireworks', name: 'Fireworks AI', modes: ['promotional-credits'], note: 'Require a current promotional grant and an enforceable $0 invoicing boundary.' },
  { id: 'llmsrelay', name: 'LLMsRelay', modes: ['promotional-credits'], note: 'Require a current promotional grant and an enforceable $0 invoicing boundary.' },
  { id: 'cloudflare_workers_ai', name: 'Cloudflare Workers AI', modes: ['cloudflare-workers-free'], note: 'Require an authoritative Workers Free plan check, model eligibility, and an enforced account-wide quota cap.' }
]);

const PROFILE_BY_ID = new Map(PROVIDER_PROFILES.map((profile) => [profile.id, profile]));

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const parseTime = (value) => {
  if (typeof value !== 'string' || !value.trim()) return NaN;
  return Date.parse(value);
};
const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const isZero = (value) => typeof value === 'number' && Number.isFinite(value) && value === 0;

export function normalizeRepositoryProviderId(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '-');
  const providerId = PROVIDER_ALIASES[normalized] || normalized;
  return PROFILE_BY_ID.has(providerId) ? providerId : null;
}

function isAllowedEvidenceUrl(providerId, rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const url = new URL(rawUrl);
    const allowedHosts = EVIDENCE_HOSTS[providerId] || [];
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith('.' + host));
  } catch {
    return false;
  }
}

function addReason(reasons, condition, message) {
  if (!condition) reasons.push(message);
}

/**
 * Validate a human-owner attestation for one provider. This is not a vendor API
 * verification: the caller must inspect the provider console and keep this
 * server-only attestation fresh. No request is accepted from model output.
 */

const PROVIDER_ENDPOINT_HOSTS = Object.freeze({
  gemini: ['generativelanguage.googleapis.com'],
  nvidia: ['integrate.api.nvidia.com'],
  anthropic: ['api.anthropic.com'],
  xai: ['api.x.ai'],
  meta: [],
  openai: ['api.openai.com'],
  groq: ['api.groq.com'],
  openrouter: ['openrouter.ai'],
  huggingface: ['router.huggingface.co'],
  ollama: [],
  mistral: ['api.mistral.ai'],
  qwen: ['dashscope-intl.aliyuncs.com', 'dashscope.aliyuncs.com', 'dashscope-us.aliyuncs.com'],
  deepseek: ['api.deepseek.com'],
  together: ['api.together.ai'],
  fireworks: ['api.fireworks.ai'],
  llmsrelay: ['api.llmsrelay.com'],
  cloudflare_workers_ai: ['api.cloudflare.com']
});

export function normalizeRepositoryProviderEndpoint(providerIdValue, rawUrl) {
  const providerId = normalizeRepositoryProviderId(providerIdValue);
  if (!providerId || typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  try {
    const url = new URL(rawUrl);
    if (url.username || url.password || url.search || url.hash) return null;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (providerId === 'meta' || providerId === 'ollama') {
      const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
      if (url.protocol !== 'http:' || !loopback || (url.port && !/^\d{1,5}$/.test(url.port))) return null;
    } else {
      const allowedHosts = PROVIDER_ENDPOINT_HOSTS[providerId] || [];
      if (url.protocol !== 'https:' || (url.port && url.port !== '443') ||
          !allowedHosts.some((host) => hostname === host || hostname.endsWith('.' + host))) return null;
    }
    const normalizedPath = url.pathname.replace(/\/+$/, '');
    return url.origin + normalizedPath;
  } catch {
    return null;
  }
}

export function evaluateRepositoryProviderAttestation(providerIdValue, attestation, nowValue = new Date().toISOString()) {
  const providerId = normalizeRepositoryProviderId(providerIdValue);
  const reasons = [];
  if (!providerId) {
    return { eligible: false, providerId: null, modelId: null, reasons: ['unsupported-provider'] };
  }
  const profile = PROFILE_BY_ID.get(providerId);
  if (!isRecord(attestation)) {
    return { eligible: false, providerId, modelId: null, reasons: ['missing-owner-attestation'] };
  }

  addReason(reasons, attestation.status === 'owner-attested', 'attestation-must-be-owner-attested');
  addReason(reasons, normalizeRepositoryProviderId(attestation.providerId) === providerId, 'attestation-provider-mismatch');
  addReason(reasons, profile.modes.includes(attestation.mode), 'unsupported-free-entitlement-mode');
  addReason(reasons, isAllowedEvidenceUrl(providerId, attestation.evidenceUrl), 'official-evidence-reference-required');

  const now = parseTime(nowValue);
  const attestedAt = parseTime(attestation.attestedAt);
  const expiresAt = parseTime(attestation.expiresAt);
  addReason(reasons, Number.isFinite(now) && Number.isFinite(attestedAt)
    && attestedAt <= now && now - attestedAt <= ATTESTATION_MAX_AGE_MS, 'attestation-is-stale-or-has-invalid-time');
  addReason(reasons, Number.isFinite(now) && Number.isFinite(expiresAt)
    && expiresAt > now && expiresAt - now <= ATTESTATION_MAX_FUTURE_MS, 'attestation-is-expired-or-expires-too-far-in-the-future');

  addReason(reasons, isZero(attestation.monthlyPaidSpendLimitUsd), 'monthly-paid-spend-limit-must-be-exactly-zero');
  addReason(reasons, attestation.autoTopUpEnabled === false, 'auto-top-up-must-be-disabled');
  addReason(reasons, attestation.payAsYouGoEnabled === false, 'pay-as-you-go-must-be-disabled');
  addReason(reasons, attestation.paidFallbackEnabled === false, 'paid-provider-fallback-must-be-disabled');
  addReason(reasons, attestation.monthlyInvoicingEnabled === false, 'monthly-invoicing-must-be-disabled');
  addReason(reasons, attestation.billingEnabled === false, 'provider-billing-must-be-disabled-or-restricted-to-free-grant');
  addReason(reasons, isPositiveInteger(attestation.requestsPerMinute), 'current-account-requests-per-minute-limit-required');
  addReason(reasons, isPositiveInteger(attestation.requestsPerDay), 'current-account-requests-per-day-limit-required');
  addReason(reasons, isPositiveInteger(attestation.maxTokensPerDay), 'current-account-daily-token-limit-required');
  addReason(reasons, isPositiveInteger(attestation.maxInputTokens), 'bounded-max-input-token-limit-required');
  addReason(reasons, isPositiveInteger(attestation.maxOutputTokens), 'bounded-max-output-token-limit-required');

  const endpointUrl = normalizeRepositoryProviderEndpoint(providerId, attestation.endpointUrl);
  addReason(reasons, Boolean(endpointUrl), 'provider-endpoint-must-match-the-attested-provider-and-local-modes-must-use-loopback');

  const modelId = typeof attestation.modelId === 'string' ? attestation.modelId.trim() : '';
  addReason(reasons, Boolean(modelId) && modelId.length <= 200, 'exact-model-id-required');

  if (providerId === 'gemini') {
    addReason(reasons, attestation.mode === 'vendor-free-tier' && attestation.modelFree === true,
      'Gemini requires a Free Tier eligible model');
    addReason(reasons, attestation.billingEnabled === false, 'Gemini project must have billing disabled');
  } else if (providerId === 'nvidia') {
    addReason(reasons, attestation.mode === 'developer-program'
      && attestation.developerProgramActive === true
      && attestation.nonProduction === true, 'NVIDIA Developer Program prototype entitlement is required');
  } else if (['openai', 'anthropic', 'xai', 'mistral', 'qwen', 'deepseek', 'together', 'fireworks', 'llmsrelay'].includes(providerId)) {
    addReason(reasons, attestation.mode === 'promotional-credits'
      && typeof attestation.remainingFreeCreditsUsd === 'number'
      && Number.isFinite(attestation.remainingFreeCreditsUsd)
      && attestation.remainingFreeCreditsUsd > 0, 'positive promotional API credit grant is required');
  } else if (providerId === 'meta' || providerId === 'ollama') {
    addReason(reasons, attestation.mode === 'local-self-hosted'
      && attestation.localExecution === true
      && attestation.endpointKind === 'loopback'
      && attestation.cloudComputePaid === false
      && attestation.incrementalComputeCostUsd === 0
      && attestation.modelLicenseReviewed === true
      && attestation.networkEgress === false, 'existing local zero-cost runtime and model license review are required');
  } else if (providerId === 'groq') {
    addReason(reasons, attestation.mode === 'vendor-free-tier'
      && attestation.billingEnabled === false
      && /free/i.test(String(attestation.planName || '')), 'Groq account must be on its Free plan with billing disabled');
  } else if (providerId === 'openrouter') {
    addReason(reasons, attestation.mode === 'free-model'
      && (modelId === 'openrouter/free' || modelId.endsWith(':free')), 'OpenRouter only permits explicit free model IDs');
    addReason(reasons, attestation.billingEnabled === false && attestation.creditsPurchased === false,
      'OpenRouter must be an unfunded Free account');
    addReason(reasons, isPositiveInteger(attestation.requestsPerMinute) && attestation.requestsPerMinute <= 20
      && isPositiveInteger(attestation.requestsPerDay) && attestation.requestsPerDay <= 50,
      'OpenRouter Free account limits cannot exceed 20 requests/minute and 50 requests/day');
  } else if (providerId === 'huggingface') {
    addReason(reasons, attestation.mode === 'monthly-credit-grant'
      && typeof attestation.monthlyFreeGrantUsd === 'number'
      && attestation.monthlyFreeGrantUsd > 0
      && attestation.monthlyFreeGrantUsd <= 0.1
      && typeof attestation.remainingFreeCreditsUsd === 'number'
      && attestation.remainingFreeCreditsUsd > 0
      && attestation.remainingFreeCreditsUsd <= attestation.monthlyFreeGrantUsd,
      'Hugging Face Free user monthly grant must be positive and no greater than USD 0.10');
  } else if (providerId === 'cloudflare_workers_ai') {
    // The current policy accepts owner-submitted attestations only. Cloudflare
    // Workers AI must remain excluded until an authorized Billing Read and a
    // separately approved server-side verifier can attest the live account plan.
    addReason(reasons, false,
      'Cloudflare Workers AI is disabled until an authorized Billing Read and approved authoritative attestation mechanism are implemented');
  } else {
    addReason(reasons, ['vendor-free-tier', 'promotional-credits'].includes(attestation.mode),
      'provider-specific free tier or promotional grant required');
  }

  return {
    eligible: reasons.length === 0,
    providerId,
    modelId: modelId || null,
    endpointUrl,
    verificationLevel: 'owner-attested-not-vendor-verified',
    reasons,
    limits: reasons.length === 0 ? {
      requestsPerMinute: attestation.requestsPerMinute,
      requestsPerDay: attestation.requestsPerDay,
      maxTokensPerDay: attestation.maxTokensPerDay,
      maxInputTokens: attestation.maxInputTokens,
      maxOutputTokens: attestation.maxOutputTokens
    } : null
  };
}

export function listEligibleRepositoryContributors({ attestations = [], configuredProviders = [], now = new Date().toISOString() } = {}) {
  const byId = new Map();
  const input = Array.isArray(attestations)
    ? attestations
    : isRecord(attestations)
      ? Object.entries(attestations).map(([providerId, value]) => ({ ...value, providerId }))
      : [];

  for (const attestation of input) {
    if (!isRecord(attestation)) continue;
    const providerId = normalizeRepositoryProviderId(attestation.providerId);
    if (!providerId || byId.has(providerId)) continue;
    byId.set(providerId, attestation);
  }

  const configuredProviderMap = new Map(configuredProviders
    .filter((provider) => isRecord(provider) && typeof provider.id === 'string')
    .map((provider) => [normalizeRepositoryProviderId(provider.id), provider])
    .filter(([providerId]) => Boolean(providerId)));

  return PROVIDER_PROFILES.flatMap((profile) => {
    const provider = configuredProviderMap.get(profile.id);
    if (!provider || provider.status !== 'connected') return [];
    const attestation = byId.get(profile.id);
    const evaluation = evaluateRepositoryProviderAttestation(profile.id, attestation, now);
    const modelIsConfigured = Boolean(attestation?.modelId)
      && Array.isArray(provider.models)
      && provider.models.includes(attestation.modelId);
    if (!evaluation.eligible || !modelIsConfigured) return [];
    return [{
      providerId: profile.id,
      providerName: profile.name,
      modelId: evaluation.modelId,
      endpointUrl: evaluation.endpointUrl,
      verificationLevel: evaluation.verificationLevel,
      limits: evaluation.limits
    }];
  }).slice(0, MAX_REPOSITORY_CONTRIBUTOR_PROVIDERS);
}

export function getRepositoryFreeContributorPolicy({
  env = process.env,
  configuredProviders = [],
  now = new Date().toISOString()
} = {}) {
  const required = {
    freeOnly: env.GLORIFIER_REPOSITORY_AI_FREE_ONLY === 'true',
    publicCodeEgress: env.GLORIFIER_REPOSITORY_PUBLIC_CODE_EGRESS === 'true',
    zeroPaidBudget: env.GLORIFIER_MONTHLY_AI_BUDGET_USD === '0',
    paidInferenceDisabled: env.GLORIFIER_PAID_INFERENCE_AUTHORIZED === 'false',
    broadExternalEgressDisabled: env.GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS !== 'true'
  };
  const authorizationReasons = [];
  if (!required.freeOnly) authorizationReasons.push('repository-free-only-mode-not-enabled');
  if (!required.publicCodeEgress) authorizationReasons.push('public-repository-code-egress-not-owner-enabled');
  if (!required.zeroPaidBudget) authorizationReasons.push('monthly-paid-ai-budget-must-be-zero');
  if (!required.paidInferenceDisabled) authorizationReasons.push('paid-inference-authorization-must-remain-false');
  if (!required.broadExternalEgressDisabled) authorizationReasons.push('broad-external-data-egress-must-remain-disabled');

  let parsedAttestations = [];
  const rawAttestations = env.GLORIFIER_REPOSITORY_AI_FREE_ATTESTATIONS_JSON;
  if (typeof rawAttestations === 'string' && rawAttestations.trim()) {
    try {
      const parsed = JSON.parse(rawAttestations);
      parsedAttestations = Array.isArray(parsed)
        ? parsed
        : isRecord(parsed)
          ? Object.entries(parsed).map(([providerId, value]) => ({ ...value, providerId }))
          : [];
    } catch {
      authorizationReasons.push('provider-attestation-json-is-invalid');
    }
  }

  const eligibleProviders = listEligibleRepositoryContributors({
    attestations: parsedAttestations,
    configuredProviders,
    now
  });

  return {
    authorized: authorizationReasons.length === 0,
    mode: authorizationReasons.length === 0 ? 'repository-public-code-free-only' : 'disabled',
    monthlyPaidBudgetUsd: REPOSITORY_AI_PAID_BUDGET_USD,
    paidInferenceAuthorized: false,
    broadExternalDataEgress: false,
    authorizationReasons,
    eligibleProviders: authorizationReasons.length === 0 ? eligibleProviders : [],
    eligibleProviderCount: authorizationReasons.length === 0 ? eligibleProviders.length : 0,
    maxProvidersPerCycle: MAX_REPOSITORY_CONTRIBUTOR_PROVIDERS,
    required,
    providerProfiles: PROVIDER_PROFILES.map((profile) => ({
      providerId: profile.id,
      name: profile.name,
      freeModes: profile.modes,
      note: profile.note,
      configured: configuredById(configuredProviders, profile.id),
      eligibility: eligibleProviders.some((entry) => entry.providerId === profile.id) ? 'owner-attested-free-eligible' : 'not-eligible-or-not-configured'
    }))
  };
}

function configuredById(providers, providerId) {
  return configuredProvidersArray(providers).some((provider) => provider.id === providerId && provider.status === 'connected');
}

function configuredProvidersArray(providers) {
  return Array.isArray(providers) ? providers : [];
}


/** Assign every eligible provider exactly one bounded independent council contribution. */
export function buildRepositoryCouncilAssignments(eligibleProviders, roles) {
  if (!Array.isArray(eligibleProviders) || !Array.isArray(roles) || roles.length === 0) return [];
  const safeRoles = roles.filter((role) => isRecord(role) && typeof role.id === 'string' && role.id.trim());
  const seen = new Set();
  const providers = eligibleProviders.filter((provider) => {
    if (!isRecord(provider) || typeof provider.providerId !== 'string' || typeof provider.modelId !== 'string') return false;
    if (!provider.providerId.trim() || !provider.modelId.trim() || seen.has(provider.providerId)) return false;
    seen.add(provider.providerId);
    return true;
  }).slice(0, MAX_REPOSITORY_CONTRIBUTOR_PROVIDERS);
  if (!safeRoles.length) return [];
  return providers.map((provider, index) => ({
    providerId: provider.providerId,
    modelId: provider.modelId,
    role: safeRoles[index % safeRoles.length]
  }));
}

export function isSafeRepositoryContributionInput(value) {
  let text;
  if (typeof value === 'string') {
    text = value;
  } else if (Array.isArray(value)) {
    if (value.some((message) => !isRecord(message) || typeof message.content !== 'string')) return false;
    // Join without separators so a token split across message boundaries is
    // still detected. This is deliberately conservative for security.
    text = value.map((message) => message.content).join('');
  } else {
    return false;
  }
  if (text.length > 24_000) return false;
  const secretPatterns = [
    /\\bgh[pousr]_[A-Za-z0-9_]{20,}\\b/i,
    /\\bgithub_pat_[A-Za-z0-9_]{20,}\\b/i,
    /\\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\\b/,
    /\\bAKIA[0-9A-Z]{16}\\b/,
    /\\bxox[baprs]-[A-Za-z0-9-]{10,}\\b/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\\bAIza[0-9A-Za-z_-]{30,}\\b/,
    /\\b(?:api[_-]?key|access[_-]?token|client[_-]?secret)\\s*[:=]\\s*["']?[A-Za-z0-9._~+/-]{16,}/i,
    /\\bauthorization\\s*:\\s*bearer\\s+[A-Za-z0-9._~+/-]{16,}/i
  ];
  return !secretPatterns.some((pattern) => pattern.test(text));
}

/**
 * A broad public-code egress setting is not enough to approve arbitrary
 * mission text. Owners must explicitly enumerate mission IDs whose complete
 * objective and public repository context may be sent to external providers.
 */
export function isRepositoryMissionPublicContentApproved(env, missionId) {
  if (!env || typeof env !== 'object' || typeof missionId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(missionId)) return false;
  const raw = env.GLORIFIER_REPOSITORY_PUBLIC_CONTENT_APPROVED_MISSION_IDS_JSON;
  if (typeof raw !== 'string' || raw.length > 8_000) return false;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length <= 100 &&
      parsed.every((id) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) &&
      parsed.includes(missionId);
  } catch {
    return false;
  }
}
