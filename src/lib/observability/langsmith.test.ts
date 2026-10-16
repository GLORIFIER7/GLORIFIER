import assert from 'node:assert/strict';
import { withLangSmithTrace } from './langsmith';
import { buildProviderRegistryTraceInputs, executeThroughProviderRegistry, summarizeProviderRegistryTrace } from '../ai/registry';

async function main() {
  const originalEnv = {
    tracing: process.env.LANGSMITH_TRACING,
    key: process.env.LANGSMITH_API_KEY,
    endpoint: process.env.LANGSMITH_ENDPOINT,
    project: process.env.LANGSMITH_PROJECT,
    workspace: process.env.LANGSMITH_WORKSPACE_ID,
  };
  const originalFetch = globalThis.fetch;
  const restore = () => {
    for (const [key, value] of Object.entries({
      LANGSMITH_TRACING: originalEnv.tracing,
      LANGSMITH_API_KEY: originalEnv.key,
      LANGSMITH_ENDPOINT: originalEnv.endpoint,
      LANGSMITH_PROJECT: originalEnv.project,
      LANGSMITH_WORKSPACE_ID: originalEnv.workspace,
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

    // Exercise the real registry-to-trace boundary with no provider attempts.
    // Any future addition of raw prompts, outputs, errors, or arbitrary IDs to
    // the actual registry trace payload must fail this test.
    await executeThroughProviderRegistry({
      messages: [{ role: 'user', content: privateMarker }],
      model: privateMarker,
      capability: privateMarker,
      preferredProvider: 'openai',
      policy: { maxAttempts: 0, maxDiscoveryRefreshes: 0, refreshDiscoveryBeforeExhaustion: true },
    });
    const realRegistryTrace = JSON.stringify(capturedBody);
    assert.equal(realRegistryTrace.includes(privateMarker), false,
      'actual registry telemetry must never include prompt/model/capability markers');
    assert.ok(capturedBody && capturedBody.inputs.messageCount === 1,
      'actual registry telemetry should contain only the safe message count');
    assert.ok(capturedBody && !JSON.stringify(capturedBody.outputs || {}).includes(privateMarker),
      'actual registry output summary must not expose private response/error markers');

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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
