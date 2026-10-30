import { strict as assert } from 'node:assert';
import { resolveGeminiModelCandidates } from './providers/gemini.ts';

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
