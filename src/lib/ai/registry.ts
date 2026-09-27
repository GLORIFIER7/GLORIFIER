import { GeminiProvider } from './providers/gemini';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAICompatibleProvider } from './providers/openai-compatible';
import type { AIProvider, AIProviderId, ProviderRegistryEntry } from './types';
import { getGlobalProviderDiscoverySnapshot } from './provider-discovery';

const compatibleProviders = [
  { id: 'openai', name: 'OpenAI', apiKeyEnv: 'OPENAI_API_KEY', baseUrlEnv: 'OPENAI_BASE_URL', modelEnv: 'OPENAI_MODEL', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { id: 'meta', name: 'Meta Llama', apiKeyEnv: 'META_API_KEY', baseUrlEnv: 'META_BASE_URL', modelEnv: 'META_MODEL' },
  { id: 'xai', name: 'xAI', apiKeyEnv: 'XAI_API_KEY', baseUrlEnv: 'XAI_BASE_URL', modelEnv: 'XAI_MODEL', defaultBaseUrl: 'https://api.x.ai/v1', defaultModel: 'grok-4' },
  { id: 'mistral', name: 'Mistral AI', apiKeyEnv: 'MISTRAL_API_KEY', baseUrlEnv: 'MISTRAL_BASE_URL', modelEnv: 'MISTRAL_MODEL', defaultBaseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-large-latest' },
  { id: 'deepseek', name: 'DeepSeek', apiKeyEnv: 'DEEPSEEK_API_KEY', baseUrlEnv: 'DEEPSEEK_BASE_URL', modelEnv: 'DEEPSEEK_MODEL', defaultBaseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-reasoner' },
  { id: 'qwen', name: 'Alibaba Qwen', apiKeyEnv: 'QWEN_API_KEY', baseUrlEnv: 'QWEN_BASE_URL', modelEnv: 'QWEN_MODEL' },
  { id: 'nvidia', name: 'NVIDIA NIM', apiKeyEnv: 'NVIDIA_API_KEY', baseUrlEnv: 'NVIDIA_BASE_URL', modelEnv: 'NVIDIA_MODEL' },
  { id: 'groq', name: 'Groq', apiKeyEnv: 'GROQ_API_KEY', baseUrlEnv: 'GROQ_BASE_URL', modelEnv: 'GROQ_MODEL', defaultBaseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-4-scout' },
  { id: 'together', name: 'Together AI', apiKeyEnv: 'TOGETHER_API_KEY', baseUrlEnv: 'TOGETHER_BASE_URL', modelEnv: 'TOGETHER_MODEL' },
  { id: 'fireworks', name: 'Fireworks AI', apiKeyEnv: 'FIREWORKS_API_KEY', baseUrlEnv: 'FIREWORKS_BASE_URL', modelEnv: 'FIREWORKS_MODEL' },
];

const providers: AIProvider[] = [
  new GeminiProvider(),
  new AnthropicProvider(),
  ...compatibleProviders.map((config) => new OpenAICompatibleProvider(config)),
];

// Provider-neutral circuit breaker state. Cooldowns prevent repeated calls against
// known-exhausted providers while preserving automatic recovery after the window.
const providerCooldownUntil = new Map<string, number>();
const providerLastFailure = new Map<string, string>();

function parseRetryAfterMs(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/retry(?: after| in)?\s+(\d+(?:\.\d+)?)\s*s/i);
  if (!match) return null;
  return Math.min(Math.max(Number(match[1]) * 1000, 5_000), 15 * 60_000);
}

function cooldownFor(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  const retryAfter = parseRetryAfterMs(error);
  if (retryAfter) return retryAfter;
  if (/429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(message)) return 60_000;
  if (/402|insufficient_quota|credit_balance_exhausted|no credits/i.test(message)) return 15 * 60_000;
  if (/503|UNAVAILABLE|overloaded|high demand/i.test(message)) return 30_000;
  return 10_000;
}

function isCoolingDown(providerId: string): boolean {
  const until = providerCooldownUntil.get(providerId) || 0;
  if (until <= Date.now()) {
    providerCooldownUntil.delete(providerId);
    return false;
  }
  return true;
}

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
}

export interface ProviderExecutionResult {
  response?: import('./types').AIResponse;
  provider: string;
  attemptedProviders: string[];
  errors: string[];
  providerStatuses: Record<string, 'connected' | 'unavailable' | 'error'>;
}

/**
 * GLORIFIER AI CEO provider-routing boundary.
 * The registry is authoritative for provider selection; provider failures are
 * recorded and execution continues to another authenticated provider.
 * No synthetic response is ever produced here.
 */
export async function executeThroughProviderRegistry(
  request: ProviderExecutionRequest
): Promise<ProviderExecutionResult> {
  const connected = getConnectedProviders();
  const preferredProvider = request.preferredProvider
    || (request.model?.startsWith('gemini') ? 'gemini' : request.model?.startsWith('gpt') ? 'openai' : undefined);

  const discovery = new Map(getGlobalProviderDiscoverySnapshot().map((entry) => [entry.id, entry]));
  const ordered = [...connected].sort((a, b) => {
    const da = discovery.get(a.id);
    const db = discovery.get(b.id);
    const rank = (entry: typeof da) => entry?.availability === 'available' && entry.authenticated ? 0 : entry?.availability === 'rate_limited' ? 2 : 1;
    if (rank(da) !== rank(db)) return rank(da) - rank(db);
    if (preferredProvider) {
      if (a.id === preferredProvider && b.id !== preferredProvider) return -1;
      if (b.id === preferredProvider && a.id !== preferredProvider) return 1;
    }
    if (a.id === 'gemini' && b.id !== 'gemini') return -1;
    if (b.id === 'gemini' && a.id !== 'gemini') return 1;
    if (a.id === 'openai' && b.id !== 'openai') return -1;
    if (b.id === 'openai' && a.id !== 'openai') return 1;
    return 0;
  });

  const attemptedProviders: string[] = [];
  const errors: string[] = [];
  const providerStatuses: Record<string, 'connected' | 'unavailable' | 'error'> = {};

  for (const provider of ordered) {
    const discovered = discovery.get(provider.id);
    if (discovered && ['quota_exhausted','auth_failure','unreachable','unconfigured'].includes(discovered.availability)) {
      attemptedProviders.push(provider.id);
      providerStatuses[provider.id] = 'unavailable';
      errors.push(`${provider.id}: discovery=${discovered.availability}`);
      continue;
    }
    if (isCoolingDown(provider.id)) {
      attemptedProviders.push(provider.id);
      providerStatuses[provider.id] = 'unavailable';
      errors.push(`${provider.id}: circuit cooldown active until ${providerCooldownUntil.get(provider.id)}`);
      continue;
    }

    attemptedProviders.push(provider.id);
    providerStatuses[provider.id] = 'connected';

    try {
      const providerRequest = {
        ...request,
        model: provider.id === 'gemini'
          ? (request.model?.startsWith('gemini') ? request.model : undefined)
          : provider.id === 'openai'
            ? (request.model?.startsWith('gpt') ? request.model : undefined)
            : request.model,
      };
      const response = await provider.generate(providerRequest);

      if (response.text?.trim()) {
        providerCooldownUntil.delete(provider.id);
        providerLastFailure.delete(provider.id);
        return { response, provider: provider.id, attemptedProviders, errors, providerStatuses };
      }

      errors.push(`${provider.id}: empty response`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const availability = (error as any)?.providerAvailability;
      providerStatuses[provider.id] = availability === 'unavailable' ? 'unavailable' : 'error';
      errors.push(`${provider.id}: ${message}`);

      const cooldownMs = cooldownFor(error);
      providerCooldownUntil.set(provider.id, Date.now() + cooldownMs);
      providerLastFailure.set(provider.id, message.slice(0, 1000));
    }
  }

  return {
    provider: 'provider-registry-exhausted',
    attemptedProviders,
    errors,
    providerStatuses,
  };
}
