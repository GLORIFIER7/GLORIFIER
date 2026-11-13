import { executeGithubReadTool, type GithubReadToolName } from './github-mcp';
import { verifyGithubToolResult, type GithubVerificationResult } from './autopilot-evidence-verifier';

type JsonRecord = Record<string, unknown>;
type Adapter = (toolName: GithubReadToolName, args: JsonRecord) => Promise<unknown>;
type Verifier = (
  toolName: GithubReadToolName,
  args: JsonRecord,
  result: unknown,
) => Promise<GithubVerificationResult>;

const GITHUB_CAPABILITY_TO_TOOL: Record<string, GithubReadToolName> = {
  'github.get_repository': 'github_get_repository',
  'github.list_pull_requests': 'github_list_open_pull_requests',
  'github.list_workflow_runs': 'github_list_workflow_runs',
  'github.read_file': 'github_read_file',
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const assertOnlyKeys = (input: JsonRecord, allowed: string[]) => {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new Error(`Unsupported argument '${key}' for the read-only GitHub adapter.`);
  }
};

const validatePageSize = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 20) {
    throw new Error('per_page must be an integer between 1 and 20.');
  }
  return value;
};

const validatePath = (value: unknown): string => {
  if (typeof value !== 'string' || !value || value.length > 200 || value.startsWith('/') ||
      value.includes('\\') || value.includes('\0') ||
      value.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('path must be a valid repository-relative path.');
  }
  return value;
};

const validateRef = (value: unknown): string => {
  if (typeof value !== 'string' || !value || value.length > 128 ||
      !/^[A-Za-z0-9._/-]+$/.test(value) || value.includes('..')) {
    throw new Error('ref must be a valid Git reference.');
  }
  return value;
};

export function isSupportedGithubCapability(capability: string): boolean {
  return Object.prototype.hasOwnProperty.call(GITHUB_CAPABILITY_TO_TOOL, capability.trim().toLowerCase());
}

export function normalizeGithubToolInvocation(
  capability: string,
  argumentsValue: unknown,
): { toolName: GithubReadToolName; arguments: JsonRecord } {
  const normalized = typeof capability === 'string' ? capability.trim().toLowerCase() : '';
  const toolName = Object.hasOwn(GITHUB_CAPABILITY_TO_TOOL, normalized) ? GITHUB_CAPABILITY_TO_TOOL[normalized] : undefined;
  if (!toolName) throw new Error(`Capability '${String(capability)}' has no enabled read-only adapter.`);
  const input = argumentsValue === undefined ? {} : argumentsValue;
  if (!isRecord(input)) throw new Error('Tool arguments must be an object.');

  if (toolName === 'github_get_repository') {
    assertOnlyKeys(input, []);
    if (Object.keys(input).length) throw new Error('github.get_repository does not accept arguments.');
    return { toolName, arguments: {} };
  }
  if (toolName === 'github_list_open_pull_requests') {
    assertOnlyKeys(input, ['state', 'per_page']);
    const args: JsonRecord = {};
    if (input.state !== undefined) {
      if (!['open', 'closed', 'all'].includes(String(input.state))) throw new Error('state must be open, closed, or all.');
      args.state = input.state;
    }
    if (input.per_page !== undefined) args.per_page = validatePageSize(input.per_page);
    return { toolName, arguments: args };
  }
  if (toolName === 'github_list_workflow_runs') {
    assertOnlyKeys(input, ['per_page']);
    return {
      toolName,
      arguments: input.per_page === undefined ? {} : { per_page: validatePageSize(input.per_page) },
    };
  }
  assertOnlyKeys(input, ['path', 'ref']);
  const path = validatePath(input.path);
  const args: JsonRecord = { path };
  if (input.ref !== undefined) args.ref = validateRef(input.ref);
  return { toolName, arguments: args };
}

export async function executeAutopilotToolStep(
  capability: string,
  argumentsValue: unknown,
  dependencies: { adapter?: Adapter; verifier?: Verifier } = {},
) {
  const invocation = normalizeGithubToolInvocation(capability, argumentsValue);
  const adapter = dependencies.adapter ?? ((toolName, args) =>
    executeGithubReadTool(toolName, args, process.env.GITHUB_MCP_READ_TOKEN));
  const verifier = dependencies.verifier ?? ((toolName, args, output) =>
    verifyGithubToolResult(toolName, args, output, fetch, process.env.GITHUB_MCP_READ_TOKEN));
  const executionResult = await adapter(invocation.toolName, invocation.arguments);
  const verification = await verifier(invocation.toolName, invocation.arguments, executionResult);
  const executionSha256 = verification.executionSha256;
  const sourceUrlIsTrusted = (() => {
    try {
      const url = new URL(verification.sourceUrl);
      return url.protocol === 'https:' && url.origin === 'https://api.github.com' &&
        (url.pathname === '/repos/GLORIFIER7/GLORIFIER' || url.pathname.startsWith('/repos/GLORIFIER7/GLORIFIER/'));
    } catch {
      return false;
    }
  })();
  if (!verification.verified || !sourceUrlIsTrusted ||
      !/^[a-f0-9]{64}$/.test(verification.sourceSha256) ||
      !/^[a-f0-9]{64}$/.test(verification.executionSha256) ||
      verification.sourceSha256 !== verification.executionSha256 ||
      !Number.isFinite(Date.parse(verification.verifiedAt)) || !verification.verifierId.trim()) {
    throw new Error(`Autopilot independent evidence verification failed for ${invocation.toolName}: ${verification.reason || 'invalid or mismatched source proof'}.`);
  }
  return {
    toolName: invocation.toolName,
    arguments: invocation.arguments,
    executionResult,
    executionSha256,
    verification,
  };
}
