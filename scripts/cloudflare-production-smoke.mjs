import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const PRODUCTION_BASE_URL = 'https://glorifier.glorifier.workers.dev';
const EXPECTED_MCP_TOOLS = [
  'github_get_repository',
  'github_list_open_pull_requests',
  'github_list_workflow_runs',
  'github_read_file',
].sort();

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
  assert.deepEqual(tools.map((tool) => tool.name).sort(), EXPECTED_MCP_TOOLS,
    'production MCP must expose only the four approved read-only GitHub tools');
  assert.ok(tools.every((tool) =>
    tool.annotations?.readOnlyHint === true &&
    tool.annotations?.destructiveHint === false &&
    !/(write|create|update|delete|merge|push)/i.test(tool.name)),
  'every production MCP tool must explicitly be read-only and non-destructive');
  return tools;
};

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const requestJson = async (baseUrl, path, options = {}, acceptedStatuses = [200]) => {
  const attempts = 4;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(new URL(path, baseUrl), {
        ...options,
        signal: AbortSignal.timeout(15_000),
      });
      const raw = await response.text();
      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`${path} returned non-JSON content (HTTP ${response.status})`);
      }
      if (acceptedStatuses.includes(response.status)) {
        return { status: response.status, body };
      }
      const error = new Error(`${path} returned HTTP ${response.status}: ${String(body?.code ?? body?.error ?? 'unexpected response')}`);
      if (response.status < 500 || attempt === attempts - 1) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
    }
    await sleep(2_000 * (attempt + 1));
  }
  throw lastError ?? new Error(`Unable to verify ${path}`);
};

export const runProductionSmoke = async ({
  baseUrl = process.env.GLORIFIER_PRODUCTION_URL || PRODUCTION_BASE_URL,
} = {}) => {
  const base = new URL(baseUrl);
  assert.equal(base.protocol, 'https:', 'production smoke must use HTTPS');
  assert.equal(base.username, '');
  assert.equal(base.password, '');

  console.log('GLORIFIER production smoke: checking Worker and static assets');
  const health = await requestJson(base, '/api/health');
  assert.equal(health.body?.ok, true);
  assert.equal(health.body?.status, 'worker-ready');

  console.log('GLORIFIER production smoke: checking Neon exact operational counts');
  const reports = await requestJson(base, '/api/reports/summary');
  const counts = validateOperationalSummary(reports.body);
  console.log(`Neon exact counts verified: ${JSON.stringify(counts)}`);

  console.log('GLORIFIER production smoke: checking live runtime database provider');
  const runtimeResponse = await requestJson(base, '/api/runtime-verification?probeAi=false');
  const runtime = validateRuntimeVerification(runtimeResponse.body);
  console.log(`Neon runtime probe verified; latencyMs=${runtime.database.latencyMs ?? 'not-reported'}`);

  console.log('GLORIFIER production smoke: checking unauthenticated application boundary');
  const appState = await requestJson(base, '/api/app-state', {}, [401]);
  const validAuthFailure = appState.body?.code === 'AUTHENTICATION_REQUIRED' ||
    (appState.body?.code === undefined && appState.body?.ok === false);
  assert.equal(validAuthFailure, true,
    'unauthenticated /api/app-state must return a structured authentication-required response');

  console.log('GLORIFIER production smoke: checking MCP initialize');
  const mcpHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  const initialize = await requestJson(base, '/mcp', {
    method: 'POST',
    headers: mcpHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'GLORIFIER-production-smoke', version: '1' },
      },
    }),
  });
  validateMcpInitialize(initialize.body);

  console.log('GLORIFIER production smoke: checking MCP read-only tool surface');
  const toolsResponse = await requestJson(base, '/mcp', {
    method: 'POST',
    headers: mcpHeaders,
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  });
  const tools = validateMcpReadOnlyTools(toolsResponse.body);
  console.log(`MCP verified: ${tools.length} read-only tools exposed`);

  console.log('GLORIFIER production smoke: checking organizational identity readiness');
  const identity = await requestJson(base, '/api/identity', {}, [200, 503]);
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
      console.warn(`PRODUCTION READINESS WARNING: ${label}: ${dependency?.status ?? 'not-observed'}`);
    }
  }

  console.log('PRODUCTION CRITICAL CONTRACTS VERIFIED: Worker, Neon database, exact counts, auth boundary, MCP protocol and read-only tool policy.');
  console.log('This smoke test does not assert organizational identity, Neural execution, user login, or AI-provider execution.');
  return { counts, mcpTools: tools.length, identityStatus: identity.body?.status, runtime };
};

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runProductionSmoke().catch((error) => {
    console.error('GLORIFIER production smoke failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
