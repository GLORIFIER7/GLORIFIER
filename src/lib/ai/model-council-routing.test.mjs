import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeModelCouncilProviders,
  validateModelCouncilProviderIds,
} from './model-council-routing.mjs';

const knownProviders = ['openai', 'gemini', 'anthropic', 'meta', 'nvidia', 'mistral', 'deepseek', 'qwen', 'groq'];

test('provider selection requires at least one known provider', () => {
  assert.throws(() => validateModelCouncilProviderIds(undefined, knownProviders), /array/i);
  assert.throws(() => validateModelCouncilProviderIds([], knownProviders), /at least one/i);
  assert.throws(() => validateModelCouncilProviderIds(['unknown-provider'], knownProviders), /unknown provider/i);
});

test('provider selection rejects blank, duplicate, and excessive provider IDs', () => {
  assert.throws(() => validateModelCouncilProviderIds(['openai', ' '], knownProviders), /non-empty/i);
  assert.throws(() => validateModelCouncilProviderIds(['openai', 'openai'], knownProviders), /duplicate/i);
  assert.throws(() => validateModelCouncilProviderIds(knownProviders, knownProviders), /maximum/i);
});

test('provider selection trims IDs and preserves the owner-selected order', () => {
  assert.deepEqual(
    validateModelCouncilProviderIds([' openai ', 'anthropic', 'gemini'], knownProviders),
    ['openai', 'anthropic', 'gemini'],
  );
});

test('council executes exactly the selected providers and reports actual identities', async () => {
  const calls = [];
  const result = await executeModelCouncilProviders({
    providerIds: ['openai', 'anthropic', 'gemini'],
    messages: [{ role: 'user', content: 'Review this change.' }],
    generate: async (providerId, messages) => {
      calls.push({ providerId, messages });
      return {
        provider: providerId,
        model: `${providerId}-actual-model`,
        text: `Independent findings from ${providerId}.`,
      };
    },
  });

  assert.deepEqual(calls.map(({ providerId }) => providerId), ['openai', 'anthropic', 'gemini']);
  assert.equal(result.status, 'complete');
  assert.equal(result.participantCount, 3);
  assert.equal(result.providerDiversity, 3);
  assert.deepEqual(result.participants.map(({ provider }) => provider), ['openai', 'anthropic', 'gemini']);
  assert.deepEqual(result.participants.map(({ model }) => model), [
    'openai-actual-model', 'anthropic-actual-model', 'gemini-actual-model',
  ]);
  assert.deepEqual(result.failures, []);
});

test('failed providers are reported without substituting an unselected provider', async () => {
  const calls = [];
  const result = await executeModelCouncilProviders({
    providerIds: ['openai', 'anthropic'],
    messages: [{ role: 'user', content: 'Review this change.' }],
    generate: async (providerId) => {
      calls.push(providerId);
      if (providerId === 'anthropic') throw new Error('credential details must not be exposed');
      return { provider: providerId, model: 'gpt-test', text: 'One independent response.' };
    },
  });

  assert.deepEqual(calls, ['openai', 'anthropic']);
  assert.equal(result.status, 'partial');
  assert.equal(result.participantCount, 1);
  assert.equal(result.providerDiversity, 1);
  assert.deepEqual(result.failures, [{ providerId: 'anthropic', code: 'provider_execution_failed' }]);
  assert.equal(JSON.stringify(result).includes('credential details'), false);
});

test('council rejects a response that claims a different provider or contains no text', async () => {
  const mismatch = await executeModelCouncilProviders({
    providerIds: ['openai'],
    messages: [],
    generate: async () => ({ provider: 'gemini', model: 'model-x', text: 'misattributed response' }),
  });
  assert.equal(mismatch.status, 'unavailable');
  assert.equal(mismatch.participantCount, 0);
  assert.deepEqual(mismatch.failures, [{ providerId: 'openai', code: 'provider_execution_failed' }]);

  const empty = await executeModelCouncilProviders({
    providerIds: ['openai'],
    messages: [],
    generate: async () => ({ provider: 'openai', model: 'gpt-test', text: '   ' }),
  });
  assert.equal(empty.status, 'unavailable');
  assert.equal(empty.participantCount, 0);
});
