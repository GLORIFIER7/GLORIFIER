import assert from 'node:assert/strict';
import {
  MCP_PROTOCOL_VERSION,
  MCP_JSONRPC_PATH,
  MCP_TASK_STATUS_TOOL,
  createMCPJsonRpcHandler,
  validateMCPRequestHeaders,
} from './mcp-v2026';

const task = {
  id: 'task-owned-by-user',
  parentTaskId: null,
  requesterAgentId: 'owner-1',
  capability: 'research',
  objective: 'private objective must not be disclosed',
  status: 'queued' as const,
  updatedAt: '2026-10-30T00:00:00.000Z',
  result: { private: 'result must not be disclosed' },
};

const dependencies = {
  requesterAgentId: 'owner-1',
  getTask: async (id: string) => id === task.id ? task : null,
};

const requestMeta = {
  'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL_VERSION,
  'io.modelcontextprotocol/clientInfo': { name: 'test-client', version: '1.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

const validHeaders = {
  protocolVersion: MCP_PROTOCOL_VERSION,
  method: 'server/discover',
  name: null,
};

assert.equal(MCP_JSONRPC_PATH, '/api/mcp/v1');
assert.equal(MCP_TASK_STATUS_TOOL, 'get_task_status');

const handler = createMCPJsonRpcHandler(dependencies);
const discover = await handler({
  jsonrpc: '2.0',
  id: 'discover-1',
  method: 'server/discover',
  params: { _meta: requestMeta },
}, validHeaders);
assert.equal(discover.error, undefined);
assert.deepEqual(discover.result.supportedVersions, [MCP_PROTOCOL_VERSION]);
assert.deepEqual(discover.result.capabilities, { tools: {} });
assert.deepEqual(discover.result._meta['io.modelcontextprotocol/serverInfo'], {
  name: 'GLORIFIER Services',
  version: '0.2.1',
});

const listTools = await handler({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
  params: { _meta: requestMeta },
}, { ...validHeaders, method: 'tools/list' });
assert.equal(listTools.error, undefined);
assert.equal(listTools.result.tools.length, 1);
assert.equal(listTools.result.tools[0].name, 'get_task_status');
assert.deepEqual(listTools.result.tools[0].inputSchema.required, ['taskId']);
assert.equal(listTools.result.tools[0].inputSchema.additionalProperties, false);

const callTool = await handler({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: {
    _meta: requestMeta,
    name: MCP_TASK_STATUS_TOOL,
    arguments: { taskId: task.id },
  },
}, { ...validHeaders, method: 'tools/call', name: MCP_TASK_STATUS_TOOL });
assert.equal(callTool.error, undefined);
assert.equal(callTool.result.isError, false);
assert.equal(callTool.result.structuredContent.taskId, task.id);
assert.equal(callTool.result.structuredContent.status, 'queued');
assert.equal(JSON.stringify(callTool.result).includes('private objective'), false);
assert.equal(JSON.stringify(callTool.result).includes('result must not be disclosed'), false);

const crossOwnerHandler = createMCPJsonRpcHandler({
  requesterAgentId: 'other-user',
  getTask: async () => task,
});
const crossOwnerCall = await crossOwnerHandler({
  jsonrpc: '2.0',
  id: 4,
  method: 'tools/call',
  params: { _meta: requestMeta, name: MCP_TASK_STATUS_TOOL, arguments: { taskId: task.id } },
}, { ...validHeaders, method: 'tools/call', name: MCP_TASK_STATUS_TOOL });
assert.equal(crossOwnerCall.error, undefined);
assert.equal(crossOwnerCall.result.isError, true);
assert.match(crossOwnerCall.result.content[0].text, /not found or is not accessible/i);

const malformedArgs = await handler({
  jsonrpc: '2.0',
  id: 5,
  method: 'tools/call',
  params: { _meta: requestMeta, name: MCP_TASK_STATUS_TOOL, arguments: { taskId: task.id, extra: true } },
}, { ...validHeaders, method: 'tools/call', name: MCP_TASK_STATUS_TOOL });
assert.equal(malformedArgs.error.code, -32602);

const unsupportedMethod = await handler({
  jsonrpc: '2.0',
  id: 6,
  method: 'resources/list',
  params: { _meta: requestMeta },
}, { ...validHeaders, method: 'resources/list' });
assert.equal(unsupportedMethod.error.code, -32601);

const unsupportedVersion = await handler({
  jsonrpc: '2.0',
  id: 7,
  method: 'server/discover',
  params: { _meta: { ...requestMeta, 'io.modelcontextprotocol/protocolVersion': '2025-11-25' } },
}, { ...validHeaders, protocolVersion: '2025-11-25' });
assert.equal(unsupportedVersion.error.code, -32022);
assert.deepEqual(unsupportedVersion.error.data, {
  supported: [MCP_PROTOCOL_VERSION],
  requested: '2025-11-25',
});

const missingMeta = await handler({
  jsonrpc: '2.0',
  id: 8,
  method: 'server/discover',
  params: {},
}, validHeaders);
assert.equal(missingMeta.error.code, -32602);

const malformedEnvelope = await handler({ jsonrpc: '1.0', id: 9, method: 'server/discover', params: { _meta: requestMeta } }, validHeaders);
assert.equal(malformedEnvelope.error.code, -32600);

const invalidHeader = validateMCPRequestHeaders({
  method: 'tools/call',
  params: { name: 'get_task_status' },
}, {
  protocolVersion: MCP_PROTOCOL_VERSION,
  method: 'tools/list',
  name: 'get_task_status',
});
assert.equal(invalidHeader?.code, -32020);

console.log('MCP 2026-07-28 JSON-RPC contract tests passed.');
