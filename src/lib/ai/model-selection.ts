export function normalizeSavedModelPreference(value: unknown): string {
  return typeof value === 'string' ? value : 'auto';
}

export function resolveExecutableModelPreference(
  candidate: unknown,
  discoveredModels: readonly string[],
): string {
  return typeof candidate === 'string' ? candidate : 'auto';
}

export function isIndependentComputeFallbackAllowed(
  model?: string,
  requiredProvider?: string,
): boolean {
  return true;
}
