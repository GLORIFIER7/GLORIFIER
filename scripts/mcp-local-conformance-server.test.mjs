import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createHarnessErrorEnvelope,
  isFetchUnsupportedMethod,
  toLoopbackRequestUrl,
} from './mcp-local-conformance-server.mjs';

test('absolute-form request targets are pinned to the local loopback origin', () => {
  const target = toLoopbackRequestUrl('http://attacker.example/mcp?query=1');
  assert.equal(target.origin, 'http://127.0.0.1:8787');
  assert.equal(target.pathname, '/mcp');
  assert.equal(target.search, '?query=1');
});

test('harness failures preserve JSON-RPC error envelopes for oversized and internal failures', () => {
  assert.deepEqual(createHarnessErrorEnvelope(413), {
    jsonrpc: '2.0',
    id: null,
    error: {
      code: -32600,
      message: 'Local MCP conformance request exceeds the 1,048,576-byte harness safety limit.',
    },
  });
  assert.deepEqual(createHarnessErrorEnvelope(500), {
    jsonrpc: '2.0',
    id: null,
    error: {
      code: -32603,
      message: 'Local MCP conformance adapter failed.',
    },
  });
});

test('CONNECT requests receive an explicit 405 response before Fetch Request construction', async () => {
  const source = await readFile(new URL('./mcp-local-conformance-server.mjs', import.meta.url), 'utf8');
  const serverDeclaration = source.indexOf('const server = createServer');
  const connectHandler = source.indexOf("server.on('connect'");
  assert.ok(serverDeclaration >= 0 && connectHandler > serverDeclaration, 'CONNECT handler must be registered after the HTTP server is initialized');
  assert.match(source, /server\.on\('connect',[\s\S]*?405 Method Not Allowed[\s\S]*?Allow: POST/);
});

test('Fetch-forbidden request methods are rejected before constructing Request objects', () => {
  for (const method of ['TRACE', 'CONNECT', 'TRACK']) {
    assert.equal(isFetchUnsupportedMethod(method), true);
  }
  assert.equal(isFetchUnsupportedMethod('POST'), false);
  assert.equal(isFetchUnsupportedMethod('GET'), false);
});

test('the PR-controlled MCP conformance job does not receive a GitHub credential', async () => {
  const workflow = await readFile(new URL('../.github/workflows/interoperability-linux.yml', import.meta.url), 'utf8');
  const start = workflow.indexOf('  mcp-local-conformance:');
  assert.notEqual(start, -1);
  const tail = workflow.slice(start);
  const nextJob = tail.search(/\n  [a-z0-9_-]+:\s*$/m);
  const job = nextJob === -1 ? tail : tail.slice(0, nextJob);
  assert.match(job, /contents:\s*read/);
  assert.doesNotMatch(job, /GITHUB_MCP_READ_TOKEN|github\.token|pull-requests:\s*read|actions:\s*read/);
});

test('all advertised MCP TCK scenarios run before the workflow reports aggregate failure', async () => {
  const workflow = await readFile(new URL('../.github/workflows/interoperability-linux.yml', import.meta.url), 'utf8');
  const start = workflow.indexOf('for scenario in tools-list tools-call-error dns-rebinding-protection http-header-validation; do');
  const end = workflow.indexOf('- name: Capture local MCP harness diagnostics', start);
  assert.ok(start >= 0 && end > start);
  const loop = workflow.slice(start, end);
  assert.match(loop, /if node dist\/index\.js server/);
  assert.match(loop, /failures\+=\("\$scenario"\)/);
  assert.match(loop, /MCP conformance scenarios failed/);
  assert.match(loop, /exit 1/);
});

test('GitHub MCP tool arguments have one shared validation boundary', async () => {
  const source = await readFile(new URL('../src/lib/github-mcp.ts', import.meta.url), 'utf8');
  const toolStart = source.indexOf('const listPullRequestsTool');
  const validatorStart = source.indexOf('const getToolArgumentError');
  const toolSection = source.slice(toolStart, validatorStart);
  assert.ok(toolStart >= 0 && validatorStart > toolStart);
  assert.doesNotMatch(toolSection, /isValidPerPage|state !==|per_page must be|path is required|ref must be a string/);
  assert.match(source, /const callTool =[\s\S]*?validateToolArguments\(name, args\)/);
  assert.match(source, /const getRateLimitableMcpToolCall =[\s\S]*?validateToolArguments\(params\.name, params\.arguments\)/);
});
