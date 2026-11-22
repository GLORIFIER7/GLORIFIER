/**
 * Keeps overlapping asynchronous refreshes from committing stale results.
 * Each new request supersedes earlier requests within the same mount.
 */
export function createLatestRequestGate() {
  let newestRequest = 0;
  return {
    begin: () => ++newestRequest,
    isCurrent: (requestId: number) => requestId === newestRequest,
  };
}
