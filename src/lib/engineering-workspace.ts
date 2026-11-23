/**
 * Public, read-only engineering workspace metadata.
 * Never infer authentication, write authorization, CI success, or an active Kernel
 * session from a public link or an unauthenticated GitHub API response.
 */
export const ENGINEERING_WORKSPACE_LINKS = Object.freeze({
  repository: 'https://github.com/GLORIFIER7/GLORIFIER',
  editor: 'https://github.dev/GLORIFIER7/GLORIFIER',
  pullRequests: 'https://github.com/GLORIFIER7/GLORIFIER/pulls',
  actions: 'https://github.com/GLORIFIER7/GLORIFIER/actions',
  kernel: 'https://dashboard.onkernel.com',
});

export type GitHubRepositoryObservation = {
  name: 'GLORIFIER7/GLORIFIER';
  defaultBranch: string;
  /** GitHub's open_issues_count includes issues and pull requests. */
  openIssuesAndPullRequests: number;
  pushedAt: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseGitHubRepository = (value: unknown): GitHubRepositoryObservation | null => {
  if (!isRecord(value) || value.full_name !== 'GLORIFIER7/GLORIFIER') return null;
  if (typeof value.default_branch !== 'string' || value.default_branch.trim().length === 0) return null;
  if (typeof value.open_issues_count !== 'number' || !Number.isSafeInteger(value.open_issues_count) || value.open_issues_count < 0) return null;
  if (value.pushed_at != null && (typeof value.pushed_at !== 'string' ||
    !Number.isFinite(Date.parse(value.pushed_at)))) return null;

  return {
    name: 'GLORIFIER7/GLORIFIER',
    defaultBranch: value.default_branch,
    openIssuesAndPullRequests: value.open_issues_count,
    pushedAt: (value.pushed_at as string | null) ?? null,
  };
};

/** Returns null for malformed or rate-limited responses, never a false zero. */
export const parseGitHubPullRequests = (value: unknown): number | null => {
  if (!Array.isArray(value) || value.some(item =>
    !isRecord(item) || typeof item.number !== 'number' || !Number.isSafeInteger(item.number) || item.number < 1)) {
    return null;
  }
  return value.length;
};
