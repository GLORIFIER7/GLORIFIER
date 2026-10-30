import { strict as assert } from 'node:assert';
import { OpenAICompatibleProvider } from './openai-compatible.ts';

const envKeys = ['GLR_TEST_OPENAI_KEY', 'GLR_TEST_OPENAI_BASE', 'GLR_TEST_OPENAI_MODEL'];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const previousFetch = globalThis.fetch;
try {
  process.env.GLR_TEST_OPENAI_KEY = 'test-key';
  process.env.GLR_TEST_OPENAI_BASE = 'https://provider.invalid/v1';
  process.env.GLR_TEST_OPENAI_MODEL = 'configured-default-model';
  let capturedInit: RequestInit | undefined;
  let capturedBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input, init) => {
    capturedInit = init;
    capturedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      id: 'test-response',
      choices: [{ message: { content: 'provider abort signal forwarded' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const abortController = new AbortController();
  const provider = new OpenAICompatibleProvider({
    id: 'openai',
    name: 'OpenAI test adapter',
    apiKeyEnv: 'GLR_TEST_OPENAI_KEY',
    baseUrlEnv: 'GLR_TEST_OPENAI_BASE',
    modelEnv: 'GLR_TEST_OPENAI_MODEL',
  });
  const response = await provider.generate({
    messages: [{ role: 'user', content: 'Verify exact model and abort signal.' }],
    model: 'explicit-selected-model',
    signal: abortController.signal,
  });
  assert.equal(response.model, 'explicit-selected-model');
  assert.equal(capturedBody?.model, 'explicit-selected-model');
  assert.equal(capturedInit?.signal, abortController.signal);
} finally {
  globalThis.fetch = previousFetch;
  for (const key of envKeys) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
}

console.log('Provider abort forwarding tests: PASS');
