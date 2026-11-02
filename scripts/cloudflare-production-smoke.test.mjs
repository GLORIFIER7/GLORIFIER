import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';

test('production smoke probes never send HTTP mutation methods to the live Worker', () => {
  const workflow = readFileSync(new URL('../.github/workflows/cloudflare-worker.yml', import.meta.url), 'utf8');
  const smokeSource = readFileSync(new URL('./cloudflare-production-smoke.mjs', import.meta.url), 'utf8');

  assert.doesNotMatch(smokeSource, /method:\\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i,
    'the production smoke script must not issue HTTP mutation methods');
  assert.doesNotMatch(workflow, /--request\\s+(?:POST|PUT|PATCH|DELETE)\\b/i,
    'the production deployment workflow must not issue HTTP mutation methods');
});

import test from 'node:test';
import {
  validateMcpInitialize,
  validateMcpReadOnlyTools,
  validateOperationalSummary,
  validateRuntimeVerification,
  requestJson,
} from './cloudflare-production-smoke.mjs';

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
