import assert from 'node:assert/strict';
import {
  assessOpenTelemetryRuntimeEvidence,
  type OpenTelemetryRuntimeSnapshot,
} from './otel-runtime-verification';
import test from 'node:test';

const nowMs = Date.parse('2026-10-26T13:00:00.000Z');
const fresh = new Date(nowMs - 60_000).toISOString();
const fullSnapshot: OpenTelemetryRuntimeSnapshot = {
  observedAt: fresh,
  resource: {
    'service.name': 'glorifier-worker',
    'deployment.environment.name': 'production',
    'telemetry.sdk.name': 'opentelemetry',
    'telemetry.sdk.version': '1.0.0',
  },
  exporter: { endpointConfigured: true, lastExportStatus: 'success', lastExportAt: fresh, evidenceRef: 'export:run-100' },
  signals: {
    traces: { count: 12, lastObservedAt: fresh, evidenceRef: 'trace:batch-100' },
    metrics: { count: 8, lastObservedAt: fresh, evidenceRef: 'metric:batch-100' },
    logs: { count: 21, lastObservedAt: fresh, evidenceRef: 'log:batch-100' },
  },
};

test('complete telemetry snapshot remains analysis evidence, not verified fact', () => {
  const result = assessOpenTelemetryRuntimeEvidence(fullSnapshot, nowMs);
  assert.equal(result.status, 'complete');
  assert.equal(result.evidenceClass, 'analysis');
  assert.deepEqual(result.observedSignals, ['traces', 'metrics', 'logs']);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.evidenceRefs.sort(), ['export:run-100', 'log:batch-100', 'metric:batch-100', 'trace:batch-100'].sort());
});

test('export configuration alone does not imply observed telemetry signals', () => {
  const result = assessOpenTelemetryRuntimeEvidence({
    observedAt: fresh,
    resource: fullSnapshot.resource,
    exporter: { endpointConfigured: true, lastExportStatus: 'success', lastExportAt: fresh, evidenceRef: 'export:run-101' },
    signals: {
      traces: { count: 0, lastObservedAt: fresh, evidenceRef: null },
      metrics: { count: 0, lastObservedAt: fresh, evidenceRef: null },
      logs: { count: 0, lastObservedAt: fresh, evidenceRef: null },
      note: 'OpenTelemetry enabled',
    },
  }, nowMs);
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.observedSignals, []);
  assert.ok(result.failures.some((failure) => failure.includes('traces must include a positive observed count')));
});

test('partial signals and failed exporters are distinguished', () => {
  const partial = assessOpenTelemetryRuntimeEvidence({
    ...fullSnapshot,
    signals: { ...fullSnapshot.signals, logs: { count: 0, lastObservedAt: null, evidenceRef: null } },
  }, nowMs);
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.observedSignals, ['traces', 'metrics']);
  const failed = assessOpenTelemetryRuntimeEvidence({
    ...fullSnapshot,
    exporter: { ...fullSnapshot.exporter, lastExportStatus: 'failure' },
  }, nowMs);
  assert.equal(failed.status, 'degraded');
  assert.ok(failed.failures.some((failure) => failure.includes('reports failure')));
});

test('future signal timestamps cannot be admitted as observed telemetry', () => {
  const result = assessOpenTelemetryRuntimeEvidence({
    ...fullSnapshot,
    signals: {
      ...fullSnapshot.signals,
      traces: { count: 1, lastObservedAt: new Date(nowMs + 1).toISOString(), evidenceRef: 'trace:future' },
    },
  }, nowMs);
  assert.equal(result.status, 'partial');
  assert.ok(!result.observedSignals.includes('traces'));
  assert.ok(result.failures.some((failure) => failure.includes('traces lastObservedAt')));
});

test('sub-observations cannot be newer than the parent snapshot', () => {
  const laterThanSnapshot = new Date(nowMs - 30_000).toISOString();
  const exporter = assessOpenTelemetryRuntimeEvidence({
    ...fullSnapshot, exporter: { ...fullSnapshot.exporter, lastExportAt: laterThanSnapshot },
  }, nowMs);
  assert.equal(exporter.status, 'partial');
  assert.ok(exporter.failures.some((failure) => failure.includes('no later than snapshot observedAt')));
  assert.ok(!exporter.evidenceRefs.includes('export:run-100'));
  const signal = assessOpenTelemetryRuntimeEvidence({
    ...fullSnapshot,
    signals: { ...fullSnapshot.signals, traces: { count: 12, lastObservedAt: laterThanSnapshot, evidenceRef: 'trace:after-snapshot' } },
  }, nowMs);
  assert.equal(signal.status, 'partial');
  assert.ok(!signal.observedSignals.includes('traces'));
  assert.ok(signal.failures.some((failure) => failure.includes('no later than snapshot observedAt')));
  assert.ok(!signal.evidenceRefs.includes('trace:after-snapshot'));
});

test('stale snapshots, unknown services and invalid clocks fail closed', () => {
  const stale = assessOpenTelemetryRuntimeEvidence({
    ...fullSnapshot, observedAt: new Date(nowMs - 300_001).toISOString(),
  }, nowMs);
  assert.equal(stale.status, 'not-observed');
  assert.deepEqual(stale.observedSignals, []);
  assert.ok(stale.failures.some((failure) => failure.includes('snapshot observedAt')));
  const unknown = assessOpenTelemetryRuntimeEvidence({
    ...fullSnapshot, resource: { ...fullSnapshot.resource, 'service.name': 'unknown_service:node' },
  }, nowMs);
  assert.equal(unknown.status, 'partial');
  assert.ok(unknown.failures.some((failure) => failure.includes('not unknown_service')));
  const invalidClock = assessOpenTelemetryRuntimeEvidence(fullSnapshot, Number.NaN);
  assert.equal(invalidClock.status, 'not-observed');
  assert.ok(invalidClock.failures.some((failure) => failure.includes('validation clock')));
});

test('ambiguous timestamps, missing timezone and impossible dates are rejected', () => {
  const ambiguous = assessOpenTelemetryRuntimeEvidence({ ...fullSnapshot, observedAt: '10/26/2026 12:59:00' }, nowMs);
  assert.equal(ambiguous.status, 'not-observed');
  assert.ok(ambiguous.failures.some((failure) => failure.includes('snapshot observedAt')));
  const missingTimezone = assessOpenTelemetryRuntimeEvidence({ ...fullSnapshot, observedAt: '2026-10-26T12:59:00' }, nowMs);
  assert.equal(missingTimezone.status, 'not-observed');
  const impossible = assessOpenTelemetryRuntimeEvidence({ ...fullSnapshot, observedAt: '2026-02-30T12:59:00Z' }, nowMs);
  assert.equal(impossible.status, 'not-observed');
  assert.ok(impossible.failures.some((failure) => failure.includes('snapshot observedAt')));
});

test('unknown UTC offsets and sub-millisecond future snapshots fail closed', () => {
  const unknownOffset = assessOpenTelemetryRuntimeEvidence({
    ...fullSnapshot, observedAt: '2026-10-26T12:59:00-00:00',
  }, nowMs);
  assert.equal(unknownOffset.status, 'not-observed');
  assert.ok(unknownOffset.failures.some((failure) => failure.includes('snapshot observedAt')));

  const futureSubMillisecond = assessOpenTelemetryRuntimeEvidence({
    ...fullSnapshot, observedAt: '2026-10-26T13:00:00.0000001Z',
  }, nowMs);
  assert.equal(futureSubMillisecond.status, 'not-observed');
  assert.ok(futureSubMillisecond.failures.some((failure) => failure.includes('snapshot observedAt')));
});

test('sub-millisecond child observations cannot be newer than their parent snapshot', () => {
  const result = assessOpenTelemetryRuntimeEvidence({
    ...fullSnapshot,
    observedAt: '2026-10-26T13:00:00.0000000Z',
    signals: {
      ...fullSnapshot.signals,
      traces: { count: 1, lastObservedAt: '2026-10-26T13:00:00.0000001Z', evidenceRef: 'trace:after-parent' },
    },
  }, nowMs + 1);
  assert.equal(result.status, 'partial');
  assert.ok(!result.observedSignals.includes('traces'));
  assert.ok(!result.evidenceRefs.includes('trace:after-parent'));
  assert.ok(result.failures.some((failure) => failure.includes('traces lastObservedAt')));
});

test('ambiguous signal timestamps cannot be counted as observed traces', () => {
  const result = assessOpenTelemetryRuntimeEvidence({
    ...fullSnapshot,
    signals: { ...fullSnapshot.signals, traces: { count: 1, lastObservedAt: '10/26/2026 12:59:00', evidenceRef: 'trace:ambiguous-time' } },
  }, nowMs);
  assert.equal(result.status, 'partial');
  assert.ok(!result.observedSignals.includes('traces'));
  assert.ok(result.failures.some((failure) => failure.includes('traces lastObservedAt')));
});
