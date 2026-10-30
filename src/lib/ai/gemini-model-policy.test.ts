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

console.log('Gemini model policy tests: PASS');
