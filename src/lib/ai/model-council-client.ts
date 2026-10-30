import type { CouncilConsensusResult } from '../../types';

export interface ModelCouncilSelection {
  providerId: string;
  modelId: string;
}

export interface ModelCouncilProviderFailure {
  providerId: string;
  modelId: string | null;
  code: string;
}

export interface ModelCouncilApiResponse extends CouncilConsensusResult {
  ok: true;
  participantCount: number;
  providerDiversity: number;
  failures: ModelCouncilProviderFailure[];
}

export function formatModelCouncilFailures(failures: readonly ModelCouncilProviderFailure[]): string {
  return failures.map((failure) => {
    const modelSuffix = failure.modelId ? '/' + failure.modelId : '';
    return failure.providerId + modelSuffix + ' (' + failure.code + ')';
  }).join(', ');
}

export class ModelCouncilClientError extends Error {
  readonly failures: ModelCouncilProviderFailure[];
  readonly status: number;

  constructor(message: string, failures: ModelCouncilProviderFailure[] = [], status = 0) {
    super(message);
    this.name = 'ModelCouncilClientError';
    this.failures = failures;
    this.status = status;
  }
}

export function normalizeModelCouncilFailures(value: unknown): ModelCouncilProviderFailure[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ModelCouncilProviderFailure[] => {
    if (!entry || typeof entry !== 'object') return [];
    const failure = entry as Record<string, unknown>;
    if (typeof failure.providerId !== 'string' || !failure.providerId.trim()) return [];
    return [{
      providerId: failure.providerId,
      modelId: typeof failure.modelId === 'string' ? failure.modelId : null,
      code: typeof failure.code === 'string' && failure.code.trim()
        ? failure.code
        : 'provider_execution_failed',
    }];
  });
}

/** Discover only connected providers with an explicit model advertised by the API registry. */
export async function discoverConfiguredModelCouncilParticipants(
  fetcher: typeof fetch = fetch,
  maxParticipants = 8,
): Promise<ModelCouncilSelection[]> {
  if (!Number.isInteger(maxParticipants) || maxParticipants < 1 || maxParticipants > 8) {
    throw new RangeError('maxParticipants must be an integer from 1 through 8.');
  }
  const response = await fetcher('/api/ai/registry');
  if (!response.ok) {
    throw new ModelCouncilClientError(`Provider registry request failed (HTTP ${response.status}).`, [], response.status);
  }
  let payload: { providers?: unknown };
  try {
    payload = await response.json() as { providers?: unknown };
  } catch {
    throw new ModelCouncilClientError(`Provider registry returned non-JSON data (HTTP ${response.status}).`, [], response.status);
  }
  const providers = Array.isArray(payload.providers) ? payload.providers : [];
  const groups = providers.flatMap((entry): Array<{ providerId: string; modelIds: string[] }> => {
    if (!entry || typeof entry !== 'object') return [];
    const provider = entry as Record<string, unknown>;
    const providerId = typeof provider.id === 'string' ? provider.id.trim() : '';
    const models = Array.isArray(provider.models) ? provider.models : [];
    const modelIds = [...new Set(models.flatMap((model): string[] => (
      typeof model === 'string' && model.trim() ? [model.trim()] : []
    )))];
    if (provider.status !== 'connected' || !providerId || modelIds.length === 0) return [];
    return [{ providerId, modelIds }];
  });

  // Round-robin across providers so one provider's large catalog cannot starve others.
  const selections: ModelCouncilSelection[] = [];
  let modelIndex = 0;
  while (selections.length < maxParticipants) {
    let addedAtThisDepth = false;
    for (const group of groups) {
      const modelId = group.modelIds[modelIndex];
      if (!modelId) continue;
      selections.push({ providerId: group.providerId, modelId });
      addedAtThisDepth = true;
      if (selections.length >= maxParticipants) break;
    }
    if (!addedAtThisDepth) break;
    modelIndex += 1;
  }
  return selections;
}

export async function submitAuthenticatedModelCouncilRequest(input: {
  agenda: string;
  participants: ModelCouncilSelection[];
  currentPolicy?: unknown;
  footprints?: unknown[];
  getToken: () => Promise<string | null | undefined>;
  fetcher?: typeof fetch;
}): Promise<ModelCouncilApiResponse> {
  if (!Array.isArray(input.participants) || input.participants.length === 0) {
    throw new ModelCouncilClientError('Select at least one configured provider/model pair.', [], 400);
  }
  const token = await input.getToken();
  if (!token) {
    throw new ModelCouncilClientError('Authentication required. Sign in with the GLORIFIER owner account to run the AI council.', [], 401);
  }

  const response = await (input.fetcher || fetch)('/api/ai/council', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      agenda: input.agenda,
      participants: input.participants,
      currentPolicy: input.currentPolicy,
      footprints: input.footprints || [],
    }),
  });

  let raw: Record<string, unknown>;
  try {
    raw = await response.json() as Record<string, unknown>;
  } catch {
    throw new ModelCouncilClientError(`Council endpoint returned non-JSON data (HTTP ${response.status}).`, [], response.status);
  }
  const failures = normalizeModelCouncilFailures(raw.failures);
  if (!response.ok) {
    const message = typeof raw.error === 'string' ? raw.error : `Council request failed (HTTP ${response.status}).`;
    throw new ModelCouncilClientError(message, failures, response.status);
  }
  if (
    raw.ok !== true
    || typeof raw.agenda !== 'string'
    || typeof raw.timestamp !== 'string'
    || !Array.isArray(raw.participants)
    || typeof raw.unifiedConsensus !== 'string'
  ) {
    throw new ModelCouncilClientError('Council response did not satisfy the expected response contract.', failures, response.status);
  }
  return { ...raw, failures } as unknown as ModelCouncilApiResponse;
}
