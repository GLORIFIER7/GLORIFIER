/**
 * Server-side JavaScript/TypeScript client for GLORIFIER's versioned Neural API.
 * The client never discovers arbitrary endpoints, follows redirects, or retries
 * task submissions. The published HTTPS/JSON contract remains authoritative.
 */

export const CANONICAL_ORIGIN = 'https://glorifier.glorifier.workers.dev';
export const MAX_TASK_CHARACTERS = 20_000;
export const MAX_TASK_BODY_BYTES = 65_536;
export const MAX_RESPONSE_BODY_BYTES = 1_048_576;
export const DEFAULT_TIMEOUT_MS = 8_000;

const TASK_FIELDS = new Set(['task', 'purpose', 'require_approval', 'action_class']);
const TASK_PATH = '/api/neural/v1/tasks';

export class GlorifierApiError extends Error {
  constructor(message, { status, code, correlationId, retryAfter, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'GlorifierApiError';
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
    this.retryAfter = retryAfter;
  }
}

function normalizeOrigin(raw, { allowLoopbackHttp = false } = {}) {
  let url;
  try {
    url = new URL(raw);
  } catch (cause) {
    throw new TypeError('baseUrl must be an absolute URL origin', { cause });
  }

  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new TypeError('baseUrl must be an origin without credentials, path, query, or fragment');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopback = hostname === 'localhost' || hostname === '::1' ||
    (hostname.startsWith('127.') && hostname.split('.').length === 4 &&
      hostname.split('.').every(part => /^\d+$/.test(part) && Number(part) <= 255));
  const localHttp = url.protocol === 'http:' && allowLoopbackHttp && loopback;
  if (url.protocol !== 'https:' && !localHttp) {
    throw new TypeError('baseUrl must use HTTPS; HTTP is allowed only for explicitly enabled loopback development');
  }

  return url.origin.toLowerCase();
}

function validateTask(task) {
  if (task === null || typeof task !== 'object' || Array.isArray(task) ||
      Object.getPrototypeOf(task) !== Object.prototype) {
    throw new TypeError('task must be a plain JSON object');
  }

  for (const key of Object.keys(task)) {
    if (!TASK_FIELDS.has(key)) {
      throw new TypeError('task contains unsupported field: ' + key);
    }
  }

  if (typeof task.task !== 'string' || !task.task.trim() ||
      Array.from(task.task).length > MAX_TASK_CHARACTERS) {
    throw new TypeError('task must be a non-empty string of at most ' + MAX_TASK_CHARACTERS + ' Unicode characters');
  }
  if (Object.hasOwn(task, 'purpose') &&
      (typeof task.purpose !== 'string' || Array.from(task.purpose).length < 1 || Array.from(task.purpose).length > 100)) {
    throw new TypeError('purpose must contain 1-100 Unicode characters');
  }
  if (Object.hasOwn(task, 'require_approval') && typeof task.require_approval !== 'boolean') {
    throw new TypeError('require_approval must be a boolean');
  }
  if (Object.hasOwn(task, 'action_class') &&
      (typeof task.action_class !== 'string' || Array.from(task.action_class).length < 1 || Array.from(task.action_class).length > 64)) {
    throw new TypeError('action_class must contain 1-64 Unicode characters');
  }
}

async function readLimitedBody(response) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new GlorifierApiError('GLORIFIER API response exceeds the 1 MiB limit', { status: response.status });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function parseJsonObject(bytes, status) {
  if (bytes.byteLength === 0) return {};
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new GlorifierApiError('GLORIFIER API returned invalid UTF-8', { status, cause });
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new GlorifierApiError('GLORIFIER API returned invalid JSON', { status, cause });
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new GlorifierApiError('GLORIFIER API response must be a JSON object', { status });
  }
  return value;
}

/**
 * @param {object} options
 * @param {string} [options.baseUrl] Exact HTTPS origin. Defaults to canonical Worker.
 * @param {string} [options.token] Caller bearer token; sent only to task submission.
 * @param {string[]} [options.allowedOrigins] Additional exact HTTPS origins.
 * @param {boolean} [options.allowLoopbackHttp] Opt in to HTTP for loopback tests only.
 * @param {number} [options.timeoutMs] Per-request timeout (1-60,000 ms).
 * @param {typeof fetch} [options.fetchImpl] Injectable Fetch implementation for tests.
 */
export class GlorifierNeuralClient {
  constructor({
    baseUrl = CANONICAL_ORIGIN,
    token,
    allowedOrigins = [CANONICAL_ORIGIN],
    allowLoopbackHttp = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
  } = {}) {
    if (!Array.isArray(allowedOrigins)) throw new TypeError('allowedOrigins must be an array of exact HTTPS origins');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
      throw new RangeError('timeoutMs must be greater than 0 and at most 60,000');
    }
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a Fetch-compatible function');
    if (token !== undefined && token !== null &&
        (typeof token !== 'string' || token.length === 0 || /[\s\u0000-\u001f\u007f]/u.test(token))) {
      throw new TypeError('token must be a non-empty raw bearer token without whitespace or control characters');
    }

    this.origin = normalizeOrigin(baseUrl, { allowLoopbackHttp });
    this.token = token ?? undefined;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;

    const permittedOrigins = new Set([CANONICAL_ORIGIN]);
    for (const origin of allowedOrigins) {
      const normalized = normalizeOrigin(origin);
      if (!normalized.startsWith('https://')) {
        throw new TypeError('allowedOrigins entries must use HTTPS');
      }
      permittedOrigins.add(normalized);
    }
    const isLocalHttp = this.origin.startsWith('http://') && allowLoopbackHttp;
    if (!isLocalHttp && !permittedOrigins.has(this.origin)) {
      throw new TypeError('baseUrl is not the canonical GLORIFIER Worker origin or an exact origin listed in allowedOrigins');
    }
  }

  health(options = {}) {
    return this.#request('GET', '/api/neural/health', undefined, options);
  }

  ready(options = {}) {
    return this.#request('GET', '/api/neural/ready', undefined, options);
  }

  submitTask(task, options = {}) {
    if (!this.token) throw new TypeError('a caller GLORIFIER API token is required to submit tasks');
    validateTask(task);

    let body;
    try {
      body = new TextEncoder().encode(JSON.stringify(task));
    } catch (cause) {
      throw new TypeError('task must be serializable as UTF-8 JSON', { cause });
    }
    if (body.byteLength > MAX_TASK_BODY_BYTES) {
      throw new RangeError('task request body exceeds the ' + MAX_TASK_BODY_BYTES + '-byte limit');
    }
    return this.#request('POST', TASK_PATH, body, options);
  }

  async #request(method, path, body, options) {
    const headers = new Headers({ Accept: 'application/json' });
    if (body) headers.set('Content-Type', 'application/json; charset=utf-8');
    if (method === 'POST' && path === TASK_PATH && this.token) {
      headers.set('Authorization', 'Bearer ' + this.token);
    }
    if (options.correlationId !== undefined) {
      if (typeof options.correlationId !== 'string' || options.correlationId.length > 128 ||
          /[\s\u0000-\u001f\u007f]/u.test(options.correlationId)) {
        throw new TypeError('correlationId must be a string of at most 128 characters without whitespace or control characters');
      }
      headers.set('X-Correlation-ID', options.correlationId);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    try {
      const response = await this.fetchImpl(this.origin + path, {
        method,
        headers,
        body,
        redirect: 'manual',
        signal,
      });
      const bytes = await readLimitedBody(response);
      const responseBody = parseJsonObject(bytes, response.status);
      return {
        status: response.status,
        ok: response.ok,
        body: responseBody,
        correlationId: response.headers.get('X-Correlation-ID') || undefined,
        retryAfter: response.headers.get('Retry-After') || undefined,
      };
    } catch (cause) {
      if (cause instanceof GlorifierApiError) throw cause;
      const timedOut = controller.signal.aborted && !options.signal?.aborted;
      throw new GlorifierApiError(timedOut ? 'GLORIFIER API request timed out' : 'GLORIFIER API transport failed', { cause });
    } finally {
      clearTimeout(timeout);
    }
  }
}
