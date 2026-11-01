/**
 * Stateless, read-only MCP Streamable HTTP endpoint for the public GLORIFIER repository.
 *
 * This server intentionally exposes no GitHub write operations and carries no GitHub credential.
 * Every upstream request is pinned to api.github.com and the single public repository below.
 */

export const GITHUB_MCP_PATH = '/mcp' as const;

const OWNER = 'GLORIFIER7';
const REPOSITORY = 'GLORIFIER';
const API_ROOT = 'https://api.github.com';
const PROTOCOL_VERSION = '2025-03-26';
const MAX_REQUEST_BYTES = 65_536;
const MAX_UPSTREAM_BYTES = 1_000_000;
const USER_AGENT = 'GLORIFIER-GitHub-MCP-ReadOnly';

type JsonRecord = Record<string, unknown>;
export type GithubMcpRateLimiter = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
};
type McpMessage = {
  jsonrpc?: unknown;
  id?: string | number | null;
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

const rpcError = (id: string | number | null, code: number, message: string, status = 200): Response =>
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

const validateRequestSize = (request: Request): Response | null => {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength) || !Number.isSafeInteger(Number(declaredLength))) {
      return rpcError(null, -32600, 'Invalid Content-Length.', 400);
    }
    if (Number(declaredLength) > MAX_REQUEST_BYTES) {
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

const readBoundedRequestText = async (request: Request): Promise<string> => {
  const body = request.body;
  if (!body) return '';

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value) continue;
      totalBytes += next.value.byteLength;
      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new McpRequestBodyTooLargeError();
      }
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('MCP request body must be valid UTF-8.');
  }
};

const cancelResponseBody = async (response: Response): Promise<void> => {
  try {
    await response.body?.cancel();
  } catch {
    // Best-effort cleanup for an upstream body that will not be consumed.
  }
};

const readBoundedResponseText = async (response: Response): Promise<string> => {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_UPSTREAM_BYTES) {
    await cancelResponseBody(response);
    throw new Error('GitHub API response exceeded the configured size limit.');
  }

  const body = response.body;
  if (!body) return '';

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value) continue;
      totalBytes += next.value.byteLength;
      if (totalBytes > MAX_UPSTREAM_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('GitHub API response exceeded the configured size limit.');
      }
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('GitHub API returned invalid UTF-8.');
  }
};

const readGithubJson = async (pathname: string, query?: URLSearchParams): Promise<unknown> => {
  const url = new URL(pathname, API_ROOT);
  if (url.protocol !== 'https:' || url.origin !== API_ROOT || url.username || url.password) {
    throw new Error('Blocked GitHub API URL outside the trusted HTTPS origin.');
  }
  if (query) url.search = query.toString();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER_AGENT,
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    await cancelResponseBody(response);
    throw new Error(`GitHub API request failed with HTTP ${response.status}.`);
  }
  const text = await readBoundedResponseText(response);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('GitHub API returned invalid JSON.');
  }
};

const repositoryPathSegments = (path: string): string[] => {
  if (!path || path.length > 200 || path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    throw new Error('Invalid repository-relative file path.');
  }
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Invalid repository-relative file path.');
  }
  return segments;
};

const assertValidGitReference = (ref: string): void => {
  if (!ref || ref.length > 128 || !/^[A-Za-z0-9._/-]+$/.test(ref) || ref.split('/').some((segment) => segment === '..')) {
    throw new Error('Invalid Git reference.');
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
  let binary: string;
  try {
    binary = atob(compact);
  } catch {
    throw new Error('GitHub file content was not valid Base64.');
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('GitHub file content was not valid UTF-8.');
  }
};

const readGithubFile = async (path: string, ref: string): Promise<{ path: string; ref: string; content: string }> => {
  const segments = repositoryPathSegments(path);
  assertValidGitReference(ref);
  const encodedPath = segments.map((segment) => encodeURIComponent(segment)).join('/');
  const data = await readGithubJson(`/repos/${OWNER}/${REPOSITORY}/contents/${encodedPath}`, new URLSearchParams({ ref }));
  if (!isRecord(data)) throw new Error('The requested path is not a supported text file.');
  return { path, ref, content: decodeGithubTextFile(data) };
};

const toolArguments = (args: unknown): JsonRecord => isRecord(args) ? args : {};

const getRepositoryTool = (): Promise<unknown> =>
  readGithubJson(`/repos/${OWNER}/${REPOSITORY}`);

const listPullRequestsTool = (args: unknown): Promise<unknown> => {
  const input = toolArguments(args);
  const state = input.state === undefined ? 'open' : input.state;
  if (state !== 'open' && state !== 'closed' && state !== 'all') {
    throw new Error('state must be open, closed, or all.');
  }
  const perPage = input.per_page === undefined ? 10 : input.per_page;
  if (!Number.isInteger(perPage) || Number(perPage) < 1 || Number(perPage) > 20) {
    throw new Error('per_page must be an integer between 1 and 20.');
  }
  return readGithubJson(`/repos/${OWNER}/${REPOSITORY}/pulls`, new URLSearchParams({
    state,
    per_page: String(perPage),
  }));
};

const listWorkflowRunsTool = (args: unknown): Promise<unknown> => {
  const input = toolArguments(args);
  const perPage = input.per_page === undefined ? 10 : input.per_page;
  if (!Number.isInteger(perPage) || Number(perPage) < 1 || Number(perPage) > 20) {
    throw new Error('per_page must be an integer between 1 and 20.');
  }
  return readGithubJson(`/repos/${OWNER}/${REPOSITORY}/actions/runs`, new URLSearchParams({ per_page: String(perPage) }));
};

const readFileTool = (args: unknown): Promise<unknown> => {
  const input = toolArguments(args);
  if (typeof input.path !== 'string') throw new Error('path is required and must be a string.');
  const ref = input.ref === undefined ? 'main' : input.ref;
  if (typeof ref !== 'string') throw new Error('ref must be a string.');
  return readGithubFile(input.path, ref);
};

const toolHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  github_get_repository: getRepositoryTool,
  github_list_open_pull_requests: listPullRequestsTool,
  github_list_workflow_runs: listWorkflowRunsTool,
  github_read_file: readFileTool,
};

const callTool = (name: string, args: unknown): Promise<unknown> => {
  if (!Object.prototype.hasOwnProperty.call(toolHandlers, name)) {
    throw new Error('Unknown or unsupported GitHub tool. This MCP server exposes read-only tools only.');
  }
  return toolHandlers[name](args);
};

const resultText = (value: unknown): string => typeof value === 'string' ? value : String(JSON.stringify(value));

const emptyNotificationResponse = (): Response =>
  new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });

const handleInitialize = (id: string | number | null, paramsValue: unknown): Response => {
  const params = isRecord(paramsValue) ? paramsValue : {};
  const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL_VERSION;
  const supported = ['2025-03-26', '2025-06-18', '2025-11-25'];
  const protocolVersion = supported.includes(requested) ? requested : PROTOCOL_VERSION;
  return jsonResponse({
    jsonrpc: '2.0',
    id,
    result: {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'GLORIFIER GitHub Read-Only', version: '1.0.0' },
      instructions: 'Read-only access to the public GLORIFIER7/GLORIFIER repository. No write, merge, deployment, secret, or credential tools are exposed.',
    },
  });
};

const handleToolCall = async (id: string | number | null, paramsValue: unknown): Promise<Response> => {
  const params = isRecord(paramsValue) ? paramsValue : {};
  if (typeof params.name !== 'string') {
    return jsonResponse({
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text: 'Tool name is required.' }], isError: true },
    });
  }
  try {
    const result = await callTool(params.name, params.arguments);
    return jsonResponse({
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text: resultText(result) }] },
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'GitHub request failed.';
    return jsonResponse({
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text: messageText }], isError: true },
    });
  }
};

const handleJsonRpcMethod = (message: McpMessage, id: string | number | null): Response | Promise<Response> => {
  switch (message.method) {
    case 'initialize':
      return handleInitialize(id, message.params);
    case 'ping':
      return jsonResponse({ jsonrpc: '2.0', id, result: {} });
    case 'tools/list':
      return jsonResponse({ jsonrpc: '2.0', id, result: { tools } });
    case 'tools/call':
      return handleToolCall(id, message.params);
    default:
      return rpcError(id, -32601, 'Method not found.');
  }
};

const handleJsonRpc = (message: McpMessage): Response | Promise<Response> => {
  const id = typeof message.id === 'string' || typeof message.id === 'number' || message.id === null
    ? message.id
    : null;
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return rpcError(id, -32600, 'Invalid JSON-RPC request.');
  }
  if (message.method.startsWith('notifications/')) return emptyNotificationResponse();
  if (!Object.prototype.hasOwnProperty.call(message, 'id')) return emptyNotificationResponse();
  return handleJsonRpcMethod(message, id);
};

export const githubMcpRoute = async (
  request: Request,
  rateLimiter: GithubMcpRateLimiter,
): Promise<Response> => {
  if (!isValidOrigin(request)) {
    return jsonResponse({ error: 'Forbidden origin.' }, 403);
  }
  if (request.method !== 'POST') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return rpcError(null, -32600, 'Content-Type must be application/json.', 415);
  }
  const sizeFailure = validateRequestSize(request);
  if (sizeFailure) {
    await request.body?.cancel().catch(() => undefined);
    return sizeFailure;
  }

  let text: string;
  try {
    text = await readBoundedRequestText(request);
  } catch (error) {
    if (error instanceof McpRequestBodyTooLargeError) {
      return rpcError(null, -32600, 'MCP request body exceeds 65,536 bytes.', 413);
    }
    return rpcError(null, -32700, 'Unable to read a valid UTF-8 request body.', 400);
  }

  let message: unknown;
  try {
    message = JSON.parse(text) as unknown;
  } catch {
    return rpcError(null, -32700, 'Parse error.', 400);
  }
  if (!isRecord(message)) return rpcError(null, -32600, 'Invalid JSON-RPC request.', 400);

  if (message.method === 'tools/call') {
    const clientKey = request.headers.get('cf-connecting-ip')?.trim() || 'unknown-client';
    try {
      const limit = await rateLimiter.limit({ key: clientKey });
      if (!limit.success) {
        return jsonResponse({ error: 'MCP tool-call rate limit exceeded.' }, 429, { 'Retry-After': '60' });
      }
    } catch {
      return jsonResponse({ error: 'MCP rate-limit service is unavailable.' }, 503);
    }
  }

  return handleJsonRpc(message as McpMessage);
};
