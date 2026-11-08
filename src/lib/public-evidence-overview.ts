export type OperationalReport = {
  generatedAt: string | null;
  source: 'neon-hyperdrive';
  exactRowCounts: true;
  revenueStatus: string | null;
  counts: {
    connectionApprovals: number;
    connectionEvents: number;
    registeredConnections: number;
    intelligenceAnalyses: number;
    intelligenceEvidence: number;
    intelligenceReports: number;
  };
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const COUNT_KEYS = [
  'connectionApprovals',
  'connectionEvents',
  'registeredConnections',
  'intelligenceAnalyses',
  'intelligenceEvidence',
  'intelligenceReports',
] as const;

export function parseOperationalReport(value: unknown): OperationalReport | null {
  if (!isRecord(value) || value.ok !== true || value.status !== 'operational-data-observed') {
    return null;
  }

  const evidence = isRecord(value.evidence) ? value.evidence : null;
  const summary = isRecord(value.summary) ? value.summary : null;
  if (evidence?.source !== 'neon-hyperdrive' || evidence.exactRowCounts !== true || !summary) {
    return null;
  }

  const counts = {} as OperationalReport['counts'];
  for (const key of COUNT_KEYS) {
    const count = summary[key];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return null;
    counts[key] = count;
  }

  const generatedAt = typeof value.generatedAt === 'string' && Number.isFinite(Date.parse(value.generatedAt))
    ? value.generatedAt
    : null;

  const revenueStatus = typeof evidence.revenue === 'string' ? evidence.revenue : null;
  return { generatedAt, source: 'neon-hyperdrive', exactRowCounts: true, revenueStatus, counts };
}

export type EndpointSummary = {
  label: string;
  detail: string;
};

export function summarizeEndpoint(httpStatus: number | null, payload: unknown): EndpointSummary {
  const body = isRecord(payload) ? payload : null;

  if (httpStatus === null) {
    return { label: 'UNKNOWN', detail: 'No response was received; availability was not established.' };
  }

  if (httpStatus >= 200 && httpStatus < 300 && body?.ok === true) {
    return { label: 'RESPONDING', detail: 'HTTP ' + httpStatus + ' with an explicit success response.' };
  }

  if (httpStatus === 401 && body?.code === 'AUTHENTICATION_REQUIRED') {
    return {
      label: 'PROTECTED',
      detail: 'HTTP 401 for an unauthenticated request. This does not verify the signed-in session flow.',
    };
  }

  if (httpStatus === 503 && body?.code === 'BACKEND_ORIGIN_NOT_CONFIGURED') {
    return {
      label: 'NOT AVAILABLE',
      detail: 'HTTP 503: no approved backend origin is configured; the route fails closed.',
    };
  }

  if (httpStatus === 503 && body?.status === 'not-ready') {
    return {
      label: 'NOT READY',
      detail: 'HTTP 503: required identity or service configuration is incomplete.',
    };
  }

  return { label: 'HTTP ' + httpStatus, detail: 'The endpoint did not return its required success contract.' };
}

export function summarizeValuationEvidence(
  httpStatus: number | null,
  payload: unknown,
): EndpointSummary {
  const endpoint = summarizeEndpoint(httpStatus, payload);
  if (endpoint.label === 'RESPONDING') {
    return {
      label: 'ENDPOINT RESPONDING · OUTPUT NOT VERIFIED',
      detail: 'The endpoint returned a success response, but this check does not establish a verified company valuation or market price.',
    };
  }
  if (endpoint.label === 'NOT AVAILABLE') {
    return {
      label: 'NOT VERIFIED — ENDPOINT UNAVAILABLE',
      detail: endpoint.detail,
    };
  }
  if (endpoint.label === 'UNKNOWN') {
    return {
      label: 'NOT VERIFIED — NO RESPONSE',
      detail: endpoint.detail,
    };
  }
  return {
    label: 'NOT VERIFIED',
    detail: endpoint.detail,
  };
}

export function summarizeOperationalReportResponse(
  httpStatus: number | null,
  payload: unknown,
): EndpointSummary {
  if (parseOperationalReport(payload)) {
    return {
      label: 'EXACT COUNTS OBSERVED',
      detail: 'HTTP success with exact row counts from the declared Neon Hyperdrive source.',
    };
  }

  const generic = summarizeEndpoint(httpStatus, payload);
  if (httpStatus !== null && httpStatus >= 200 && httpStatus < 300 &&
      isRecord(payload) && payload.ok === true) {
    return {
      label: 'EVIDENCE CONTRACT NOT MET',
      detail: 'The endpoint responded, but the payload did not satisfy the Neon exact-count evidence contract. No counts are displayed.',
    };
  }
  return generic;
}

export function summarizeRevenueEvidence(report: OperationalReport | null): EndpointSummary {
  if (!report) {
    return {
      label: 'NOT VERIFIED — REPORT UNAVAILABLE',
      detail: 'No valid Neon operational report is available. Revenue evidence cannot be inferred from this check; this does not mean revenue is zero.',
    };
  }
  if (report.revenueStatus === 'not-observable-from-operational-tables') {
    return {
      label: 'NOT OBSERVABLE IN REPORTED TABLES',
      detail: 'The exact-count report states that revenue is not observable from these operational tables. This does not mean revenue is zero.',
    };
  }
  if (report.revenueStatus === 'observable') {
    return {
      label: 'SOURCE REPORTS OBSERVABLE · NOT VERIFIED',
      detail: 'The source labels revenue as observable, but this does not verify a revenue amount, settlement, payment, or independently reconciled outcome.',
    };
  }
  return {
    label: 'NOT VERIFIED — SOURCE STATUS UNKNOWN',
    detail: 'The report did not provide a recognized revenue evidence status. No revenue value or zero balance is inferred.',
  };
}

export type RuntimeSummary = {
  worker: string;
  database: string;
  neural: string;
  authentication: string;
  ai: string;
};

export function summarizeRuntime(payload: unknown): RuntimeSummary {
  const checks = isRecord(payload) && isRecord(payload.checks) ? payload.checks : {};
  const worker = isRecord(checks.worker) ? checks.worker : {};
  const database = isRecord(checks.database) ? checks.database : {};
  const neural = isRecord(checks.neural) ? checks.neural : {};
  const authentication = isRecord(checks.authentication) ? checks.authentication : {};
  const ai = isRecord(checks.ai) ? checks.ai : {};

  return {
    worker: worker.ok === true ? 'RESPONDING' : 'NOT VERIFIED',
    database: database.ok === true && database.source === 'neon-hyperdrive'
      ? 'READ-ONLY PROBE PASSED'
      : 'NOT VERIFIED',
    neural: neural.ok === true
      ? 'READINESS CHECK PASSED'
      : neural.code === 'NEURAL_ORIGIN_NOT_CONFIGURED' || neural.status === 'not-configured'
        ? 'NOT CONFIGURED IN THE MAIN WORKER'
        : 'NOT VERIFIED',
    authentication: authentication.ok === true
      ? 'PROBE PASSED'
      : authentication.ok === false
        ? 'PROBE FAILED'
        : 'NOT PROBED',
    ai: ai.executed === true
      ? 'EXECUTION REPORTED'
      : ai.executed === false
        ? 'NOT EXECUTED'
        : 'NOT PROBED',
  };
}
