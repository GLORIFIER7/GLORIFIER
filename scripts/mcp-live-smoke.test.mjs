import assert from 'node:assert/strict';
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

function fixtureFetch(calls) {
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
      result = {
        resultType: 'complete',
        _meta: { 'io.modelcontextprotocol/serverInfo': serverInfo },
        tools,
      };
    } else if (body.method === 'tools/call') {
      result = {
        resultType: 'complete',
        _meta: { 'io.modelcontextprotocol/serverInfo': serverInfo },
        content: [{ type: 'text', text: JSON.stringify({
          full_name: 'GLORIFIER7/GLORIFIER',
          name: 'GLORIFIER',
          default_branch: 'main',
        }) }],
      };
    } else {
      throw new Error(`Unexpected MCP method: ${body.method}`);
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
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
