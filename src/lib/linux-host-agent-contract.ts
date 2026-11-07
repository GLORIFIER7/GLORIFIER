export const LINUX_HOST_AGENT_ACTIONS = ['host.info', 'memory.info', 'disk.info'] as const;
export type LinuxHostAgentAction = (typeof LINUX_HOST_AGENT_ACTIONS)[number];

export type LinuxHostHeartbeat = {
  agentVersion: string;
  hostname: string;
  distribution: string;
  kernelRelease: string;
  architecture: string;
  pythonVersion: string;
};

export type LinuxHostTaskResult = {
  status: 'succeeded' | 'failed';
  result?: Record<string, unknown>;
  errorCode?: 'unsupported_action' | 'probe_failed';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const boundedString = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maxLength &&
  !/[\u0000-\u001f\u007f]/.test(value);

export function isLinuxHostAgentAction(value: unknown): value is LinuxHostAgentAction {
  return typeof value === 'string' &&
    (LINUX_HOST_AGENT_ACTIONS as readonly string[]).includes(value);
}

export function isValidLinuxHostAgentToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function parseLinuxHostAgentBearerToken(header: string | undefined): string | null {
  if (typeof header !== 'string') return null;
  const match = /^Bearer (.+)$/.exec(header.trim());
  return match && isValidLinuxHostAgentToken(match[1]) ? match[1] : null;
}

export function validateLinuxHostEnrollment(input: unknown): {
  displayName: string;
  architecture: string;
} {
  if (!isRecord(input)) throw new Error('Enrollment body must be a JSON object');
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  const architecture = typeof input.architecture === 'string' ? input.architecture.trim() : '';
  if (!boundedString(displayName, 80)) throw new Error('displayName must be 1-80 printable characters');
  if (!/^[A-Za-z0-9_ -]{1,32}$/.test(architecture)) throw new Error('architecture is invalid');
  return { displayName, architecture };
}

/**
 * Stable JSON encoding for result receipts. Object keys are sorted recursively;
 * array order and scalar values are preserved. The SHA-256 digest is over this
 * canonical representation, not PostgreSQL's JSONB textual formatting.
 */
export function canonicalizeLinuxHostAgentJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('JSON numbers must be safe integers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalizeLinuxHostAgentJson(item)).join(',') + ']';
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((key) =>
      JSON.stringify(key) + ':' + canonicalizeLinuxHostAgentJson(value[key])
    ).join(',') + '}';
  }
  throw new Error('Value is not representable as JSON');
}

export function normalizeLinuxHostHeartbeat(input: unknown): LinuxHostHeartbeat {
  if (!isRecord(input)) throw new Error('Heartbeat body must be a JSON object');
  const fields: Array<[keyof LinuxHostHeartbeat, number]> = [
    ['agentVersion', 32],
    ['hostname', 128],
    ['distribution', 80],
    ['kernelRelease', 128],
    ['architecture', 32],
    ['pythonVersion', 32],
  ];
  const normalized: Record<string, string> = {};
  for (const [key, maxLength] of fields) {
    const value = typeof input[key] === 'string' ? input[key].trim() : '';
    if (!boundedString(value, maxLength)) throw new Error('Heartbeat field is missing or invalid: ' + key);
    normalized[key] = value;
  }
  if (!/^[A-Za-z0-9._+-]+$/.test(normalized.agentVersion)) throw new Error('agentVersion is invalid');
  if (!/^[A-Za-z0-9._-]+$/.test(normalized.hostname)) throw new Error('hostname is invalid');
  if (!/^[A-Za-z0-9._+ /()'-]+$/.test(normalized.distribution)) throw new Error('distribution is invalid');
  if (!/^[A-Za-z0-9._+~-]+$/.test(normalized.kernelRelease)) throw new Error('kernelRelease is invalid');
  if (!/^[A-Za-z0-9_]+$/.test(normalized.architecture)) throw new Error('architecture is invalid');
  if (!/^[0-9]+(?:\.[0-9]+){1,2}(?:[A-Za-z][A-Za-z0-9.]*)?$/.test(normalized.pythonVersion)) throw new Error('pythonVersion is invalid');
  return normalized as LinuxHostHeartbeat;
}

export function normalizeLinuxHostTaskResult(input: unknown): LinuxHostTaskResult {
  if (!isRecord(input)) throw new Error('Task result must be a JSON object');
  if (input.status !== 'succeeded' && input.status !== 'failed') {
    throw new Error('Task status must be succeeded or failed');
  }
  if (input.status === 'succeeded') {
    if (!isRecord(input.result)) throw new Error('Successful task result must be a JSON object');
    const encoded = JSON.stringify(input.result);
    if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > 16_384) throw new Error('Task result exceeds 16 KiB');
    return { status: 'succeeded', result: input.result };
  }
  const errorCode = input.errorCode;
  if (errorCode !== 'unsupported_action' && errorCode !== 'probe_failed') {
    throw new Error('Failed task result has an unsupported errorCode');
  }
  return { status: 'failed', errorCode };
}

export function isSafeLinuxHostRuntimeId(value: unknown): value is string {
  return typeof value === 'string' && /^linux-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

export function isSafeLinuxHostTaskId(value: unknown): value is string {
  return typeof value === 'string' && /^linux-task-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}
