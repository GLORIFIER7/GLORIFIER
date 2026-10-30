export const MAX_MODEL_COUNCIL_PROVIDERS = 8;
export const DEFAULT_MODEL_COUNCIL_TIMEOUT_MS = 45_000;

const LEGACY_MODEL_PROVIDER_IDS = Object.freeze({
  'gpt-4o': 'openai',
  'claude': 'anthropic',
  'gemini-3.8-flash': 'gemini',
  'llama-3.3': 'meta',
});

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
            ? (Object.hasOwn(LEGACY_MODEL_PROVIDER_IDS, modelId) ? LEGACY_MODEL_PROVIDER_IDS[modelId] : modelId)
            : modelId
        ))
      : providerIds;
  return validateModelCouncilProviderIds(requested, availableProviderIds);
}

/**
 * Resolve exact provider/model pairs. Legacy provider-only requests intentionally
 * select the first model advertised by each provider; new clients must send pairs.
 */
export function resolveModelCouncilParticipants({
  participants,
  providerIds,
  activeModels,
  availableProviders,
}) {
  if (!Array.isArray(availableProviders)) {
    throw new TypeError('availableProviders must be a provider registry array.');
  }

  let requested;
  if (participants !== undefined) {
    if (!Array.isArray(participants)) {
      throw new TypeError('participants must be an array of provider/model selections.');
    }
    requested = participants;
  } else if (providerIds === undefined && activeModels !== undefined) {
    if (!Array.isArray(activeModels)) {
      throw new TypeError('activeModels must be an array of exact model IDs.');
    }
    requested = activeModels.map((entry) => {
      if (typeof entry !== 'string' || !entry.trim()) {
        throw new TypeError('Every legacy activeModels entry must be a non-empty model ID.');
      }
      const modelId = entry.trim();
      const mappedProviderId = Object.hasOwn(LEGACY_MODEL_PROVIDER_IDS, modelId)
        ? LEGACY_MODEL_PROVIDER_IDS[modelId]
        : availableProviders.find((provider) => Array.isArray(provider.models) && provider.models.includes(modelId))?.id;
      if (!mappedProviderId) throw new RangeError(`Unknown legacy model ID: ${modelId}.`);
      return { providerId: mappedProviderId, modelId };
    });
  } else {
    const ids = resolveModelCouncilProviderIds({
      providerIds,
      availableProviderIds: availableProviders.map((provider) => provider.id),
    });
    requested = ids.map((providerId) => {
      const provider = availableProviders.find((entry) => entry.id === providerId);
      const modelId = Array.isArray(provider?.models) ? provider.models[0] : undefined;
      if (typeof modelId !== 'string' || !modelId.trim()) {
        throw new RangeError(`Provider ${providerId} does not advertise a configured model.`);
      }
      return { providerId, modelId };
    });
  }

  if (requested.length === 0) {
    throw new RangeError('Select at least one provider-backed model before starting the council.');
  }
  if (requested.length > MAX_MODEL_COUNCIL_PROVIDERS) {
    throw new RangeError(`A council can include at most ${MAX_MODEL_COUNCIL_PROVIDERS} model selections.`);
  }

  const normalized = requested.map((selection) => {
    if (!selection || typeof selection !== 'object') {
      throw new TypeError('Every model selection must include a provider ID and model ID.');
    }
    const providerId = typeof selection.providerId === 'string' ? selection.providerId.trim() : '';
    const modelId = typeof selection.modelId === 'string' ? selection.modelId.trim() : '';
    if (!providerId || !modelId) {
      throw new TypeError('Every model selection must include non-empty providerId and modelId strings.');
    }
    const provider = availableProviders.find((entry) => entry.id === providerId);
    if (!provider) throw new RangeError(`Unknown provider ID: ${providerId}.`);
    if (!Array.isArray(provider.models) || !provider.models.includes(modelId)) {
      throw new RangeError(`Unknown model ID ${modelId} for provider ${providerId}.`);
    }
    return { providerId, modelId };
  });

  const uniqueSelections = new Set(normalized.map(({ providerId, modelId }) => `${providerId}::${modelId}`));
  if (uniqueSelections.size !== normalized.length) {
    throw new RangeError('Duplicate provider/model selections are not allowed.');
  }

  return normalized;
}

export function isValidModelCouncilResponse(response, expectedProviderId, expectedModelId) {
  return Boolean(
    response
    && typeof response === 'object'
    && response.provider === expectedProviderId
    && (expectedModelId === undefined || response.model === expectedModelId)
    && typeof response.model === 'string'
    && response.model.trim()
    && typeof response.text === 'string'
    && response.text.trim()
  );
}

export async function executeModelCouncilProviders({
  participants,
  providerIds,
  messages,
  generate,
  timeoutMs = DEFAULT_MODEL_COUNCIL_TIMEOUT_MS,
}) {
  const legacyProviderSelection = !Array.isArray(participants);
  const selected = Array.isArray(participants)
    ? participants
    : Array.isArray(providerIds)
      ? providerIds.map((providerId) => ({ providerId, modelId: undefined }))
      : [];
  if (selected.length === 0) {
    throw new RangeError('At least one validated provider/model selection is required.');
  }
  if (typeof generate !== 'function') {
    throw new TypeError('A provider-specific generate function is required.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('timeoutMs must be a positive integer.');
  }

  const settled = await Promise.all(selected.map(async ({ providerId, modelId }) => {
    const controller = new AbortController();
    let timeoutHandle;
    try {
      const timeout = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          controller.abort();
          const error = new Error('Provider execution deadline exceeded.');
          error.code = 'provider_timeout';
          reject(error);
        }, timeoutMs);
      });
      const execution = Promise.resolve().then(() => (
        legacyProviderSelection
          ? generate(providerId, messages, controller.signal)
          : generate(providerId, modelId, messages, controller.signal)
      ));
      const response = await Promise.race([execution, timeout]);
      if (!isValidModelCouncilResponse(response, providerId, modelId)) {
        throw new Error('Provider response did not match the requested provider/model contract.');
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
    } catch (error) {
      return {
        status: 'rejected',
        providerId,
        modelId: modelId ?? null,
        code: controller.signal.aborted || error?.code === 'provider_timeout'
          ? 'provider_timeout'
          : 'provider_execution_failed',
      };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }));

  const successful = settled
    .filter((entry) => entry.status === 'fulfilled')
    .map((entry) => entry.value);
  const failures = settled
    .filter((entry) => entry.status === 'rejected')
    .map(({ providerId, modelId, code }) => ({ providerId, modelId, code }));
  const providerDiversity = new Set(successful.map((entry) => entry.provider)).size;

  return {
    requestedParticipants: selected.map(({ providerId, modelId }) => ({ providerId, modelId: modelId ?? null })),
    requestedProviderIds: [...new Set(selected.map(({ providerId }) => providerId))],
    participants: successful,
    failures,
    participantCount: successful.length,
    providerDiversity,
    status: successful.length === selected.length
      ? 'complete'
      : successful.length > 0
        ? 'partial'
        : 'unavailable',
  };
}
