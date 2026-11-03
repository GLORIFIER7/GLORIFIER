import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { executeThroughProviderRegistry } from './registry.ts';
import { discoverGlobalProviders } from './provider-discovery.ts';

const envKeys = [
  'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'OPENAI_AUTHORIZED',
  'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'META_API_KEY', 'META_BASE_URL', 'META_MODEL', 'META_AUTHORIZED',
  'XAI_API_KEY', 'MISTRAL_API_KEY', 'DEEPSEEK_API_KEY', 'QWEN_API_KEY', 'NVIDIA_API_KEY', 'GROQ_API_KEY',
  'TOGETHER_API_KEY', 'FIREWORKS_API_KEY', 'OPENROUTER_API_KEY', 'HF_TOKEN', 'LLMSRELAY_API_KEY',
  'OLLAMA_AUTH_TOKEN', 'LANGSMITH_TRACING',
] as const;
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]] as const));
const originalFetch = globalThis.fetch;
const providerRequests: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
let metaModelListStatus = 200;
const messages = [{ role: 'user' as const, content: 'test request' }];

before(() => {
  for (const key of envKeys) delete process.env[key];
  process.env.META_API_KEY = 'test-meta-key';
  process.env.META_BASE_URL = 'https://meta.example.test/v1';
  process.env.META_MODEL = 'meta-default';
  process.env.META_AUTHORIZED = 'true';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method || 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    providerRequests.push({ method, url, body });
    if (method === 'GET' && url.endsWith('/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'meta-default' }, { id: 'qwen-dynamic' }] }), {
        status: metaModelListStatus, headers: { 'content-type': 'application/json' },
      });
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
});

after(() => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    const previous = originalEnv.get(key);
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test('discovered models reach the configured provider unchanged', async () => {
  const result = await executeThroughProviderRegistry({ model: 'qwen-dynamic', messages });
  assert.equal(result.provider, 'meta');
  assert.equal(result.response?.model, 'qwen-dynamic');
  assert.ok(providerRequests.some((request) => request.method === 'POST' && request.body?.model === 'qwen-dynamic'));
});

test('provider capability mismatch fails before inference', async () => {
  const beforePosts = providerRequests.filter((request) => request.method === 'POST').length;
  const result = await executeThroughProviderRegistry({
    requiredProvider: 'meta', capability: 'image-generation', model: 'auto', messages,
  });
  assert.equal(result.provider, 'provider-registry-exhausted');
  assert.ok(result.errors.some((error) => error.includes('does not advertise requested capability "image-generation"')));
  assert.equal(providerRequests.filter((request) => request.method === 'POST').length, beforePosts);
});

test('unsupported explicit models are not sent to adapters', async () => {
  const beforePosts = providerRequests.filter((request) => request.method === 'POST').length;
  const result = await executeThroughProviderRegistry({ model: 'not-advertised', messages });
  assert.equal(result.provider, 'provider-registry-exhausted');
  assert.ok(result.errors.some((error) => error.includes('not advertised')));
  assert.equal(providerRequests.filter((request) => request.method === 'POST').length, beforePosts);
});

test('automatic routing selects the configured model, never the auto sentinel', async () => {
  const result = await executeThroughProviderRegistry({ model: 'auto', messages });
  assert.equal(result.provider, 'meta');
  assert.equal(result.response?.model, 'meta-default');
  assert.ok(providerRequests.some((request) => request.method === 'POST' && request.body?.model === 'meta-default'));
  assert.equal(providerRequests.some((request) => request.body?.model === 'auto'), false);
});

test('required unavailable providers fail fast without alternate egress', async () => {
  const beforeRequests = providerRequests.length;
  const result = await executeThroughProviderRegistry({ requiredProvider: 'openai', model: 'auto', messages });
  assert.equal(result.provider, 'provider-registry-exhausted');
  assert.deepEqual(result.attemptedProviders, []);
  assert.ok(result.errors.some((error) => error.toLowerCase().includes('openai') && error.toLowerCase().includes('required provider')));
  assert.equal(result.providerStatuses.openai, 'unavailable');
  assert.equal(providerRequests.length, beforeRequests);
});

test('revoked provider authorization blocks dynamic and required model execution', async () => {
  process.env.META_AUTHORIZED = 'false';
  await discoverGlobalProviders('provider-registry-unauthorized-regression', { persistConnections: false });
  const beforePosts = providerRequests.filter((request) => request.method === 'POST').length;
  const dynamic = await executeThroughProviderRegistry({ model: 'qwen-dynamic', messages });
  assert.equal(dynamic.provider, 'provider-registry-exhausted');
  assert.equal(providerRequests.filter((request) => request.method === 'POST').length, beforePosts);
  const beforeRequests = providerRequests.length;
  const required = await executeThroughProviderRegistry({ requiredProvider: 'meta', model: 'auto', messages });
  assert.equal(required.provider, 'provider-registry-exhausted');
  assert.ok(required.errors.some((error) => error.toLowerCase().includes('meta') && error.toLowerCase().includes('required provider')));
  assert.equal(required.providerStatuses.meta, 'unavailable');
  assert.equal(providerRequests.length, beforeRequests);
});

test('failed model-list discovery status blocks inference despite configured authorization', async () => {
  process.env.META_AUTHORIZED = 'true';
  for (const status of [400, 429, 503]) {
    metaModelListStatus = status;
    await discoverGlobalProviders(`provider-registry-model-list-${status}-regression`, { persistConnections: false });
    const beforePosts = providerRequests.filter((request) => request.method === 'POST').length;
    const result = await executeThroughProviderRegistry({ requiredProvider: 'meta', model: 'auto', messages });
    assert.equal(result.provider, 'provider-registry-exhausted');
    assert.equal(providerRequests.filter((request) => request.method === 'POST').length, beforePosts);
  }
  metaModelListStatus = 200;
});
