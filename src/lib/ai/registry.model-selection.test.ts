import { strict as assert } from 'node:assert';
import type { AIProvider } from './types.ts';
import { isProviderModelEligible } from './registry.ts';

const provider: AIProvider = {
  id: 'openai',
  name: 'OpenAI',
  status: () => 'connected',
  models: () => ['gpt-4o'],
  generate: async () => ({ provider: 'openai', model: 'gpt-4o', text: 'ok' }),
};

assert.equal(isProviderModelEligible(provider), true, 'unspecified model leaves model selection to the provider');
assert.equal(isProviderModelEligible(provider, 'gpt-4o'), true, 'exact configured model is eligible');
assert.equal(isProviderModelEligible(provider, 'gpt-4.1'), false, 'unsupported explicit model must not silently fall back');
assert.equal(isProviderModelEligible(provider, 'claude-sonnet'), false, 'another provider model must not be silently substituted');

console.log('provider model-selection contract tests: PASS');
