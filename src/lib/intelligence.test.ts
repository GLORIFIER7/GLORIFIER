import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJson } from './intelligence';

test('valid raw JSON preserves triple-backtick values inside report fields', () => {
  const expected = {
    executiveSummary: 'Retain the inline code marker ```typescript and its report context.',
    themes: [{ theme: 'Code samples', evidenceIds: ['evidence-1'], summary: 'The fenced text is data.' }],
    disagreements: [],
  };

  assert.deepEqual(parseJson(JSON.stringify(expected), {}), expected);
});

test('Markdown-fenced JSON is parsed when the response is not raw JSON', () => {
  const expected = { executiveSummary: 'A valid report', themes: [], disagreements: [] };
  const response = [
    'Here is the requested report:',
    '```json',
    JSON.stringify(expected),
    '```',
    '',
  ].join('\n');

  assert.deepEqual(parseJson(response, {}), expected);
});

test('invalid JSON returns the caller-provided fallback', () => {
  const fallback = { executiveSummary: 'fallback' };
  assert.deepEqual(parseJson('not JSON or a fenced JSON value', fallback), fallback);
});
