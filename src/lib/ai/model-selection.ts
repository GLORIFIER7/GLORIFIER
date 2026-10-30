export function normalizeSavedModelPreference(value: unknown): string {
  if (typeof value !== 'string') return 'auto';
  const normalized = value.trim();
  if (!normalized) return 'auto';
  const sentinel = normalized.toLowerCase();
  return sentinel === 'auto' || sentinel === 'all-models' || sentinel === 'consensus'
    ? 'auto'
    : normalized;
}

export function resolveExecutableModelPreference(
  candidate: unknown,
  discoveredModels: readonly string[],
): string {
  const normalized = normalizeSavedModelPreference(candidate);
  if (normalized === 'auto') return 'auto';
  const available = new Set(discoveredModels.map((model) => model.trim()).filter(Boolean));
  return available.has(normalized) ? normalized : 'auto';
}

/** Result of reconciling a saved or selected model with provider discovery. */
export interface ModelSelectionResolution {
  model: string;
  persistModel: boolean;
  savedPreferenceUnavailable: boolean;
}

/**
 * Resolve the model actually executable after discovery. When the saved or
 * selected model is not advertised, use Auto and tell the caller to sync the
 * executable preference into shared policy so other components do not use a
 * stale explicit model.
 */
export function reconcileDiscoveredModelPreference(
  savedPreference: unknown,
  currentSelection: unknown,
  hasUserSelectedModel: boolean,
  discoveredModels: readonly string[],
): ModelSelectionResolution {
  const preferred = hasUserSelectedModel ? currentSelection : savedPreference;
  const normalizedPreferred = normalizeSavedModelPreference(preferred);
  const model = resolveExecutableModelPreference(normalizedPreferred, discoveredModels);
  const unavailable = normalizedPreferred !== 'auto' && model === 'auto';
  return {
    model,
    persistModel: model !== normalizedPreferred,
    savedPreferenceUnavailable: !hasUserSelectedModel && unavailable,
  };
}

/**
 * Independent compute is a separate provider. It may be used only for an
 * unpinned automatic request; explicit models and provider constraints must
 * never be silently moved to another execution path.
 */
export function isIndependentComputeFallbackAllowed(
  model?: string,
  requiredProvider?: string,
  preferredProvider?: string,
): boolean {
  const normalized = normalizeSavedModelPreference(model);
  return !requiredProvider && !preferredProvider && normalized === 'auto';
}

export function modelPreferenceLabel(value: unknown): string {
  const normalized = normalizeSavedModelPreference(value);
  return normalized === 'auto' ? 'automatic provider routing' : normalized;
}
