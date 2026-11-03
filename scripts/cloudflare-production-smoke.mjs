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

const PRIVATE_RUNTIME_INTEGRATION_IDS = [
  'neon',
  'opensea',
  'github-mcp',
  'identity',
  'neural',
  'ai-providers',
];

const REQUIRED_INTEGRATION_IDS = [
  ...PRIVATE_RUNTIME_INTEGRATION_IDS,
  'cloudflare-worker',
  'railway',
  'vercel',
  'netlify-preview',
  'netlify-production',
];

const ALLOWED_INTEGRATION_STATUSES = new Set([
  'responding',
  'not-observable',
  'configured',
  'disabled',
]);

const PRIVATE_FIELD_KEY_PATTERN =
  /(?:api[_-]?key|secret|token|password|connection[_-]?string|private[_-]?credential|runtime[_-]?origin)/i;

const assertNoPrivateRecordFields = (records) => {
  const visited = new WeakSet();
  const inspect = (value) => {
    if (value === null || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    for (const [key, nestedValue] of Object.entries(value)) {
      assert.doesNotMatch(
        key,
        PRIVATE_FIELD_KEY_PATTERN,
        'public integration records must not contain private fields',
      );
      inspect(nestedValue);
    }
  };
  inspect(records);
};

export const validateIntegrationRegistry = (body) => {
  assert.equal(body?.ok, true, 'integration registry must report ok=true');
  assert.equal(body?.policy?.secretsExposed, false);
  assert.equal(body?.policy?.privateCredentialsReturned, false);
  assert.equal(body?.policy?.privateRuntimeConfigurationIsNotExposed, true);

  const integrations = body?.integrations;
  assert.ok(Array.isArray(integrations), 'integration registry must return an array');
  const byId = new Map(integrations.map((item) => [item.id, item]));
  assert.equal(byId.size, integrations.length, 'integration identifiers must be unique');

  for (const id of REQUIRED_INTEGRATION_IDS) {
    assert.ok(byId.has(id), 'integration registry is missing ' + id);
  }
  for (const item of integrations) {
    assert.ok(ALLOWED_INTEGRATION_STATUSES.has(item.status),
      'integration ' + item.id + ' has an unsupported status');
    assertNoPrivateRecordFields([item]);
  }
  for (const id of PRIVATE_RUNTIME_INTEGRATION_IDS) {
    assert.equal(byId.get(id)?.status, 'not-observable',
      'private runtime integration ' + id + ' must remain not-observable');
  }
  assert.equal(byId.get('cloudflare-worker')?.status, 'responding');
  for (const id of ['railway', 'vercel', 'netlify-production']) {
    assert.equal(byId.get(id)?.status, 'disabled');
  }
  assert.equal(byId.get('netlify-preview')?.status, 'configured');
  assert.match(byId.get('netlify-preview')?.detail || '', /preview-only/i);
  return integrations;
};

export const validateDataStatus = (body) => {
  assert.equal(body?.ok, true, 'data status must report ok=true');
  assert.equal(body?.policy?.verifiedMeansEvidenceBacked, true);
  assert.equal(body?.policy?.configuredDoesNotMeanVerified, true);
  assert.equal(body?.policy?.estimatedDoesNotMeanVerified, true);
  assert.equal(body?.policy?.humanFinalAuthority, true);
  assert.equal(body?.policy?.privateRuntimeConfigurationIsNotExposed, true);

  const data = body?.data;
  assert.ok(Array.isArray(data), 'data status must return a data array');
  const byId = new Map(data.map((item) => [item.id, item]));
  assert.equal(byId.size, data.length, 'data status identifiers must be unique');
  for (const id of REQUIRED_INTEGRATION_IDS) {
    assert.ok(byId.has(id), 'data status is missing ' + id);
  }
  assertNoPrivateRecordFields(data);

  for (const item of data) {
    assert.equal(item.verificationStatus, 'not-verified',
      'data source ' + item.id + ' must remain not-verified without qualifying evidence');
    assert.equal(item.verificationEvidence, null,
      'data source ' + item.id + ' must not claim evidence without a verifier');
  }
  for (const id of PRIVATE_RUNTIME_INTEGRATION_IDS) {
    assert.equal(byId.get(id)?.configurationStatus, 'not-observable',
      'private runtime configuration for ' + id + ' must remain not-observable');
  }
  assert.equal(byId.get('cloudflare-worker')?.configurationStatus, 'not-observable');
  assert.equal(byId.get('netlify-preview')?.configurationStatus, 'configured');
  for (const id of ['railway', 'vercel', 'netlify-production']) {
    assert.equal(byId.get(id)?.configurationStatus, 'disabled');
  }

  const summary = body.summary;
  assert.equal(summary?.total, data.length);
  assert.equal(summary?.verified, 0);
  assert.equal(summary?.notVerified, data.length);
  assert.equal(summary?.configured,
    data.filter((item) => item.configurationStatus === 'configured').length);
  assert.equal(summary?.needsConfiguration,
    data.filter((item) => item.configurationStatus === 'needs-configuration').length);
  assert.equal(summary?.notObservable,
    data.filter((item) => item.configurationStatus === 'not-observable').length,
  'notObservable summary must match the data rows');
  return data;
};

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

const PRODUCTION_WORKER_ORIGIN = 'https://glorifier.glorifier.workers.dev';

const fetchProductionBuildInfo = (options) =>
  fetch(new URL('/api/build-info', PRODUCTION_WORKER_ORIGIN), options);

export const validateBuildInfo = (body, expectedCommit) => {
  assert.ok(typeof expectedCommit === 'string' && /^[0-9a-f]{40}$/i.test(expectedCommit),
    'expected Git commit SHA must be a 40-character hexadecimal value');
  assert.equal(body?.ok, true, 'build-info must report ok=true');
  assert.equal(body?.status, 'source-provenance-verified');
  assert.equal(body?.repository, 'https://github.com/GLORIFIER7/GLORIFIER');
  assert.ok(/^[0-9a-f]{40}$/i.test(body?.git?.commit || ''),
    'build-info must expose a 40-character source commit SHA');
  assert.equal(body.git.commit.toLowerCase(), expectedCommit.toLowerCase(),
    'deployed Worker source commit does not match the expected commit');
  assert.equal(body?.git?.ref, 'refs/heads/main',
    'production Worker must identify the protected main branch');
  assert.ok(/^\d{1,20}$/.test(body?.git?.runId || ''),
    'build-info must expose the GitHub Actions run ID');
  assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body?.worker?.versionId || ''),
    'build-info must expose the Cloudflare Worker version ID');
  assert.ok(typeof body?.worker?.versionTimestamp === 'string' &&
    Number.isFinite(Date.parse(body.worker.versionTimestamp)),
  'build-info must expose a valid Cloudflare version timestamp');
  assert.ok(body.worker.versionTag === null || typeof body.worker.versionTag === 'string',
    'build-info version tag must be a string or null');
  return body;
};

export const verifyBuildProvenance = async (
  fetchRequest = fetch,
  expectedCommit = process.env.GITHUB_SHA,
) => {
  assert.ok(typeof expectedCommit === 'string' && /^[0-9a-f]{40}$/i.test(expectedCommit),
    'expected Git commit SHA must be a 40-character hexadecimal value');
  console.log('GLORIFIER production smoke: verifying exact deployed source commit and Cloudflare version');
  const response = await requestJson((options) =>
    fetchRequest(new URL('/api/build-info', PRODUCTION_WORKER_ORIGIN), options));
  return validateBuildInfo(response.body, expectedCommit);
};

export const verifyPublicReadModels = async (fetchRequest = fetch) => {
  console.log('GLORIFIER production smoke: checking public integration registry and data-status read models');
  const getEndpoint = (pathname) => (options) =>
    fetchRequest(new URL(pathname, PRODUCTION_WORKER_ORIGIN), options);
  const [integrationsResponse, dataStatusResponse] = await Promise.all([
    requestJson(getEndpoint('/api/integrations')),
    requestJson(getEndpoint('/api/data-status')),
  ]);
  const integrations = validateIntegrationRegistry(integrationsResponse.body);
  const data = validateDataStatus(dataStatusResponse.body);
  return { integrations: integrations.length, dataRows: data.length };
};

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

const SAFE_SMOKE_FAILURE_MESSAGES = new Map([
  ['503:NEON_HYPERDRIVE_NOT_CONFIGURED', 'HTTP 503: NEON_HYPERDRIVE_NOT_CONFIGURED'],
  ['401:AUTHENTICATION_REQUIRED', 'HTTP 401: AUTHENTICATION_REQUIRED'],
  ['503:MCP_RATE_LIMITER_NOT_CONFIGURED', 'HTTP 503: MCP_RATE_LIMITER_NOT_CONFIGURED'],
]);

export const formatSmokeFailure = (error) => {
  if (!(error instanceof Error)) return 'unknown error';
  if (error.name === 'AssertionError') return 'assertion failed';

  const httpError = /^Production endpoint returned HTTP (\d{3}): ([\s\S]*)$/.exec(error.message);
  if (httpError) {
    const status = Number(httpError[1]);
    if (!Number.isInteger(status) || status < 100 || status > 599) return 'unknown error';
    const code = httpError[2].trim();
    return SAFE_SMOKE_FAILURE_MESSAGES.get(`${status}:${code}`) ?? `HTTP ${status}`;
  }

  const nonJson = /^Production endpoint returned non-JSON content \(HTTP (\d{3})\)$/.exec(error.message);
  if (nonJson) {
    const status = Number(nonJson[1]);
    return Number.isInteger(status) && status >= 100 && status <= 599
      ? `non-JSON response (HTTP ${status})`
      : 'unknown error';
  }

  return 'smoke failed (unexpected error)';
};

export const runProductionSmoke = async () => {
  const provenance = await verifyBuildProvenance();
  const { counts, runtime } = await verifyWorkerAndDatabase();
  await verifyUnauthenticatedBoundary();
  const identity = await verifyIdentity();
  const publicReadModels = await verifyPublicReadModels();
  console.log('Deployed source commit verified: ' + provenance.git.commit + ' (Worker version ' + provenance.worker.versionId + ').');
  console.log('Neon exact operational counts verified for all six reporting tables.');
  console.log('Production public read models verified: ' + publicReadModels.integrations + ' integrations and ' + publicReadModels.dataRows + ' data records.');
  console.log('MCP was not probed: its protocol endpoint requires POST and is excluded from GET-only production smoke checks.');
  reportReadinessWarnings(identity, runtime);
  console.log('PRODUCTION CRITICAL CONTRACTS VERIFIED: exact source provenance, Worker, Neon database, exact counts, unauthenticated boundary, public read models, and identity response contract.');
  console.log('This smoke test does not assert MCP protocol interoperability, organizational identity readiness, Neural execution, user login, or AI-provider execution.');
  return { counts, identityStatus: identity.body?.status, runtime, publicReadModels, provenance };
};

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    await runProductionSmoke();
  } catch (error) {
    console.error(`GLORIFIER production smoke failed: ${formatSmokeFailure(error)}`);
    process.exitCode = 1;
  }
}
