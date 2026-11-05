/**
 * Stateless, read-only MCP Streamable HTTP endpoint for the public GLORIFIER repository.
 *
 * This server exposes no GitHub write operations. It uses anonymous public API access by default and
 * supports an optional, least-privilege read token supplied only by the Worker secret binding.
 * Every upstream request is pinned to api.github.com and the single public repository below.
 */

export const GITHUB_MCP_PATH = '/mcp' as const;

const OWNER = 'GLORIFIER7';
const REPOSITORY = 'GLORIFIER';
const API_ROOT = 'https://api.github.com';
const PROTOCOL_VERSION = '2025-03-26';
const LEGACY_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;
const MODERN_PROTOCOL_VERSION = '2026-07-28' as const;
const MODERN_PROTOCOL_VERSIONS = [MODERN_PROTOCOL_VERSION] as const;
const SUPPORTED_PROTOCOL_VERSIONS = [...MODERN_PROTOCOL_VERSIONS, ...LEGACY_PROTOCOL_VERSIONS] as const;
const REQUEST_PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';
const SERVER_INFO_META_KEY = 'io.modelcontextprotocol/serverInfo';
const SERVER_INFO = { name: 'GLORIFIER GitHub Read-Only', version: '1.1.0' } as const;
const SERVER_DISCOVERY_INSTRUCTIONS =
  'Stateless, read-only access to the public GLORIFIER7/GLORIFIER repository. Four GitHub read tools are exposed. No write, merge, deployment, secret, or credential tools are available.';
const MAX_REQUEST_BYTES = 65_536;
const MAX_UPSTREAM_BYTES = 1_000_000;
const USER_AGENT = 'GLORIFIER-GitHub-MCP-ReadOnly';

type JsonRecord = Record<string, unknown>;
type JsonRpcId = string | number | null;
export type GithubMcpRateLimiter = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
};
type McpMessage = {
  jsonrpc?: unknown;
  id?: JsonRpcId;
  method?: unknown;
  params?: unknown;
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonRecord;
  annotations: {
    readOnlyHint: true;
    destructiveHint: false;
    openWorldHint: true;
  };
};

const annotations = {
  readOnlyHint: true as const,
  destructiveHint: false as const,
  openWorldHint: true as const,
};

const tools: ToolDefinition[] = [
  {
    name: 'github_get_repository',
    description: 'Read metadata for the public GLORIFIER7/GLORIFIER repository.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations,
  },
  {
    name: 'github_list_open_pull_requests',
    description: 'List pull requests in the public GLORIFIER repository. This operation is read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Pull request state; defaults to open.' },
        per_page: { type: 'integer', minimum: 1, maximum: 20, description: 'Maximum number of pull requests to return; defaults to 10.' },
      },
      additionalProperties: false,
    },
    annotations,
  },
  {
    name: 'github_list_workflow_runs',
    description: 'List recent GitHub Actions workflow runs for the public GLORIFIER repository. This operation is read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        per_page: { type: 'integer', minimum: 1, maximum: 20, description: 'Maximum number of workflow runs to return; defaults to 10.' },
      },
      additionalProperties: false,
    },
    annotations,
  },
  {
    name: 'github_read_file',
    description: 'Read a text file from the public GLORIFIER repository at a branch, tag, or commit. This operation is read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1, maxLength: 200, description: 'Repository-relative file path.' },
        ref: { type: 'string', minLength: 1, maxLength: 128, description: 'Branch, tag, or commit; defaults to main.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    annotations,
  },
];

const jsonResponse = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });

const rpcError = (id: JsonRpcId, code: number, message: string, status = 200): Response =>
  jsonResponse({ jsonrpc: '2.0', id, error: { code, message } }, status);

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isValidOrigin = (request: Request): boolean => {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
};

const parseContentLength = (value: string): number | null => {
  if (value.length === 0 || value.length > 16 || !/^\d{1,16}$/.test(value)) return null;
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : null;
};

const validateRequestSize = (request: Request): Response | null => {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const parsedLength = parseContentLength(declaredLength);
    if (parsedLength === null) {
      return rpcError(null, -32600, 'Invalid Content-Length.', 400);
    }
    if (parsedLength > MAX_REQUEST_BYTES) {
      return rpcError(null, -32600, 'MCP request body exceeds 65,536 bytes.', 413);
    }
  }
  return null;
};

class McpRequestBodyTooLargeError extends Error {
  constructor() {
    super('MCP request body exceeds 65,536 bytes.');
    this.name = 'McpRequestBodyTooLargeError';
  }
}

type StreamChunks = { chunks: Uint8Array[]; totalBytes: number };

const readStreamChunks = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maximumBytes: number,
  overflowError: Error,
): Promise<StreamChunks> => {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    const chunk = next.value;
    if (!chunk) continue;
    totalBytes += chunk.byteLength;
    if (totalBytes > maximumBytes) throw overflowError;
    chunks.push(chunk);
  }
  return { chunks, totalBytes };
};

const combineStreamChunks = ({ chunks, totalBytes }: StreamChunks): Uint8Array => {
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const readBoundedStreamBytes = async (
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
  overflowError: Error,
): Promise<Uint8Array> => {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  try {
    const chunks = await readStreamChunks(reader, maximumBytes, overflowError);
    return combineStreamChunks(chunks);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
};

const decodeUtf8 = (bytes: Uint8Array, errorMessage: string): string => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(errorMessage);
  }
};

const readBoundedRequestText = async (request: Request): Promise<string> => {
  const bytes = await readBoundedStreamBytes(
    request.body,
    MAX_REQUEST_BYTES,
    new McpRequestBodyTooLargeError(),
  );
  return decodeUtf8(bytes, 'MCP request body must be valid UTF-8.');
};

const cancelResponseBody = async (response: Response): Promise<void> => {
  try {
    await response.body?.cancel();
  } catch {
    // Best-effort cleanup for an upstream body that will not be consumed.
  }
};

const hasOversizedContentLength = (response: Response, maximumBytes: number): boolean => {
  const value = response.headers.get('content-length');
  if (value === null) return false;
  const parsedLength = parseContentLength(value);
  return parsedLength === null || parsedLength > maximumBytes;
};

const readBoundedResponseText = async (response: Response): Promise<string> => {
  if (hasOversizedContentLength(response, MAX_UPSTREAM_BYTES)) {
    await cancelResponseBody(response);
    throw new Error('GitHub API response exceeded the configured size limit.');
  }
  const bytes = await readBoundedStreamBytes(
    response.body,
    MAX_UPSTREAM_BYTES,
    new Error('GitHub API response exceeded the configured size limit.'),
  );
  return decodeUtf8(bytes, 'GitHub API returned invalid UTF-8.');
};

const createGithubApiUrl = (pathname: string, query?: URLSearchParams): URL => {
  const url = new URL(pathname, API_ROOT);
  const trustedOrigin = url.protocol === 'https:' && url.origin === API_ROOT && !url.username && !url.password;
  if (!trustedOrigin) throw new Error('Blocked GitHub API URL outside the trusted HTTPS origin.');
  if (query) url.search = query.toString();
  return url;
};

const isTrustedGithubApiUrl = (url: URL): boolean =>
  url.protocol === 'https:'
  && url.origin === API_ROOT
  && url.hostname === 'api.github.com'
  && !url.username
  && !url.password;

const fetchGithubApi = (url: URL, readToken?: string): Promise<Response> => {
  if (!isTrustedGithubApiUrl(url)) {
    throw new Error('Blocked GitHub API request outside the trusted HTTPS origin.');
  }
  // Copy only path/query onto a fresh URL rooted at the immutable API origin.
  // Caller-controlled input can therefore never select the fetch destination host.
  const requestUrl = new URL(API_ROOT);
  requestUrl.pathname = url.pathname;
  requestUrl.search = url.search;
  if (!isTrustedGithubApiUrl(requestUrl)) {
    throw new Error('Blocked GitHub API request outside the trusted HTTPS origin.');
  }
  const requestHeaders = new Headers({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': USER_AGENT,
  });
  const normalizedToken = readToken?.trim();
  if (normalizedToken) requestHeaders.set('Authorization', `Bearer ${normalizedToken}`);
  return fetch(requestUrl.href, {
    method: 'GET',
    headers: requestHeaders,
    redirect: 'manual',
    signal: AbortSignal.timeout(8_000),
  });
};

const assertGithubApiSuccess = async (response: Response): Promise<Response> => {
  if (response.ok) return response;
  await cancelResponseBody(response);
  throw new Error(`GitHub API request failed with HTTP ${response.status}.`);
};

const parseGithubJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('GitHub API returned invalid JSON.');
  }
};

const readGithubJson = async (pathname: string, query?: URLSearchParams, readToken?: string): Promise<unknown> => {
  const url = createGithubApiUrl(pathname, query);
  const response = await fetchGithubApi(url, readToken);
  const successfulResponse = await assertGithubApiSuccess(response);
  const body = await readBoundedResponseText(successfulResponse);
  return parseGithubJson(body);
};

const isSafeRepositoryPathSegment = (segment: string): boolean =>
  segment.length > 0 && segment !== '.' && segment !== '..';

const isValidRepositoryPath = (path: string): boolean =>
  path.length > 0
  && path.length <= 200
  && !path.startsWith('/')
  && !path.includes('\\')
  && !path.includes('\0')
  && path.split('/').every(isSafeRepositoryPathSegment);

const repositoryPathSegments = (path: string): string[] => {
  if (!isValidRepositoryPath(path)) throw new Error('Invalid repository-relative file path.');
  return path.split('/');
};

const assertValidGitReference = (ref: string): void => {
  if (!ref || ref.length > 128 || !/^[A-Za-z0-9._/-]+$/.test(ref) || ref.includes('..')) {
    throw new Error('Invalid Git reference.');
  }
};

const decodeBase64 = (value: string): Uint8Array => {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('GitHub file content was not valid Base64.');
  }
};

const decodeGithubTextFile = (data: JsonRecord): string => {
  if (typeof data.content !== 'string' || data.encoding !== 'base64') {
    throw new Error('The requested path is not a supported text file.');
  }
  const compact = data.content.replace(/\s/g, '');
  if (compact.length > Math.ceil(MAX_UPSTREAM_BYTES * 4 / 3)) {
    throw new Error('GitHub file exceeded the configured size limit.');
  }
  const bytes = decodeBase64(compact);
  return decodeUtf8(bytes, 'GitHub file content was not valid UTF-8.');
};

const readGithubFile = async (path: string, ref: string, readToken?: string): Promise<{ path: string; ref: string; content: string }> => {
  repositoryPathSegments(path);
  assertValidGitReference(ref);
  const encodedPath = encodeURIComponent(path).replaceAll('%2F', '/');
  const data = await readGithubJson(`/repos/${OWNER}/${REPOSITORY}/contents/${encodedPath}`, new URLSearchParams({ ref }), readToken);
  if (!isRecord(data)) throw new Error('The requested path is not a supported text file.');
  return { path, ref, content: decodeGithubTextFile(data) };
};

const toolArguments = (args: unknown): JsonRecord => isRecord(args) ? args : {};

const getRepositoryTool = (readToken?: string): Promise<unknown> =>
  readGithubJson(`/repos/${OWNER}/${REPOSITORY}`, undefined, readToken);

const isValidPerPage = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 20;

const listPullRequestsTool = (args: unknown, readToken?: string): Promise<unknown> => {
  const input = toolArguments(args);
  const state = input.state === undefined ? 'open' : input.state;
  if (state !== 'open' && state !== 'closed' && state !== 'all') {
    throw new Error('state must be open, closed, or all.');
  }
  const perPage = input.per_page === undefined ? 10 : input.per_page;
  if (!isValidPerPage(perPage)) {
    throw new Error('per_page must be an integer between 1 and 20.');
  }
  return readGithubJson(`/repos/${OWNER}/${REPOSITORY}/pulls`, new URLSearchParams({
    state,
    per_page: String(perPage),
  }), readToken);
};

const listWorkflowRunsTool = (args: unknown, readToken?: string): Promise<unknown> => {
  const input = toolArguments(args);
  const perPage = input.per_page === undefined ? 10 : input.per_page;
  if (!isValidPerPage(perPage)) {
    throw new Error('per_page must be an integer between 1 and 20.');
  }
  return readGithubJson(`/repos/${OWNER}/${REPOSITORY}/actions/runs`, new URLSearchParams({ per_page: String(perPage) }), readToken);
};

const readFileTool = (args: unknown, readToken?: string): Promise<unknown> => {
  const input = toolArguments(args);
  if (typeof input.path !== 'string') throw new Error('path is required and must be a string.');
  const ref = input.ref === undefined ? 'main' : input.ref;
  if (typeof ref !== 'string') throw new Error('ref must be a string.');
  return readGithubFile(input.path, ref, readToken);
};

const callTool = (name: string, args: unknown, readToken?: string): Promise<unknown> => {
  switch (name) {
    case 'github_get_repository':
      return getRepositoryTool(readToken);
    case 'github_list_open_pull_requests':
      return listPullRequestsTool(args, readToken);
    case 'github_list_workflow_runs':
      return listWorkflowRunsTool(args, readToken);
    case 'github_read_file':
      return readFileTool(args, readToken);
    default:
      throw new Error('Unknown or unsupported GitHub tool. This MCP server exposes read-only tools only.');
  }
};

const resultText = (value: unknown): string => typeof value === 'string' ? value : String(JSON.stringify(value));

const emptyNotificationResponse = (): Response =>
  new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });

const handleInitialize = (id: JsonRpcId, paramsValue: unknown): Response => {
  const params = isRecord(paramsValue) ? paramsValue : {};
  const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL_VERSION;
  const protocolVersion = (LEGACY_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : PROTOCOL_VERSION;
  return jsonResponse({
    jsonrpc: '2.0',
    id,
    result: {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: SERVER_DISCOVERY_INSTRUCTIONS,
    },
  });
};

const modernServerMetadata = (): JsonRecord => ({
  [SERVER_INFO_META_KEY]: SERVER_INFO,
});

const modernCompleteResult = (value: JsonRecord): JsonRecord => ({
  ...value,
  resultType: 'complete',
  _meta: modernServerMetadata(),
});

const handleServerDiscover = (id: JsonRpcId): Response => jsonResponse({
  jsonrpc: '2.0',
  id,
  result: {
    resultType: 'complete',
    supportedVersions: [...MODERN_PROTOCOL_VERSIONS],
    capabilities: { tools: {} },
    _meta: modernServerMetadata(),
    instructions: SERVER_DISCOVERY_INSTRUCTIONS,
    ttlMs: 3_600_000,
    cacheScope: 'public',
  },
});

const handleToolCall = async (
  id: JsonRpcId,
  paramsValue: unknown,
  modern = false,
  readToken?: string,
): Promise<Response> => {
  const params = isRecord(paramsValue) ? paramsValue : {};
  const respondWithToolResult = (result: JsonRecord): Response => jsonResponse({
    jsonrpc: '2.0',
    id,
    result: modern ? modernCompleteResult(result) : result,
  });
  if (typeof params.name !== 'string') {
    return respondWithToolResult({
      content: [{ type: 'text', text: 'Tool name is required.' }],
      isError: true,
    });
  }
  try {
    const result = await callTool(params.name, params.arguments, readToken);
    return respondWithToolResult({ content: [{ type: 'text', text: resultText(result) }] });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'GitHub request failed.';
    return respondWithToolResult({
      content: [{ type: 'text', text: messageText }],
      isError: true,
    });
  }
};

const handleLegacyJsonRpcMethod = (
  message: McpMessage,
  id: JsonRpcId,
  readToken?: string,
): Response | Promise<Response> => {
  switch (message.method) {
    case 'initialize':
      return handleInitialize(id, message.params);
    case 'ping':
      return jsonResponse({ jsonrpc: '2.0', id, result: {} });
    case 'tools/list':
      return jsonResponse({ jsonrpc: '2.0', id, result: { tools } });
    case 'tools/call':
      return handleToolCall(id, message.params, false, readToken);
    default:
      return rpcError(id, -32601, 'Method not found.');
  }
};

const handleModernJsonRpcMethod = (
  message: McpMessage,
  id: JsonRpcId,
  readToken?: string,
): Response | Promise<Response> => {
  switch (message.method) {
    case 'server/discover':
      return handleServerDiscover(id);
    case 'tools/list':
      return jsonResponse({
        jsonrpc: '2.0',
        id,
        result: modernCompleteResult({ tools }),
      });
    case 'tools/call':
      return handleToolCall(id, message.params, true, readToken);
    default:
      // The modern stateless protocol has no initialize handshake or ping.
      return rpcError(id, -32601, 'Method not found.', 404);
  }
};

const unsupportedProtocolVersion = (
  id: JsonRpcId,
  requested: string,
): Response => jsonResponse({
  jsonrpc: '2.0',
  id,
  error: {
    code: -32022,
    message: 'Unsupported protocol version',
    data: {
      supported: /^2026(?:-|$)/.test(requested)
        ? [...MODERN_PROTOCOL_VERSIONS]
        : [...LEGACY_PROTOCOL_VERSIONS],
      requested,
    },
  },
}, 400);

type McpProtocolMode = 'modern' | 'legacy';

const resolveMcpProtocolMode = (
  request: Request,
  message: McpMessage,
  id: JsonRpcId,
): { mode: McpProtocolMode } | { response: Response } => {
  const params = isRecord(message.params) ? message.params : {};
  const metadata = isRecord(params._meta) ? params._meta : {};
  const metadataVersion = typeof metadata[REQUEST_PROTOCOL_VERSION_META_KEY] === 'string'
    ? (metadata[REQUEST_PROTOCOL_VERSION_META_KEY] as string).trim()
    : '';
  const headerVersion = (request.headers.get('MCP-Protocol-Version') ?? '').trim();
  const modernRequested = metadataVersion === MODERN_PROTOCOL_VERSION ||
    headerVersion === MODERN_PROTOCOL_VERSION;

  // On Streamable HTTP, the modern per-request metadata is mandatory and the
  // HTTP version header must repeat the same value. A missing or mismatched
  // declaration is an invalid request, not an unsupported protocol version.
  if (modernRequested) {
    if (!metadataVersion || !headerVersion) {
      return {
        response: rpcError(
          id,
          -32020,
          'Header mismatch: modern HTTP requests must declare the same protocol version in both params._meta and the MCP-Protocol-Version header.',
          400,
        ),
      };
    }
    if (metadataVersion !== headerVersion) {
      return {
        response: rpcError(
          id,
          -32020,
          'Header mismatch: the per-request protocol version in params._meta must match the MCP-Protocol-Version header.',
          400,
        ),
      };
    }
    return { mode: 'modern' };
  }

  const metadataSupported = !metadataVersion ||
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(metadataVersion);
  const headerSupported = !headerVersion ||
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(headerVersion);
  if (!metadataSupported || !headerSupported) {
    return {
      response: unsupportedProtocolVersion(id, metadataVersion || headerVersion),
    };
  }
  if (metadataVersion && headerVersion && metadataVersion !== headerVersion) {
    return {
      response: rpcError(
        id,
        -32020,
        'Header mismatch: the per-request protocol version in params._meta must match the MCP-Protocol-Version header.',
        400,
      ),
    };
  }

  return { mode: 'legacy' };
};

const validateModernRequestEnvelope = (
  message: McpMessage,
  id: JsonRpcId,
): Response | null => {
  const params = isRecord(message.params) ? message.params : {};
  const metadata = isRecord(params._meta) ? params._meta : {};
  const capabilities = metadata['io.modelcontextprotocol/clientCapabilities'];
  if (!isRecord(capabilities)) {
    return rpcError(
      id,
      -32602,
      'Invalid params: modern MCP requests must include an object-valued io.modelcontextprotocol/clientCapabilities field in params._meta.',
      400,
    );
  }
  const clientInfo = metadata['io.modelcontextprotocol/clientInfo'];
  if (clientInfo !== undefined &&
      (!isRecord(clientInfo) ||
       typeof clientInfo.name !== 'string' || !clientInfo.name.trim() ||
       typeof clientInfo.version !== 'string' || !clientInfo.version.trim())) {
    return rpcError(id, -32602, 'Invalid params: clientInfo must contain non-empty string name and version fields.', 400);
  }
  return null;
};

const decodeMcpNameHeader = (value: string): string | null => {
  if (value.startsWith('=?base64?') && value.endsWith('?=')) {
    const encoded = value.slice('=?base64?'.length, -2);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return null;
    try {
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return null;
    }
  }
  if (!/^[\x20-\x7E\t]*$/.test(value) || value.trim() !== value) return null;
  return value;
};

const validateModernRoutingHeaders = (
  request: Request,
  message: McpMessage,
  id: JsonRpcId,
): Response | null => {
  const methodHeader = request.headers.get('Mcp-Method');
  if (!methodHeader || methodHeader !== message.method) {
    return rpcError(id, -32020, 'Header mismatch: Mcp-Method must be present and match the JSON-RPC method.', 400);
  }

  const params = isRecord(message.params) ? message.params : {};
  const nameField = message.method === 'tools/call' ? 'name'
    : message.method === 'resources/read' ? 'uri'
    : message.method === 'prompts/get' ? 'name'
    : null;
  if (nameField) {
    const bodyName = params[nameField];
    const headerName = request.headers.get('Mcp-Name');
    const decodedHeaderName = headerName === null ? null : decodeMcpNameHeader(headerName);
    if (typeof bodyName !== 'string' || bodyName.length === 0 ||
        decodedHeaderName === null || decodedHeaderName !== bodyName) {
      return rpcError(id, -32020, 'Header mismatch: Mcp-Name must be present and match the request body name or URI.', 400);
    }
  }
  return null;
};

const handleJsonRpc = (
  request: Request,
  message: McpMessage,
  readToken?: string,
): Response | Promise<Response> => {
  const id = typeof message.id === 'string' || typeof message.id === 'number' || message.id === null
    ? message.id
    : null;
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return rpcError(id, -32600, 'Invalid JSON-RPC request.');
  }
  if (message.method.startsWith('notifications/')) return emptyNotificationResponse();
  if (!Object.hasOwn(message, 'id')) return emptyNotificationResponse();

  const protocolMode = resolveMcpProtocolMode(request, message, id);
  if ('response' in protocolMode) return protocolMode.response;
  if (protocolMode.mode === 'modern') {
    const envelopeFailure = validateModernRequestEnvelope(message, id);
    if (envelopeFailure) return envelopeFailure;
    const headerFailure = validateModernRoutingHeaders(request, message, id);
    if (headerFailure) return headerFailure;
    return handleModernJsonRpcMethod(message, id, readToken);
  }
  return handleLegacyJsonRpcMethod(message, id, readToken);
};

const validateMcpRequestHeaders = async (request: Request): Promise<Response | null> => {
  if (!isValidOrigin(request)) return jsonResponse({ error: 'Forbidden origin.' }, 403);
  if (request.method !== 'POST') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  const contentType = (request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') return rpcError(null, -32600, 'Content-Type must be application/json.', 415);

  const sizeFailure = validateRequestSize(request);
  if (sizeFailure) await request.body?.cancel().catch(() => undefined);
  return sizeFailure;
};

type ParsedMcpRequest = { message: McpMessage } | { response: Response };

const parseMcpRequest = async (request: Request): Promise<ParsedMcpRequest> => {
  let text: string;
  try {
    text = await readBoundedRequestText(request);
  } catch (error) {
    const response = error instanceof McpRequestBodyTooLargeError
      ? rpcError(null, -32600, 'MCP request body exceeds 65,536 bytes.', 413)
      : rpcError(null, -32700, 'Unable to read a valid UTF-8 request body.', 400);
    return { response };
  }

  try {
    const message: unknown = JSON.parse(text);
    return isRecord(message)
      ? { message: message as McpMessage }
      : { response: rpcError(null, -32600, 'Invalid JSON-RPC request.', 400) };
  } catch {
    return { response: rpcError(null, -32700, 'Parse error.', 400) };
  }
};

const enforceMcpToolRateLimit = async (
  request: Request,
  message: McpMessage,
  rateLimiter: GithubMcpRateLimiter,
): Promise<Response | null> => {
  if (message.method !== 'tools/call') return null;
  const key = request.headers.get('cf-connecting-ip')?.trim() || 'unknown-client';
  try {
    const result = await rateLimiter.limit({ key });
    return result.success
      ? null
      : jsonResponse({ error: 'MCP tool-call rate limit exceeded.' }, 429, { 'Retry-After': '60' });
  } catch {
    return jsonResponse({ error: 'MCP rate-limit service is unavailable.' }, 503);
  }
};

export const githubMcpRoute = async (
  request: Request,
  rateLimiter: GithubMcpRateLimiter,
  readToken?: string,
): Promise<Response> => {
  const headerFailure = await validateMcpRequestHeaders(request);
  if (headerFailure) return headerFailure;

  const parsed = await parseMcpRequest(request);
  if ('response' in parsed) return parsed.response;

  const rateLimitFailure = await enforceMcpToolRateLimit(request, parsed.message, rateLimiter);
  if (rateLimitFailure) return rateLimitFailure;
  return handleJsonRpc(request, parsed.message, readToken);
};
