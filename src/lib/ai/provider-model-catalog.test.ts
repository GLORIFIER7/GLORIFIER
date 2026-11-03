import assert from 'node:assert/strict';
import { buildProviderModelOptions } from './provider-model-catalog.ts';
import test from 'node:test';

const discoveredProviders = [
  { id: 'openai', name: 'OpenAI', configured: true, availability: 'available', authorization: 'configured', authenticated: true, models: ['gpt-4o', 'shared-model', '  '] },
  { id: 'meta', name: 'Meta', configured: true, availability: 'available', authorization: 'configured', authenticated: true, models: ['meta-model', ' shared-model '] },
  { id: 'qwen', name: 'Qwen', configured: true, availability: 'available', authorization: 'pending', authenticated: false, models: ['qwen-model'] },
  { id: 'pending-auth', name: 'Pending authorization but reachable', configured: true, availability: 'available', authorization: 'pending', authenticated: true, models: ['pending-auth-model'] },
  { id: 'offline', name: 'Offline Provider', configured: true, availability: 'unreachable', authorization: 'configured', authenticated: true, models: ['offline-model'] },
  { id: 'not-configured', name: 'Not Configured', configured: false, availability: 'available', authorization: 'configured', authenticated: true, models: ['not-configured-model'] },
  { id: 'fallback-id', name: '', configured: true, availability: 'available', authorization: 'configured', authenticated: true, models: ['fallback-model'] },
  { id: 'bad-model-list', name: 'Bad model list', configured: true, availability: 'available', authorization: 'configured', authenticated: true, models: 'not-an-array' as unknown as string[] },
  { id: 'nvidia', name: 'NVIDIA', configured: true, availability: 'available', authorization: 'configured', authenticated: false, models: ['nvidia/test-model'] },
];

void test('provider model options expose only authorized model-list discovery', () => {
  assert.deepEqual(buildProviderModelOptions(discoveredProviders), [
    { model: 'fallback-model', providers: ['fallback-id'] },
    { model: 'gpt-4o', providers: ['OpenAI'] },
    { model: 'meta-model', providers: ['Meta'] },
    { model: 'shared-model', providers: ['Meta', 'OpenAI'] },
  ]);
});

void test('malformed provider discovery entries are ignored safely', () => {
  assert.deepEqual(
    buildProviderModelOptions([null, undefined, 'invalid'] as unknown as Parameters<typeof buildProviderModelOptions>[0]),
    [],
  );
});
