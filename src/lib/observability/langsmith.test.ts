import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { withLangSmithTrace } from './langsmith';
import {
  buildProviderRegistryTraceInputs,
  executeThroughProviderRegistry,
  summarizeProviderRegistryTrace,
} from '../ai/registry';
import { discoverGlobalProviders } from '../ai/provider-discovery';

const providerEnvKeys = [
  'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'OPENAI_AUTHORIZED',
  'META_API_KEY', 'META_BASE_URL', 'META_MODEL', 'XAI_API_KEY', 'XAI_BASE_URL', 'XAI_MODEL',
  'MISTRAL_API_KEY', 'MISTRAL_BASE_URL', 'MISTRAL_MODEL', 'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL',
  'QWEN_API_KEY', 'QWEN_BASE_URL', 'QWEN_MODEL', 'NVIDIA_API_KEY', 'NVIDIA_BASE_URL', 'NVIDIA_MODEL',
  'GROQ_API_KEY', 'GROQ_BASE_URL', 'GROQ_MODEL', 'TOGETHER_API_KEY', 'TOGETHER_BASE_URL', 'TOGETHER_MODEL',
  'OPENROUTER_API_KEY', 'OPENROUTER_BASE_URL', 'OPENROUTER_MODEL', 'FIREWORKS_API_KEY', 'FIREWORKS_BASE_URL', 'FIREWORKS_MODEL',
];
const environmentKeys = [
  'LANGSMITH_TRACING', 'LANGSMITH_API_KEY', 'LANGSMITH_ENDPOINT', 'LANGSMITH_PROJECT', 'LANGSMITH_WORKSPACE_ID',
  ...providerEnvKeys,
];
const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]] as const));
const originalFetch = globalThis.fetch;
const policy = { refreshDiscoveryBeforeExhaustion: false, maxDiscoveryRefreshes: 0, retryTransientFailures: false, maxAttempts: 1 };

beforeEach(() => {
  for (const key of environmentKeys) delete process.env[key];
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  for (const key of environmentKeys) {
    const value = originalEnvironment.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
});

function configureTracing() {
  process.env.LANGSMITH_TRACING = 'true';
  process.env.LANGSMITH_API_KEY = 'test-key';
  process.env.LANGSMITH_PROJECT = 'GLORIFIER-test';
  process.env.LANGSMITH_WORKSPACE_ID = 'workspace-test';
}

function configureOpenAI() {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.OPENAI_MODEL = 'gpt-4o';
  process.env.OPENAI_AUTHORIZED = 'true';
}

function createProviderTraceFetch(outcome: 'success' | 'failure') {
  const providerCalls: string[] = [];
  const tracePayloads: Record<string, any>[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/chat/completions')) {
      providerCalls.push(url);
      if (outcome === 'success') {
        return new Response(JSON.stringify({
          id: 'private-request-id',
          choices: [{ message: { content: 'PRIVATE MODEL OUTPUT' } }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('PRIVATE ERROR RESPONSE', { status: 500 });
    }
    const payload = JSON.parse(String(init?.body));
    tracePayloads.push(payload);
    return new Response(null, { status: 202 });
  };
  return { fetcher, providerCalls, tracePayloads };
}

async function runProviderRegistry(outcome: 'success' | 'failure') {
  const privateMarker = 'PRIVATE_MARKER_DO_NOT_TRANSMIT';
  configureTracing();
  configureOpenAI();
  const { fetcher, providerCalls, tracePayloads } = createProviderTraceFetch(outcome);
  globalThis.fetch = fetcher;
  await discoverGlobalProviders('langsmith-regression-test-' + outcome, { persistConnections: false });
  const result = await executeThroughProviderRegistry({
    messages: [{ role: 'user', content: privateMarker }],
    model: 'gpt-4o',
    preferredProvider: 'openai',
    policy,
  } as any);
  return { result, providerCalls, tracePayloads, privateMarker };
}

test('disabled LangSmith tracing does not send telemetry requests', async () => {
  process.env.LANGSMITH_TRACING = 'false';
  process.env.LANGSMITH_API_KEY = 'test-key';
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return new Response(null, { status: 202 }); }) as typeof fetch;
  assert.equal(await withLangSmithTrace('disabled', {}, async () => 'ok'), 'ok');
  assert.equal(calls, 0);
});

test('LangSmith submits minimal redacted metadata and approved workspace headers', async () => {
  configureTracing();
  let capturedUrl = '';
  let capturedHeaders: HeadersInit | undefined;
  let capturedBody: Record<string, any> | undefined;
  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedHeaders = init?.headers;
    capturedBody = JSON.parse(String(init?.body));
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  const result = await withLangSmithTrace(
    'provider-registry',
    { messageCount: 1, roles: ['user'] },
    async () => ({ provider: 'mock', text: 'PRIVATE MODEL OUTPUT', errors: ['PRIVATE ERROR'] }),
    (value) => ({ provider: value.provider, success: true }),
  );
  assert.equal(result.provider, 'mock');
  assert.equal(capturedUrl, 'https://api.smith.langchain.com/runs');
  assert.equal(new Headers(capturedHeaders).get('x-api-key'), 'test-key');
  assert.equal(new Headers(capturedHeaders).get('x-tenant-id'), 'workspace-test');
  assert.ok(capturedBody);
  assert.equal(capturedBody.session_name, 'GLORIFIER-test');
  assert.equal(capturedBody.inputs.messageCount, 1);
  assert.equal(JSON.stringify(capturedBody).includes('PRIVATE MODEL OUTPUT'), false);
  assert.equal(JSON.stringify(capturedBody).includes('PRIVATE ERROR'), false);
});

test('provider registry trace summaries exclude prompts, outputs, errors and arbitrary identifiers', () => {
  const marker = 'PRIVATE_MARKER_DO_NOT_TRANSMIT';
  const inputs = buildProviderRegistryTraceInputs({
    messages: [{ role: 'user', content: marker }], model: marker, capability: marker,
    preferredProvider: 'openai', policy,
  } as any);
  const summary = summarizeProviderRegistryTrace({
    provider: marker, attemptedProviders: [marker, 'openai'],
    providerStatuses: { [marker]: 'error', openai: 'connected' }, errors: [marker], response: { text: marker },
  } as any);
  assert.equal(JSON.stringify({ inputs, outputs: summary }).includes(marker), false);
  assert.equal(summary.errorCount, 1);
  assert.deepEqual(summary.attemptedProviders, ['unknown', 'openai']);
});

test('successful real provider execution submits metadata without private model output', async () => {
  const { result, tracePayloads, privateMarker } = await runProviderRegistry('success');
  assert.equal(result.provider, 'openai');
  assert.equal(result.response?.text, 'PRIVATE MODEL OUTPUT');
  assert.ok(tracePayloads.length >= 1);
  for (const payload of tracePayloads) {
    const outbound = JSON.stringify(payload);
    assert.equal(outbound.includes(privateMarker), false);
    assert.equal(outbound.includes('PRIVATE MODEL OUTPUT'), false);
    assert.equal(outbound.includes('test-openai-key'), false);
    assert.equal(payload.inputs.messageCount, 1);
    assert.deepEqual(payload.outputs.attemptedProviders, ['openai']);
  }
});

test('failed real provider execution submits metadata without raw provider errors', async () => {
  const { result, tracePayloads, privateMarker } = await runProviderRegistry('failure');
  assert.equal(result.provider, 'provider-registry-exhausted');
  assert.ok(result.errors.length > 0);
  assert.ok(tracePayloads.length > 0);
  for (const payload of tracePayloads) {
    const outbound = JSON.stringify(payload);
    assert.equal(outbound.includes(privateMarker), false);
    assert.equal(outbound.includes('PRIVATE ERROR RESPONSE'), false);
    assert.equal(outbound.includes('test-openai-key'), false);
    assert.deepEqual(payload.outputs.attemptedProviders, ['openai']);
  }
});

test('telemetry summarizer failures do not break inference', async () => {
  configureTracing();
  const result = await withLangSmithTrace(
    'summarizer-failure', {}, async () => 'inference-still-successful',
    () => { throw new Error('PRIVATE_MARKER_DO_NOT_TRANSMIT'); },
  );
  assert.equal(result, 'inference-still-successful');
});

test('unapproved LangSmith endpoints do not receive credentials', async () => {
  configureTracing();
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return new Response(null, { status: 202 }); }) as typeof fetch;
  for (const endpoint of [
    'https://attacker.example',
    'https://user:password@api.smith.langchain.com',
    'https://api.smith.langchain.com/?tenant=untrusted',
    'https://api.smith.langchain.com/#fragment',
    'https://api.smith.langchain.com:8443',
  ]) {
    process.env.LANGSMITH_ENDPOINT = endpoint;
    await withLangSmithTrace('invalid-endpoint', {}, async () => 'still works');
  }
  assert.equal(calls, 0);
});

test('LangSmith network failure remains best-effort for inference', async () => {
  configureTracing();
  process.env.LANGSMITH_ENDPOINT = 'https://api.smith.langchain.com';
  globalThis.fetch = (async () => { throw new Error('network failure'); }) as typeof fetch;
  assert.equal(await withLangSmithTrace('best-effort', {}, async () => 'inference-ok'), 'inference-ok');
});
