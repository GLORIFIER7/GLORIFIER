/**
 * OpenTelemetry runtime evidence assessment.
 *
 * This is a deterministic admission contract for caller-supplied telemetry
 * snapshots. It does not configure an SDK, contact an exporter, authenticate a
 * collector, or prove that a referenced trace/metric/log is genuine. Results
 * remain analysis until a trusted runtime integration supplies authenticated
 * evidence and its own independent probe result.
 */

export const DEFAULT_OTEL_EVIDENCE_MAX_AGE_MS = 5 * 60 * 1000;

export type OTelSignalName = 'traces' | 'metrics' | 'logs';
export type OTelExportStatus = 'success' | 'failure' | 'unknown';
export type OTelRuntimeAssessmentStatus = 'complete' | 'partial' | 'degraded' | 'not-observed';

export interface OTelSignalObservation {
  count: number;
  lastObservedAt: string | null;
  evidenceRef: string | null;
}

export interface OpenTelemetryRuntimeSnapshot {
  observedAt: string;
  resource: {
    'service.name': string;
    'deployment.environment.name': string;
    'telemetry.sdk.name': string;
    'telemetry.sdk.version': string;
  };
  exporter: {
    endpointConfigured: boolean;
    lastExportStatus: OTelExportStatus;
    lastExportAt: string | null;
    evidenceRef: string | null;
  };
  signals: Record<OTelSignalName, OTelSignalObservation>;
}

export interface OpenTelemetryRuntimeAssessment {
  status: OTelRuntimeAssessmentStatus;
  evidenceClass: 'analysis';
  observedSignals: OTelSignalName[];
  evidenceRefs: string[];
  failures: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Accept only an explicit-offset RFC 3339 timestamp subset for runtime evidence.
 * Loose Date.parse formats and impossible calendar dates are not admissible;
 * leap-second notation is rejected because JavaScript Date cannot represent it.
 */
function parseRfc3339Timestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const daysInMonth = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > (daysInMonth[month - 1] ?? 0)
      || hour > 23 || minute > 59 || second > 59) return null;

  const offset = match[8];
  if (offset.toUpperCase() !== 'Z') {
    const [offsetHour, offsetMinute] = offset.slice(1).split(':').map(Number);
    if (offsetHour > 23 || offsetMinute > 59) return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function freshTimestamp(value: unknown, nowMs: number, maxAgeMs: number): boolean {
  const timestamp = parseRfc3339Timestamp(value);
  return timestamp !== null && timestamp <= nowMs && nowMs - timestamp <= maxAgeMs;
}

function result(
  status: OTelRuntimeAssessmentStatus,
  observedSignals: OTelSignalName[],
  evidenceRefs: string[],
  failures: string[],
): OpenTelemetryRuntimeAssessment {
  return {
    status,
    evidenceClass: 'analysis',
    observedSignals: [...observedSignals],
    evidenceRefs: [...new Set(evidenceRefs)],
    failures: [...new Set(failures)],
  };
}

/**
 * Admit only fresh, explicitly referenced signal/export observations.
 * A keyword, endpoint URL, configured flag, or resource label alone is not
 * runtime telemetry evidence.
 */
export function assessOpenTelemetryRuntimeEvidence(
  input: unknown,
  nowMs: number = Date.now(),
  maxAgeMs: number = DEFAULT_OTEL_EVIDENCE_MAX_AGE_MS,
): OpenTelemetryRuntimeAssessment {
  const failures: string[] = [];
  if (!Number.isFinite(nowMs)) failures.push('validation clock must be finite');
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) failures.push('maximum evidence age must be a positive finite duration');

  const snapshot = asRecord(input);
  if (!snapshot) failures.push('runtime telemetry snapshot must be an object');
  if (failures.length > 0 || !snapshot) return result('not-observed', [], [], failures);

  if (!freshTimestamp(snapshot.observedAt, nowMs, maxAgeMs)) {
    failures.push('snapshot observedAt must be valid, non-future, and fresh');
    return result('not-observed', [], [], failures);
  }

  const resource = asRecord(snapshot.resource);
  const serviceName = textValue(resource?.['service.name']);
  const deploymentEnvironment = textValue(resource?.['deployment.environment.name']);
  const sdkName = textValue(resource?.['telemetry.sdk.name']);
  const sdkVersion = textValue(resource?.['telemetry.sdk.version']);
  let resourceComplete = true;

  if (!serviceName || /^unknown_service(?::|$)/i.test(serviceName)) {
    failures.push('resource serviceName must be explicit and not unknown_service');
    resourceComplete = false;
  }
  if (!deploymentEnvironment) {
    failures.push('resource deploymentEnvironment is required');
    resourceComplete = false;
  }
  if (!sdkName || !sdkVersion) {
    failures.push('OpenTelemetry SDK name and version are required');
    resourceComplete = false;
  }

  const exporter = asRecord(snapshot.exporter);
  const endpointConfigured = exporter?.endpointConfigured === true;
  const exportStatus = exporter?.lastExportStatus;
  const exportAtFresh = freshTimestamp(exporter?.lastExportAt, nowMs, maxAgeMs);
  const exportEvidenceRef = textValue(exporter?.evidenceRef);
  const exporterHealthy = endpointConfigured && exportStatus === 'success' && exportAtFresh && !!exportEvidenceRef;
  const exporterFailureObserved = endpointConfigured && exportStatus === 'failure' && exportAtFresh && !!exportEvidenceRef;

  if (!endpointConfigured) failures.push('OTLP/exporter endpoint is not evidenced as configured');
  if (exportStatus !== 'success' && exportStatus !== 'failure') failures.push('exporter status is unknown');
  if (!exportAtFresh) failures.push('exporter lastExportAt must be valid, non-future, and fresh');
  if (!exportEvidenceRef) failures.push('exporter observation requires an evidenceRef');

  const signals = asRecord(snapshot.signals);
  const observedSignals: OTelSignalName[] = [];
  const evidenceRefs: string[] = [];
  if (!signals) {
    failures.push('signals object is required');
  } else {
    for (const signalName of ['traces', 'metrics', 'logs'] as const) {
      const signal = asRecord(signals[signalName]);
      const count = signal?.count;
      const evidenceRef = textValue(signal?.evidenceRef);
      const observedAtFresh = freshTimestamp(signal?.lastObservedAt, nowMs, maxAgeMs);
      if (!Number.isSafeInteger(count) || (count as number) <= 0) {
        failures.push(signalName + ' must include a positive observed count');
      }
      if (!observedAtFresh) failures.push(signalName + ' lastObservedAt must be valid, non-future, and fresh');
      if (!evidenceRef) failures.push(signalName + ' observation requires an evidenceRef');
      if (Number.isSafeInteger(count) && (count as number) > 0 && observedAtFresh && evidenceRef) {
        observedSignals.push(signalName);
        evidenceRefs.push(evidenceRef);
      }
    }
  }

  if (exportEvidenceRef && (exporterHealthy || exporterFailureObserved)) evidenceRefs.push(exportEvidenceRef);
  if (exporterFailureObserved) {
    failures.push('fresh exporter evidence reports failure');
    return result('degraded', observedSignals, evidenceRefs, failures);
  }

  if (resourceComplete && exporterHealthy && observedSignals.length === 3) {
    return result('complete', observedSignals, evidenceRefs, failures);
  }
  if (observedSignals.length > 0 || exporterHealthy) {
    return result('partial', observedSignals, evidenceRefs, failures);
  }
  return result('not-observed', observedSignals, evidenceRefs, failures);
}
