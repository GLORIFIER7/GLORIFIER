export interface ProviderDiscoveryModelSource {
  id: string;
  name: string;
  configured: boolean;
  availability: string;
  authorization: string;
  authenticated: boolean;
  models: string[];
}

export interface ProviderModelOption {
  model: string;
  providers: string[];
}

/**
 * Expose only model IDs advertised by configured, available, explicitly
 * authorized providers. Discovery is not an inference test, so these options
 * describe model-list evidence rather than guaranteed generation capacity.
 */
export function buildProviderModelOptions(
  providers: readonly ProviderDiscoveryModelSource[],
): ProviderModelOption[] {
  const providersByModel = new Map<string, Set<string>>();

  for (const provider of providers) {
    if (!provider || typeof provider !== 'object') continue;
    if (
      !provider.configured ||
      provider.availability !== 'available' ||
      provider.authorization !== 'configured' ||
      provider.authenticated !== true ||
      !Array.isArray(provider.models)
    ) continue;

    for (const rawModel of provider.models) {
      const model = typeof rawModel === 'string' ? rawModel.trim() : '';
      if (!model) continue;
      const matchingProviders = providersByModel.get(model) ?? new Set<string>();
      matchingProviders.add(provider.name || provider.id);
      providersByModel.set(model, matchingProviders);
    }
  }

  return [...providersByModel.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([model, matchingProviders]) => ({
      model,
      providers: [...matchingProviders].sort((a, b) => a.localeCompare(b)),
    }));
}
