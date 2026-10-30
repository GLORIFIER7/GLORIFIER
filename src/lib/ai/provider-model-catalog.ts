export interface ProviderDiscoveryModelSource {
  id: string;
  name: string;
  configured: boolean;
  availability: string;
  /** Explicit provider authorization configuration; not proof of inference access. */
  authorization: string;
  /** True when read-only model discovery did not return 401/403; not inference verification. */
  authenticated: boolean;
  /** Advertised model IDs returned by the read-only discovery endpoint. */
  models: string[];
}

export interface ProviderModelOption {
  model: string;
  providers: string[];
}

/**
 * Expose advertised model IDs from configured, available providers with an
 * explicit authorization setting and a successful read-only model-list response.
 * Here, authenticated means the model-list endpoint did not return 401/403;
 * it does not prove inference permission, quota, generation capacity, or success.
 * The execution registry must independently verify and gate each inference.
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
