import type { AIProvider, AIRequest, AIResponse } from '../types';

export interface OpenAICompatibleConfig {
  id: string;
  name: string;
  apiKeyEnv: string;
  baseUrlEnv: string;
  modelEnv: string;
  defaultBaseUrl?: string;
  defaultModel?: string;
}

export class OpenAICompatibleProvider implements AIProvider {
  id: string;
  name: string;

  private config: OpenAICompatibleConfig;

  constructor(config: OpenAICompatibleConfig) {
    this.id = config.id;
    this.name = config.name;
    this.config = config;
  }

  private get apiKey() {
    return process.env[this.config.apiKeyEnv];
  }

  private get baseUrl() {
    return process.env[this.config.baseUrlEnv] || this.config.defaultBaseUrl;
  }

  private get defaultModel() {
    return process.env[this.config.modelEnv] || this.config.defaultModel;
  }

  status() {
    return this.apiKey && this.baseUrl ? 'connected' as const : 'disconnected' as const;
  }

  models() {
    return this.defaultModel ? [this.defaultModel] : [];
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!this.apiKey) throw new Error(`${this.name} is not configured: missing ${this.config.apiKeyEnv}.`);
    if (!this.baseUrl) throw new Error(`${this.name} is not configured: missing ${this.config.baseUrlEnv}.`);

    const model = request.model || this.defaultModel;
    if (!model) throw new Error(`${this.name} model is not configured: missing ${this.config.modelEnv}.`);

    const cleanBaseUrl = this.baseUrl.replace(/\/+$/, '');
    const response = await fetch(`${cleanBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        // OpenRouter must not perform hidden provider/model fallback. GLORIFIER
        // owns fallback decisions and records each attempted provider itself.
        ...(this.id === 'openrouter' ? { provider: { allow_fallbacks: false } } : {}),
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`${this.name} request failed (${response.status}): ${details.slice(0, 500)}`);
    }

    const data = await response.json() as any;
    return {
      provider: this.id,
      model,
      text: data.choices?.[0]?.message?.content || '',
      requestId: data.id,
      usage: data.usage,
    };
  }
}
