import { GeminiProvider } from './providers/gemini';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAICompatibleProvider } from './providers/openai-compatible';
import type { AIProvider, AIProviderId, ProviderRegistryEntry } from './types';
import { discoverGlobalProviders, getGlobalProviderDiscoverySnapshot, recordProviderInferenceVerification, type DiscoveredProvider } from './provider-discovery';
import { withLangSmithTrace } from '../observability/langsmith';

const compatibleProviders = [
  { id: 'openai', name: 'OpenAI', apiKeyEnv: 'OPENAI_API_KEY', baseUrlEnv: 'OPENAI_BASE_URL', modelEnv: 'OPENAI_MODEL', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { id: 'meta', name: 'Meta Llama', apiKeyEnv: 'META_API_KEY', baseUrlEnv: 'META_BASE_URL', modelEnv: 'META_MODEL' },
  { id: 'xai', name: 'xAI', apiKeyEnv: 'XAI_API_KEY', baseUrlEnv: 'XAI_BASE_URL', modelEnv: 'XAI_MODEL', defaultBaseUrl: 'https://api.x.ai/v1', defaultModel: 'grok-4' },
  { id: 'mistral', name: 'Mistral AI', apiKeyEnv: 'MISTRAL_API_KEY', baseUrlEnv: 'MISTRAL_BASE_URL', modelEnv: 'MISTRAL_MODEL', defaultBaseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-large-latest' },
  { id: 'deepseek', name: 'DeepSeek', apiKeyEnv: 'DEEPSEEK_API_KEY', baseUrlEnv: 'DEEPSEEK_BASE_URL', modelEnv: 'DEEPSEEK_MODEL', defaultBaseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-reasoner' },
  { id: 'qwen', name: 'Alibaba Qwen', apiKeyEnv: 'QWEN_API_KEY', baseUrlEnv: 'QWEN_BASE_URL', modelEnv: 'QWEN_MODEL' },
  { id: 'nvidia', name: 'NVIDIA NIM / Nemotron', apiKeyEnv: 'NVIDIA_API_KEY', baseUrlEnv: 'NVIDIA_BASE_URL', modelEnv: 'NVIDIA_MODEL', defaultBaseUrl: 'https://integrate.api.nvidia.com/v1', defaultModel: 'nvidia/nemotron-3.5-super-vl-120b-a12b' },
  { id: 'groq', name: 'Groq', apiKeyEnv: 'GROQ_API_KEY', baseUrlEnv: 'GROQ_BASE_URL', modelEnv: 'GROQ_MODEL', defaultBaseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-4-scout' },
  { id: 'together', name: 'Together AI', apiKeyEnv: 'TOGETHER_API_KEY', baseUrlEnv: 'TOGETHER_BASE_URL', modelEnv: 'TOGETHER_MODEL' },
  { id: 'fireworks', name: 'Fireworks AI', apiKeyEnv: 'FIREWORKS_API_KEY', baseUrlEnv: 'FIREWORKS_BASE_URL', modelEnv: 'FIREWORKS_MODEL' },
  { id: 'openrouter', name: 'OpenRouter', apiKeyEnv: 'OPENROUTER_API_KEY', baseUrlEnv: 'OPENROUTER_BASE_URL', modelEnv: 'OPENROUTER_MODEL', defaultBaseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini' },
  { id: 'huggingface', name: 'Hugging Face Inference Providers', apiKeyEnv: 'HF_TOKEN', baseUrlEnv: 'HF_BASE_URL', modelEnv: 'HF_MODEL', defaultBaseUrl: 'https://router.huggingface.co/v1' },
  { id: 'llmsrelay', name: 'LLMsRelay', apiKeyEnv: 'LLMSRELAY_API_KEY', baseUrlEnv: 'LLMSRELAY_BASE_URL', modelEnv: 'LLMSRELAY_MODEL', defaultBaseUrl: 'https://api.llmsrelay.com/v1', defaultModel: 'claude-sonnet-4.6' },
  { id: 'ollama', name: 'Ollama', apiKeyEnv: 'OLLAMA_AUTH_TOKEN', baseUrlEnv: 'OLLAMA_BASE_URL', modelEnv: 'OLLAMA_MODEL' },
];

const providers: AIProvider[] = [
  new GeminiProvider(),
  new AnthropicProvider(),
  ...compatibleProviders.map((config) => new OpenAICompatibleProvider(config)),
];

/**
 * Normalize the UI/API "auto" sentinel to an omitted model so providers use
 * their own configured defaults. Explicit model IDs remain exact and strict.
 */
export function normalizeRequestedModel(requestedModel?: string): string | undefined {
  const normalized = requestedModel?.trim();
  return !normalized || normalized.toLowerCase() === 'auto' ? undefined : normalized;
}

/**
 * Explicit models must be advertised either by the adapter's configured model
 * list or by the latest provider-discovery snapshot. Empty lists are unknown,
 * not permission to silently substitute an arbitrary provider default.
 */
export function isProviderModelEligible(
  provider: AIProvider,
  requestedModel?: string,
  discoveredModels: readonly string[] = [],
): boolean {
  const model = normalizeRequestedModel(requestedModel);
  if (!model) return true;
  const canonicalModelId = (value: string) => value.replace(/^models\//, '');
  const canonicalRequestedModel = canonicalModelId(model);
  return provider.models().some((advertised) => canonicalModelId(advertised) === canonicalRequestedModel)
    || discoveredModels.some((advertised) => canonicalModelId(advertised) === canonicalRequestedModel);
}

export function filterRequiredProvider<T extends { id: string }>(
  candidates: readonly T[],
  requiredProvider?: string,
): T[] {
  return requiredProvider
    ? candidates.filter((candidate) => candidate.id === requiredProvider)
    : [...candidates];
}

const providerCooldownUntil = new Map<string, number>();
const providerLastFailure = new Map<string, string>();
const isProviderEligible = (provider: AIProvider, discovery: Map<string, DiscoveredProvider>, capability?: string): boolean => {
  const entry = discovery.get(provider.id);
  const explicitlyAuthorizedNvidia = provider.id === 'nvidia' && process.env.NVIDIA_AUTHORIZED === 'true';
  // A configured authorization flag is not enough: the latest read-only
  // discovery must be healthy, and the provider credential must be accepted.
  // NVIDIA is the sole exception because its model-list endpoint does not
  // authenticate inference; an explicit owner authorization permits the
  // actual requested inference to perform that separate credential check.
  return Boolean(entry
    && entry.availability === 'available'
    && (entry.authenticated || explicitlyAuthorizedNvidia)
    && (entry.authorization === 'configured' || explicitlyAuthorizedNvidia)
    && (!capability || entry.capabilities.includes(capability)));
};

const isProviderEligibleAfterRefresh = (provider: AIProvider, discovery: Map<string, DiscoveredProvider>, capability: string | undefined, attemptedProviders: string[]): boolean => {
  const entry = discovery.get(provider.id);
  // NVIDIA's read-only /models endpoint cannot prove inference authentication.
  // A separately configured authorization flag may allow the actual user-requested
  // inference attempt to be the credential check; never label discovery authenticated.
  const inferenceMayBeAttempted = entry?.authenticated
    || (provider.id === 'nvidia' && process.env.NVIDIA_AUTHORIZED === 'true');
  return Boolean(entry?.availability === 'available' && inferenceMayBeAttempted
    && isProviderEligible(provider, discovery, capability)
    && !isCoolingDown(provider.id)
    && !attemptedProviders.includes(provider.id));
};

const providerAvailabilityRank = (entry: DiscoveredProvider | undefined): number => {
  if (entry?.availability === 'available' && entry.authenticated) return 0;
  return entry?.availability === 'rate_limited' ? 2 : 1;
};

const compareProviderOrder = (a: AIProvider, b: AIProvider, discovery: Map<string, DiscoveredProvider>, preferredProvider?: AIProviderId): number => {
  const rankDifference = providerAvailabilityRank(discovery.get(a.id)) - providerAvailabilityRank(discovery.get(b.id));
  if (rankDifference !== 0) return rankDifference;
  const preferredComesFirst = preferredProvider === a.id && preferredProvider !== b.id;
  const otherComesFirst = preferredProvider === b.id && preferredProvider !== a.id;
  return Number(otherComesFirst) - Number(preferredComesFirst);
};


const parseRetryAfterMs = (error: unknown): number | null => {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/retry(?: after| in)?\s+(\d+(?:\.\d+)?)\s*s/i);
  if (!match) return null;
  return Math.min(Math.max(Number(match[1]) * 1000, 5_000), 15 * 60_000);
};

const getProviderAvailability = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('providerAvailability' in error)) return undefined;
  const availability = error.providerAvailability;
  return typeof availability === 'string' ? availability : undefined;
};

const cooldownFor = (error: unknown): number => {
  const retryAfter = parseRetryAfterMs(error);
  if (retryAfter) return retryAfter;
  const message = error instanceof Error ? error.message : String(error);
  const rules: Array<[RegExp, number]> = [
    [/429|RESOURCE_EXHAUSTED|quota|rate.?limit/i, 60_000],
    [/402|insufficient_quota|credit_balance_exhausted|no credits/i, 15 * 60_000],
    [/503|UNAVAILABLE|overloaded|high demand/i, 30_000],
  ];
  return rules.find(([pattern]) => pattern.test(message))?.[1] ?? 10_000;
};

const isCoolingDown = (providerId: string): boolean => {
  const until = providerCooldownUntil.get(providerId) || 0;
  if (until <= Date.now()) {
    providerCooldownUntil.delete(providerId);
    return false;
  }
  return true;
};

export function getProviderCircuitStatus() {
  const now = Date.now();
  return providers.map((provider) => {
    const cooldownUntil = providerCooldownUntil.get(provider.id) || 0;
    return {
      id: provider.id,
      name: provider.name,
      configured: provider.status() === 'connected',
      circuit: cooldownUntil > now ? 'cooldown' : 'available',
      cooldownUntil: cooldownUntil > now ? new Date(cooldownUntil).toISOString() : null,
      lastFailure: providerLastFailure.get(provider.id) || null,
    };
  });
}

export function listProviders(): ProviderRegistryEntry[] {
  return providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    status: provider.status(),
    models: provider.models(),
  }));
}

export function getProvider(id: AIProviderId): AIProvider {
  const provider = providers.find((candidate) => candidate.id === id);
  if (!provider) throw new Error(`Unknown AI provider: ${id}`);
  return provider;
}

export function getConnectedProviders(): AIProvider[] {
  return providers.filter((provider) => provider.status() === 'connected');
}

export interface ProviderExecutionRequest {
  messages: import('./types').AIMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  preferredProvider?: AIProviderId;
  requiredProvider?: AIProviderId;
  capability?: string;
  policy?: Partial<ProviderExecutionPolicy>;
}

export type OrchestrationFallbackMode = 'governed-only';

export interface ProviderExecutionPolicy {
  fallbackMode: OrchestrationFallbackMode;
  allowImplicitSystemFallback: false;
  allowImplicitProviderFallback: false;
  allowImplicitModelFallback: false;
  refreshDiscoveryBeforeExhaustion: true;
  maxDiscoveryRefreshes: number;
  maxAttempts: number;
  retryTransientFailures: boolean;
}

export const DEFAULT_PROVIDER_EXECUTION_POLICY: ProviderExecutionPolicy = {
  fallbackMode: 'governed-only',
  allowImplicitSystemFallback: false,
  allowImplicitProviderFallback: false,
  allowImplicitModelFallback: false,
  refreshDiscoveryBeforeExhaustion: true,
  maxDiscoveryRefreshes: 1,
  maxAttempts: Math.max(1, providers.length),
  retryTransientFailures: true,
};

export interface ProviderExecutionResult {
  response?: import('./types').AIResponse;
  provider: string;
  attemptedProviders: string[];
  errors: string[];
  providerStatuses: Record<string, 'connected' | 'unavailable' | 'error'>;
}

interface ProviderExecutionState {
  attemptedProviders: string[];
  errors: string[];
  providerStatuses: Record<string, 'connected' | 'unavailable' | 'error'>;
  attempts: number;
  transientRetries: number;
}

const isDiscoveryUnavailable = (entry: DiscoveredProvider | undefined): boolean =>
  Boolean(entry && ['quota_exhausted', 'auth_failure', 'unreachable', 'unconfigured'].includes(entry.availability));

const recordProviderSkip = (
  provider: AIProvider,
  discovery: Map<string, DiscoveredProvider>,
  state: ProviderExecutionState,
): boolean => {
  const entry = discovery.get(provider.id);
  if (isDiscoveryUnavailable(entry)) {
    state.attemptedProviders.push(provider.id);
    state.providerStatuses[provider.id] = 'unavailable';
    state.errors.push(`${provider.id}: discovery=${entry?.availability}`);
    return true;
  }
  if (!isCoolingDown(provider.id)) return false;
  state.attemptedProviders.push(provider.id);
  state.providerStatuses[provider.id] = 'unavailable';
  state.errors.push(`${provider.id}: circuit cooldown active until ${providerCooldownUntil.get(provider.id)}`);
  return true;
};

const isRateLimitedError = (message: string, error: unknown): boolean =>
  /429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(message) || parseRetryAfterMs(error) !== null;

const isTransientProviderError = (message: string): boolean =>
  /408|425|500|502|503|504|timeout|temporar|overloaded|unavailable/i.test(message);

const shouldRetryProvider = (
  allowRetry: boolean,
  policy: ProviderExecutionPolicy,
  state: ProviderExecutionState,
  message: string,
  error: unknown,
): boolean => allowRetry
  && policy.retryTransientFailures
  && !isRateLimitedError(message, error)
  && isTransientProviderError(message)
  && state.transientRetries < 1
  && state.attempts < policy.maxAttempts;

const handleProviderFailure = (
  provider: AIProvider,
  error: unknown,
  policy: ProviderExecutionPolicy,
  state: ProviderExecutionState,
  allowRetry: boolean,
  markUnavailable: boolean,
): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  const availability = getProviderAvailability(error);
  state.providerStatuses[provider.id] = markUnavailable && availability === 'unavailable' ? 'unavailable' : 'error';
  state.errors.push(`${provider.id}: ${message}`);
  providerCooldownUntil.set(provider.id, Date.now() + cooldownFor(error));
  const retry = shouldRetryProvider(allowRetry, policy, state, message, error);
  if (retry) {
    state.transientRetries += 1;
    providerCooldownUntil.delete(provider.id);
    state.errors.push(`${provider.id}: retrying once after transient failure`);
  }
  providerLastFailure.set(provider.id, message.slice(0, 1000));
  return retry;
};

const attemptProviderOnce = async (
  provider: AIProvider,
  request: ProviderExecutionRequest,
  policy: ProviderExecutionPolicy,
  state: ProviderExecutionState,
  allowRetry: boolean,
  markUnavailable: boolean,
  emptyResponseSuffix = '',
): Promise<{ response?: import('./types').AIResponse; retry: boolean }> => {
  state.attemptedProviders.push(provider.id);
  state.providerStatuses[provider.id] = 'connected';
  state.attempts += 1;
  try {
    // The request is normalized and model-checked at the registry boundary.
    const response = await provider.generate(request);
    if (!response.text?.trim()) {
      state.errors.push(`${provider.id}: empty response${emptyResponseSuffix}`);
      return { retry: false };
    }
    await recordProviderInferenceVerification(provider.id, response.model);
    providerCooldownUntil.delete(provider.id);
    providerLastFailure.delete(provider.id);
    return { response, retry: false };
  } catch (error) {
    return { retry: handleProviderFailure(provider, error, policy, state, allowRetry, markUnavailable) };
  }
};

const executeProviderWithRetry = async (
  provider: AIProvider,
  request: ProviderExecutionRequest,
  policy: ProviderExecutionPolicy,
  state: ProviderExecutionState,
): Promise<import('./types').AIResponse | undefined> => {
  let retry = true;
  while (retry && state.attempts < policy.maxAttempts) {
    const result = await attemptProviderOnce(provider, request, policy, state, true, true);
    if (result.response) return result.response;
    retry = result.retry;
  }
  return undefined;
};

const tryOrderedProviders = async (
  ordered: AIProvider[],
  request: ProviderExecutionRequest,
  policy: ProviderExecutionPolicy,
  discovery: Map<string, DiscoveredProvider>,
  state: ProviderExecutionState,
): Promise<{ response: import('./types').AIResponse; provider: string } | undefined> => {
  for (const provider of ordered) {
    if (state.attempts >= policy.maxAttempts) break;
    if (recordProviderSkip(provider, discovery, state)) continue;
    const response = await executeProviderWithRetry(provider, request, policy, state);
    if (response) return { response, provider: provider.id };
  }
  return undefined;
};

const tryRefreshedProviders = async (
  request: ProviderExecutionRequest,
  policy: ProviderExecutionPolicy,
  discovery: Map<string, DiscoveredProvider>,
  state: ProviderExecutionState,
): Promise<{ response: import('./types').AIResponse; provider: string } | undefined> => {
  const refreshed = filterRequiredProvider(getConnectedProviders(), request.requiredProvider).filter((provider) => {
    if (!isProviderEligibleAfterRefresh(provider, discovery, request.capability, state.attemptedProviders)) {
      return false;
    }
    if (!isProviderModelEligible(provider, request.model, discovery.get(provider.id)?.models)) {
      state.providerStatuses[provider.id] = 'unavailable';
      state.errors.push(`${provider.id}: requested model "${request.model}" is not advertised by this provider after discovery refresh.`);
      return false;
    }
    return true;
  });
  for (const provider of refreshed) {
    if (state.attempts >= policy.maxAttempts) break;
    const result = await attemptProviderOnce(provider, request, policy, state, false, false, ' after discovery refresh');
    if (result.response) return { response: result.response, provider: provider.id };
  }
  return undefined;
};

const assertGovernedFallbackPolicy = (policy: ProviderExecutionPolicy): void => {
  const implicitFallback = policy.allowImplicitSystemFallback
    || policy.allowImplicitProviderFallback
    || policy.allowImplicitModelFallback;
  if (implicitFallback) {
    throw new Error('Implicit system/provider/model fallback is forbidden by GLORIFIER orchestration policy.');
  }
};

const buildExecutionResult = (
  provider: string,
  response: import('./types').AIResponse | undefined,
  state: ProviderExecutionState,
): ProviderExecutionResult => ({
  ...(response ? { response } : {}),
  provider,
  attemptedProviders: state.attemptedProviders,
  errors: state.errors,
  providerStatuses: state.providerStatuses,
});

const tryDiscoveryRefresh = async (
  request: ProviderExecutionRequest,
  policy: ProviderExecutionPolicy,
  discovery: Map<string, DiscoveredProvider>,
  state: ProviderExecutionState,
): Promise<{ response: import('./types').AIResponse; provider: string } | undefined> => {
  if (!policy.refreshDiscoveryBeforeExhaustion || policy.maxDiscoveryRefreshes <= 0) return undefined;
  try {
    await (async () => {
      const refreshed = await discoverGlobalProviders('provider-registry-pre-exhaustion', { persistConnections: false });
      discovery.clear();
      for (const entry of refreshed) discovery.set(entry.id, entry);
    })();
    return await tryRefreshedProviders(request, policy, discovery, state);
  } catch (error) {
    state.errors.push(`provider-discovery refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
};

const resolveExecutionPolicy = (request: ProviderExecutionRequest): ProviderExecutionPolicy => ({
  ...DEFAULT_PROVIDER_EXECUTION_POLICY,
  ...(request.policy || {}),
});

const resolvePreferredProvider = (request: ProviderExecutionRequest): AIProviderId | undefined =>
  request.requiredProvider || request.preferredProvider || (request.model?.startsWith('gpt') ? 'openai' : undefined);

const createProviderExecutionState = (): ProviderExecutionState => ({
  attemptedProviders: [],
  errors: [],
  providerStatuses: {},
  attempts: 0,
  transientRetries: 0,
});

const TRACE_PROVIDER_IDS = new Set([
  'gemini', 'anthropic', ...compatibleProviders.map((provider) => provider.id),
]);

const safeTraceProviderId = (value: string): string => TRACE_PROVIDER_IDS.has(value) ? value : 'unknown';

export const buildProviderRegistryTraceInputs = (request: ProviderExecutionRequest): Record<string, unknown> => ({
  messageCount: Array.isArray(request.messages) ? request.messages.length : 0,
  messageRoles: Array.isArray(request.messages)
    ? [...new Set(request.messages.map((message) =>
        typeof message?.role === 'string' && ['system', 'developer', 'user', 'assistant', 'tool'].includes(message.role)
          ? message.role
          : 'unknown'))]
    : [],
  // Never transmit caller-controlled model/capability text in telemetry.
  hasRequestedModel: Boolean(request.model),
  hasPreferredProvider: Boolean(request.preferredProvider),
  hasRequiredProvider: Boolean(request.requiredProvider),
  hasCapability: Boolean(request.capability),
  maxTokens: typeof request.maxTokens === 'number' && Number.isFinite(request.maxTokens) ? request.maxTokens : null,
});

export const summarizeProviderRegistryTrace = (result: ProviderExecutionResult): Record<string, unknown> => ({
  success: Boolean(result.response),
  selectedProvider: safeTraceProviderId(result.provider),
  attemptedProviderCount: result.attemptedProviders.length,
  attemptedProviders: result.attemptedProviders.map(safeTraceProviderId),
  providerStatuses: Object.fromEntries(Object.entries(result.providerStatuses)
    .filter(([provider, status]) => TRACE_PROVIDER_IDS.has(provider)
      && ['connected', 'unavailable', 'error'].includes(status))
    .map(([provider, status]) => [provider, status])),
  errorCount: result.errors.length,
});

/** Apply the real registry metadata allowlist to an execution result before tracing it. */
export const withProviderRegistryTrace = (
  request: ProviderExecutionRequest,
  operation: () => Promise<ProviderExecutionResult>,
): Promise<ProviderExecutionResult> => withLangSmithTrace(
  'GLORIFIER Provider Registry',
  buildProviderRegistryTraceInputs(request),
  operation,
  summarizeProviderRegistryTrace,
);

/** Execute providers in governed order with bounded retries and one discovery refresh. */
export const executeThroughProviderRegistry = async (
  request: ProviderExecutionRequest,
): Promise<ProviderExecutionResult> => withProviderRegistryTrace(request, async () => {
  // Normalize sentinels once; the adapter receives either a real explicit model
  // ID or undefined, never the synthetic "auto" value.
  const executionRequest: ProviderExecutionRequest = {
    ...request,
    model: normalizeRequestedModel(request.model),
  };
  const policy = resolveExecutionPolicy(executionRequest);
  assertGovernedFallbackPolicy(policy);
  const allConnected = getConnectedProviders();
  const connected = filterRequiredProvider(allConnected, executionRequest.requiredProvider);
  const preferredProvider = resolvePreferredProvider(executionRequest);
  const discovery = new Map(getGlobalProviderDiscoverySnapshot().map((entry) => [entry.id, entry]));
  const state = createProviderExecutionState();

  if (executionRequest.requiredProvider) {
    const requiredId = executionRequest.requiredProvider;
    const adapter = providers.find((provider) => provider.id === requiredId);
    const connectedAdapter = allConnected.find((provider) => provider.id === requiredId);
    const entry = discovery.get(requiredId);
    let reason: string | undefined;
    if (!adapter) reason = 'unknown provider';
    else if (!connectedAdapter) reason = 'not connected (credentials or adapter unavailable)';
    else if (entry && executionRequest.capability && !entry.capabilities.includes(executionRequest.capability)) {
      reason = `does not advertise requested capability "${executionRequest.capability}"`;
    }
    else if (!isProviderEligible(connectedAdapter, discovery, executionRequest.capability)) {
      reason = entry?.authorization === 'not-configured' || !entry
        ? 'not configured or not authorized'
        : 'not authorized or not yet verified for execution';
    }
    if (reason) {
      state.providerStatuses[requiredId] = 'unavailable';
      state.errors.push(`${requiredId}: required provider is ${reason}; alternate providers and independent compute are disabled for this request.`);
      return buildExecutionResult('provider-registry-exhausted', undefined, state);
    }
  }

  const ordered = [...connected]
    .filter((provider) => {
      if (!isProviderEligible(provider, discovery, executionRequest.capability)) return false;
      const discoveredModels = discovery.get(provider.id)?.models;
      if (!isProviderModelEligible(provider, executionRequest.model, discoveredModels)) {
        state.providerStatuses[provider.id] = 'unavailable';
        state.errors.push(`${provider.id}: requested model "${executionRequest.model}" is not advertised by this provider.`);
        return false;
      }
      return true;
    })
    .sort((a, b) => compareProviderOrder(a, b, discovery, preferredProvider));
  const initial = await tryOrderedProviders(ordered, executionRequest, policy, discovery, state);
  if (initial) return buildExecutionResult(initial.provider, initial.response, state);
  const refreshed = await tryDiscoveryRefresh(executionRequest, policy, discovery, state);
  if (refreshed) return buildExecutionResult(refreshed.provider, refreshed.response, state);
  return buildExecutionResult('provider-registry-exhausted', undefined, state);
});
