import { GoogleGenAI } from '@google/genai';
import type { AIMessage, AIProvider, AIRequest, AIResponse } from '../types';

function toPrompt(messages: AIMessage[]): { systemInstruction?: string; contents: string } {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const conversation = messages
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  return {
    systemInstruction: system || undefined,
    contents: conversation,
  };
}

export class GeminiProvider implements AIProvider {
  id = 'gemini' as const;
  name = 'Google Gemini';

  private client: GoogleGenAI | null = null;

  private getClient() {
    if (!this.client && process.env.GEMINI_API_KEY) {
      this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return this.client;
  }

  status() {
    return process.env.GEMINI_API_KEY ? 'connected' as const : 'disconnected' as const;
  }

  models() {
    return [process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'];
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const client = this.getClient();
    if (!client) throw new Error('Gemini is not configured. Set GEMINI_API_KEY.');

    const primaryModel = request.model || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
    const fallbackModels = [primaryModel, 'gemini-3.1-flash-lite', 'gemini-flash-latest'].filter(
      (m, idx, arr) => arr.indexOf(m) === idx
    );

    const prompt = toPrompt(request.messages);

    let lastError: any = null;
    for (const model of fallbackModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await client.models.generateContent({
            model,
            contents: prompt.contents,
            config: {
              systemInstruction: prompt.systemInstruction,
              ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
              ...(request.maxTokens === undefined ? {} : { maxOutputTokens: request.maxTokens }),
            },
          });

          return {
            provider: this.id,
            model,
            text: response.text || '',
          };
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || String(err);
          const status = err?.status || err?.code || (errMsg.includes('503') ? 503 : (errMsg.includes('429') ? 429 : 0));
          const isQuota = status === 429 || errMsg.includes('Quota exceeded') || errMsg.includes('RESOURCE_EXHAUSTED');
          const isUnavailable = status === 503 || errMsg.includes('high demand') || errMsg.includes('UNAVAILABLE') || errMsg.includes('overloaded');

          if (isQuota) {
            break;
          }

          if (isUnavailable && attempt === 0) {
            // Brief backoff before next attempt
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }

          if (isUnavailable) {
            break;
          }
          throw err;
        }
      }
    }

    const finalError: any = lastError || new Error('Gemini generation failed');
    const message = finalError?.message || String(finalError);
    if (finalError && (finalError.status === 429 || finalError.code === 429 || /quota|resource_exhausted|rate.?limit/i.test(message))) {
      const unavailable = new Error(`Gemini unavailable: quota exhausted or rate limited (429). ${message}`);
      (unavailable as any).providerAvailability = 'unavailable';
      (unavailable as any).unavailableReason = 'quota_exhausted';
      throw unavailable;
    }
    throw finalError;
  }
}
