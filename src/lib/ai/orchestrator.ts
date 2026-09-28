import { getConnectedProviders, getProvider, listProviders } from './registry';
import type { AIMessage, AIRequest, AIResponse, AIProviderId, AIProvider, ResponseEvaluation } from './types';
import { averageLatencyMs, providerReliability, recordProviderFailure, recordProviderSuccess, snapshotProviderMetrics } from './metrics';
import { registerOrObserveModel, getModelTrust, modelCanRun, recordModelSecurityEvent } from './model-trust';

export interface OrchestratorRequest extends AIRequest {
  provider?: AIProviderId | 'auto';
  evaluate?: boolean;
}

function evaluateResponse(response: AIResponse): ResponseEvaluation {
  const text = response.text?.trim() || '';
  const reasons: string[] = [];
  let score = 100;
  if (!text) { score = 0; reasons.push('Empty response'); }
  else {
    if (text.length < 20) { score -= 20; reasons.push('Very short response'); }
    if (/^(error|failed|exception):/i.test(text)) { score -= 40; reasons.push('Response begins with an error marker'); }
  }
  return { score: Math.max(0, score), passed: score >= 60, reasons };
}

function modelCapabilityScore(model: string): number {
  const value = model.toLowerCase();
  let score = 50;
  if (/gpt-6.*astra|gpt-6.*sol/.test(value)) score = 100;
  else if (/gpt-5/.test(value)) score = 99;
  else if (/o[3-9]/.test(value)) score = 98;
  else if (/claude.*opus/.test(value)) score = 97;
  else if (/gemini.*pro|gemini.*ultra/.test(value)) score = 96;
  else if (/grok.*[4-9]/.test(value)) score = 96;
  else if (/deepseek.*reasoner/.test(value)) score = 95;
  else if (/llama.*405b|405b/.test(value)) score = 95;
  else if (/gpt-4\.1/.test(value)) score = 92;
  else if (/gemini.*flash/.test(value)) score = 82;
  else if (/70b/.test(value)) score = 85;
  else if (/large/.test(value)) score = 80;
  return score;
}

function providerCapabilityScore(provider: AIProvider): number {
  const models = provider.models();
  if (!models.length) return 0;
  return Math.max(...models.map(modelCapabilityScore));
}

function selectProviders(providers: AIProvider[]): AIProvider[] {
  return [...providers].sort((a, b) => {
    const capabilityDiff = providerCapabilityScore(b) - providerCapabilityScore(a);
    if (capabilityDiff !== 0) return capabilityDiff;
    const reliabilityDiff = providerReliability(b.id) - providerReliability(a.id);
    if (Math.abs(reliabilityDiff) > 0.05) return reliabilityDiff;
    const aLatency = averageLatencyMs(a.id);
    const bLatency = averageLatencyMs(b.id);
    if (aLatency && bLatency && Math.abs(aLatency - bLatency) > 150) return aLatency - bLatency;
    return 0;
  });
}

function executiveProfile(providers: AIProvider[]) {
  const candidates = selectProviders(providers);
  const leader = candidates[0];
  if (!leader) {
    return { status: 'vacant' as const, provider: null, model: null, capabilityScore: 0, basis: 'No connected AI provider is available.' };
  }
  return {
    status: 'active' as const,
    provider: leader.id,
    model: leader.models()[0] || null,
    capabilityScore: providerCapabilityScore(leader),
    basis: 'Highest configured model capability; reliability and latency break ties.',
  };
}

export class AIOrchestrator {
  private providerCooldownUntil = new Map<AIProviderId, number>();
  private readonly quotaCooldownMs = 15 * 60_000;
  private readonly maxFailoverAttempts = 3;

  private isExplicitProviderRequest(request: OrchestratorRequest): boolean {
    return Boolean(request.provider && request.provider !== 'auto');
  }

  private isFailoverEligible(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    // Never hide deterministic caller/configuration errors behind another provider.
    if (/\b(400|401|403|404)\b|invalid.?request|invalid.?api.?key|authentication|permission|forbidden/i.test(message)) {
      return false;
    }
    return /\b(408|409|425|429|500|502|503|504)\b|quota|rate.?limit|credit_balance_exhausted|insufficient_quota|timeout|timed out|temporar|overloaded|unavailable|network|ECONN|ENOTFOUND/i.test(message);
  }

  private isProviderCoolingDown(providerId: AIProviderId): boolean {
    const until = this.providerCooldownUntil.get(providerId) || 0;
    if (until <= Date.now()) {
      this.providerCooldownUntil.delete(providerId);
      return false;
    }
    return true;
  }

  private markProviderUnavailable(providerId: AIProviderId, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (/\b429\b|quota|insufficient_quota|credit_balance_exhausted|rate.?limit/i.test(message)) {
      this.providerCooldownUntil.set(providerId, Date.now() + this.quotaCooldownMs);
    }
  }

  private async callProvider(provider: AIProvider, request: AIRequest): Promise<AIResponse> {
    // Rogue-model defense: every observed model is registered and quarantined models cannot execute.

    const started = Date.now();
    try {
      const response = await provider.generate(request);
      if (!response || typeof response !== 'object' || typeof response.provider !== 'string' || typeof response.model !== 'string') {
        throw new Error(`${provider.id} returned an invalid/empty AI response.`);
      }
      const latencyMs = Date.now() - started;
      response.latencyMs = latencyMs;
      response.evaluation = evaluateResponse(response);
      const trust = await registerOrObserveModel({ provider: response.provider, model: response.model, capabilityScore: providerCapabilityScore(provider) });
      if (!modelCanRun(trust)) throw new Error(`Model ${response.provider}:${response.model} is quarantined by the AI trust layer.`);
      if (!response.evaluation.passed) {
        await recordModelSecurityEvent({ provider: response.provider, model: response.model, eventType: 'unsupported_claim', severity: 'warning', details: { reasons: response.evaluation.reasons } });
      }
      recordProviderSuccess(provider.id, latencyMs, response.usage);
      return response;
    } catch (error) {
      recordProviderFailure(provider.id);
      throw error;
    }
  }

  async generate(request: OrchestratorRequest): Promise<AIResponse> {
    const explicitProvider = this.isExplicitProviderRequest(request);
    const connected = explicitProvider ? [getProvider(request.provider as AIProviderId)] : getConnectedProviders();
    const candidates = selectProviders(connected)
      .filter((provider) => !this.isProviderCoolingDown(provider.id))
      .filter((provider) => !request.model || provider.models().includes(request.model));

    if (candidates.length === 0) {
      throw new Error(
        explicitProvider
          ? `Requested AI provider ${request.provider} is unavailable, cooling down, or does not expose the requested model.`
          : 'No eligible AI providers are currently available; execution is DEGRADED rather than silently substituted.'
      );
    }

    const errors: string[] = [];
    const maxAttempts = explicitProvider ? 1 : Math.min(this.maxFailoverAttempts, candidates.length);

    for (let index = 0; index < maxAttempts; index += 1) {
      const provider = candidates[index];
      try {
        const result = await this.callProvider(provider, request);
        if (request.evaluate !== false && !result.evaluation?.passed) {
          errors.push(`${provider.id}: response quality check failed`);
          // A quality failure is not an infrastructure failure; do not silently
          // substitute another provider for a response that may require review.
          break;
        }
        return result;
      } catch (error) {
        this.markProviderUnavailable(provider.id, error);
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${provider.id}: ${message}`);

        // Controlled failover: only auto-routing may move to another provider,
        // and only for transient/capacity/quota/network failures.
        if (explicitProvider || !this.isFailoverEligible(error)) break;
      }
    }

    throw new Error(
      explicitProvider
        ? `Requested AI provider failed; no implicit provider fallback was performed. ${errors.join(' | ')}`
        : `Controlled provider failover exhausted. No eligible provider produced a verified response. ${errors.join(' | ')}`
    );
  }

  async collaborate(messages: AIMessage[], providerIds?: AIProviderId[]): Promise<AIResponse[]> {
    const providers = selectProviders(providerIds?.length ? providerIds.map(getProvider) : getConnectedProviders());
    const results = await Promise.allSettled(providers.map((provider) => this.callProvider(provider, { messages })));
    return results.filter((result): result is PromiseFulfilledResult<AIResponse> => result.status === 'fulfilled').map((result) => result.value);
  }

  async resilientGenerate(request: OrchestratorRequest): Promise<AIResponse> {
    // Backward-compatible entry point. Failover is governed exclusively by
    // generate(): explicit providers never fall through; auto-routing may make
    // bounded, sequential failover attempts only for eligible failures.
    return this.generate(request);
  }

  async consensus(request: OrchestratorRequest, maxProviders = 3) {
    const providers = selectProviders(getConnectedProviders()).slice(0, Math.max(1, Math.min(5, maxProviders)));
    const results = await Promise.allSettled(providers.map((provider) => this.callProvider(provider, request)));
    const responses = results.filter((r): r is PromiseFulfilledResult<AIResponse> => r.status === 'fulfilled').map((r) => r.value);
    const normalized = responses.map((r) => r.text.trim().replace(/\\s+/g, ' '));
    const agreementRatio = normalized.length < 2 ? 1 : new Set(normalized).size === 1 ? 1 : 1 / new Set(normalized).size;
    return { responses, agreementRatio, providerCount: providers.length, successfulCount: responses.length, consensusRequiresHumanReview: agreementRatio < 1 };
  }

  registry() {
    return listProviders().map((entry) => ({ ...entry, capabilityScore: providerCapabilityScore(getProvider(entry.id)) }));
  }

  executive() { return executiveProfile(getConnectedProviders()); }
  metrics() {
    const cooldowns = [...this.providerCooldownUntil.entries()].map(([provider, until]) => ({ provider, until, remainingMs: Math.max(0, until - Date.now()) }));
    return { ...snapshotProviderMetrics(), cooldowns };
  }
}

export const aiOrchestrator = new AIOrchestrator();
