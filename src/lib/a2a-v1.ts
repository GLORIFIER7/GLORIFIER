export const A2A_PROTOCOL_VERSION = '1.0' as const;
export const A2A_JSONRPC_PATH = '/api/a2a/v1' as const;
export const A2A_AGENT_CARD_PATH = '/.well-known/agent-card.json' as const;
export const A2A_MAX_MESSAGE_TEXT_CHARS = 20_000;

export interface A2AAgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export interface A2AAgentCard {
  name: string;
  description: string;
  supportedInterfaces: Array<{
    url: string;
    protocolBinding: 'JSONRPC';
    protocolVersion: typeof A2A_PROTOCOL_VERSION;
  }>;
  provider: { organization: string; url: string };
  version: string;
  capabilities: {
    streaming: false;
    pushNotifications: false;
    extendedAgentCard: false;
  };
  securitySchemes: {
    bearer: {
      httpAuthSecurityScheme: {
        scheme: 'Bearer';
        bearerFormat: 'JWT';
        description: string;
      };
    };
  };
  securityRequirements: Array<{ schemes: { bearer: string[] } }>;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: A2AAgentSkill[];
}

export interface A2ATaskLike {
  id: string;
  parentTaskId: string | null;
  requesterAgentId: string;
  capability: string;
  objective: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'blocked' | 'degraded';
  updatedAt: string;
  result?: unknown;
  error?: string;
  evidenceId?: string;
}

export interface A2ACreateTaskInput {
  requesterAgentId: string;
  capability: string;
  objective: string;
  input: unknown;
}

export interface A2AJsonRpcDependencies {
  requesterAgentId: string;
  createTask(input: A2ACreateTaskInput): A2ATaskLike;
  getTask(id: string): A2ATaskLike | null | Promise<A2ATaskLike | null>;
}

export interface A2AJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

export function buildA2AAgentCard(publicBaseUrl: string, agentVersion = '0.2.1'): A2AAgentCard {
  let origin: string;
  try {
    const parsed = new URL(publicBaseUrl);
    const localHttp = parsed.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !localHttp) {
      throw new Error('A2A public origin must use HTTPS (HTTP is allowed only for loopback development).');
    }
    if (parsed.username || parsed.password) {
      throw new Error('A2A public origin must not contain credentials.');
    }
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('A2A public URL must be an origin without a path, query, or fragment.');
    }
    origin = parsed.origin;
  } catch (error) {
    if (error instanceof Error && /A2A public/.test(error.message)) throw error;
    throw new Error('A2A public origin is invalid.');
  }

  return {
    name: 'GLORIFIER Services',
    description: 'Governed AI task intake and orchestration. Requests submitted through this interface are recorded for human-owner review; no task executes solely because it was submitted.',
    supportedInterfaces: [{
      url: new URL(A2A_JSONRPC_PATH, origin).toString(),
      protocolBinding: 'JSONRPC',
      protocolVersion: A2A_PROTOCOL_VERSION,
    }],
    provider: {
      organization: 'GLORIFIER Services',
      url: origin,
    },
    version: agentVersion,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    securitySchemes: {
      bearer: {
        httpAuthSecurityScheme: {
          scheme: 'Bearer',
          bearerFormat: 'JWT',
          description: 'A GLORIFIER authenticated identity token is required for task submission and retrieval.',
        },
      },
    },
    securityRequirements: [{ schemes: { bearer: [] } }],
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['application/json'],
    skills: [{
      id: 'governed-task-intake',
      name: 'Governed task intake',
      description: 'Accepts a new text or structured-data task request, records it in the GLORIFIER task queue, and returns its task identifier. Every newly submitted task remains pending human-owner approval before execution. Existing-task continuation, streaming, and push notifications are not supported by this interface.',
      tags: ['task-intake', 'human-approval', 'governance', 'task-status'],
      examples: ['Submit a proposal for human-owner review.'],
      inputModes: ['text/plain', 'application/json'],
      outputModes: ['application/json'],
    }],
  };
}

function statusFor(task: A2ATaskLike): {
  state: 'submitted' | 'working' | 'completed' | 'failed' | 'rejected';
  message: string;
} {
  switch (task.status) {
    case 'queued':
      return {
        state: 'submitted',
        message: 'Request received and queued. Human-owner approval is required before task execution.',
      };
    case 'running':
    case 'degraded':
      return { state: 'working', message: 'The task is being processed by the governed execution plane.' };
    case 'completed':
      return { state: 'completed', message: 'The task completed. Any available result is included as an artifact.' };
    case 'failed':
      return { state: 'failed', message: task.error || 'The task failed.' };
    case 'blocked':
      return { state: 'rejected', message: task.error || 'The task was blocked by GLORIFIER governance.' };
  }
}

export function toA2ATask(task: A2ATaskLike) {
  const mapped = statusFor(task);
  const artifacts = task.result === undefined || task.result === null ? [] : [{
    artifactId: task.evidenceId || `artifact-${task.id}`,
    name: 'GLORIFIER task result',
    parts: [{
      text: typeof task.result === 'string' ? task.result : JSON.stringify(task.result),
      mediaType: 'application/json',
    }],
  }];

  return {
    id: task.id,
    contextId: task.parentTaskId || task.id,
    status: {
      state: mapped.state,
      message: {
        messageId: `status-${task.id}`,
        role: 'agent',
        parts: [{ text: mapped.message, mediaType: 'text/plain' }],
      },
      timestamp: task.updatedAt,
    },
    artifacts,
  };
}

function rpcError(id: string | number | null, code: number, message: string): A2AJsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function rpcResult(id: string | number, result: unknown): A2AJsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function messageText(message: JsonRecord): { text: string; normalizedParts: Array<{ text?: string; data?: unknown }> } | null {
  if (message.role !== 'user' || typeof message.messageId !== 'string' || !message.messageId.trim()) return null;
  if (message.taskId || message.contextId) return null;
  if (!Array.isArray(message.parts) || message.parts.length < 1 || message.parts.length > 20) return null;

  const normalizedParts: Array<{ text?: string; data?: unknown }> = [];
  const textParts: string[] = [];
  for (const part of message.parts) {
    if (!isRecord(part)) return null;
    if (typeof part.text === 'string') {
      normalizedParts.push({ text: part.text });
      textParts.push(part.text);
      continue;
    }
    if (hasOwn(part, 'data')) {
      let serialized: string;
      try {
        serialized = JSON.stringify(part.data);
      } catch {
        return null;
      }
      normalizedParts.push({ data: part.data });
      textParts.push(serialized);
      continue;
    }
    // This first binding accepts text and structured JSON only; file/URL parts
    // are deliberately not advertised as supported input modes.
    return null;
  }

  const text = textParts.join('\n');
  if (!text.trim() || text.length > A2A_MAX_MESSAGE_TEXT_CHARS) return null;
  return { text, normalizedParts };
}

export function createA2AJsonRpcHandler(dependencies: A2AJsonRpcDependencies) {
  return async (payload: unknown): Promise<A2AJsonRpcResponse> => {
    if (!isRecord(payload) || payload.jsonrpc !== '2.0' || typeof payload.method !== 'string' ||
        !hasOwn(payload, 'id') ||
        !((typeof payload.id === 'string') || (typeof payload.id === 'number' && Number.isFinite(payload.id)))) {
      return rpcError(null, -32600, 'Invalid Request');
    }

    const id = payload.id as string | number;
    if (!isRecord(payload.params)) return rpcError(id, -32602, 'Invalid params');

    if (payload.method === 'message/send') {
      const params = payload.params;
      if (!isRecord(params.message)) return rpcError(id, -32602, 'Invalid params: message is required.');
      if (isRecord(params.configuration) && params.configuration.pushNotificationConfig) {
        return rpcError(id, -32602, 'Push notifications are not supported by this agent.');
      }
      const parsed = messageText(params.message);
      if (!parsed) {
        return rpcError(
          id,
          -32602,
          'Invalid message. Submit a new user message with text or JSON data parts, no taskId/contextId, and at most 20,000 characters.',
        );
      }
      if (!dependencies.requesterAgentId.trim()) {
        return rpcError(id, -32603, 'Authenticated requester identity is unavailable.');
      }

      try {
        const task = dependencies.createTask({
          requesterAgentId: dependencies.requesterAgentId,
          capability: 'a2a-message-intake',
          objective: parsed.text,
          input: {
            messageId: params.message.messageId,
            parts: parsed.normalizedParts,
          },
        });
        return rpcResult(id, toA2ATask(task));
      } catch {
        return rpcError(id, -32603, 'The task could not be recorded.');
      }
    }

    if (payload.method === 'tasks/get') {
      const taskId = payload.params.id;
      if (typeof taskId !== 'string' || !taskId.trim()) {
        return rpcError(id, -32602, 'Invalid params: task id is required.');
      }
      if (!dependencies.requesterAgentId.trim()) {
        return rpcError(id, -32603, 'Authenticated requester identity is unavailable.');
      }
      try {
        const task = await dependencies.getTask(taskId);
        // A task ID is not an authorization credential. Keep task retrieval
        // scoped to the authenticated creator and avoid revealing foreign IDs.
        if (!task || task.requesterAgentId !== dependencies.requesterAgentId) {
          return rpcError(id, -32001, 'Task not found.');
        }
        return rpcResult(id, toA2ATask(task));
      } catch {
        return rpcError(id, -32603, 'Task lookup is temporarily unavailable.');
      }
    }

    return rpcError(id, -32601, 'Method not found.');
  };
}
