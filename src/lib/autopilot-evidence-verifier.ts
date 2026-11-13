import { createHash } from 'node:crypto';

const API_ROOT = 'https://api.github.com';
const REPOSITORY_PATH = '/repos/GLORIFIER7/GLORIFIER';
const VERIFIER_ID = 'github-rest-independent-read-v1';
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
  return JSON.stringify(value);
};

const sha256 = (value: unknown): string =>
  createHash('sha256').update(canonicalize(value)).digest('hex');

const readJson = async (fetchImpl: FetchLike, url: string): Promise<unknown> => {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'GLORIFIER-Autopilot-Evidence-Verifier',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Independent GitHub evidence read failed with HTTP ${response.status}.`);
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new Error('Independent GitHub evidence response exceeded the 1 MB limit.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Independent GitHub evidence source returned invalid JSON.');
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
    throw new Error('Invalid repository-relative file path for independent verification.');
  }
  if (!ref || ref.length > 128 || !/^[A-Za-z0-9._/-]+$/.test(ref) || ref.includes('..')) {
    throw new Error('Invalid Git reference for independent verification.');
  }
  return { path, ref };
};

const fileContent = (value: unknown): string => {
  if (!isRecord(value) || typeof value.content !== 'string' || value.encoding !== 'base64') {
    throw new Error('Independent GitHub file response is not supported base64 text content.');
  }
  const compact = value.content.replace(/\s/g, '');
  if (compact.length > Math.ceil(MAX_RESPONSE_BYTES * 4 / 3)) {
    throw new Error('Independent GitHub file exceeded the configured limit.');
  }
  return Buffer.from(compact, 'base64').toString('utf8');
};

export async function verifyGithubToolResult(
  toolName: string,
  argumentsValue: unknown,
  executedResult: unknown,
  fetchImpl: FetchLike = fetch,
): Promise<GithubVerificationResult> {
  const args = isRecord(argumentsValue) ? argumentsValue : {};
  let sourceUrl = API_ROOT + REPOSITORY_PATH;
  let sourceProjection: unknown;
  let executionProjection: unknown;

  if (toolName === 'github_get_repository') {
    sourceProjection = repositorySummary(await readJson(fetchImpl, sourceUrl));
    executionProjection = repositorySummary(executedResult);
  } else if (toolName === 'github_list_open_pull_requests') {
    const state = typeof args.state === 'string' ? args.state : 'open';
    const perPage = typeof args.per_page === 'number' ? args.per_page : 10;
    sourceUrl += '/pulls?' + new URLSearchParams({ state, per_page: String(perPage) }).toString();
    sourceProjection = pullRequestSummary(await readJson(fetchImpl, sourceUrl));
    executionProjection = pullRequestSummary(executedResult);
  } else if (toolName === 'github_list_workflow_runs') {
    const perPage = typeof args.per_page === 'number' ? args.per_page : 10;
    sourceUrl += '/actions/runs?' + new URLSearchParams({ per_page: String(perPage) }).toString();
    sourceProjection = workflowRunSummary(await readJson(fetchImpl, sourceUrl));
    executionProjection = workflowRunSummary(executedResult);
  } else if (toolName === 'github_read_file') {
    const { path, ref } = validateFileArguments(args);
    sourceUrl += '/contents/' + encodeURIComponent(path).replaceAll('%2F', '/') + '?' +
      new URLSearchParams({ ref }).toString();
    const source = await readJson(fetchImpl, sourceUrl);
    sourceProjection = { path, ref, content: fileContent(source) };
    if (!isRecord(executedResult)) throw new Error('GitHub file execution result is invalid.');
    executionProjection = {
      path: executedResult.path,
      ref: executedResult.ref,
      content: executedResult.content,
    };
  } else {
    throw new Error('No independent verifier exists for this GitHub tool.');
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
    ...(verified ? {} : { reason: 'independent-source-mismatch' }),
  };
}
