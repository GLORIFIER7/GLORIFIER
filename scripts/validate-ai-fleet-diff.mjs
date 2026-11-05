import { execFileSync } from 'node:child_process';
import { authorizeCapability, getCapabilityPolicy } from '../src/lib/capability-authorization.ts';
import { validateAiFleetDiff } from './ai-fleet-diff-policy.mjs';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
}

function fail(message) {
  console.error(`AI fleet PR gate denied: ${message}`);
  process.exitCode = 1;
}

if (process.env.GLORIFIER_PR_CREATION_AUTHORIZED !== 'true') {
  fail('a human must explicitly authorize PR creation for this workflow run.');
} else {
  const policy = getCapabilityPolicy('create.pull_request');
  const authorization = authorizeCapability({
    capability: 'create.pull_request',
    requestedBy: process.env.GITHUB_ACTOR || 'github-actions',
    humanApproved: true,
  });

  if (!policy || policy.id !== 'create.pull_request' || policy.risk !== 'medium'
    || policy.reversible !== true || !authorization.allowed) {
    fail('the central create.pull_request capability policy is missing, changed, or denied.');
  } else {
    try {
      const paths = git(['diff', '--cached', '--name-only', '--diff-filter=ACDMRT'])
        .split('\n')
        .filter(Boolean);
      const numstat = git(['diff', '--cached', '--numstat', '--diff-filter=ACDMRT']);
      const stats = new Map();
      for (const line of numstat.split('\n').filter(Boolean)) {
        const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
        if (!match) throw new Error('Could not parse staged diff statistics.');
        const [, added, removed, path] = match;
        stats.set(path, {
          additions: added === '-' ? 0 : Number(added),
          deletions: removed === '-' ? 0 : Number(removed),
          binary: added === '-' || removed === '-',
        });
      }

      const files = paths.map((path) => ({
        path,
        ...(stats.get(path) || { additions: 0, deletions: 0, binary: false }),
      }));
      const result = validateAiFleetDiff({
        files,
        diffText: git(['diff', '--cached', '--unified=0', '--no-ext-diff']),
      });
      if (!result.allowed) {
        fail(`${result.reason}${result.path ? ` (${result.path})` : ''}`);
      } else {
        git(['diff', '--cached', '--check']);
        console.log(
          `AI fleet PR gate passed: ${result.fileCount} files, +${result.additions}/-${result.deletions} lines, capability=${policy.id}.`,
        );
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }
}
