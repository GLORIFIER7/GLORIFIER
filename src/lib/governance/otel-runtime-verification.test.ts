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
    serviceName: 'glorifier-worker',
    deploymentEnvironment: 'production',
    sdkName: 'opentelemetry',
    sdkVersion: '1.0.0',
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

const staleSnapshot = assessOpenTelemetryRuntimeEvidence({
  ...fullSnapshot,
  observedAt: new Date(nowMs - 300_001).toISOString(),
}, nowMs);
assert.equal(staleSnapshot.status, 'not-observed');
assert.deepEqual(staleSnapshot.observedSignals, []);
assert.ok(staleSnapshot.failures.some((failure) => failure.includes('snapshot observedAt')));

const unknownService = assessOpenTelemetryRuntimeEvidence({
  ...fullSnapshot,
  resource: { ...fullSnapshot.resource, serviceName: 'unknown_service:node' },
}, nowMs);
assert.equal(unknownService.status, 'partial');
assert.ok(unknownService.failures.some((failure) => failure.includes('not unknown_service')));

const invalidClock = assessOpenTelemetryRuntimeEvidence(fullSnapshot, Number.NaN);
assert.equal(invalidClock.status, 'not-observed');
assert.ok(invalidClock.failures.some((failure) => failure.includes('validation clock')));

process.stdout.write('OpenTelemetry runtime evidence contract tests passed; live exporter authentication remains external.\\n');
