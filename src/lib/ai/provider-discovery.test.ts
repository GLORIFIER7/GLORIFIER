import { strict as assert } from 'node:assert';
import { discoverGlobalProviders } from './provider-discovery.ts';

const environmentKeys = [
  'QWEN_API_KEY',
  'QWEN_BASE_URL',
  'NVIDIA_API_KEY',
  'NVIDIA_BASE_URL',
  'NVIDIA_MODEL',
  'NVIDIA_AUTHORIZED',
] as const;
const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const requests: Array<{ url: string; method: string }> = [];

try {
  process.env.QWEN_API_KEY = 'test-qwen-key';
  process.env.QWEN_BASE_URL = '';
  process.env.NVIDIA_API_KEY = 'test-nvidia-key';
  process.env.NVIDIA_BASE_URL = 'https://nvidia.example.test/v1';
  process.env.NVIDIA_MODEL = 'nvidia/test-model';
  process.env.NVIDIA_AUTHORIZED = 'true';

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method || 'GET').toUpperCase();
    requests.push({ url, method });
    return new Response(JSON.stringify({ data: [{ id: 'nvidia/test-model' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const providers = await discoverGlobalProviders('provider-discovery-regression-test', {
    persistConnections: false,
  });
  const ids = new Set(providers.map((provider) => provider.id));
  const qwen = providers.find((provider) => provider.id === 'qwen');
  const nvidia = providers.find((provider) => provider.id === 'nvidia');

  assert.equal(ids.has('qwen'), true, 'Qwen must be represented in discovery');
  assert.equal(ids.has('openai'), true, 'OpenAI discovery remains registered');
  assert.equal(ids.has('ollama'), true, 'self-hosted Ollama discovery remains registered');
  assert.equal(providers.length, ids.size, 'provider discovery IDs must be unique');

  assert.ok(qwen, 'Qwen discovery entry must exist');
  assert.equal(qwen.configured, false, 'Qwen without a base URL must remain unconfigured');
  assert.equal(qwen.availability, 'unconfigured');
  assert.match(qwen.reason || '', /QWEN_BASE_URL/, 'configuration guidance must name the required environment variable');

  assert.ok(nvidia, 'NVIDIA discovery entry must exist');
  assert.equal(nvidia.availability, 'available', 'the read-only models endpoint should be discoverable');
  assert.ok(nvidia.models.includes('nvidia/test-model'), 'NVIDIA discovery should retain advertised model IDs');
  assert.equal(
    requests.some((request) => request.method !== 'GET' || request.url.endsWith('/chat/completions')),
    false,
    'provider discovery must not issue billable inference requests',
  );
} finally {
  globalThis.fetch = originalFetch;
  for (const key of environmentKeys) {
    const previous = originalEnvironment.get(key);
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

console.log('provider discovery behavior tests: PASS');
