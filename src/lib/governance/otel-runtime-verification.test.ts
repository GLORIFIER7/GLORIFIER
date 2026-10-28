import assert from 'node:assert/strict';
import {
  assessOpenTelemetryRuntimeEvidence,
  type OpenTelemetryRuntimeSnapshot,
} from './otel-runtime-verification';

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
  exporter: {
    endpointConfigured: true,
    lastExportStatus: 'success',
    lastExportAt: fresh,
    evidenceRef: 'export:run-100',
  },
  signals: {
    traces: { count: 12, lastObservedAt: fresh, evidenceRef: 'trace:batch-100' },
    metrics: { count: 8, lastObservedAt: fresh, evidenceRef: 'metric:batch-100' },
    logs: { count: 21, lastObservedAt: fresh, evidenceRef: 'log:batch-100' },
  },
};

const complete = assessOpenTelemetryRuntimeEvidence(fullSnapshot, nowMs);
assert.equal(complete.status, 'complete');
assert.equal(complete.evidenceClass, 'analysis', 'structural admission must not authenticate telemetry or promote it to verified fact');
assert.deepEqual(complete.observedSignals, ['traces', 'metrics', 'logs']);
assert.deepEqual(complete.failures, []);
assert.deepEqual(complete.evidenceRefs.sort(), ['export:run-100', 'log:batch-100', 'metric:batch-100', 'trace:batch-100'].sort());

const keywordOnly = assessOpenTelemetryRuntimeEvidence({
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
assert.equal(keywordOnly.status, 'partial', 'export configuration alone must not imply observed signals');
assert.deepEqual(keywordOnly.observedSignals, []);
assert.ok(keywordOnly.failures.some((failure) => failure.includes('traces must include a positive observed count')));

const partial = assessOpenTelemetryRuntimeEvidence({
  ...fullSnapshot,
  signals: {
    ...fullSnapshot.signals,
    logs: { count: 0, lastObservedAt: null, evidenceRef: null },
  },
}, nowMs);
assert.equal(partial.status, 'partial');
assert.deepEqual(partial.observedSignals, ['traces', 'metrics']);

const failedExporter = assessOpenTelemetryRuntimeEvidence({
  ...fullSnapshot,
  exporter: { ...fullSnapshot.exporter, lastExportStatus: 'failure' },
}, nowMs);
assert.equal(failedExporter.status, 'degraded');
assert.ok(failedExporter.failures.some((failure) => failure.includes('reports failure')));

const futureSignal = assessOpenTelemetryRuntimeEvidence({
  ...fullSnapshot,
  signals: {
    ...fullSnapshot.signals,
    traces: { count: 1, lastObservedAt: new Date(nowMs + 1).toISOString(), evidenceRef: 'trace:future' },
  },
}, nowMs);
assert.equal(futureSignal.status, 'partial');
assert.ok(!futureSignal.observedSignals.includes('traces'));
assert.ok(futureSignal.failures.some((failure) => failure.includes('traces lastObservedAt')));

// Sub-observations must not be newer than the parent snapshot, even when they are
// individually fresh relative to the validation clock.
const laterThanSnapshot = new Date(nowMs - 30_000).toISOString();
const laterExporter = assessOpenTelemetryRuntimeEvidence({
  ...fullSnapshot,
  exporter: { ...fullSnapshot.exporter, lastExportAt: laterThanSnapshot },
}, nowMs);
assert.equal(laterExporter.status, 'partial');
assert.ok(laterExporter.failures.some((failure) => failure.includes('no later than snapshot observedAt')));
assert.ok(!laterExporter.evidenceRefs.includes('export:run-100'));

const laterSignal = assessOpenTelemetryRuntimeEvidence({
  ...fullSnapshot,
  signals: {
    ...fullSnapshot.signals,
    traces: { count: 12, lastObservedAt: laterThanSnapshot, evidenceRef: 'trace:after-snapshot' },
  },
}, nowMs);
assert.equal(laterSignal.status, 'partial');
assert.ok(!laterSignal.observedSignals.includes('traces'));
assert.ok(laterSignal.failures.some((failure) => failure.includes('no later than snapshot observedAt')));
assert.ok(!laterSignal.evidenceRefs.includes('trace:after-snapshot'));

const staleSnapshot = assessOpenTelemetryRuntimeEvidence({
  ...fullSnapshot,
  observedAt: new Date(nowMs - 300_001).toISOString(),
}, nowMs);
assert.equal(staleSnapshot.status, 'not-observed');
assert.deepEqual(staleSnapshot.observedSignals, []);
assert.ok(staleSnapshot.failures.some((failure) => failure.includes('snapshot observedAt')));

const unknownService = assessOpenTelemetryRuntimeEvidence({
  ...fullSnapshot,
  resource: { ...fullSnapshot.resource, 'service.name': 'unknown_service:node' },
}, nowMs);
assert.equal(unknownService.status, 'partial');
assert.ok(unknownService.failures.some((failure) => failure.includes('not unknown_service')));

const invalidClock = assessOpenTelemetryRuntimeEvidence(fullSnapshot, Number.NaN);
assert.equal(invalidClock.status, 'not-observed');
assert.ok(invalidClock.failures.some((failure) => failure.includes('validation clock')));


const ambiguousTimestamp = assessOpenTelemetryRuntimeEvidence({
  ...fullSnapshot,
  observedAt: '10/26/2026 12:59:00',
}, nowMs);
assert.equal(ambiguousTimestamp.status, 'not-observed', 'locale-dependent timestamps must not establish runtime observation');
assert.ok(ambiguousTimestamp.failures.some((failure) => failure.includes('snapshot observedAt')));

const missingTimezone = assessOpenTelemetryRuntimeEvidence({
  ...fullSnapshot,
  observedAt: '2026-10-26T12:59:00',
}, nowMs);
assert.equal(missingTimezone.status, 'not-observed', 'timestamps without an explicit UTC offset must fail closed');

const impossibleCalendarDate = assessOpenTelemetryRuntimeEvidence({
  ...fullSnapshot,
  observedAt: '2026-02-30T12:59:00Z',
}, nowMs);
assert.equal(impossibleCalendarDate.status, 'not-observed', 'impossible dates must not be normalized into runtime evidence');

const ambiguousSignalTimestamp = assessOpenTelemetryRuntimeEvidence({
  ...fullSnapshot,
  signals: {
    ...fullSnapshot.signals,
    traces: { count: 1, lastObservedAt: '10/26/2026 12:59:00', evidenceRef: 'trace:ambiguous-time' },
  },
}, nowMs);
assert.equal(ambiguousSignalTimestamp.status, 'partial');
assert.ok(!ambiguousSignalTimestamp.observedSignals.includes('traces'));
assert.ok(ambiguousSignalTimestamp.failures.some((failure) => failure.includes('traces lastObservedAt')));

process.stdout.write('OpenTelemetry runtime evidence contract tests passed; live exporter authentication remains external.\n');
