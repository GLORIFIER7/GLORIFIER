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

/**
 * Independent compute has its own model-selection path. Only automatic routing
 * may use it; explicit model or provider constraints must fail closed.
 */
export function isIndependentComputeFallbackAllowed(
  model?: string,
  requiredProvider?: string,
): boolean {
  const normalized = normalizeSavedModelPreference(model);
  return !requiredProvider && normalized === 'auto';
}
