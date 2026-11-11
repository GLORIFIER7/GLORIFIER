import { validateMcpConformanceTarget } from './mcp-conformance-target.mjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MCP_PROTOCOL_VERSION = '2026-07-28';
const PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';
const CLIENT_CAPABILITIES_META_KEY = 'io.modelcontextprotocol/clientCapabilities';
const CLIENT_INFO_META_KEY = 'io.modelcontextprotocol/clientInfo';
const SERVER_INFO_META_KEY = 'io.modelcontextprotocol/serverInfo';
const EXPECTED_TOOLS = [
  'github_get_repository',
  'github_list_open_pull_requests',
  'github_list_workflow_runs',
  'github_read_file',
];
const REQUEST_TIMEOUT_MS = 15_000;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function readSseEnvelope(response, expectedId, method) {
  const raw = await response.text();
  let matchingEnvelope;

  for (const event of raw.split(/\r?\n\r?\n/)) {
    const dataLines = event.split(/\r?\n/).flatMap((line) => {
      if (line.startsWith(':')) return [];
      const separator = line.indexOf(':');
      if (separator < 0 || line.slice(0, separator) !== 'data') return [];
      const value = line.slice(separator + 1);
      return [value.startsWith(' ') ? value.slice(1) : value];
    });

    if (dataLines.length === 0) continue;

    let envelope;
    try {
      envelope = JSON.parse(dataLines.join('\n'));
    } catch {
      throw new Error(`MCP ${method} SSE stream contained invalid JSON data.`);
    }
    if (envelope?.id === expectedId) matchingEnvelope = envelope;
  }

  assert(matchingEnvelope, `MCP ${method} SSE stream did not contain response ID ${expectedId}.`);
  return matchingEnvelope;
}

function buildMeta() {
  return {
    [PROTOCOL_VERSION_META_KEY]: MCP_PROTOCOL_VERSION,
    [CLIENT_CAPABILITIES_META_KEY]: {},
    [CLIENT_INFO_META_KEY]: { name: 'GLORIFIER interoperability smoke', version: '1.0.0' },
  };
}

async function postRpc({ endpoint, method, id, params = {}, fetchImpl }) {
  const url = new URL(endpoint);
  const headers = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    Origin: url.origin,
    'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    'Mcp-Method': method,
  };
  if (method === 'tools/call') {
    assert(typeof params.name === 'string' && params.name.length > 0, 'MCP tools/call requires a tool name.');
    headers['Mcp-Name'] = params.name;
  }

  const requestParams = { ...params, _meta: buildMeta() };
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params: requestParams }),
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`MCP ${method} request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  assert(response.status === 200, `MCP ${method} returned HTTP ${response.status}; expected HTTP 200.`);
  const contentType = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  let envelope;
  if (contentType === 'application/json') {
    try {
      envelope = await response.json();
    } catch {
      throw new Error(`MCP ${method} response was not valid JSON.`);
    }
  } else if (contentType === 'text/event-stream') {
    envelope = await readSseEnvelope(response, id, method);
  } else {
    throw new Error(`MCP ${method} returned unsupported content type: ${contentType || 'missing'}.`);
  }
  assert(envelope?.jsonrpc === '2.0', `MCP ${method} response is not a JSON-RPC 2.0 envelope.`);
  assert(envelope.id === id, `MCP ${method} response ID does not match the request.`);
  if (envelope.error) {
    throw new Error(`MCP ${method} returned JSON-RPC error ${envelope.error.code}: ${envelope.error.message}`);
  }
  assert(envelope.result && typeof envelope.result === 'object', `MCP ${method} response is missing a result object.`);
  assert(envelope.result.resultType === 'complete', `MCP ${method} did not return resultType=complete.`);
  assert(envelope.result._meta?.[SERVER_INFO_META_KEY], `MCP ${method} response is missing server identity metadata.`);
  return envelope.result;
}

function validateDiscovery(result) {
  assert(Array.isArray(result.supportedVersions), 'MCP discovery did not return supportedVersions.');
  assert(result.supportedVersions.includes(MCP_PROTOCOL_VERSION), 'MCP discovery does not advertise 2026-07-28.');
  assert(result.capabilities && typeof result.capabilities === 'object' && result.capabilities.tools,
    'MCP discovery did not advertise the tools capability.');
}

function validateTools(result) {
  assert(Array.isArray(result.tools), 'MCP tools/list did not return a tools array.');
  const names = result.tools.map((tool) => tool?.name);
  assert(JSON.stringify(names) === JSON.stringify(EXPECTED_TOOLS),
    `MCP tools/list did not return the expected fixed read-only tool set and order: ${JSON.stringify(names)}.`);

  for (const tool of result.tools) {
    assert(typeof tool.description === 'string' && tool.description.trim().length > 0,
      `MCP tool ${tool.name} is missing a description.`);
    assert(tool.inputSchema && typeof tool.inputSchema === 'object' && !Array.isArray(tool.inputSchema),
      `MCP tool ${tool.name} is missing an input schema.`);
    assert(tool.annotations?.readOnlyHint === true, `MCP tool ${tool.name} is not marked read-only.`);
    assert(tool.annotations?.destructiveHint === false, `MCP tool ${tool.name} is not marked non-destructive.`);
  }
}

function parseRepositoryToolResult(result) {
  assert(
    result.isError === undefined || typeof result.isError === 'boolean',
    'MCP github_get_repository returned a malformed isError flag.',
  );
  assert(result.isError !== true, 'MCP github_get_repository tool call returned isError=true.');
  assert(Array.isArray(result.content), 'MCP github_get_repository result is missing content.');
  const textContent = result.content.find((item) => item?.type === 'text' && typeof item.text === 'string');
  assert(textContent, 'MCP github_get_repository result has no text content.');

  let repository;
  try {
    repository = JSON.parse(textContent.text);
  } catch {
    throw new Error('MCP github_get_repository did not return a JSON repository record.');
  }
  assert(repository.full_name === 'GLORIFIER7/GLORIFIER', 'MCP read tool returned an unexpected repository identity.');
  assert(repository.name === 'GLORIFIER', 'MCP read tool returned an unexpected repository name.');
  return repository;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`,
    );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function runMcpLiveSmoke({ targetUrl, allowedHosts, fetchImpl = globalThis.fetch }) {
  assert(typeof fetchImpl === 'function', 'A Fetch implementation is required.');
  const endpoint = validateMcpConformanceTarget(targetUrl, allowedHosts);

  const discovery = await postRpc({ endpoint, method: 'server/discover', id: 1, fetchImpl });
  validateDiscovery(discovery);

  const firstTools = await postRpc({ endpoint, method: 'tools/list', id: 2, fetchImpl });
  validateTools(firstTools);
  const secondTools = await postRpc({ endpoint, method: 'tools/list', id: 3, fetchImpl });
  validateTools(secondTools);
  const deterministicList = stableStringify(firstTools.tools) === stableStringify(secondTools.tools);
  assert(deterministicList, 'MCP tools/list order or contents changed between consecutive requests.');

  const repositoryResult = await postRpc({
    endpoint,
    method: 'tools/call',
    id: 4,
    params: { name: 'github_get_repository', arguments: {} },
    fetchImpl,
  });
  const repository = parseRepositoryToolResult(repositoryResult);

  return {
    endpoint,
    protocolVersion: MCP_PROTOCOL_VERSION,
    discovery: true,
    toolCount: firstTools.tools.length,
    deterministicList,
    readOnlyTool: 'github_get_repository',
    repository: repository.full_name,
    requests: 4,
    classification: 'SCOPED_EXTERNAL_SMOKE_ONLY_FULL_CONFORMANCE_NOT_VERIFIED',
  };
}

const isMainModule = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  runMcpLiveSmoke({
    targetUrl: process.env.GLORIFIER_MCP_CONFORMANCE_URL,
    allowedHosts: process.env.GLORIFIER_MCP_CONFORMANCE_ALLOWED_HOSTS,
  }).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`MCP modern stateless smoke failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
