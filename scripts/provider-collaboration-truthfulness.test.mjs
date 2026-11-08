import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('work-together UI labels provider requests and reports agreement as unmeasured', () => {
  const studio = read('../src/components/WorkTogetherWithGptStudio.tsx');

  assert.match(studio, /OpenAI \+ Google Gemini provider requests/);
  assert.match(studio, /agreement NOT MEASURED/i);
  assert.match(studio, /cryptographic review NOT VERIFIED/i);

  for (const unsupportedLabel of [
    /OpenAI GPT-4o/,
    /Google Gemini 3\.8 Flash/,
    /Dual-Consensus/,
    /Cryptographic Cross-Audit/,
    /JOINT CO-AUTHORED ARTIFACT/i,
    /INDIVIDUAL MODEL CONTRIBUTIONS/i,
    /Dual-Model Cross-Validation Enclave/,
    /co-signed by GPT-4o/i,
  ]) {
    assert.doesNotMatch(studio, unsupportedLabel, 'unsupported static collaboration label remains visible');
  }
});

test('work-together backend requires separate provider responses and does not claim consensus or joint authorship', () => {
  const server = read('../server.ts');
  const start = server.indexOf("app.post('/api/ai/work-together-gpt'");
  const boundary = '\n// =========================================================================\n// 24/7 Standing Continuous Co-Working Autopilot Engine';
  const end = server.indexOf(boundary, start);
  assert.ok(start >= 0 && end > start, 'work-together route must end before the 24/7 engine section');
  const route = server.slice(start, end);

  assert.match(route, /requiredProvider: 'openai'/);
  assert.match(route, /requiredProvider: 'gemini'/);
  assert.match(route, /consensusScore: null/);
  assert.match(route, /consensusStatus: 'NOT MEASURED'/);
  assert.match(route, /actual returned model/);
  assert.match(route, /No agreement or verification is asserted unless both providers actually responded/);
  assert.match(route, /Provider Collaboration Output/);
  assert.doesNotMatch(route, /Joint Co-Authored Artifact/);
});
