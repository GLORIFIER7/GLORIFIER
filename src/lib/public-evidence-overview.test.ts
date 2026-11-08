import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseOperationalReport,
  summarizeEndpoint,
  summarizeOperationalReportResponse,
  summarizeValuationEvidence,
  summarizeRevenueEvidence,
  summarizeRuntime,
} from './public-evidence-overview';

const validReport = {
  ok: true,
  status: 'operational-data-observed',
  generatedAt: '2026-11-08T03:42:40.984Z',
  summary: {
    connectionApprovals: 9,
    connectionEvents: 251212,
    registeredConnections: 30,
    intelligenceAnalyses: 266,
    intelligenceEvidence: 1099,
    intelligenceReports: 133,
  },
  evidence: {
    source: 'neon-hyperdrive',
    exactRowCounts: true,
    revenue: 'not-observable-from-operational-tables',
  },
};

test('distinguishes an unavailable valuation endpoint from an unobservable valuation', () => {
  const unavailable = summarizeValuationEvidence(503, {
    ok: false,
    status: 'unavailable',
    code: 'BACKEND_ORIGIN_NOT_CONFIGURED',
  });
  assert.equal(unavailable.label, 'NOT VERIFIED — ENDPOINT UNAVAILABLE');

  const responding = summarizeValuationEvidence(200, {
    ok: true,
    status: 'estimate-returned',
    estimate: 125000,
  });
  assert.equal(responding.label, 'ENDPOINT RESPONDING · OUTPUT NOT VERIFIED');
  assert.match(responding.detail, /does not establish a verified company valuation/);

  const unknown = summarizeValuationEvidence(null, null);
  assert.equal(unknown.label, 'NOT VERIFIED — NO RESPONSE');
});

test('does not infer revenue status when the operational report is missing', () => {
  const result = summarizeRevenueEvidence(null);
  assert.equal(result.label, 'NOT VERIFIED — REPORT UNAVAILABLE');
  assert.match(result.detail, /does not mean revenue is zero/);
});

test('uses only the revenue evidence label carried by a valid Neon report', () => {
  const report = parseOperationalReport(validReport);
  assert.ok(report);
  const unobservable = summarizeRevenueEvidence(report);
  assert.equal(unobservable.label, 'NOT OBSERVABLE IN REPORTED TABLES');
  assert.match(unobservable.detail, /does not mean revenue is zero/);

  const observable = summarizeRevenueEvidence({ ...report, revenueStatus: 'observable' });
  assert.equal(observable.label, 'SOURCE REPORTS OBSERVABLE · NOT VERIFIED');
  assert.match(observable.detail, /does not verify a revenue amount/);

  const unknown = summarizeRevenueEvidence({ ...report, revenueStatus: null });
  assert.equal(unknown.label, 'NOT VERIFIED — SOURCE STATUS UNKNOWN');
});

test('accepts only exact operational row counts from the declared Neon source', () => {
  const parsed = parseOperationalReport(validReport);
  assert.ok(parsed);
  assert.equal(parsed.source, 'neon-hyperdrive');
  assert.equal(parsed.counts.connectionEvents, 251212);
  assert.equal(parsed.counts.intelligenceReports, 133);
});

test('rejects counts from an undeclared source or without exact-count evidence', () => {
  assert.equal(parseOperationalReport({
    ...validReport,
    evidence: { source: 'supabase-postgrest', exactRowCounts: true },
  }), null);
  assert.equal(parseOperationalReport({
    ...validReport,
    evidence: { source: 'neon-hyperdrive', exactRowCounts: false },
  }), null);
});

test('does not promote a successful HTTP response to verified counts when the evidence contract fails', () => {
  const result = summarizeOperationalReportResponse(200, {
    ...validReport,
    evidence: { source: 'supabase-postgrest', exactRowCounts: true },
  });
  assert.equal(result.label, 'EVIDENCE CONTRACT NOT MET');
  assert.match(result.detail, /No counts are displayed/);
});

test('rejects missing, negative, fractional, and unsafe numeric counts', () => {
  for (const badCount of [undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseOperationalReport({
      ...validReport,
      summary: { ...validReport.summary, connectionEvents: badCount },
    }), null);
  }
});

test('treats absent backend configuration as unavailable rather than zero or success', () => {
  const result = summarizeEndpoint(503, {
    ok: false,
    status: 'unavailable',
    code: 'BACKEND_ORIGIN_NOT_CONFIGURED',
  });
  assert.equal(result.label, 'NOT AVAILABLE');
  assert.match(result.detail, /fails closed/);
});

test('distinguishes an unauthenticated 401 from proof of a working login flow', () => {
  const result = summarizeEndpoint(401, {
    ok: false,
    code: 'AUTHENTICATION_REQUIRED',
  });
  assert.equal(result.label, 'PROTECTED');
  assert.match(result.detail, /does not verify the signed-in session flow/);
});

test('keeps authentication NOT PROBED when the check is absent as well as when ok is null', () => {
  const missing = summarizeRuntime({
    checks: {
      worker: { ok: true },
      database: { ok: true, source: 'neon-hyperdrive' },
    },
  });
  const explicitNull = summarizeRuntime({
    checks: {
      worker: { ok: true },
      database: { ok: true, source: 'neon-hyperdrive' },
      authentication: { ok: null, status: 'not-probed' },
    },
  });
  assert.equal(missing.authentication, 'NOT PROBED');
  assert.equal(explicitNull.authentication, 'NOT PROBED');
});

test('does not infer database, authentication, neural, or inference readiness beyond returned checks', () => {
  const result = summarizeRuntime({
    ok: true,
    checks: {
      worker: { ok: true },
      database: { ok: true, source: 'neon-hyperdrive' },
      neural: { ok: false, code: 'NEURAL_ORIGIN_NOT_CONFIGURED' },
      authentication: { ok: null, status: 'not-probed' },
      ai: { ok: null, executed: false, status: 'not-probed' },
    },
  });
  assert.deepEqual(result, {
    worker: 'RESPONDING',
    database: 'READ-ONLY PROBE PASSED',
    neural: 'NOT CONFIGURED IN THE MAIN WORKER',
    authentication: 'NOT PROBED',
    ai: 'NOT EXECUTED',
  });
});
