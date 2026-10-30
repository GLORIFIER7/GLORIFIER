import { strict as assert } from 'node:assert';
import type { AIProvider } from './types.ts';
import { isProviderModelEligible, normalizeRequestedModel } from './registry.ts';

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

console.log('provider model-selection behavior tests: PASS');
