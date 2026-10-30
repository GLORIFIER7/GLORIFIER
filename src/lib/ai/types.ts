export type AIProviderId = 'openai' | 'gemini' | 'meta' | string;
export type AIProviderStatus = 'connected' | 'disconnected' | 'error' | 'unavailable';

export interface AIMessage { role: 'system' | 'user' | 'assistant'; content: string; }
export interface AIRequest { messages: AIMessage[]; model?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal; }

export interface ResponseEvaluation { score: number; passed: boolean; reasons: string[]; }

export interface AIResponse {
  provider: AIProviderId;
  model: string;
  text: string;
  requestId?: string;
  latencyMs?: number;
  evaluation?: ResponseEvaluation;
  availability?: 'available' | 'unavailable';
  unavailableReason?: 'quota_exhausted' | 'rate_limited' | 'provider_error' | 'not_configured';
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; };
}

export interface AIProvider {
  id: AIProviderId; name: string; status(): AIProviderStatus; models(): string[];
  generate(request: AIRequest): Promise<AIResponse>;
}
export interface ProviderRegistryEntry { id: AIProviderId; name: string; status: AIProviderStatus; models: string[]; }
