import assert from 'node:assert/strict';
import { GeminiProvider, resolveGeminiModelCandidates } from './providers/gemini.ts';
import test from 'node:test';

test('explicit and automatic Gemini model preferences resolve deterministically', () => {
  assert.deepEqual(resolveGeminiModelCandidates('gemini-explicit-model', 'gemini-configured-model'), ['gemini-explicit-model']);
  assert.deepEqual(resolveGeminiModelCandidates(undefined, 'gemini-configured-model'), ['gemini-configured-model']);
  assert.deepEqual(resolveGeminiModelCandidates('auto', 'gemini-configured-model'), ['gemini-configured-model']);
  assert.deepEqual(resolveGeminiModelCandidates('', 'gemini-configured-model'), ['gemini-configured-model']);
  assert.deepEqual(resolveGeminiModelCandidates('   ', 'gemini-configured-model'), ['gemini-configured-model']);
  assert.deepEqual(resolveGeminiModelCandidates('AUTO', 'gemini-configured-model'), ['gemini-configured-model']);
  assert.deepEqual(resolveGeminiModelCandidates(undefined, 'AUTO'), ['gemini-3.1-flash-lite']);
  assert.deepEqual(resolveGeminiModelCandidates(undefined, '  auto  '), ['gemini-3.1-flash-lite']);
});

test('Gemini provider registry exposes the concrete configured auto model', () => {
  const previousModel = process.env.GEMINI_MODEL;
  try {
    process.env.GEMINI_MODEL = 'auto';
    assert.deepEqual(new GeminiProvider().models(), ['gemini-3.1-flash-lite']);
  } finally {
    if (previousModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousModel;
  }
});

test('Gemini abort signal is forwarded and prevents retry', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  try {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    let observedSignal: AbortSignal | undefined;
    let fetchCallCount = 0;
    let notifyFetchStarted: (() => void) | undefined;
    const fetchStarted = new Promise<void>((resolve) => { notifyFetchStarted = resolve; });
    globalThis.fetch = (async (_input, init) => {
      fetchCallCount += 1;
      observedSignal = init?.signal as AbortSignal | undefined;
      notifyFetchStarted?.();
      return await new Promise<Response>((_resolve, reject) => {
        if (observedSignal?.aborted) {
          reject(new DOMException('Request aborted by test.', 'AbortError'));
          return;
        }
        observedSignal?.addEventListener('abort', () => reject(new DOMException('Request aborted by test.', 'AbortError')), { once: true });
      });
    }) as typeof fetch;
    const abortController = new AbortController();
    const generation = new GeminiProvider().generate({
      messages: [{ role: 'user', content: 'Verify abort forwarding.' }],
      model: 'gemini-3.1-flash-lite',
      signal: abortController.signal,
    });
    await fetchStarted;
    abortController.abort();
    assert.equal(observedSignal?.aborted, true);
    await assert.rejects(generation);
    assert.equal(fetchCallCount, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test('Gemini explicit model failure never falls back to a configured model', async () => {
  const previousModel = process.env.GEMINI_MODEL;
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  try {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GEMINI_MODEL = 'configured-fallback-model';
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({ error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } }), {
        status: 429, headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    await assert.rejects(new GeminiProvider().generate({
      messages: [{ role: 'user', content: 'Use only the explicitly requested model.' }],
      model: 'explicit-requested-model',
    }));
    assert.ok(requestedUrls.length >= 1);
    assert.ok(requestedUrls.every((url) => url.includes('explicit-requested-model')));
    assert.ok(requestedUrls.every((url) => !url.includes('configured-fallback-model')));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousModel;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
