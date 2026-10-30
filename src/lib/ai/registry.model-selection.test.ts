import { strict as assert } from 'node:assert';
import type { AIProvider } from './types.ts';
import { isProviderModelEligible, normalizeRequestedModel } from './registry.ts';
import { normalizeSavedModelPreference, resolveExecutableModelPreference, isIndependentComputeFallbackAllowed } from './model-selection.ts';

const configuredProvider: AIProvider = {
  id: 'openai',
  name: 'OpenAI',
  status: () => 'connected',
  models: () => ['gpt-4o'],
  generate: async () => ({ provider: 'openai', model: 'gpt-4o', text: 'ok' }),
};
const dynamicallyDiscoveredProvider: AIProvider = {
  id: 'qwen',
  name: 'Alibaba Qwen',
  status: () => 'connected',
  models: () => [],
  generate: async () => ({ provider: 'qwen', model: 'qwen-plus', text: 'ok' }),
};

assert.equal(normalizeRequestedModel(undefined), undefined);
assert.equal(normalizeRequestedModel(''), undefined);
assert.equal(normalizeRequestedModel('  auto  '), undefined, 'auto is a routing sentinel, not a provider model ID');
assert.equal(normalizeRequestedModel(' gpt-4o '), 'gpt-4o', 'explicit model IDs are trimmed but otherwise preserved');

assert.equal(isProviderModelEligible(configuredProvider), true, 'unspecified model leaves model selection to the provider');
assert.equal(isProviderModelEligible(configuredProvider, 'gpt-4o'), true, 'exact configured model is eligible');
assert.equal(isProviderModelEligible(configuredProvider, 'gpt-4.1'), false, 'unsupported explicit model must not silently fall back');
assert.equal(isProviderModelEligible(configuredProvider, 'claude-sonnet'), false, 'another provider model must not be silently substituted');
assert.equal(isProviderModelEligible(configuredProvider, 'auto'), true, 'auto must not filter out all configured providers');

assert.equal(
  isProviderModelEligible(dynamicallyDiscoveredProvider, 'qwen-plus', ['qwen-plus']),
  true,
  'a dynamically advertised model must be eligible even when the adapter has no static model list',
);
assert.equal(
  isProviderModelEligible(dynamicallyDiscoveredProvider, 'qwen-plus'),
  false,
  'an empty model list is unknown, not permission to silently use an arbitrary default',
);

const geminiProvider: AIProvider = {
  id: 'gemini',
  name: 'Google Gemini',
  status: () => 'connected',
  models: () => ['gemini-3.1-flash-lite'],
  generate: async () => ({ provider: 'gemini', model: 'gemini-3.1-flash-lite', text: 'ok' }),
};
assert.equal(
  isProviderModelEligible(geminiProvider, 'gemini-2.5-flash', ['models/gemini-2.5-flash']),
  true,
  'Gemini resource names must compare using their canonical model IDs',
);


assert.equal(normalizeSavedModelPreference(undefined), 'auto');
assert.equal(normalizeSavedModelPreference(''), 'auto', 'blank saved preferences must normalize to auto');
assert.equal(normalizeSavedModelPreference('   '), 'auto', 'whitespace-only saved preferences must normalize to auto');
assert.equal(normalizeSavedModelPreference('AUTO'), 'auto', 'auto sentinel matching must be case-insensitive');
assert.equal(normalizeSavedModelPreference('all-models'), 'auto');
assert.equal(normalizeSavedModelPreference('consensus'), 'auto');
assert.equal(normalizeSavedModelPreference(' gpt-4o '), 'gpt-4o', 'explicit saved IDs must be trimmed');

assert.equal(resolveExecutableModelPreference('gpt-4o', ['gpt-4o']), 'gpt-4o');
assert.equal(resolveExecutableModelPreference('stale-model', ['gpt-4o']), 'auto', 'undiscovered saved IDs must never remain executable');
assert.equal(resolveExecutableModelPreference('AUTO', ['gpt-4o']), 'auto');

import { reconcileDiscoveredModelPreference, modelPreferenceLabel } from './model-selection.ts';
assert.deepEqual(
  reconcileDiscoveredModelPreference('gpt-4o', 'auto', false, ['gpt-4o']),
  { model: 'gpt-4o', persistModel: false, savedPreferenceUnavailable: false },
  'a discovered saved model remains the executable and persisted preference',
);
assert.deepEqual(
  reconcileDiscoveredModelPreference('stale-model', 'auto', false, ['gpt-4o']),
  { model: 'auto', persistModel: true, savedPreferenceUnavailable: true },
  'a saved model omitted by successful discovery must resolve to Auto and persist that executable choice',
);
assert.deepEqual(
  reconcileDiscoveredModelPreference('gpt-4o', 'gpt-4o', true, ['gpt-4.1']),
  { model: 'auto', persistModel: true, savedPreferenceUnavailable: false },
  'an explicitly selected model that is no longer discoverable must not remain executable',
);
assert.equal(modelPreferenceLabel('auto'), 'automatic provider routing');
assert.equal(modelPreferenceLabel('all-models'), 'automatic provider routing');
assert.equal(modelPreferenceLabel('consensus'), 'automatic provider routing');
assert.equal(modelPreferenceLabel('gpt-4o'), 'gpt-4o');

assert.equal(isIndependentComputeFallbackAllowed(undefined), true, 'automatic routing may use independent compute when no provider is pinned');
assert.equal(isIndependentComputeFallbackAllowed('auto'), true);
assert.equal(isIndependentComputeFallbackAllowed('unknown-model'), false, 'an explicit unavailable model must not silently run on independent compute');
assert.equal(isIndependentComputeFallbackAllowed('auto', 'openai'), false, 'a required provider must not escape to independent compute');
assert.equal(isIndependentComputeFallbackAllowed(undefined, undefined, 'openai'), false, 'a provider-bound request must not escape to independent compute');
assert.equal(isIndependentComputeFallbackAllowed('all-models'), true, 'legacy automatic sentinel allows only unpinned independent fallback');
assert.equal(isIndependentComputeFallbackAllowed('consensus', 'openai'), false, 'legacy automatic sentinel must not bypass required provider');


console.log('provider model-selection behavior tests: PASS');
