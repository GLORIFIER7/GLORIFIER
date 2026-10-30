import { strict as assert } from 'node:assert';
import { buildProviderModelOptions } from './provider-model-catalog.ts';

assert.deepEqual(
  buildProviderModelOptions([
    {
      id: 'openai',
      name: 'OpenAI',
      configured: true,
      availability: 'available',
      authorization: 'configured',
      authenticated: true,
      models: ['gpt-4o', 'shared-model', '  '],
    },
    {
      id: 'meta',
      name: 'Meta',
      configured: true,
      availability: 'available',
      authorization: 'configured',
      authenticated: true,
      models: ['meta-model', ' shared-model '],
    },
    {
      id: 'qwen',
      name: 'Qwen',
      configured: true,
      availability: 'available',
      authorization: 'pending',
      authenticated: false,
      models: ['qwen-model'],
    },
    {
      id: 'pending-auth',
      name: 'Pending authorization but reachable',
      configured: true,
      availability: 'available',
      authorization: 'pending',
      authenticated: true,
      models: ['pending-auth-model'],
    },
    {
      id: 'offline',
      name: 'Offline Provider',
      configured: true,
      availability: 'unreachable',
      authorization: 'configured',
      authenticated: true,
      models: ['offline-model'],
    },
    {
      id: 'not-configured',
      name: 'Not Configured',
      configured: false,
      availability: 'available',
      authorization: 'configured',
      authenticated: true,
      models: ['not-configured-model'],
    },
    {
      id: 'fallback-id',
      name: '',
      configured: true,
      availability: 'available',
      authorization: 'configured',
      authenticated: true,
      models: ['fallback-model'],
    },
    {
      id: 'bad-model-list',
      name: 'Bad model list',
      configured: true,
      availability: 'available',
      authorization: 'configured',
      authenticated: true,
      models: 'not-an-array' as unknown as string[],
    },
    {
      id: 'nvidia',
      name: 'NVIDIA',
      configured: true,
      availability: 'available',
      authorization: 'configured',
      authenticated: false,
      models: ['nvidia/test-model'],
    },
  ]),
  [
    { model: 'fallback-model', providers: ['fallback-id'] },
    { model: 'gpt-4o', providers: ['OpenAI'] },
    { model: 'meta-model', providers: ['Meta'] },
    { model: 'shared-model', providers: ['Meta', 'OpenAI'] },
  ],
  'model options reflect explicitly authorized model-list discovery only; they do not prove inference permission or capacity',
);

assert.deepEqual(
  buildProviderModelOptions([null, undefined, 'invalid'] as unknown as Parameters<typeof buildProviderModelOptions>[0]),
  [],
  'malformed provider discovery entries must be ignored safely',
);

console.log('provider model catalogue tests: PASS');
