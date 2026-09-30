import type { AIProvider, AIRequest, AIResponse } from '../types';

export class AnthropicProvider implements AIProvider {
  id = 'anthropic' as const;
  name = 'Anthropic Claude';

  status() {
    return process.env.ANTHROPIC_API_KEY ? 'connected' as const : 'disconnected' as const;
  }

  models() {
    return [process.env.ANTHROPIC_MODEL || 'claude-opus-4-1'];
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      const error: any = new Error('Anthropic is not configured. Set ANTHROPIC_API_KEY.');
      error.providerAvailability = 'unavailable';
      error.unavailableReason = 'not_configured';
      throw error;
    }

    const model = request.model || process.env.ANTHROPIC_MODEL || 'claude-opus-5';
    const system = request.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const messages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens || 4096,
        ...(system ? { system } : {}),
        messages,
      }),
    });

    if (!response.ok) {
      const details = (await response.text()).slice(0, 1000);
      const unavailable = response.status === 401 || response.status === 403 || response.status === 402 || response.status === 429 || /quota|credit|billing|spend.?limit/i.test(details);
      const error: any = new Error(`Anthropic request failed (${response.status}): ${details}`);
      error.providerAvailability = unavailable ? 'unavailable' : 'error';
      error.unavailableReason = response.status === 429 ? 'rate_limited' : response.status === 402 || /quota|credit|billing|spend.?limit/i.test(details) ? 'quota_exhausted' : 'provider_error';
      error.status = response.status;
      throw error;
    }

    const data = await response.json() as any;
    return {
      provider: this.id,
      model,
      text: (data.content || []).filter((item: any) => item.type === 'text').map((item: any) => item.text).join(''),
      requestId: data.id,
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  }
}
