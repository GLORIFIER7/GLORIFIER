import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const EXPECTED_MCP_TOOLS = [
  'github_get_repository',
  'github_list_open_pull_requests',
  'github_list_workflow_runs',
  'github_read_file',
].sort((left, right) => left.localeCompare(right));

const OPERATIONAL_COUNT_KEYS = [
  'connectionApprovals',
  'connectionEvents',
  'registeredConnections',
  'intelligenceAnalyses',
  'intelligenceEvidence',
  'intelligenceReports',
];

export const validateOperationalSummary = (body) => {
  assert.equal(body?.ok, true, 'reports summary must report ok=true');
  assert.equal(body?.status, 'operational-data-observed');
  assert.equal(body?.evidence?.source, 'neon-hyperdrive',
    'production reports must use the authoritative Neon Hyperdrive database');
  assert.equal(body?.evidence?.exactRowCounts, true,
    'production reports must use exact row counts');
  for (const key of OPERATIONAL_COUNT_KEYS) {
    assert.ok(Number.isSafeInteger(body.summary?.[key]) && body.summary[key] >= 0,
      `reports summary must contain a safe non-negative exact count for ${key}`);
  }
  return body.summary;
};

export const validateRuntimeVerification = (body) => {
  assert.equal(body?.ok, true, 'runtime verification must report ok=true');
  assert.equal(body?.status, 'verified-for-probed-dependencies');
  assert.equal(body?.checks?.worker?.ok, true);
  assert.equal(body?.checks?.assets?.ok, true);
  assert.equal(body?.checks?.database?.ok, true);
  assert.equal(body?.checks?.database?.source, 'neon-hyperdrive',
    'runtime verification must prove Neon is the live database provider');
  assert.equal(body?.checks?.database?.connectionRegistryRows >= 0, true);
  return body.checks;
};

export const validateMcpInitialize = (body) => {
  assert.equal(body?.jsonrpc, '2.0');
  assert.equal(body?.id, 1);
  assert.equal(body?.result?.protocolVersion, '2025-03-26');
  assert.equal(body?.result?.serverInfo?.name, 'GLORIFIER GitHub Read-Only');
  assert.ok(body?.result?.capabilities?.tools,
    'MCP initialize must advertise tools capability');
  return body.result;
};

export const validateMcpReadOnlyTools = (body) => {
  assert.equal(body?.jsonrpc, '2.0');
  assert.equal(body?.id, 2);
  const tools = body?.result?.tools;
  assert.ok(Array.isArray(tools), 'MCP tools/list must return a tools array');
  assert.deepEqual(tools.map((tool) => tool.name).sort((left, right) => left.localeCompare(right)), EXPECTED_MCP_TOOLS,
    'production MCP must expose only the four approved read-only GitHub tools');
  assert.ok(tools.every((tool) =>
    tool.annotations?.readOnlyHint === true &&
    tool.annotations?.destructiveHint === false &&
    !/(write|create|update|delete|merge|push)/i.test(tool.name)),
  'every production MCP tool must explicitly be read-only and non-destructive');
  return tools;
};

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const readJsonResponse = async (fetchRequest, options) => {
  const response = await fetchRequest({
    ...options,
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    const error = new Error(`Production endpoint returned non-JSON content (HTTP ${response.status})`);
    error.retryable = response.status >= 500;
    throw error;
  }
  return { status: response.status, body };
};

export const requestJson = async (
  fetchRequest,
  options = {},
  acceptedStatuses = [200],
  attempt = 0,
) => {
  try {
    const { status, body } = await readJsonResponse(fetchRequest, options);
    if (acceptedStatuses.includes(status)) return { status, body };
    const error = new Error(`Production endpoint returned HTTP ${status}: ${String(body?.code ?? body?.error ?? 'unexpected response')}`);
    error.retryable = status >= 500 && attempt < 3;
    throw error;
  } catch (error) {
    if (error?.retryable === false || attempt >= 3) throw error;
    await sleep(2_000 * (attempt + 1));
    return requestJson(fetchRequest, options, acceptedStatuses, attempt + 1);
  }
};

const fetchProductionHealth = (options) =>
  fetch('https://glorifier.glorifier.workers.dev/api/health', options);
const fetchProductionReports = (options) =>
  fetch('https://glorifier.glorifier.workers.dev/api/reports/summary', options);
const fetchProductionRuntime = (options) =>
  fetch('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false', options);
const fetchProductionAppState = (options) =>
  fetch('https://glorifier.glorifier.workers.dev/api/app-state', options);
const fetchProductionIdentity = (options) =>
  fetch('https://glorifier.glorifier.workers.dev/api/identity', options);

const verifyWorkerAndDatabase = async () => {
  console.log('GLORIFIER production smoke: checking Worker and static assets');
  const health = await requestJson(fetchProductionHealth);
  assert.equal(health.body?.ok, true);
  assert.equal(health.body?.status, 'worker-ready');

  console.log('GLORIFIER production smoke: checking Neon exact operational counts');
  const reports = await requestJson(fetchProductionReports);
  const counts = validateOperationalSummary(reports.body);

  console.log('GLORIFIER production smoke: checking live runtime database provider');
  const runtimeResponse = await requestJson(fetchProductionRuntime);
  const runtime = validateRuntimeVerification(runtimeResponse.body);
  return { counts, runtime };
};

const verifyUnauthenticatedBoundary = async () => {
  console.log('GLORIFIER production smoke: checking unauthenticated application boundary');
  const appState = await requestJson(fetchProductionAppState, {}, [401]);
  const validAuthFailure = appState.body?.code === 'AUTHENTICATION_REQUIRED' ||
    (appState.body?.code === undefined && appState.body?.ok === false);
  assert.equal(validAuthFailure, true,
    'unauthenticated /api/app-state must return a structured authentication-required response');
};

const reportReadinessWarnings = (identity, runtime) => {
  if (identity.body?.status !== 'ready') {
    console.warn('PRODUCTION READINESS WARNING: organizational domain/email identity is not configured or verified.');
  }
  for (const [key, label] of [
    ['neural', 'Neural execution origin'],
    ['authentication', 'Authentication integration probe'],
    ['ai', 'AI provider execution probe'],
  ]) {
    const dependency = runtime[key];
    if (dependency?.ok !== true) {
      console.warn(`PRODUCTION READINESS WARNING: ${label} requires setup or verification.`);
    }
  }
};

const verifyIdentity = async () => {
  console.log('GLORIFIER production smoke: checking organizational identity readiness');
  return requestJson(fetchProductionIdentity, {}, [200, 503]);
};

export const formatSmokeFailure = (error) => {
  if (!(error instanceof Error)) return 'unknown error';
  if (error.name === 'AssertionError') return 'assertion failed';

  const httpCode = /^Production endpoint returned HTTP (\\d{3}): ([A-Z][A-Z0-9_]{0,79})$/.exec(error.message);
  if (httpCode) return `HTTP ${httpCode[1]}: ${httpCode[2]}`;

  const nonJson = /^Production endpoint returned non-JSON content \\(HTTP (\\d{3})\\)$/.exec(error.message);
  if (nonJson) return `non-JSON response (HTTP ${nonJson[1]})`;

  return `smoke failed (${error.name || 'Error'})`;
};

export const runProductionSmoke = async () => {
  const { counts, runtime } = await verifyWorkerAndDatabase();
  await verifyUnauthenticatedBoundary();
  const identity = await verifyIdentity();
  console.log('Neon exact operational counts verified for all six reporting tables.');
  console.log('MCP was not probed: its protocol endpoint requires POST and is excluded from GET-only production smoke checks.');
  reportReadinessWarnings(identity, runtime);
  console.log('PRODUCTION CRITICAL CONTRACTS VERIFIED: Worker, Neon database, exact counts, unauthenticated boundary, and identity response contract.');
  console.log('This smoke test does not assert MCP protocol interoperability, organizational identity readiness, Neural execution, user login, or AI-provider execution.');
  return { counts, identityStatus: identity.body?.status, runtime };
};

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    await runProductionSmoke();
  } catch (error) {
    console.error(`GLORIFIER production smoke failed: ${formatSmokeFailure(error)}`);
    process.exitCode = 1;
  }
}
