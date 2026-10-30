export const MAX_MODEL_COUNCIL_PROVIDERS: 8;
export const DEFAULT_MODEL_COUNCIL_TIMEOUT_MS: 45000;

export interface ModelCouncilMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export interface ModelCouncilSelection {
  providerId: string;
  modelId: string;
}
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
  requestedParticipants: Array<{ providerId: string; modelId: string | null }>;
  requestedProviderIds: string[];
  participants: ModelCouncilParticipant[];
  failures: Array<{ providerId: string; modelId: string | null; code: 'provider_execution_failed' | 'provider_timeout' }>;
  participantCount: number;
  providerDiversity: number;
  status: 'complete' | 'partial' | 'unavailable';
}

export function validateModelCouncilProviderIds(
  providerIds: unknown,
  availableProviderIds: readonly string[],
): string[];
export function resolveModelCouncilProviderIds(input: {
  providerIds?: unknown;
  activeModels?: unknown;
  availableProviderIds: readonly string[];
}): string[];
export function resolveModelCouncilParticipants(input: {
  participants?: unknown;
  providerIds?: unknown;
  activeModels?: unknown;
  availableProviders: readonly { id: string; models: readonly string[] }[];
}): ModelCouncilSelection[];
export function isValidModelCouncilResponse(
  response: unknown,
  expectedProviderId: string,
  expectedModelId?: string,
): response is ModelCouncilResponse;
export function executeModelCouncilProviders(input: {
  participants?: readonly ModelCouncilSelection[];
  providerIds?: readonly string[];
  messages: ModelCouncilMessage[];
  generate: (
    providerId: string,
    modelId: string,
    messages: ModelCouncilMessage[],
    signal: AbortSignal,
  ) => Promise<ModelCouncilResponse>;
  timeoutMs?: number;
}): Promise<ModelCouncilExecutionResult>;
