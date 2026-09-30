import { strict as assert } from 'node:assert';
import { AnthropicProvider } from './anthropic';

const originalFetch = globalThis.fetch;
const originalKey = process.env.ANTHROPIC_API_KEY;
const originalModel = process.env.ANTHROPIC_MODEL;

try {
  delete process.env.ANTHROPIC_MODEL;
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

  const provider = new AnthropicProvider();
  assert.equal(provider.status(), 'connected');
  assert.deepEqual(provider.models(), ['claude-opus-5']);

  let captured: any = null;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured = init;
    return new Response(JSON.stringify({
      id: 'msg_test',
      content: [{ type: 'text', text: 'Claude test response' }],
      usage: { input_tokens: 12, output_tokens: 7 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const response = await provider.generate({
    messages: [
      { role: 'system', content: 'You are a governed assistant.' },
      { role: 'user', content: 'Return a test response.' },
    ],
    temperature: 0.2,
  });

  assert.equal(response.provider, 'anthropic');
  assert.equal(response.model, 'claude-opus-5');
  assert.equal(response.text, 'Claude test response');
  assert.equal(response.usage?.totalTokens, 19);

  const body = JSON.parse(String(captured?.body));
  assert.equal(body.model, 'claude-opus-5');
  assert.equal(body.system, 'You are a governed assistant.');
  assert.equal(body.messages[0].role, 'user');
  assert.equal(body.temperature, undefined);
  assert.equal(captured?.headers?.['x-api-key'], 'test-anthropic-key');

  globalThis.fetch = (async () => new Response('rate limited', { status: 429 })) as typeof fetch;
  await assert.rejects(
    () => provider.generate({ messages: [{ role: 'user', content: 'test' }] }),
    (error: any) => error?.providerAvailability === 'unavailable' && error?.unavailableReason === 'rate_limited'
  );

  console.log('Anthropic provider integration tests: PASS');
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.ANTHROPIC_MODEL;
  else process.env.ANTHROPIC_MODEL = originalModel;
}
