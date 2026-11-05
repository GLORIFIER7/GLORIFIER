import { execFileSync } from 'node:child_process';
import { authorizeCapability, getCapabilityPolicy } from '../src/lib/capability-authorization.ts';
import { validateAiFleetDiff } from './ai-fleet-diff-policy.mjs';

function gitRaw(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 8 * 1024 * 1024,
  });
}

function git(args) {
  return gitRaw(args).trimEnd();
}

function fail(message) {
  console.error(\`AI fleet PR gate denied: \${message}\`);
  process.exitCode = 1;
}

function parseNumstatZ(value) {
  const stats = new Map();
  for (const record of value.split('\0').filter(Boolean)) {
    const firstTab = record.indexOf('\t');
    const secondTab = record.indexOf('\t', firstTab + 1);
    if (firstTab < 0 || secondTab < 0) {
      throw new Error('Could not parse staged diff statistics.');
    }
    const added = record.slice(0, firstTab);
    const removed = record.slice(firstTab + 1, secondTab);
    const path = record.slice(secondTab + 1);
    if (!path) throw new Error('A staged diff entry has an empty path.');
    stats.set(path, {
      additions: added === '-' ? 0 : Number(added),
      deletions: removed === '-' ? 0 : Number(removed),
      binary: added === '-' || removed === '-',
    });
  }
  return stats;
}

function readSymlinkPaths() {
  const entries = gitRaw(['ls-files', '-s', '-z']).split('\0').filter(Boolean);
  const paths = new Set();
  for (const entry of entries) {
    const tab = entry.indexOf('\t');
    if (tab < 0) throw new Error('Could not parse Git index entry.');
    const [mode] = entry.slice(0, tab).split(' ');
    const path = entry.slice(tab + 1);
    if (mode === '120000') paths.add(path);
  }
  return paths;
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
      // Disable rename detection so both the old and new paths are checked.
      const paths = gitRaw([
        'diff', '--cached', '--no-renames', '--name-only', '--diff-filter=ACDMRT', '-z',
      ]).split('\0').filter(Boolean);
      const stats = parseNumstatZ(gitRaw([
        'diff', '--cached', '--no-renames', '--numstat', '--diff-filter=ACDMRT', '-z',
      ]));
      const symlinkPaths = readSymlinkPaths();

      const files = paths.map((path) => ({
        path,
        ...(stats.get(path) || { additions: 0, deletions: 0, binary: false }),
        symlink: symlinkPaths.has(path),
      }));
      const result = validateAiFleetDiff({
        files,
        diffText: gitRaw([
          'diff', '--cached', '--no-renames', '--unified=0', '--no-ext-diff',
        ]),
      });
      if (!result.allowed) {
        fail(\`\${result.reason}\${result.path ? \` (\${result.path})\` : ''}\`);
      } else {
        git(['diff', '--cached', '--no-renames', '--check']);
        console.log(
          \`AI fleet PR gate passed: \${result.fileCount} files, +\${result.additions}/-\${result.deletions} lines, capability=\${policy.id}.\`,
        );
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }
}
