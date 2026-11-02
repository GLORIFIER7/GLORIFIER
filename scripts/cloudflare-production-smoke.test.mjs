import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  validateDataStatus,
  validateIntegrationRegistry,
  validateMcpInitialize,
  validateMcpReadOnlyTools,
  validateOperationalSummary,
  validateRuntimeVerification,
  requestJson,
  formatSmokeFailure,
} from './cloudflare-production-smoke.mjs';

test('production smoke probes never send HTTP mutation methods to the live Worker', () => {
  const workflow = readFileSync(new URL('../.github/workflows/cloudflare-worker.yml', import.meta.url), 'utf8');
  const smokeSource = readFileSync(new URL('./cloudflare-production-smoke.mjs', import.meta.url), 'utf8');

  assert.doesNotMatch(smokeSource, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i,
    'the production smoke script must not issue HTTP mutation methods');
  assert.doesNotMatch(workflow, /--request\s+(?:POST|PUT|PATCH|DELETE)\b/i,
    'the production deployment workflow must not issue HTTP mutation methods');
  assert.equal(smokeSource.includes('fetchProductionMcp'), false,
    'production smoke must not make MCP POST requests');
});

const reports = {
  ok: true,
  status: 'operational-data-observed',
  evidence: { source: 'neon-hyperdrive', exactRowCounts: true },
  summary: {
    connectionApprovals: 9,
    connectionEvents: 251212,
    registeredConnections: 30,
    intelligenceAnalyses: 266,
    intelligenceEvidence: 1099,
    intelligenceReports: 133,
  },
};

const runtime = {
  ok: true,
  status: 'verified-for-probed-dependencies',
  checks: {
    worker: { ok: true },
    assets: { ok: true },
    database: { ok: true, source: 'neon-hyperdrive', connectionRegistryRows: 30, latencyMs: 100 },
    neural: { ok: false, status: 'not-configured' },
    authentication: { ok: null, status: 'not-probed' },
    ai: { ok: null, executed: false, status: 'not-probed' },
  },
};

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  result: {
    protocolVersion: '2025-03-26',
    serverInfo: { name: 'GLORIFIER GitHub Read-Only' },
    capabilities: { tools: {} },
  },
};

const tools = {
  jsonrpc: '2.0',
  id: 2,
  result: {
    tools: [
      'github_get_repository',
      'github_list_open_pull_requests',
      'github_list_workflow_runs',
      'github_read_file',
    ].map((name) => ({
      name,
      annotations: { readOnlyHint: true, destructiveHint: false },
    })),
  },
};

test('production reports require exact Neon count evidence for all six tables', () => {
  assert.equal(validateOperationalSummary(reports).connectionEvents, 251212);
  assert.throws(() => validateOperationalSummary({
    ...reports,
    evidence: { source: 'supabase-postgrest', exactRowCounts: true },
  }), /Neon Hyperdrive/);
  assert.throws(() => validateOperationalSummary({
    ...reports,
    summary: { ...reports.summary, connectionEvents: -1 },
  }), /safe non-negative exact count/);
});

test('production runtime must prove the live database source is Neon Hyperdrive', () => {
  assert.equal(validateRuntimeVerification(runtime).database.source, 'neon-hyperdrive');
  assert.throws(() => validateRuntimeVerification({
    ...runtime,
    checks: { ...runtime.checks, database: { ok: true, source: 'supabase-postgrest' } },
  }), /Neon/);
});

test('production MCP initialization must advertise the approved protocol and server', () => {
  assert.equal(validateMcpInitialize(initialize).protocolVersion, '2025-03-26');
  assert.throws(() => validateMcpInitialize({
    ...initialize,
    result: { ...initialize.result, protocolVersion: 'unapproved' },
  }), /2025-03-26/);
});

test('production MCP tool surface must be the exact read-only allowlist', () => {
  assert.equal(validateMcpReadOnlyTools(tools).length, 4);
  assert.throws(() => validateMcpReadOnlyTools({
    ...tools,
    result: { tools: [...tools.result.tools, {
      name: 'github_delete_repository',
      annotations: { readOnlyHint: false, destructiveHint: true },
    }] },
  }), /four approved read-only GitHub tools/);
});

test('production smoke request fails immediately for deterministic client errors', async () => {
  let attempts = 0;
  const fetchNotFound = async () => {
    attempts += 1;
    return new Response(JSON.stringify({ code: 'NOT_FOUND' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  await assert.rejects(requestJson(fetchNotFound), /HTTP 404/);
  assert.equal(attempts, 1, 'a deterministic 4xx must not be retried');
});

test('production smoke request fails immediately for non-JSON error responses', async () => {
  let attempts = 0;
  const fetchHtmlError = async () => {
    attempts += 1;
    return new Response('<html>not found</html>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });
  };
  await assert.rejects(requestJson(fetchHtmlError), /non-JSON content/);
  assert.equal(attempts, 1, 'a non-JSON error response must not be retried');
});

test('production smoke failure diagnostics retain safe HTTP codes without response values', () => {
  const knownCode = new Error('Production endpoint returned HTTP 503: NEON_HYPERDRIVE_NOT_CONFIGURED');
  assert.equal(formatSmokeFailure(knownCode), 'HTTP 503: NEON_HYPERDRIVE_NOT_CONFIGURED');

  const untrustedResponseText = new Error('Production endpoint returned HTTP 503: customer-email@example.test');
  assert.equal(formatSmokeFailure(untrustedResponseText), 'HTTP 503');
  assert.doesNotMatch(formatSmokeFailure(untrustedResponseText), /customer-email/);

  const untrustedUppercaseCode = new Error('Production endpoint returned HTTP 503: CUSTOMER_EMAIL_EXPOSED');
  assert.equal(formatSmokeFailure(untrustedUppercaseCode), 'HTTP 503');
  assert.doesNotMatch(formatSmokeFailure(untrustedUppercaseCode), /CUSTOMER_EMAIL/);

  const multilineResponseText = new Error('Production endpoint returned HTTP 503: untrusted response\nprivate detail');
  assert.equal(formatSmokeFailure(multilineResponseText), 'HTTP 503');
  assert.doesNotMatch(formatSmokeFailure(multilineResponseText), /private detail/);

  const assertionFailure = new Error('smoke contract failed');
  assertionFailure.name = 'AssertionError';
  assert.equal(formatSmokeFailure(assertionFailure), 'assertion failed');

  const forgedErrorName = new Error('network failure');
  forgedErrorName.name = 'customer\\nPRIVATE_PAYLOAD';
  assert.equal(formatSmokeFailure(forgedErrorName), 'smoke failed (unexpected error)');
  assert.doesNotMatch(formatSmokeFailure(forgedErrorName), /customer|PRIVATE_PAYLOAD/);
  assert.equal(formatSmokeFailure({ message: 'untrusted response payload' }), 'unknown error');
});


const privateRuntimeIds = [
  'neon',
  'opensea',
  'github-mcp',
  'identity',
  'neural',
  'ai-providers',
];

const integrationRows = [
  ...privateRuntimeIds.map((id) => ({
    id, name: id, category: 'test', status: 'not-observable',
    detail: 'Private runtime configuration is not exposed.',
    publicUrl: 'https://example.test/',
  })),
  {
    id: 'cloudflare-worker', name: 'Cloudflare Workers', category: 'compute',
    status: 'responding', detail: 'This request reached the Worker.',
    publicUrl: 'https://developers.cloudflare.com/workers/',
  },
  {
    id: 'railway', name: 'Railway', category: 'compute', status: 'disabled',
    detail: 'Not a production runtime.', publicUrl: 'https://railway.app/',
  },
  {
    id: 'vercel', name: 'Vercel', category: 'frontend', status: 'disabled',
    detail: 'Not a production frontend.', publicUrl: 'https://vercel.com/',
  },
  {
    id: 'netlify-preview', name: 'Netlify previews', category: 'ci-preview',
    status: 'configured', detail: 'Configured for preview-only builds.',
    publicUrl: 'https://www.netlify.com/',
  },
  {
    id: 'netlify-production', name: 'Netlify production', category: 'frontend',
    status: 'disabled', detail: 'Not a production frontend.',
    publicUrl: 'https://www.netlify.com/',
  },
];

const integrationRegistry = {
  ok: true,
  policy: {
    secretsExposed: false,
    privateCredentialsReturned: false,
    privateRuntimeConfigurationIsNotExposed: true,
  },
  integrations: integrationRows,
};

const dataRows = integrationRows.map((item) => ({
  ...item,
  configurationStatus: item.status === 'responding' || item.status === 'not-observable'
    ? 'not-observable'
    : item.status,
  verificationStatus: 'not-verified',
  verificationEvidence: null,
  truthRule: 'Only qualifying external evidence may change verificationStatus to verified.',
}));

const dataStatus = {
  ok: true,
  policy: {
    verifiedMeansEvidenceBacked: true,
    configuredDoesNotMeanVerified: true,
    estimatedDoesNotMeanVerified: true,
    humanFinalAuthority: true,
    privateRuntimeConfigurationIsNotExposed: true,
  },
  summary: {
    total: dataRows.length,
    verified: 0,
    notVerified: dataRows.length,
    configured: 1,
    needsConfiguration: 0,
    notObservable: dataRows.filter((item) => item.configurationStatus === 'not-observable').length,
  },
  data: dataRows,
};

test('production integration registry exposes only the reviewed static, non-secret contract', () => {
  assert.equal(validateIntegrationRegistry(integrationRegistry).length, integrationRows.length);
  assert.throws(() => validateIntegrationRegistry({
    ...integrationRegistry,
    integrations: integrationRows.map((item) =>
      item.id === 'neon' ? { ...item, status: 'configured' } : item),
  }), /private runtime integration/);
  assert.throws(() => validateIntegrationRegistry({
    ...integrationRegistry,
    integrations: integrationRows.map((item) =>
      item.id === 'opensea' ? { ...item, apiKey: 'must-not-be-returned' } : item),
  }), /private fields/);
});

test('production data-status keeps every source not-verified and summaries exact', () => {
  assert.equal(validateDataStatus(dataStatus).length, dataRows.length);
  assert.throws(() => validateDataStatus({
    ...dataStatus,
    data: dataRows.map((item) =>
      item.id === 'neon' ? { ...item, verificationStatus: 'verified' } : item),
  }), /must remain not-verified/);
  assert.throws(() => validateDataStatus({
    ...dataStatus,
    summary: { ...dataStatus.summary, notObservable: 0 },
  }), /notObservable summary/);
});
