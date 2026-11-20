import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeIntelligenceSynthesis, parseJson } from './intelligence';

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
test('Markdown-fenced JSON preserves backticks inside JSON string values', () => {
  const expected = {
    executiveSummary: 'Keep the marker ```typescript without truncating the report.',
    themes: [],
    disagreements: [],
  };
  const response = [
    'Here is the report:',
    '```json',
    JSON.stringify(expected),
    '```',
  ].join('\n');

  assert.deepEqual(parseJson(response, {}), expected);
});


test('invalid JSON returns the caller-provided fallback', () => {
  const fallback = { executiveSummary: 'fallback' };
  assert.deepEqual(parseJson('not JSON or a fenced JSON value', fallback), fallback);
});


test('cross-model synthesis drops malformed themes and evidence references outside the report', () => {
  const normalized = normalizeIntelligenceSynthesis({
    executiveSummary: ' Evidence-backed summary ',
    themes: [
      { theme: 'Valid theme', evidenceIds: ['evidence-1', 'not-in-report'], summary: 'supported by one report item' },
      { theme: 'Unsupported theme', evidenceIds: ['not-in-report'], summary: 'must be dropped' },
      { theme: 42, evidenceIds: ['evidence-1'], summary: 'malformed title' },
      null,
    ],
    disagreements: [' Different interpretation ', 42, ''],
  }, new Set(['evidence-1']));

  assert.equal(normalized.executiveSummary, 'Evidence-backed summary');
  assert.deepEqual(normalized.themes, [{
    theme: 'Valid theme',
    evidenceIds: ['evidence-1'],
    summary: 'supported by one report item',
  }]);
  assert.deepEqual(normalized.disagreements, ['Different interpretation']);
});

test('cross-model synthesis returns a safe empty structure for non-object model output', () => {
  assert.deepEqual(normalizeIntelligenceSynthesis('not an object', new Set()), {
    executiveSummary: '',
    themes: [],
    disagreements: [],
  });
});
