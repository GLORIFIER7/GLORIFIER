import { strict as assert } from 'node:assert';
import { getGlobalProviderDiscoverySnapshot } from './provider-discovery.ts';

const providers = getGlobalProviderDiscoverySnapshot();
const ids = new Set(providers.map((provider) => provider.id));

assert.equal(ids.has('qwen'), true, 'Qwen must be represented in discovery as well as execution');
assert.equal(ids.has('openai'), true, 'OpenAI discovery remains registered');
assert.equal(ids.has('ollama'), true, 'self-hosted Ollama discovery remains registered');
assert.equal(providers.length, ids.size, 'provider discovery IDs must be unique');

console.log('provider discovery registry contract tests: PASS');
