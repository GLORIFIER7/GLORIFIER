export const MCP_PROTOCOL_VERSION = '2026-07-28' as const;
export const MCP_JSONRPC_PATH = '/api/mcp/v1' as const;
export const MCP_TASK_STATUS_TOOL = 'get_task_status' as const;
export const MCP_MAX_REQUEST_BYTES = 65_536;

type JsonRecord = Record<string, unknown>;

export interface MCPTaskLike {
  id: string;
  requesterAgentId: string;
  capability: string;
  status: string;
  updatedAt: string;
}

export interface MCPJsonRpcHeaders {
  protocolVersion: string | null;
  method: string | null;
  name: string | null;
}

export interface MCPJsonRpcDependencies {
  requesterAgentId: string;
  getTask(id: string): MCPTaskLike | null | Promise<MCPTaskLike | null>;
}

export interface MCPJsonRpcError {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPJsonRpcSuccess {
  jsonrpc: '2.0';
  id: string | number;
  result: JsonRecord;
}

export type MCPJsonRpcResponse = MCPJsonRpcError | MCPJsonRpcSuccess;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): MCPJsonRpcError {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

function rpcResult(id: string | number, result: JsonRecord): MCPJsonRpcSuccess {
  return { jsonrpc: '2.0', id, result };
}

export function validateMCPRequestHeaders(
  payload: unknown,
  headers: MCPJsonRpcHeaders,
): { code: number; message: string } | null {
  if (!isRecord(payload) || typeof payload.method !== 'string' || !isRecord(payload.params)) {
    return { code: -32020, message: 'Header mismatch: MCP request method or params are malformed.' };
  }
  const method = payload.method;
  if (!headers.protocolVersion || !headers.method) {
    return { code: -32020, message: 'Header mismatch: MCP-Protocol-Version and Mcp-Method are required.' };
  }
  if (headers.method !== method) {
    return { code: -32020, message: 'Header mismatch: Mcp-Method does not match the JSON-RPC method.' };
  }
  const meta = payload.params._meta;
  if (!isRecord(meta) || typeof meta['io.modelcontextprotocol/protocolVersion'] !== 'string') {
    return { code: -32020, message: 'Header mismatch: request protocol version metadata is required.' };
  }
  if (headers.protocolVersion !== meta['io.modelcontextprotocol/protocolVersion']) {
    return { code: -32020, message: 'Header mismatch: MCP-Protocol-Version does not match request metadata.' };
  }
  if (!isRecord(meta['io.modelcontextprotocol/clientCapabilities'])) {
    return { code: -32602, message: 'Request metadata must include clientCapabilities as an object.' };
  }
  if (['tools/call', 'resources/read', 'prompts/get'].includes(method)) {
    const name = method === 'resources/read' ? payload.params.uri : payload.params.name;
    if (typeof name !== 'string' || !name.trim() || !headers.name) {
      return { code: -32020, message: 'Header mismatch: Mcp-Name is required for this method.' };
    }
    if (headers.name !== name) {
      return { code: -32020, message: 'Header mismatch: Mcp-Name does not match request params.' };
    }
  }
  return null;
}

function isSupportedMetaVersion(payload: JsonRecord): string | null {
  const params = payload.params;
  if (!isRecord(params) || !isRecord(params._meta)) return null;
  const version = params._meta['io.modelcontextprotocol/protocolVersion'];
  return typeof version === 'string' ? version : null;
}

function getTaskStatusToolDefinition(): JsonRecord {
  return {
    name: MCP_TASK_STATUS_TOOL,
    title: 'Read GLORIFIER task status',
    description: 'Read the status and capability label for a GLORIFIER task owned by the authenticated requester. Does not expose task input, objective, result, evidence payload, or allow task mutation.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          minLength: 1,
          maxLength: 128,
          description: 'The GLORIFIER task identifier returned to its owner.',
        },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
  };
}

function toolText(text: string, isError: boolean, structuredContent?: JsonRecord): JsonRecord {
  return {
    resultType: 'complete',
    content: [{ type: 'text', text }],
    ...(structuredContent ? { structuredContent } : {}),
    isError,
  };
}

async function callTaskStatusTool(
  args: unknown,
  dependencies: MCPJsonRpcDependencies,
): Promise<JsonRecord> {
  if (!isRecord(args) || Object.keys(args).length !== 1 ||
      typeof args.taskId !== 'string' || !args.taskId.trim() || args.taskId.length > 128) {
    throw new TypeError('taskId must be a non-empty string of at most 128 characters; no other arguments are accepted.');
  }
  if (!dependencies.requesterAgentId.trim()) {
    return toolText('Task not found or is not accessible.', true);
  }
  let task: MCPTaskLike | null;
  try {
    task = await dependencies.getTask(args.taskId);
  } catch {
    return toolText('Task status is temporarily unavailable.', true);
  }
  if (!task || task.requesterAgentId !== dependencies.requesterAgentId) {
    return toolText('Task not found or is not accessible.', true);
  }

  const status = {
    taskId: task.id,
    status: task.status,
    capability: task.capability,
    updatedAt: task.updatedAt,
  };
  return toolText(JSON.stringify(status), false, status);
}

export function createMCPJsonRpcHandler(dependencies: MCPJsonRpcDependencies) {
  return async (
    payload: unknown,
    headers: MCPJsonRpcHeaders,
  ): Promise<MCPJsonRpcResponse> => {
    if (!isRecord(payload) || payload.jsonrpc !== '2.0' ||
        !((typeof payload.id === 'string') ||
          (typeof payload.id === 'number' && Number.isFinite(payload.id))) ||
        typeof payload.method !== 'string' || !isRecord(payload.params)) {
      return rpcError(null, -32600, 'Invalid Request.');
    }
    const id = payload.id as string | number;

    const headerError = validateMCPRequestHeaders(payload, headers);
    if (headerError) return rpcError(id, headerError.code, headerError.message);

    const requestedVersion = isSupportedMetaVersion(payload);
    if (requestedVersion !== MCP_PROTOCOL_VERSION) {
      return rpcError(id, -32022, 'Unsupported protocol version.', {
        supported: [MCP_PROTOCOL_VERSION],
        requested: requestedVersion,
      });
    }

    if (payload.method === 'server/discover') {
      return rpcResult(id, {
        resultType: 'complete',
        supportedVersions: [MCP_PROTOCOL_VERSION],
        capabilities: { tools: {} },
        _meta: {
          'io.modelcontextprotocol/serverInfo': {
            name: 'GLORIFIER Services',
            version: '0.2.1',
          },
        },
        instructions: 'GLORIFIER provides governed, owner-scoped, read-only task status lookup. Task execution requires separate human-owner approval.',
        cacheScope: 'private',
      });
    }

    if (payload.method === 'tools/list') {
      return rpcResult(id, {
        resultType: 'complete',
        tools: [getTaskStatusToolDefinition()],
        cacheScope: 'private',
      });
    }

    if (payload.method === 'tools/call') {
      const params = payload.params;
      if (params.name !== MCP_TASK_STATUS_TOOL) {
        return rpcError(id, -32602, 'Unknown tool name.');
      }
      try {
        const result = await callTaskStatusTool(params.arguments, dependencies);
        return rpcResult(id, result);
      } catch (error) {
        return rpcError(
          id,
          -32602,
          error instanceof Error ? error.message : 'Invalid tool arguments.',
        );
      }
    }

    return rpcError(id, -32601, 'Method not found.');
  };
}
