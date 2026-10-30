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
      models: ['gpt-4o', 'shared-model', '  '],
    },
    {
      id: 'meta',
      name: 'Meta',
      configured: true,
      availability: 'available',
      authorization: 'configured',
      models: ['meta-model', 'shared-model'],
    },
    {
      id: 'qwen',
      name: 'Qwen',
      configured: true,
      availability: 'available',
      authorization: 'pending',
      models: ['qwen-model'],
    },
    {
      id: 'offline',
      name: 'Offline Provider',
      configured: true,
      availability: 'unreachable',
      authorization: 'configured',
      models: ['offline-model'],
    },
    {
      id: 'not-configured',
      name: 'Not Configured',
      configured: false,
      availability: 'available',
      authorization: 'configured',
      models: ['not-configured-model'],
    },
    {
      id: 'nvidia',
      name: 'NVIDIA',
      configured: true,
      availability: 'available',
      authorization: 'configured',
      models: ['nvidia/test-model'],
    },
  ]),
  [
    { model: 'gpt-4o', providers: ['OpenAI'] },
    { model: 'meta-model', providers: ['Meta'] },
    { model: 'nvidia/test-model', providers: ['NVIDIA'] },
    { model: 'shared-model', providers: ['Meta', 'OpenAI'] },
  ],
  'only models from configured, available, explicitly authorized providers are shown; duplicates are grouped',
);

assert.deepEqual(
  buildProviderModelOptions([null, undefined, 'invalid'] as unknown as Parameters<typeof buildProviderModelOptions>[0]),
  [],
  'malformed provider discovery entries must be ignored safely',
);

console.log('provider model catalogue tests: PASS');
