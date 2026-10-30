export const MAX_MODEL_COUNCIL_PROVIDERS = 8;

const LEGACY_MODEL_PROVIDER_IDS = Object.freeze({
  'gpt-4o': 'openai',
  'claude': 'anthropic',
  'gemini-3.8-flash': 'gemini',
  'llama-3.3': 'meta',
});

/**
 * Resolve the council request without silently dropping unsupported selections.
 * Unknown legacy model IDs are passed to validation and rejected as unknown providers.
 */
export function resolveModelCouncilProviderIds({
  providerIds,
  activeModels,
  availableProviderIds,
}) {
  const requested = providerIds !== undefined
    ? providerIds
    : Array.isArray(activeModels)
      ? activeModels.map((modelId) => (
          typeof modelId === 'string'
            ? (LEGACY_MODEL_PROVIDER_IDS[modelId] ?? modelId)
            : modelId
        ))
      : providerIds;
  return validateModelCouncilProviderIds(requested, availableProviderIds);
}

export function validateModelCouncilProviderIds(providerIds, availableProviderIds) {
  if (!Array.isArray(providerIds)) {
    throw new TypeError('providerIds must be an array of registered provider IDs.');
  }
  if (providerIds.length === 0) {
    throw new RangeError('Select at least one provider-backed model before starting the council.');
  }
  if (providerIds.length > MAX_MODEL_COUNCIL_PROVIDERS) {
    throw new RangeError(`A council can include at most ${MAX_MODEL_COUNCIL_PROVIDERS} providers.`);
  }

  const normalized = providerIds.map((providerId) => {
    if (typeof providerId !== 'string' || !providerId.trim()) {
      throw new TypeError('Every provider ID must be a non-empty string.');
    }
    return providerId.trim();
  });

  if (new Set(normalized).size !== normalized.length) {
    throw new RangeError('Duplicate provider IDs are not allowed.');
  }

  const available = new Set(availableProviderIds);
  const unknown = normalized.filter((providerId) => !available.has(providerId));
  if (unknown.length) {
    throw new RangeError(`Unknown provider ID(s): ${unknown.join(', ')}.`);
  }

  return normalized;
}

export async function executeModelCouncilProviders({ providerIds, messages, generate }) {
  if (!Array.isArray(providerIds) || providerIds.length === 0) {
    throw new RangeError('At least one validated provider ID is required.');
  }
  if (typeof generate !== 'function') {
    throw new TypeError('A provider-specific generate function is required.');
  }

  const settled = await Promise.all(providerIds.map(async (providerId) => {
    try {
      const response = await generate(providerId, messages);
      if (
        !response
        || typeof response !== 'object'
        || response.provider !== providerId
        || typeof response.model !== 'string'
        || !response.model.trim()
        || typeof response.text !== 'string'
        || !response.text.trim()
      ) {
        throw new Error('Provider response did not match the requested provider contract.');
      }
      return {
        status: 'fulfilled',
        value: {
          provider: providerId,
          model: response.model,
          text: response.text.trim(),
          latencyMs: Number.isFinite(response.latencyMs) ? response.latencyMs : null,
        },
      };
    } catch {
      // Never return raw provider errors; they can contain request metadata or credentials.
      return { status: 'rejected', providerId };
    }
  }));

  const participants = settled
    .filter((entry) => entry.status === 'fulfilled')
    .map((entry) => entry.value);
  const failures = settled
    .filter((entry) => entry.status === 'rejected')
    .map((entry) => ({ providerId: entry.providerId, code: 'provider_execution_failed' }));
  const providerDiversity = new Set(participants.map((entry) => entry.provider)).size;

  return {
    requestedProviderIds: [...providerIds],
    participants,
    failures,
    participantCount: participants.length,
    providerDiversity,
    status: participants.length === providerIds.length
      ? 'complete'
      : participants.length > 0
        ? 'partial'
        : 'unavailable',
  };
}
