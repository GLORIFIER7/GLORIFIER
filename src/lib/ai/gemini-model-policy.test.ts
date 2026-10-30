import { strict as assert } from 'node:assert';
import { GeminiProvider, resolveGeminiModelCandidates } from './providers/gemini.ts';

assert.deepEqual(
  resolveGeminiModelCandidates('gemini-explicit-model', 'gemini-configured-model'),
  ['gemini-explicit-model'],
  'an explicit model request must never silently switch to a different Gemini model',
);
assert.deepEqual(
  resolveGeminiModelCandidates(undefined, 'gemini-configured-model'),
  ['gemini-configured-model'],
  'automatic routing must use the configured provider model without hidden model fallback',
);
assert.deepEqual(
  resolveGeminiModelCandidates('auto', 'gemini-configured-model'),
  ['gemini-configured-model'],
  'the auto sentinel must defer model selection to Gemini configuration',
);
assert.deepEqual(resolveGeminiModelCandidates('', 'gemini-configured-model'), ['gemini-configured-model']);
assert.deepEqual(resolveGeminiModelCandidates('   ', 'gemini-configured-model'), ['gemini-configured-model']);
assert.deepEqual(resolveGeminiModelCandidates('AUTO', 'gemini-configured-model'), ['gemini-configured-model']);
assert.deepEqual(resolveGeminiModelCandidates(undefined, 'AUTO'), ['gemini-3.1-flash-lite']);
assert.deepEqual(resolveGeminiModelCandidates(undefined, '  auto  '), ['gemini-3.1-flash-lite']);

console.log('Gemini model policy tests: PASS');

const previousGeminiKey = process.env.GEMINI_API_KEY;
const previousFetch = globalThis.fetch;
try {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  let capturedRequest: RequestInit | null = null;
  globalThis.fetch = (async (_input, init) => {
    capturedRequest = init;
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Gemini abort-signal test response' }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const abortController = new AbortController();
  const response = await new GeminiProvider().generate({
    messages: [{ role: 'user', content: 'Verify abort forwarding.' }],
    model: 'gemini-3.1-flash-lite',
    signal: abortController.signal,
  });
  assert.equal(response.provider, 'gemini');
  assert.equal((capturedRequest as RequestInit | null)?.signal, abortController.signal);
} finally {
  globalThis.fetch = previousFetch;
  if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previousGeminiKey;
}
