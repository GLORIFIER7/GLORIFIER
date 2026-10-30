export const MAX_MODEL_COUNCIL_PROVIDERS: 8;

export interface ModelCouncilResponse {
  provider: string;
  model: string;
  text: string;
  latencyMs?: number;
}

export interface ModelCouncilParticipant {
  provider: string;
  model: string;
  text: string;
  latencyMs: number | null;
}

export interface ModelCouncilExecutionResult {
  requestedProviderIds: string[];
  participants: ModelCouncilParticipant[];
  failures: Array<{ providerId: string; code: 'provider_execution_failed' }>;
  participantCount: number;
  providerDiversity: number;
  status: 'complete' | 'partial' | 'unavailable';
}

export function validateModelCouncilProviderIds(
  providerIds: unknown,
  availableProviderIds: readonly string[],
): string[];

export function executeModelCouncilProviders(input: {
  providerIds: readonly string[];
  messages: unknown[];
  generate: (providerId: string, messages: unknown[]) => Promise<ModelCouncilResponse>;
}): Promise<ModelCouncilExecutionResult>;
