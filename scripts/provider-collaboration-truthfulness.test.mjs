import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const studio = read('../src/components/WorkTogetherWithGptStudio.tsx');
const server = read('../server.ts');

test('work-together UI labels provider requests and reports agreement as unmeasured', () => {
  assert.match(studio, /OpenAI provider request/);
  assert.match(studio, /Google Gemini provider request/);
  assert.match(studio, /agreement NOT MEASURED/i);
  assert.match(studio, /cryptographic review NOT VERIFIED/i);

  for (const unsupportedLabel of [
    /OpenAI GPT-4o/,
    /Google Gemini 3\.8 Flash/,
    /Dual-Consensus/,
    /Cryptographic Cross-Audit/,
    /JOINT CO-AUTHORED ARTIFACT/i,
    /INDIVIDUAL MODEL CONTRIBUTIONS/i,
  ]) {
    assert.doesNotMatch(studio, unsupportedLabel, 'unsupported static collaboration label remains visible');
  }
});

test('work-together backend requires separate provider responses and does not claim consensus', () => {
  const start = server.indexOf("app.post('/api/ai/work-together-gpt'");
  const end = server.indexOf('\napp.', start + 10);
  assert.ok(start >= 0 && end > start, 'work-together route must exist');
  const route = server.slice(start, end);

  assert.match(route, /requiredProvider: 'openai'/);
  assert.match(route, /requiredProvider: 'gemini'/);
  assert.match(route, /consensusScore: null/);
  assert.match(route, /consensusStatus: 'NOT MEASURED/);
  assert.match(route, /actual returned model/);
  assert.match(route, /No agreement or verification is asserted unless both providers actually responded/);
});
