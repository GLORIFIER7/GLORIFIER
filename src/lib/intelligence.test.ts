import assert from 'node:assert/strict';
import test from 'node:test';
import { getPostgresPool } from './db/postgres';
import { getLatestIntelligenceReport, normalizeIntelligenceSynthesis, parseJson, sanitizeIntelligenceAnalysisOutput } from './intelligence';

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


test('persisted AI analysis omits invented evidence identifiers and unparsed provider text', () => {
  const output = [
    'Model preface must not reach the persisted report.',
    '```json',
    JSON.stringify({
      executiveSummary: 'Supported interpretation',
      themes: [
        { theme: 'Supported', evidenceIds: ['known-evidence', 'invented-evidence'], summary: 'Source-backed theme' },
        { theme: 'Unsupported', evidenceIds: ['invented-evidence'], summary: 'Unverifiable claim' },
      ],
      disagreements: [],
    }),
    '```',
  ].join('\n');
  const sanitized = sanitizeIntelligenceAnalysisOutput(output, new Set(['known-evidence']));
  const parsed = JSON.parse(sanitized);
  assert.deepEqual(parsed.themes, [
    { theme: 'Supported', evidenceIds: ['known-evidence'], summary: 'Source-backed theme' },
  ]);
  assert.doesNotMatch(sanitized, /invented-evidence|Unverifiable claim|Model preface/);
});

test('loading a legacy report validates both stored themes and provider analyses against its own evidence', async (t) => {
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://localhost/intelligence_test';
  t.after(() => {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  });

  const supported = { theme: 'Release', evidenceIds: ['report-item'], summary: 'Release observed.' };
  const themes = [
    { ...supported, evidenceIds: ['report-item', 'other-report-item'] },
    { theme: 'Unsupported', evidenceIds: ['other-report-item'], summary: 'Unconfirmed.' },
  ];
  const synthesis = { executiveSummary: 'Release notes', themes, disagreements: [] };
  const unavailable = { provider: 'Google Gemini', model: 'unavailable', status: 'unavailable', output: 'Gemini key/model unavailable.' };
  t.mock.method(getPostgresPool(), 'query', async (sql: string, values?: string[]) => {
    if (sql.includes('CREATE TABLE')) return { rows: [] };
    if (sql.includes('FROM intelligence_reports')) {
      return { rows: [{ id: 'archived-report', themes, executive_summary: synthesis.executiveSummary, disagreements: [] }] };
    }
    assert.deepEqual(values, ['archived-report']);
    if (sql.includes('FROM intelligence_evidence')) return { rows: [{ id: 'report-item' }] };
    assert.match(sql, /FROM intelligence_analyses/);
    return { rows: [
      { provider: 'OpenAI', model: 'archive', status: 'completed', output: ['Model preface', '```json', JSON.stringify(synthesis), '```'].join('\n') },
      unavailable,
    ] };
  });

  const report = await getLatestIntelligenceReport();
  assert.ok(report);
  assert.equal(report.id, 'archived-report');
  assert.deepEqual(report.themes, [supported]);
  assert.deepEqual(JSON.parse(report.analyses[0].output), { ...synthesis, themes: [supported] });
  assert.deepEqual(report.analyses[1], unavailable);
});
