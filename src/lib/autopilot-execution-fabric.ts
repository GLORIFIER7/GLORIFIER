import { executeGithubReadTool, type GithubReadToolName } from './github-mcp';
import {
  executeGithubWriteTool,
  isAllowedAutopilotWritePath,
  normalizeAutopilotWriteBranch,
  type GithubWriteToolName,
} from './autopilot-github-write';
import { verifyGithubToolResult, type GithubVerificationResult } from './autopilot-evidence-verifier';

type JsonRecord = Record<string, unknown>;
type GithubToolName = GithubReadToolName | GithubWriteToolName;
type Adapter = (toolName: GithubToolName, args: JsonRecord) => Promise<unknown>;
type Verifier = (
  toolName: GithubToolName,
  args: JsonRecord,
  result: unknown,
) => Promise<GithubVerificationResult>;

const GITHUB_CAPABILITY_TO_TOOL: Record<string, GithubToolName> = {
  'github.get_repository': 'github_get_repository',
  'github.list_pull_requests': 'github_list_open_pull_requests',
  'github.list_workflow_runs': 'github_list_workflow_runs',
  'github.read_file': 'github_read_file',
  'github.create_branch': 'github_create_branch',
  'github.update_file': 'github_update_file',
  'github.create_pull_request': 'github_create_pull_request',
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const assertOnlyKeys = (input: JsonRecord, allowed: string[]) => {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new Error(`Unsupported argument '${key}' for the Autopilot GitHub adapter.`);
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
      value.includes('\\\\') || value.includes('\\0') ||
      value.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('path must be a valid repository-relative path.');
  }
  return value;
};

const isWriteTool = (toolName: GithubToolName): toolName is GithubWriteToolName =>
  toolName === 'github_create_branch' ||
  toolName === 'github_update_file' ||
  toolName === 'github_create_pull_request';

export function isSupportedGithubCapability(capability: string): boolean {
  return Object.prototype.hasOwnProperty.call(GITHUB_CAPABILITY_TO_TOOL, capability.trim().toLowerCase());
}

export function normalizeGithubToolInvocation(
  capability: string,
  argumentsValue: unknown,
): { toolName: GithubToolName; arguments: JsonRecord } {
  const normalized = typeof capability === 'string' ? capability.trim().toLowerCase() : '';
  const toolName = Object.hasOwn(GITHUB_CAPABILITY_TO_TOOL, normalized) ? GITHUB_CAPABILITY_TO_TOOL[normalized] : undefined;
  if (!toolName) throw new Error(`Capability '${String(capability)}' has no enabled Autopilot GitHub adapter.`);
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
  if (toolName === 'github_read_file') {
    assertOnlyKeys(input, ['path', 'ref']);
    const path = validatePath(input.path);
    const args: JsonRecord = { path };
    if (input.ref !== undefined) {
      if (typeof input.ref !== 'string' || !input.ref || input.ref.length > 128 ||
          !/^[A-Za-z0-9._/-]+$/.test(input.ref) || input.ref.includes('..')) {
        throw new Error('ref must be a valid Git reference.');
      }
      args.ref = input.ref;
    }
    return { toolName, arguments: args };
  }
  if (toolName === 'github_create_branch') {
    assertOnlyKeys(input, ['branch', 'base_ref']);
    const branch = normalizeAutopilotWriteBranch(input.branch);
    if (input.base_ref !== 'main') throw new Error('Autopilot branches may only be created from main.');
    return { toolName, arguments: { branch, base_ref: 'main' } };
  }
  if (toolName === 'github_update_file') {
    assertOnlyKeys(input, ['branch', 'path', 'content', 'message', 'expectedContentSha256']);
    const branch = normalizeAutopilotWriteBranch(input.branch);
    if (!isAllowedAutopilotWritePath(input.path)) throw new Error('path is not in the enabled Autopilot maintenance scope.');
    if (typeof input.content !== 'string' || input.content.length > 24_000) {
      throw new Error('content must be text no larger than 24,000 characters.');
    }
    if (typeof input.expectedContentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.expectedContentSha256)) {
      throw new Error('expectedContentSha256 must be a lowercase SHA-256 digest of the inspected source file.');
    }
    if (typeof input.message !== 'string' || input.message.trim().length < 5 || input.message.trim().length > 120) {
      throw new Error('message must contain between 5 and 120 characters.');
    }
    return { toolName, arguments: { branch, path: input.path, content: input.content, message: input.message.trim(), expectedContentSha256: input.expectedContentSha256 } };
  }
  assertOnlyKeys(input, ['branch', 'title', 'body']);
  const branch = normalizeAutopilotWriteBranch(input.branch);
  if (typeof input.title !== 'string' || input.title.trim().length < 5 || input.title.trim().length > 120) {
    throw new Error('title must contain between 5 and 120 characters.');
  }
  if (typeof input.body !== 'string' || input.body.length > 20_000) {
    throw new Error('body must be text no larger than 20,000 characters.');
  }
  return { toolName, arguments: { branch, title: input.title.trim(), body: input.body } };
}

export async function executeAutopilotToolStep(
  capability: string,
  argumentsValue: unknown,
  dependencies: { adapter?: Adapter; verifier?: Verifier } = {},
) {
  const invocation = normalizeGithubToolInvocation(capability, argumentsValue);
  const adapter = dependencies.adapter ?? ((toolName, args) => isWriteTool(toolName)
    ? executeGithubWriteTool(toolName, args, process.env.GLORIFIER_GITHUB_WRITE_TOKEN)
    : executeGithubReadTool(toolName, args, process.env.GITHUB_MCP_READ_TOKEN));
  const verifier = dependencies.verifier ?? ((toolName, args, output) =>
    verifyGithubToolResult(
      toolName,
      args,
      output,
      fetch,
      isWriteTool(toolName)
        ? process.env.GLORIFIER_GITHUB_WRITE_TOKEN
        : process.env.GITHUB_MCP_READ_TOKEN,
    ));
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
