export interface GeasRunProvenance {
  schemaVersion: 'GEAS-RUN-PROVENANCE-1';
  eventName: string | null;
  workflowName: string | null;
  repository: string | null;
  ref: string | null;
  runId: string | null;
  runAttempt: number | null;
  runUrl: string | null;
  /** The revision GitHub Actions checked out; for pull_request this is commonly the synthetic merge commit. */
  testedCommitSha: string | null;
  /** The PR source head SHA, or the tested commit for non-PR events. */
  sourceCommitSha: string | null;
  /** The target branch SHA captured in the pull_request event. */
  baseCommitSha: string | null;
  pullRequestNumber: number | null;
}

type Environment = Readonly<Record<string, string | undefined>>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function shaValue(value: unknown): string | null {
  const candidate = stringValue(value);
  return candidate && /^[a-f0-9]{40}$/i.test(candidate) ? candidate.toLowerCase() : null;
}

/** Capture workflow identity separately from the checked-out merge revision. Missing event data stays null. */
export function buildGeasRunProvenance(
  environment: Environment,
  eventPayload: unknown,
): GeasRunProvenance {
  const eventName = stringValue(environment.GITHUB_EVENT_NAME);
  const workflowName = stringValue(environment.GITHUB_WORKFLOW);
  const repository = stringValue(environment.GITHUB_REPOSITORY);
  const ref = stringValue(environment.GITHUB_REF);
  const testedCommitSha = shaValue(environment.GITHUB_SHA);
  const runIdValue = stringValue(environment.GITHUB_RUN_ID);
  const runId = runIdValue && /^\d+$/.test(runIdValue) ? runIdValue : null;
  const attemptValue = stringValue(environment.GITHUB_RUN_ATTEMPT);
  const parsedAttempt = attemptValue && /^\d+$/.test(attemptValue) ? Number(attemptValue) : null;
  const runAttempt = parsedAttempt !== null && Number.isSafeInteger(parsedAttempt) && parsedAttempt > 0
    ? parsedAttempt
    : null;

  const event = asRecord(eventPayload);
  const pullRequest = asRecord(event?.pull_request);
  const isPullRequestEvent = eventName === 'pull_request' || eventName === 'pull_request_target';
  const head = asRecord(pullRequest?.head);
  const base = asRecord(pullRequest?.base);
  const headSha = isPullRequestEvent ? shaValue(head?.sha) : null;
  const baseSha = isPullRequestEvent ? shaValue(base?.sha) : null;
  const numberValue = pullRequest?.number;
  const pullRequestNumber = isPullRequestEvent && typeof numberValue === 'number'
      && Number.isSafeInteger(numberValue) && numberValue > 0
    ? numberValue
    : null;

  let runUrl: string | null = null;
  const serverValue = stringValue(environment.GITHUB_SERVER_URL);
  if (serverValue && repository && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) && runId) {
    try {
      const server = new URL(serverValue);
      if (server.protocol === 'https:') {
        runUrl = server.toString().replace(/\/+$/, '') + '/' + repository + '/actions/runs/' + runId;
      }
    } catch {
      runUrl = null;
    }
  }

  return {
    schemaVersion: 'GEAS-RUN-PROVENANCE-1',
    eventName,
    workflowName,
    repository,
    ref,
    runId,
    runAttempt,
    runUrl,
    testedCommitSha,
    sourceCommitSha: isPullRequestEvent ? headSha : testedCommitSha,
    baseCommitSha: isPullRequestEvent ? baseSha : null,
    pullRequestNumber,
  };
}
