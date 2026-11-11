import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runMcpLiveSmoke } from './mcp-live-smoke.mjs';

const targetUrl = 'https://glorifier.glorifier.workers.dev/mcp';
const serverInfo = { name: 'GLORIFIER GitHub Read-Only', version: '1.1.0' };
const tools = [
  'github_get_repository',
  'github_list_open_pull_requests',
  'github_list_workflow_runs',
  'github_read_file',
].map((name) => ({
  name,
  description: `Read-only ${name}`,
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
}));

function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).reverse().map(([key, nested]) => [key, reverseObjectKeys(nested)]),
    );
  }
  return value;
}

function fixtureFetch(calls, options = {}) {
  let toolsListCount = 0;
  return async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), init, body });
    let result;
    if (body.method === 'server/discover') {
      result = {
        resultType: 'complete',
        supportedVersions: ['2026-07-28'],
        capabilities: { tools: {} },
        _meta: { 'io.modelcontextprotocol/serverInfo': serverInfo },
      };
    } else if (body.method === 'tools/list') {
      toolsListCount += 1;
      const responseTools = options.reorderToolObjectKeys && toolsListCount === 2
        ? tools.map(reverseObjectKeys)
        : tools;
      result = {
        resultType: 'complete',
        _meta: { 'io.modelcontextprotocol/serverInfo': serverInfo },
        tools: responseTools,
      };
    } else if (body.method === 'tools/call') {
      result = {
        resultType: 'complete',
        _meta: { 'io.modelcontextprotocol/serverInfo': serverInfo },
        ...(options.invalidIsError ? { isError: 'true' } : {}),
        content: [{ type: 'text', text: JSON.stringify({
          full_name: 'GLORIFIER7/GLORIFIER',
          name: 'GLORIFIER',
          default_branch: 'main',
        }) }],
      };
    } else {
      throw new Error(`Unexpected MCP method: ${body.method}`);
    }
    const envelope = JSON.stringify({ jsonrpc: '2.0', id: body.id, result });
    if (options.sseMethods?.includes(body.method)) {
      return new Response(`event: message\r\ndata: ${envelope}\r\n\r\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    return new Response(envelope, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

test('runs modern discovery, deterministic tool-list, and one read-only repository tool call', async () => {
  const calls = [];
  const result = await runMcpLiveSmoke({
    targetUrl,
    allowedHosts: 'glorifier.glorifier.workers.dev',
    fetchImpl: fixtureFetch(calls),
  });

  assert.equal(result.protocolVersion, '2026-07-28');
  assert.equal(result.discovery, true);
  assert.equal(result.toolCount, 4);
  assert.equal(result.deterministicList, true);
  assert.equal(result.readOnlyTool, 'github_get_repository');
  assert.equal(result.repository, 'GLORIFIER7/GLORIFIER');
  assert.equal(calls.length, 4);
  assert(calls.every((entry) => entry.init.headers.Accept === 'application/json, text/event-stream'));

  const call = calls.find((entry) => entry.body.method === 'tools/call');
  assert.equal(call.body.params.name, 'github_get_repository');
  assert.equal(call.init.headers['Mcp-Name'], 'github_get_repository');
  assert.equal(call.init.headers['Mcp-Method'], 'tools/call');
  assert.equal(call.init.headers['MCP-Protocol-Version'], '2026-07-28');
  assert.equal(call.body.params._meta['io.modelcontextprotocol/protocolVersion'], '2026-07-28');
  assert.deepEqual(call.body.params.arguments, {});
});

test('fails closed when a live MCP request returns an HTTP error', async () => {
  await assert.rejects(
    runMcpLiveSmoke({
      targetUrl,
      allowedHosts: 'glorifier.glorifier.workers.dev',
      fetchImpl: async () => new Response('unavailable', { status: 503 }),
    }),
    /HTTP 503/,
  );
});

test('fails closed when the server returns a JSON-RPC error envelope', async () => {
  await assert.rejects(
    runMcpLiveSmoke({
      targetUrl,
      allowedHosts: 'glorifier.glorifier.workers.dev',
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body);
        return new Response(JSON.stringify({
          jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found.' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    }),
    /JSON-RPC error/,
  );
});

test('accepts Streamable HTTP SSE responses for the fixed read-only requests', async () => {
  const calls = [];
  const result = await runMcpLiveSmoke({
    targetUrl,
    allowedHosts: 'glorifier.glorifier.workers.dev',
    fetchImpl: fixtureFetch(calls, {
      sseMethods: ['server/discover', 'tools/list', 'tools/call'],
    }),
  });

  assert.equal(result.repository, 'GLORIFIER7/GLORIFIER');
  assert.equal(calls.length, 4);
  assert(calls.every((entry) => entry.init.headers.Accept === 'application/json, text/event-stream'));
});

test('compares deterministic tool contents independently of JSON object key order', async () => {
  const calls = [];
  const result = await runMcpLiveSmoke({
    targetUrl,
    allowedHosts: 'glorifier.glorifier.workers.dev',
    fetchImpl: fixtureFetch(calls, { reorderToolObjectKeys: true }),
  });

  assert.equal(result.deterministicList, true);
});

test('rejects a malformed non-boolean MCP isError flag', async () => {
  await assert.rejects(
    runMcpLiveSmoke({
      targetUrl,
      allowedHosts: 'glorifier.glorifier.workers.dev',
      fetchImpl: fixtureFetch([], { invalidIsError: true }),
    }),
    /isError/i,
  );
});


test('legacy official MCP scenario requires both target validation and runner build success', async () => {
  const workflow = await readFile(new URL('../.github/workflows/external-mcp-conformance.yml', import.meta.url), 'utf8');
  const step = workflow.match(/- name: Run official MCP legacy tools-list scenario \\(2025-11-25\\)\\s+id: official_mcp_legacy\\s+if: ([^\\n]+)/);

  assert.ok(step, 'legacy MCP scenario step and its guard must exist');
  assert.equal(
    step[1],
    "${{ always() && steps.validate_target.outcome == 'success' && steps.build_official_runner.outcome == 'success' }}",
  );
});
