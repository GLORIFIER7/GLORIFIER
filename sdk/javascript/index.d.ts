export interface TaskRequest {
  task: string;
  purpose?: string;
  require_approval?: boolean;
  action_class?: string;
}

export interface RequestOptions {
  correlationId?: string;
  signal?: AbortSignal;
}

export interface ClientOptions {
  baseUrl?: string;
  token?: string;
  allowedOrigins?: string[];
  allowLoopbackHttp?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface ApiResponse<T extends Record<string, unknown> = Record<string, unknown>> {
  status: number;
  ok: boolean;
  body: T;
  correlationId?: string;
  retryAfter?: string;
}

export declare const CANONICAL_ORIGIN: string;
export declare const MAX_TASK_CHARACTERS: number;
export declare const MAX_TASK_BODY_BYTES: number;
export declare const MAX_RESPONSE_BODY_BYTES: number;
export declare const DEFAULT_TIMEOUT_MS: number;

export declare class GlorifierApiError extends Error {
  status?: number;
  code?: string;
  correlationId?: string;
  retryAfter?: string;
}

export declare class GlorifierNeuralClient {
  constructor(options?: ClientOptions);
  health(options?: RequestOptions): Promise<ApiResponse>;
  ready(options?: RequestOptions): Promise<ApiResponse>;
  submitTask(task: TaskRequest, options?: RequestOptions): Promise<ApiResponse>;
}
