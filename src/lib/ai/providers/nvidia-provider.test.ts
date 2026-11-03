import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { getProvider } from '../registry';

const MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b';
const originalKey = process.env.NVIDIA_API_KEY;
const originalBaseUrl = process.env.NVIDIA_BASE_URL;
const originalModel = process.env.NVIDIA_MODEL;
const originalFetch = globalThis.fetch;

after(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = originalKey;
  if (originalBaseUrl === undefined) delete process.env.NVIDIA_BASE_URL; else process.env.NVIDIA_BASE_URL = originalBaseUrl;
  if (originalModel === undefined) delete process.env.NVIDIA_MODEL; else process.env.NVIDIA_MODEL = originalModel;
});

test('NVIDIA provider uses its configured model and API endpoint with mocked inference', async () => {
  process.env.NVIDIA_API_KEY = 'test-nvidia-key';
  process.env.NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
  delete process.env.NVIDIA_MODEL;
  const provider = getProvider('nvidia');
  assert.equal(provider.status(), 'connected');
  assert.deepEqual(provider.models(), [MODEL]);
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({
      id: 'chatcmpl-test',
      choices: [{ message: { content: 'OK' } }],
      usage: { prompt_tokens: 8, completion_tokens: 1, total_tokens: 9 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const response = await provider.generate({ messages: [{ role: 'user', content: 'Connectivity test' }], maxTokens: 8 });
  assert.equal(capturedUrl, 'https://integrate.api.nvidia.com/v1/chat/completions');
  assert.equal(response.provider, 'nvidia');
  assert.equal(response.model, MODEL);
  assert.equal(response.text, 'OK');
  assert.equal((capturedInit?.headers as Record<string, string>)?.Authorization, 'Bearer test-nvidia-key');
  assert.equal(JSON.parse(String(capturedInit?.body)).model, MODEL);
});
