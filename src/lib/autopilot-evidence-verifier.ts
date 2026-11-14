import { createHash } from 'node:crypto';
import { isAllowedAutopilotWritePath, normalizeAutopilotWriteBranch } from './autopilot-github-write';

const API_ROOT = 'https://api.github.com';
const REPOSITORY_PATH = '/repos/GLORIFIER7/GLORIFIER';
const VERIFIER_ID = 'github-rest-source-readback-v1';
const MAX_RESPONSE_BYTES = 1_000_000;

type JsonRecord = Record<string, unknown>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type GithubVerificationResult = {
  verified: boolean;
  verifierId: string;
  sourceUrl: string;
  verifiedAt: string;
  sourceSha256: string;
  executionSha256: string;
  reason?: string;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const canonicalize = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (isRecord(value)) {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}';
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? 'null' : encoded;
};

const sha256 = (value: unknown): string =>
  createHash('sha256').update(canonicalize(value)).digest('hex');

const readJson = async (fetchImpl: FetchLike, url: string, readToken?: string): Promise<unknown> => {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'GLORIFIER-Autopilot-Evidence-Verifier',
  });
  const normalizedToken = readToken?.trim();
  if (normalizedToken) headers.set('Authorization', `Bearer ${normalizedToken}`);
  const response = await fetchImpl(url, {
    method: 'GET',
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`GitHub source-readback evidence read failed with HTTP ${response.status}.`);
  if (!response.body) throw new Error('GitHub source-readback evidence source returned an empty response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (!part.value) continue;
      totalBytes += part.value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('GitHub source-readback evidence response exceeded the 1 MB limit.');
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('GitHub source-readback evidence source returned invalid JSON.');
  }
};

const repositorySummary = (value: unknown): JsonRecord => {
  if (!isRecord(value)) throw new Error('GitHub repository response is invalid.');
  return { id: value.id, full_name: value.full_name, default_branch: value.default_branch };
};

const pullRequestSummary = (value: unknown): JsonRecord[] => {
  if (!Array.isArray(value)) throw new Error('GitHub pull-request response is invalid.');
  return value.map(item => {
    if (!isRecord(item)) throw new Error('GitHub pull-request item is invalid.');
    const head = isRecord(item.head) ? item.head : {};
    const base = isRecord(item.base) ? item.base : {};
    return {
      number: item.number,
      state: item.state,
      title: item.title,
      updated_at: item.updated_at,
      head_sha: head.sha,
      base_sha: base.sha,
    };
  });
};

const workflowRunSummary = (value: unknown): JsonRecord[] => {
  if (!isRecord(value) || !Array.isArray(value.workflow_runs)) {
    throw new Error('GitHub workflow-run response is invalid.');
  }
  return value.workflow_runs.map(item => {
    if (!isRecord(item)) throw new Error('GitHub workflow-run item is invalid.');
    return {
      id: item.id,
      name: item.name,
      head_sha: item.head_sha,
      status: item.status,
      conclusion: item.conclusion,
      updated_at: item.updated_at,
    };
  });
};

const validateFileArguments = (args: JsonRecord): { path: string; ref: string } => {
  const path = typeof args.path === 'string' ? args.path : '';
  const ref = typeof args.ref === 'string' ? args.ref : 'main';
  if (!path || path.length > 200 || path.startsWith('/') || path.includes('\\') || path.includes('\0') ||
      path.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('Invalid repository-relative file path for GitHub source readback.');
  }
  if (!ref || ref.length > 128 || !/^[A-Za-z0-9._/-]+$/.test(ref) || ref.includes('..')) {
    throw new Error('Invalid Git reference for GitHub source readback.');
  }
  return { path, ref };
};

const fileContent = (value: unknown): string => {
  if (!isRecord(value) || typeof value.content !== 'string' || value.encoding !== 'base64') {
    throw new Error('GitHub source-readback file response is not supported base64 text content.');
  }
  const compact = value.content.replace(/\s/g, '');
  if (compact.length > Math.ceil(MAX_RESPONSE_BYTES * 4 / 3)) {
    throw new Error('GitHub source-readback file exceeded the configured limit.');
  }
  return Buffer.from(compact, 'base64').toString('utf8');
};

export async function verifyGithubToolResult(
  toolName: string,
  argumentsValue: unknown,
  executedResult: unknown,
  fetchImpl: FetchLike = fetch,
  readToken?: string,
): Promise<GithubVerificationResult> {
  const args = isRecord(argumentsValue) ? argumentsValue : {};
  let sourceUrl = API_ROOT + REPOSITORY_PATH;
  let sourceProjection: unknown;
  let executionProjection: unknown;

  if (toolName === 'github_get_repository') {
    sourceProjection = repositorySummary(await readJson(fetchImpl, sourceUrl, readToken));
    executionProjection = repositorySummary(executedResult);
  } else if (toolName === 'github_list_open_pull_requests') {
    const state = typeof args.state === 'string' ? args.state : 'open';
    const perPage = typeof args.per_page === 'number' ? args.per_page : 10;
    sourceUrl += '/pulls?' + new URLSearchParams({ state, per_page: String(perPage) }).toString();
    sourceProjection = pullRequestSummary(await readJson(fetchImpl, sourceUrl, readToken));
    executionProjection = pullRequestSummary(executedResult);
  } else if (toolName === 'github_list_workflow_runs') {
    const perPage = typeof args.per_page === 'number' ? args.per_page : 10;
    sourceUrl += '/actions/runs?' + new URLSearchParams({ per_page: String(perPage) }).toString();
    sourceProjection = workflowRunSummary(await readJson(fetchImpl, sourceUrl, readToken));
    executionProjection = workflowRunSummary(executedResult);
  } else if (toolName === 'github_read_file') {
    const { path, ref } = validateFileArguments(args);
    sourceUrl += '/contents/' + encodeURIComponent(path).replaceAll('%2F', '/') + '?' +
      new URLSearchParams({ ref }).toString();
    const source = await readJson(fetchImpl, sourceUrl, readToken);
    sourceProjection = { path, ref, content: fileContent(source) };
    if (!isRecord(executedResult)) throw new Error('GitHub file execution result is invalid.');
    executionProjection = {
      path: executedResult.path,
      ref: executedResult.ref,
      content: executedResult.content,
    };
  } else if (toolName === 'github_create_branch') {
    const branch = normalizeAutopilotWriteBranch(args.branch);
    sourceUrl += '/git/ref/heads/' + branch.split('/').map(encodeURIComponent).join('/');
    const source = await readJson(fetchImpl, sourceUrl, readToken);
    if (!isRecord(source) || source.ref !== 'refs/heads/' + branch ||
        !isRecord(source.object) || typeof source.object.sha !== 'string') {
      throw new Error('GitHub source-readback branch evidence is invalid.');
    }
    if (!isRecord(executedResult)) throw new Error('GitHub branch execution result is invalid.');
    sourceProjection = { ref: source.ref, sha: source.object.sha };
    executionProjection = { ref: executedResult.ref, sha: executedResult.sha };
  } else if (toolName === 'github_update_file') {
    const branch = normalizeAutopilotWriteBranch(args.branch);
    if (!isAllowedAutopilotWritePath(args.path)) {
      throw new Error('GitHub source-readback path is outside the Autopilot maintenance scope.');
    }
    const path = args.path as string;
    sourceUrl += '/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?' +
      new URLSearchParams({ ref: branch }).toString();
    const source = await readJson(fetchImpl, sourceUrl, readToken);
    if (!isRecord(source) || source.path !== path || typeof source.sha !== 'string') {
      throw new Error('GitHub source-readback file-update evidence is invalid.');
    }
    if (!isRecord(executedResult) || !isRecord(executedResult.content)) {
      throw new Error('GitHub file-update execution result is invalid.');
    }
    sourceProjection = { path, sha: source.sha };
    executionProjection = {
      path: executedResult.content.path,
      sha: executedResult.content.sha,
    };
  } else if (toolName === 'github_create_pull_request') {
    const branch = normalizeAutopilotWriteBranch(args.branch);
    if (!isRecord(executedResult) || !Number.isSafeInteger(executedResult.number) ||
        (executedResult.number as number) < 1) {
      throw new Error('GitHub pull-request execution result is invalid.');
    }
    const number = executedResult.number as number;
    sourceUrl += '/pulls/' + number;
    const source = await readJson(fetchImpl, sourceUrl, readToken);
    const summarizeSource = (value: unknown): JsonRecord => {
      if (!isRecord(value) || !Number.isSafeInteger(value.number) ||
          typeof value.title !== 'string' || typeof value.state !== 'string' ||
          typeof value.draft !== 'boolean' || typeof value.html_url !== 'string' ||
          !isRecord(value.head) || value.head.ref !== branch ||
          !isRecord(value.base) || value.base.ref !== 'main') {
        throw new Error('GitHub source-readback pull-request evidence is invalid.');
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
    };
    const summarizeExecution = (value: JsonRecord): JsonRecord => {
      if (!Number.isSafeInteger(value.number) || typeof value.title !== 'string' ||
          typeof value.state !== 'string' || typeof value.draft !== 'boolean' ||
          typeof value.url !== 'string' || !isRecord(value.head) ||
          !isRecord(value.base)) {
        throw new Error('GitHub pull-request execution projection is invalid.');
      }
      return {
        number: value.number,
        title: value.title,
        state: value.state,
        draft: value.draft,
        url: value.url,
        head: { ref: value.head.ref },
        base: { ref: value.base.ref },
      };
    };
    sourceProjection = summarizeSource(source);
    executionProjection = summarizeExecution(executedResult);
  } else {
    throw new Error('No GitHub source-readback verifier exists for this tool.');
  }

  const sourceSha256 = sha256(sourceProjection);
  const executionSha256 = sha256(executionProjection);
  const verified = sourceSha256 === executionSha256;
  return {
    verified,
    verifierId: VERIFIER_ID,
    sourceUrl,
    verifiedAt: new Date().toISOString(),
    sourceSha256,
    executionSha256,
    ...(verified ? {} : { reason: 'github-source-readback-mismatch' }),
  };
}
