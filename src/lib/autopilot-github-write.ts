import { createHash } from 'node:crypto';

const API_ROOT = 'https://api.github.com';
const REPOSITORY_PATH = '/repos/GLORIFIER7/GLORIFIER';
const MAX_API_RESPONSE_CHARS = 1_000_000;
const MAX_FILE_CONTENT_CHARS = 24_000;

type JsonRecord = Record<string, unknown>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type GithubWriteToolName =
  | 'github_create_branch'
  | 'github_update_file'
  | 'github_create_pull_request';

export function normalizeAutopilotWriteBranch(value: unknown): string {
  if (typeof value !== 'string' || value.length > 100 ||
      !/^autopilot\/[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    throw new Error('branch must use the isolated autopilot branch namespace.');
  }
  return value;
}

export function isAllowedAutopilotWritePath(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 200 ||
      value.startsWith('/') || value.includes('\\') || value.includes('\0')) return false;
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.toLowerCase().includes('.env'))) {
    return false;
  }
  if (segments.some(segment => ['.git', 'node_modules', 'secrets', 'credentials'].includes(segment.toLowerCase()))) {
    return false;
  }
  return value.startsWith('src/')
    || value.startsWith('scripts/')
    || value.startsWith('tests/')
    || value.startsWith('docs/')
    || value === 'AGENT_RUNTIME.md'
    || value === 'README.md';
}

const requireMessage = (value: unknown, label: string, maximum = 120): string => {
  if (typeof value !== 'string') throw new Error(label + ' must be a string.');
  const normalized = value.trim();
  if (normalized.length < 5 || normalized.length > maximum) {
    throw new Error(label + ' must contain between 5 and ' + maximum + ' characters.');
  }
  return normalized;
};

const branchRefPath = (branch: string): string =>
  '/git/ref/heads/' + branch.split('/').map(encodeURIComponent).join('/');

const fileContentPath = (path: string): string =>
  '/contents/' + path.split('/').map(encodeURIComponent).join('/');

async function githubRequest(
  fetchImpl: FetchLike,
  token: string,
  method: string,
  pathname: string,
  body?: JsonRecord,
): Promise<{ status: number; data: unknown }> {
  const url = new URL(REPOSITORY_PATH + pathname, API_ROOT);
  if (url.origin !== API_ROOT || url.protocol !== 'https:' ||
      !url.pathname.startsWith(REPOSITORY_PATH + '/')) {
    throw new Error('Blocked Autopilot GitHub request outside the fixed repository API.');
  }
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'GLORIFIER-Autopilot-Write-Adapter',
  });
  const response = await fetchImpl(url.href, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
  });
  const text = await response.text();
  if (text.length > MAX_API_RESPONSE_CHARS) {
    throw new Error('GitHub write adapter response exceeded the configured size limit.');
  }
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      throw new Error('GitHub write adapter received invalid JSON.');
    }
  }
  return { status: response.status, data };
}

function normalizedRef(value: unknown, branch: string): { ref: string; sha: string } {
  if (!isRecord(value) || value.ref !== 'refs/heads/' + branch ||
      !isRecord(value.object) || typeof value.object.sha !== 'string' ||
      !/^[a-f0-9]{40,64}$/i.test(value.object.sha)) {
    throw new Error('GitHub did not return a valid Autopilot branch reference.');
  }
  return { ref: value.ref, sha: value.object.sha };
}

async function createBranch(
  args: JsonRecord,
  token: string,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const branch = normalizeAutopilotWriteBranch(args.branch);
  if (args.base_ref !== 'main') throw new Error('Autopilot branches may only be created from main.');
  const refPath = branchRefPath(branch);
  const existing = await githubRequest(fetchImpl, token, 'GET', refPath);
  if (existing.status !== 200 && existing.status !== 404) {
    throw new Error('Unable to check the Autopilot branch reference (HTTP ' + existing.status + ').');
  }

  const base = await githubRequest(fetchImpl, token, 'GET', '/git/ref/heads/main');
  if (base.status !== 200 || !isRecord(base.data) || !isRecord(base.data.object) ||
      typeof base.data.object.sha !== 'string' || !/^[a-f0-9]{40,64}$/i.test(base.data.object.sha)) {
    throw new Error('Unable to resolve the current main branch commit.');
  }
  const baseSha = base.data.object.sha;

  const verifyExistingBranch = async (value: unknown): Promise<unknown> => {
    const branchRef = normalizedRef(value, branch);
    const comparison = await githubRequest(
      fetchImpl,
      token,
      'GET',
      '/compare/' + baseSha + '...' + branchRef.sha,
    );
    if (comparison.status !== 200 || !isRecord(comparison.data) ||
        !['ahead', 'identical'].includes(String(comparison.data.status)) ||
        !isRecord(comparison.data.merge_base_commit) ||
        comparison.data.merge_base_commit.sha !== baseSha) {
      throw new Error('Existing Autopilot branch is not a descendant of current main; refusing to reuse it.');
    }
    return { ...branchRef, idempotent: true };
  };

  if (existing.status === 200) return verifyExistingBranch(existing.data);

  const created = await githubRequest(fetchImpl, token, 'POST', '/git/refs', {
    ref: 'refs/heads/' + branch,
    sha: baseSha,
  });
  if (created.status === 201 || created.status === 200) {
    return { ...normalizedRef(created.data, branch), idempotent: false };
  }
  if (created.status === 422) {
    const raced = await githubRequest(fetchImpl, token, 'GET', refPath);
    if (raced.status === 200) return verifyExistingBranch(raced.data);
  }
  throw new Error('Unable to create the Autopilot branch (HTTP ' + created.status + ').');
}

async function updateFile(
  args: JsonRecord,
  token: string,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const branch = normalizeAutopilotWriteBranch(args.branch);
  if (!isAllowedAutopilotWritePath(args.path)) {
    throw new Error('Autopilot file path is not in the enabled maintenance scope.');
  }
  if (typeof args.content !== 'string' || args.content.length > MAX_FILE_CONTENT_CHARS) {
    throw new Error('Autopilot file content must be text no larger than 24,000 characters.');
  }
  const message = requireMessage(args.message, 'commit message');
  if (typeof args.expectedContentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(args.expectedContentSha256)) {
    throw new Error('expectedContentSha256 must be a lowercase SHA-256 digest of the inspected source file.');
  }
  const path = args.path;
  const endpoint = fileContentPath(path);
  const existing = await githubRequest(
    fetchImpl, token, 'GET', endpoint + '?' + new URLSearchParams({ ref: branch }).toString(),
  );
  if (existing.status !== 200) {
    throw new Error('Inspected source file is missing from the Autopilot branch; refusing to create an uninspected file (HTTP ' + existing.status + ').');
  }
  let sha: string | undefined;
  {
    if (!isRecord(existing.data) || typeof existing.data.sha !== 'string' ||
        !/^[a-f0-9]{40}$/i.test(existing.data.sha) ||
        typeof existing.data.content !== 'string' || existing.data.encoding !== 'base64') {
      throw new Error('GitHub returned invalid existing file content or SHA.');
    }
    const existingBytes = Buffer.from(existing.data.content.replace(/\s/g, ''), 'base64');
    const currentContentSha256 = createHash('sha256').update(existingBytes).digest('hex');
    if (currentContentSha256 !== args.expectedContentSha256) {
      throw new Error('Autopilot source changed after inspection; refusing to overwrite a stale file.');
    }
    sha = existing.data.sha;
  }
  const updated = await githubRequest(fetchImpl, token, 'PUT', endpoint, {
    message,
    content: Buffer.from(args.content, 'utf8').toString('base64'),
    branch,
    ...(sha ? { sha } : {}),
  });
  if ((updated.status !== 200 && updated.status !== 201) || !isRecord(updated.data) ||
      !isRecord(updated.data.content) || !isRecord(updated.data.commit) ||
      updated.data.content.path !== path || typeof updated.data.content.sha !== 'string' ||
      typeof updated.data.commit.sha !== 'string') {
    throw new Error('GitHub did not confirm the Autopilot file update (HTTP ' + updated.status + ').');
  }
  return {
    commit: { sha: updated.data.commit.sha },
    content: { path, sha: updated.data.content.sha },
    idempotent: false,
  };
}

function normalizePullRequest(value: unknown, branch: string): JsonRecord {
  if (!isRecord(value) || !Number.isSafeInteger(value.number) ||
      typeof value.title !== 'string' || typeof value.state !== 'string' ||
      !isRecord(value.head) || value.head.ref !== branch ||
      !isRecord(value.base) || value.base.ref !== 'main' ||
      typeof value.html_url !== 'string' || typeof value.draft !== 'boolean') {
    throw new Error('GitHub did not return a valid Autopilot pull request.');
  }
  return {
    number: value.number,
    title: value.title,
    state: value.state,
    draft: value.draft,
    url: value.html_url,
    head: { ref: branch },
    base: { ref: 'main' },
  };
}

async function createPullRequest(
  args: JsonRecord,
  token: string,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const branch = normalizeAutopilotWriteBranch(args.branch);
  const title = requireMessage(args.title, 'pull request title', 120);
  if (typeof args.body !== 'string' || args.body.length > 20_000) {
    throw new Error('pull request body must be text no larger than 20,000 characters.');
  }
  const query = new URLSearchParams({
    state: 'open',
    head: 'GLORIFIER7:' + branch,
    base: 'main',
  });
  const existing = await githubRequest(fetchImpl, token, 'GET', '/pulls?' + query.toString());
  if (existing.status !== 200 || !Array.isArray(existing.data)) {
    throw new Error('Unable to check for an existing Autopilot pull request (HTTP ' + existing.status + ').');
  }
  const current = existing.data.find(item =>
    isRecord(item) && isRecord(item.head) && item.head.ref === branch &&
    isRecord(item.base) && item.base.ref === 'main',
  );
  if (current) return { ...normalizePullRequest(current, branch), idempotent: true };

  const created = await githubRequest(fetchImpl, token, 'POST', '/pulls', {
    title,
    head: branch,
    base: 'main',
    body: args.body,
    draft: true,
  });
  if (created.status !== 201 && created.status !== 200) {
    throw new Error('Unable to open the Autopilot draft pull request (HTTP ' + created.status + ').');
  }
  return { ...normalizePullRequest(created.data, branch), idempotent: false };
}

export async function executeGithubWriteTool(
  name: string,
  argumentsValue: unknown,
  writeToken: string | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const token = typeof writeToken === 'string' ? writeToken.trim() : '';
  if (!token) throw new Error('GLORIFIER_GITHUB_WRITE_TOKEN is not configured.');
  if (token.length > 512 || /[\r\n]/.test(token)) {
    throw new Error('GLORIFIER_GITHUB_WRITE_TOKEN has an invalid format.');
  }
  if (!isRecord(argumentsValue)) throw new Error('Autopilot GitHub write arguments must be an object.');
  const args = argumentsValue;
  if (name === 'github_create_branch') {
    if (Object.keys(args).some(key => !['branch', 'base_ref'].includes(key))) throw new Error('Unsupported create_branch argument.');
    return createBranch(args, token, fetchImpl);
  }
  if (name === 'github_update_file') {
    if (Object.keys(args).some(key => !['branch', 'path', 'content', 'message', 'expectedContentSha256'].includes(key))) throw new Error('Unsupported update_file argument.');
    return updateFile(args, token, fetchImpl);
  }
  if (name === 'github_create_pull_request') {
    if (Object.keys(args).some(key => !['branch', 'title', 'body'].includes(key))) throw new Error('Unsupported create_pull_request argument.');
    return createPullRequest(args, token, fetchImpl);
  }
  throw new Error('Unknown or unsupported Autopilot GitHub write tool.');
}
