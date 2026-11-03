import assert from 'node:assert/strict';
import type { AIProvider } from './types.ts';
import { isProviderModelEligible, normalizeRequestedModel } from './registry.ts';
import {
  normalizeSavedModelPreference,
  resolveExecutableModelPreference,
  isIndependentComputeFallbackAllowed,
  reconcileDiscoveredModelPreference,
  modelPreferenceLabel,
} from './model-selection.ts';
import test from 'node:test';

const configuredProvider: AIProvider = {
  id: 'openai', name: 'OpenAI', status: () => 'connected', models: () => ['gpt-4o'],
  generate: async () => ({ provider: 'openai', model: 'gpt-4o', text: 'ok' }),
};
const dynamicallyDiscoveredProvider: AIProvider = {
  id: 'qwen', name: 'Alibaba Qwen', status: () => 'connected', models: () => [],
  generate: async () => ({ provider: 'qwen', model: 'qwen-plus', text: 'ok' }),
};
const geminiProvider: AIProvider = {
  id: 'gemini', name: 'Google Gemini', status: () => 'connected', models: () => ['gemini-3.1-flash-lite'],
  generate: async () => ({ provider: 'gemini', model: 'gemini-3.1-flash-lite', text: 'ok' }),
};

test('requested model identifiers are normalized without hidden provider substitution', () => {
  assert.equal(normalizeRequestedModel(undefined), undefined);
  assert.equal(normalizeRequestedModel(''), undefined);
  assert.equal(normalizeRequestedModel('  auto  '), undefined);
  assert.equal(normalizeRequestedModel(' gpt-4o '), 'gpt-4o');
  assert.equal(isProviderModelEligible(configuredProvider), true);
  assert.equal(isProviderModelEligible(configuredProvider, 'gpt-4o'), true);
  assert.equal(isProviderModelEligible(configuredProvider, 'gpt-4.1'), false);
  assert.equal(isProviderModelEligible(configuredProvider, 'claude-sonnet'), false);
  assert.equal(isProviderModelEligible(configuredProvider, 'auto'), true);
});

test('dynamic provider model discovery is required for eligibility', () => {
  assert.equal(isProviderModelEligible(dynamicallyDiscoveredProvider, 'qwen-plus', ['qwen-plus']), true);
  assert.equal(isProviderModelEligible(dynamicallyDiscoveredProvider, 'qwen-plus'), false);
  assert.equal(isProviderModelEligible(geminiProvider, 'gemini-2.5-flash', ['models/gemini-2.5-flash']), true);
});

test('saved model preferences normalize to automatic routing when stale or blank', () => {
  assert.equal(normalizeSavedModelPreference(undefined), 'auto');
  assert.equal(normalizeSavedModelPreference(''), 'auto');
  assert.equal(normalizeSavedModelPreference('   '), 'auto');
  assert.equal(normalizeSavedModelPreference('AUTO'), 'auto');
  assert.equal(normalizeSavedModelPreference('all-models'), 'auto');
  assert.equal(normalizeSavedModelPreference('consensus'), 'auto');
  assert.equal(normalizeSavedModelPreference(' gpt-4o '), 'gpt-4o');
  assert.equal(resolveExecutableModelPreference('gpt-4o', ['gpt-4o']), 'gpt-4o');
  assert.equal(resolveExecutableModelPreference('stale-model', ['gpt-4o']), 'auto');
  assert.equal(resolveExecutableModelPreference('AUTO', ['gpt-4o']), 'auto');
});

test('discovered saved-model preferences are reconciled explicitly', () => {
  assert.deepEqual(
    reconcileDiscoveredModelPreference('gpt-4o', 'auto', false, ['gpt-4o']),
    { model: 'gpt-4o', persistModel: false, savedPreferenceUnavailable: false },
  );
  assert.deepEqual(
    reconcileDiscoveredModelPreference('stale-model', 'auto', false, ['gpt-4o']),
    { model: 'auto', persistModel: true, savedPreferenceUnavailable: true },
  );
  assert.deepEqual(
    reconcileDiscoveredModelPreference('gpt-4o', 'gpt-4o', true, ['gpt-4.1']),
    { model: 'auto', persistModel: true, savedPreferenceUnavailable: false },
  );
  assert.equal(modelPreferenceLabel('auto'), 'automatic provider routing');
  assert.equal(modelPreferenceLabel('all-models'), 'automatic provider routing');
  assert.equal(modelPreferenceLabel('consensus'), 'automatic provider routing');
  assert.equal(modelPreferenceLabel('gpt-4o'), 'gpt-4o');
});

test('independent compute fallback is denied for pinned provider or unavailable model', () => {
  assert.equal(isIndependentComputeFallbackAllowed(undefined), true);
  assert.equal(isIndependentComputeFallbackAllowed('auto'), true);
  assert.equal(isIndependentComputeFallbackAllowed('unknown-model'), false);
  assert.equal(isIndependentComputeFallbackAllowed('auto', 'openai'), false);
  assert.equal(isIndependentComputeFallbackAllowed(undefined, undefined, 'openai'), false);
  assert.equal(isIndependentComputeFallbackAllowed('all-models'), true);
  assert.equal(isIndependentComputeFallbackAllowed('consensus', 'openai'), false);
});
