export type ModelCouncilMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ModelCouncilProviderResponse = {
  provider: string;
  model: string;
  text: string;
  latencyMs?: number | null;
};

export type ModelCouncilGenerate = (
  providerId: string,
  modelId: string,
  messages: ModelCouncilMessage[],
  signal: AbortSignal,
) => Promise<ModelCouncilProviderResponse>;

export function executeModelCouncilRequest(input: {
  participants: Array<{ providerId: string; modelId: string }>;
  messages: ModelCouncilMessage[];
  topic: string;
  generate: ModelCouncilGenerate;
  timeoutMs?: number;
  timestamp?: () => string;
}): Promise<{ status: number; body: Record<string, unknown> }>;
