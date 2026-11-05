import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const gateScript = fileURLToPath(new URL('./validate-ai-fleet-diff.mjs', import.meta.url));
const tsxLoader = import.meta.resolve('tsx/esm');

function runGit(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function createRepository() {
  const cwd = mkdtempSync(join(tmpdir(), 'glorifier-ai-fleet-gate-'));
  runGit(cwd, ['init', '-q']);
  runGit(cwd, ['config', 'user.name', 'GLORIFIER test']);
  runGit(cwd, ['config', 'user.email', 'glorifier-test@example.invalid']);
  writeFileSync(join(cwd, 'README.md'), 'baseline\n');
  runGit(cwd, ['add', 'README.md']);
  runGit(cwd, ['commit', '-q', '-m', 'baseline']);
  return cwd;
}

function writeRepoFile(cwd, path, contents) {
  const target = join(cwd, ...path.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
  runGit(cwd, ['add', '--', path]);
}

function executeGate(cwd, authorized = 'true') {
  return spawnSync(process.execPath, ['--import', tsxLoader, gateScript], {
    cwd,
    encoding: 'utf8',
    timeout: 15_000,
    env: {
      ...process.env,
      GLORIFIER_PR_CREATION_AUTHORIZED: authorized,
      GITHUB_ACTOR: 'glorifier-gate-test',
    },
  });
}

const repositories = new Set();
function freshRepository() {
  const cwd = createRepository();
  repositories.add(cwd);
  return cwd;
}

test.after(() => {
  for (const cwd of repositories) rmSync(cwd, { recursive: true, force: true });
});

test('PR gate accepts an authorized small staged source diff', () => {
  const cwd = freshRepository();
  writeRepoFile(cwd, 'src/lib/ordinary-feature.ts', 'export const feature = true;\n');
  const result = executeGate(cwd);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /capability=create\.pull_request/);
});

test('PR gate rejects a protected authorization-policy file', () => {
  const cwd = freshRepository();
  writeRepoFile(cwd, 'src/lib/capability-authorization.ts', 'export const bypass = true;\n');
  const result = executeGate(cwd);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /protected_path_requires_human_change/);
});

test('PR gate rejects a secret-like token in a staged diff', () => {
  const cwd = freshRepository();
  writeRepoFile(cwd, 'src/lib/example.ts', "export const key = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';\n");
  const result = executeGate(cwd);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /secret_like_material_detected/);
});

test('PR gate rejects a newly staged symbolic link', () => {
  const cwd = freshRepository();
  const target = join(cwd, 'target.txt');
  writeFileSync(target, 'target\n');
  runGit(cwd, ['add', 'target.txt']);
  symlinkSync('../target.txt', join(cwd, 'link.txt'));
  runGit(cwd, ['add', 'link.txt']);
  const result = executeGate(cwd);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /binary_or_symlink_change_not_reviewable|Symbolic-link mode changes/);
});

test('PR gate rejects renaming a protected workflow file into an ordinary directory', () => {
  const cwd = freshRepository();
  writeRepoFile(cwd, '.github/workflows/policy.yml', 'name: protected\n');
  runGit(cwd, ['commit', '-q', '-m', 'add protected workflow']);
  runGit(cwd, ['mv', '.github/workflows/policy.yml', 'docs/policy-notes.md']);
  const result = executeGate(cwd);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /protected_path_requires_human_change/);
});

test('PR gate denies publication without the explicit human authorization input', () => {
  const cwd = freshRepository();
  writeRepoFile(cwd, 'src/lib/ordinary-feature.ts', 'export const feature = true;\n');
  const result = executeGate(cwd, 'false');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /human must explicitly authorize PR creation/);
});
