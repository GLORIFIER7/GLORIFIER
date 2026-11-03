import assert from 'node:assert/strict';
import { withLangSmithTrace } from './langsmith';
import { buildProviderRegistryTraceInputs, executeThroughProviderRegistry, summarizeProviderRegistryTrace } from '../ai/registry';
import { discoverGlobalProviders } from '../ai/provider-discovery';
import { test } from 'node:test';

test('langsmith regression suite', async () => {
async function main() {
  const originalEnv = {
    tracing: process.env.LANGSMITH_TRACING,
    key: process.env.LANGSMITH_API_KEY,
    endpoint: process.env.LANGSMITH_ENDPOINT,
    project: process.env.LANGSMITH_PROJECT,
    workspace: process.env.LANGSMITH_WORKSPACE_ID,
    providerEnv: Object.fromEntries([
      'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'OPENAI_AUTHORIZED',
      'META_API_KEY', 'META_BASE_URL', 'META_MODEL',
      'XAI_API_KEY', 'XAI_BASE_URL', 'XAI_MODEL',
      'MISTRAL_API_KEY', 'MISTRAL_BASE_URL', 'MISTRAL_MODEL',
      'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL',
      'QWEN_API_KEY', 'QWEN_BASE_URL', 'QWEN_MODEL',
      'NVIDIA_API_KEY', 'NVIDIA_BASE_URL', 'NVIDIA_MODEL',
      'GROQ_API_KEY', 'GROQ_BASE_URL', 'GROQ_MODEL',
      'TOGETHER_API_KEY', 'TOGETHER_BASE_URL', 'TOGETHER_MODEL',
      'OPENROUTER_API_KEY', 'OPENROUTER_BASE_URL', 'OPENROUTER_MODEL',
      'FIREWORKS_API_KEY', 'FIREWORKS_BASE_URL', 'FIREWORKS_MODEL',
    ].map((key) => [key, process.env[key]])),
  };
  const originalFetch = globalThis.fetch;
  const restore = () => {
    for (const [key, value] of Object.entries({
      LANGSMITH_TRACING: originalEnv.tracing,
      LANGSMITH_API_KEY: originalEnv.key,
      LANGSMITH_ENDPOINT: originalEnv.endpoint,
      LANGSMITH_PROJECT: originalEnv.project,
      LANGSMITH_WORKSPACE_ID: originalEnv.workspace,
      ...originalEnv.providerEnv,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    globalThis.fetch = originalFetch;
  };

  try {
    let calls = 0;
    process.env.LANGSMITH_TRACING = 'false';
    process.env.LANGSMITH_API_KEY = 'test-key';
    globalThis.fetch = (async () => { calls++; return new Response(null, { status: 202 }); }) as typeof fetch;
    assert.equal(await withLangSmithTrace('disabled', {}, async () => 'ok'), 'ok');
    assert.equal(calls, 0, 'disabled tracing must not send a request');

    process.env.LANGSMITH_TRACING = 'true';
    delete process.env.LANGSMITH_ENDPOINT;
    process.env.LANGSMITH_PROJECT = 'GLORIFIER-test';
    process.env.LANGSMITH_WORKSPACE_ID = 'workspace-test';
    let capturedUrl = '';
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody: Record<string, any> | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
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
    assert.ok(capturedBody, 'trace payload should be captured');
    assert.equal(capturedBody.session_name, 'GLORIFIER-test');
    assert.equal(capturedBody.inputs.messageCount, 1);
    assert.equal(JSON.stringify(capturedBody).includes('PRIVATE MODEL OUTPUT'), false);
    assert.equal(JSON.stringify(capturedBody).includes('PRIVATE ERROR'), false);

    const privateMarker = 'PRIVATE_MARKER_DO_NOT_TRANSMIT';
    const registryInputs = buildProviderRegistryTraceInputs({
      messages: [{ role: 'user', content: privateMarker }],
      model: privateMarker,
      capability: privateMarker,
      preferredProvider: 'openai',
      policy: { refreshDiscoveryBeforeExhaustion: false, maxDiscoveryRefreshes: 0, retryTransientFailures: false, maxAttempts: 1 },
    } as any);
    const registrySummary = summarizeProviderRegistryTrace({
      provider: privateMarker,
      attemptedProviders: [privateMarker, 'openai'],
      providerStatuses: { [privateMarker]: 'error', openai: 'connected' },
      errors: [privateMarker],
      response: { text: privateMarker },
    } as any);
    const registryTrace = JSON.stringify({ inputs: registryInputs, outputs: registrySummary });
    assert.equal(registryTrace.includes(privateMarker), false, 'registry metadata must exclude prompt, output, error, and arbitrary identifiers');
    assert.equal(registrySummary.errorCount, 1);
    assert.deepEqual(registrySummary.attemptedProviders, ['unknown', 'openai']);

    // Exercise the actual provider registry, not a mocked registry result.
    // The mock returns a private output on the first provider call and a private
    // provider error on the second; only LangSmith submission payloads are checked.
    const providerEnvKeys = Object.keys(originalEnv.providerEnv);
    for (const key of providerEnvKeys) delete process.env[key];
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.OPENAI_MODEL = 'gpt-4o';
    process.env.OPENAI_AUTHORIZED = 'true';
    const providerCalls: string[] = [];
    const tracePayloads: Record<string, any>[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      const url = String(input);
      if (url.endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }] }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/chat/completions')) {
        providerCalls.push(url);
        if (providerCalls.length === 1) {
          return new Response(JSON.stringify({
            id: 'private-request-id',
            choices: [{ message: { content: 'PRIVATE MODEL OUTPUT' } }],
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('PRIVATE ERROR RESPONSE', { status: 500 });
      }
      capturedUrl = url;
      capturedHeaders = init?.headers;
      const body = JSON.parse(String(init?.body));
      capturedBody = body;
      tracePayloads.push(body);
      return new Response(null, { status: 202 });
    }) as typeof fetch;

    await discoverGlobalProviders('langsmith-regression-test', { persistConnections: false });
    const actualSuccess = await executeThroughProviderRegistry({
      messages: [{ role: 'user', content: privateMarker }],
      model: 'gpt-4o',
      preferredProvider: 'openai',
      policy: { refreshDiscoveryBeforeExhaustion: false, maxDiscoveryRefreshes: 0, retryTransientFailures: false, maxAttempts: 1 },
    } as any);
    assert.equal(actualSuccess.provider, 'openai');
    assert.equal(actualSuccess.response?.text, 'PRIVATE MODEL OUTPUT');
    assert.ok(tracePayloads.length >= 1, 'successful real provider execution must submit metadata trace');

    const tracesBeforeFailure = tracePayloads.length;
    const actualFailure = await executeThroughProviderRegistry({
      messages: [{ role: 'user', content: privateMarker }],
      model: 'gpt-4o',
      preferredProvider: 'openai',
      policy: { refreshDiscoveryBeforeExhaustion: false, maxDiscoveryRefreshes: 0, retryTransientFailures: false, maxAttempts: 1 },
    } as any);
    assert.equal(actualFailure.provider, 'provider-registry-exhausted');
    assert.ok(actualFailure.errors.length > 0, 'failed real provider attempt should be recorded in execution result');
    assert.ok(tracePayloads.length > tracesBeforeFailure, 'failed real provider execution must submit metadata trace');

    for (const payload of tracePayloads) {
      const outbound = JSON.stringify(payload);
      assert.equal(outbound.includes(privateMarker), false, 'trace must not contain private prompts');
      assert.equal(outbound.includes('PRIVATE MODEL OUTPUT'), false, 'trace must not contain private provider outputs');
      assert.equal(outbound.includes('PRIVATE ERROR RESPONSE'), false, 'trace must not contain raw provider errors');
      assert.equal(outbound.includes('test-openai-key'), false, 'trace must not contain provider credentials');
      assert.equal(payload.inputs.messageCount, 1);
      assert.deepEqual(payload.outputs.attemptedProviders, ['openai']);
    }

    const summarizedResult = await withLangSmithTrace(
      'summarizer-failure',
      {},
      async () => 'inference-still-successful',
      () => { throw new Error(privateMarker); },
    );
    assert.equal(summarizedResult, 'inference-still-successful', 'telemetry summarizer failure must not break inference');

    const beforeInvalidEndpoint = calls;
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
    assert.equal(calls, beforeInvalidEndpoint, 'unapproved or credential-bearing endpoints must not receive credentials');

    process.env.LANGSMITH_ENDPOINT = 'https://api.smith.langchain.com';
    globalThis.fetch = (async () => { throw new Error('network failure'); }) as typeof fetch;
    assert.equal(await withLangSmithTrace('best-effort', {}, async () => 'inference-ok'), 'inference-ok');
  } finally {
    restore();
  }
  console.log('LangSmith metadata-only tracing tests passed.');
}
await main();

});
