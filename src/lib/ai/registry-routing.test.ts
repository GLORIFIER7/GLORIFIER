import { strict as assert } from 'node:assert';
import { executeThroughProviderRegistry } from './registry.ts';
import { discoverGlobalProviders } from './provider-discovery.ts';

const envKeys = [
  'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'OPENAI_AUTHORIZED',
  'GEMINI_API_KEY', 'ANTHROPIC_API_KEY',
  'META_API_KEY', 'META_BASE_URL', 'META_MODEL', 'META_AUTHORIZED',
  'XAI_API_KEY', 'MISTRAL_API_KEY', 'DEEPSEEK_API_KEY', 'QWEN_API_KEY',
  'NVIDIA_API_KEY', 'GROQ_API_KEY', 'TOGETHER_API_KEY', 'FIREWORKS_API_KEY',
  'OPENROUTER_API_KEY', 'HF_TOKEN', 'LLMSRELAY_API_KEY',
  'OLLAMA_AUTH_TOKEN', 'LANGSMITH_TRACING',
] as const;
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]] as const));
const originalFetch = globalThis.fetch;
const providerRequests: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];

try {
  for (const key of envKeys) delete process.env[key];
  process.env.META_API_KEY = 'test-meta-key';
  process.env.META_BASE_URL = 'https://meta.example.test/v1';
  process.env.META_MODEL = 'meta-default';
  process.env.META_AUTHORIZED = 'true';

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method || 'GET').toUpperCase();
    const body = typeof init?.body === 'string'
      ? JSON.parse(init.body) as Record<string, unknown>
      : undefined;
    providerRequests.push({ method, url, body });

    if (method === 'GET' && url.endsWith('/models')) {
      return new Response(JSON.stringify({
        data: [{ id: 'meta-default' }, { id: 'qwen-dynamic' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (method === 'POST' && url.endsWith('/chat/completions')) {
      return new Response(JSON.stringify({
        id: 'mock-response',
        choices: [{ message: { content: 'mocked provider response' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const messages = [{ role: 'user' as const, content: 'test request' }];

  const discoveredModelResult = await executeThroughProviderRegistry({
    model: 'qwen-dynamic',
    messages,
  });
  assert.equal(discoveredModelResult.provider, 'meta', 'provider discovery can authorize a model absent from the static adapter list');
  assert.equal(discoveredModelResult.response?.model, 'qwen-dynamic');
  const discoveredRequest = providerRequests.find((request) =>
    request.method === 'POST' && request.body?.model === 'qwen-dynamic'
  );
  assert.ok(discoveredRequest, 'the explicit discovered model must reach the provider unchanged');

  const beforeCapabilityMismatch = providerRequests.filter((request) => request.method === 'POST').length;
  const capabilityMismatch = await executeThroughProviderRegistry({
    requiredProvider: 'meta',
    capability: 'image-generation',
    model: 'auto',
    messages,
  });
  assert.equal(capabilityMismatch.provider, 'provider-registry-exhausted');
  assert.ok(
    capabilityMismatch.errors.some((error) => error.includes('does not advertise requested capability "image-generation"')),
    'a required provider without the requested capability must report a capability mismatch, not an authorization failure',
  );
  assert.equal(
    providerRequests.filter((request) => request.method === 'POST').length,
    beforeCapabilityMismatch,
    'a provider capability mismatch must fail before inference',
  );

  const beforeUnsupported = providerRequests.filter((request) => request.method === 'POST').length;
  const unsupportedModelResult = await executeThroughProviderRegistry({
    model: 'not-advertised',
    messages,
  });
  const afterUnsupported = providerRequests.filter((request) => request.method === 'POST').length;
  assert.equal(unsupportedModelResult.provider, 'provider-registry-exhausted');
  assert.ok(unsupportedModelResult.errors.some((error) => error.includes('not advertised')));
  assert.equal(afterUnsupported, beforeUnsupported, 'an unsupported explicit model must not reach any provider adapter');

  const autoResult = await executeThroughProviderRegistry({
    model: 'auto',
    messages,
  });
  assert.equal(autoResult.provider, 'meta', 'auto should route through the available configured provider');
  assert.equal(autoResult.response?.model, 'meta-default');
  const autoRequest = providerRequests.find((request) =>
    request.method === 'POST' && request.body?.model === 'meta-default'
  );
  assert.ok(autoRequest, 'auto must use the configured provider model rather than the literal auto sentinel');

  const beforeStrictOpenAI = providerRequests.length;
  const strictOpenAIResult = await executeThroughProviderRegistry({
    requiredProvider: 'openai',
    model: 'auto',
    messages,
  });
  assert.equal(strictOpenAIResult.provider, 'provider-registry-exhausted');
  assert.deepEqual(strictOpenAIResult.attemptedProviders, [], 'strict provider constraints must not fall back to another connected provider');
  assert.ok(strictOpenAIResult.errors.some((error) => error.toLowerCase().includes('openai') && error.toLowerCase().includes('required provider')));
  assert.equal(strictOpenAIResult.providerStatuses.openai, 'unavailable');
  assert.equal(
    providerRequests.length,
    beforeStrictOpenAI,
    'an unavailable required provider must fail fast without refreshing or probing alternate providers',
  );

  process.env.META_AUTHORIZED = 'false';
  await discoverGlobalProviders('provider-registry-unauthorized-regression', { persistConnections: false });
  const beforeUnauthorizedDynamicModel = providerRequests.filter((request) => request.method === 'POST').length;
  const unauthorizedDynamicModel = await executeThroughProviderRegistry({ model: 'qwen-dynamic', messages });
  assert.equal(unauthorizedDynamicModel.provider, 'provider-registry-exhausted');
  assert.equal(
    providerRequests.filter((request) => request.method === 'POST').length,
    beforeUnauthorizedDynamicModel,
    'a discovered dynamic model must not execute when its provider authorization is revoked',
  );
  const beforeUnauthorizedMeta = providerRequests.length;
  const strictMetaResult = await executeThroughProviderRegistry({
    requiredProvider: 'meta',
    model: 'auto',
    messages,
  });
  assert.equal(strictMetaResult.provider, 'provider-registry-exhausted');
  assert.ok(strictMetaResult.errors.some((error) => error.toLowerCase().includes('meta') && error.toLowerCase().includes('required provider')));
  assert.equal(strictMetaResult.providerStatuses.meta, 'unavailable');
  assert.equal(
    providerRequests.length,
    beforeUnauthorizedMeta,
    'a connected but unauthorized required provider must not refresh or execute through another provider',
  );

  assert.equal(
    providerRequests.some((request) => request.body?.model === 'auto'),
    false,
    'the auto sentinel must never be sent to a provider',
  );
} finally {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log('provider registry routing integration tests: PASS');
