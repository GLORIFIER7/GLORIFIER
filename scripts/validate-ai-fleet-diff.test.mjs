import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const gateScript = fileURLToPath(new URL('./validate-ai-fleet-diff.mjs', import.meta.url));
const tsxLoader = import.meta.resolve('tsx/esm');
const gateSource = readFileSync(gateScript, 'utf8');

function extractBalancedFunction(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return null;
  const openingBrace = source.indexOf('{', start + signature.length);
  if (openingBrace < 0) return null;
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (character === quote) quote = null;
      continue;
    }
    if (character === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (character === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (character === "'" || character === '"' || character === '`') { quote = character; continue; }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

test('function extraction handles nested blocks and braces inside strings', () => {
  const fixture = [
    'function nested() {',
    "  const close = '}';",
    '  if (true) {',
    '    try {',
    '      return { value: 1 };',
    '    } catch (error) {',
    '      return { value: 2 };',
    '    }',
    '  }',
    '}',
  ].join('\n');
  assert.equal(extractBalancedFunction(fixture, 'function nested()'), fixture);
});


test('PR gate invokes the fixed platform-specific Git executable', () => {
  const declaration = gateSource.match(/^const GIT_EXECUTABLE = .*;$/m)?.[0];
  const gitRawFunction = extractBalancedFunction(gateSource, 'function gitRaw(args)');
  assert.ok(declaration, 'the gate must declare its platform-specific Git executable');
  assert.ok(gitRawFunction, 'the gate must expose the gitRaw implementation for the behavioral check');

  for (const [platform, expectedExecutable] of [
    ['linux', '/usr/bin/git'],
    ['win32', 'C:\\Program Files\\Git\\cmd\\git.exe'],
  ]) {
    const calls = [];
    runInNewContext(`${declaration}\n${gitRawFunction}\ngitRaw(['--version']);`, {
      process: { platform },
      execFileSync: (executable, args, options) => {
        calls.push({ executable, args: Array.from(args), options });
        return 'git version test';
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].executable, expectedExecutable);
    assert.deepEqual(calls[0].args, ['--version']);
    assert.equal(calls[0].options.encoding, 'utf8');
  }
});

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

test('PR gate rejects replacing an existing symlink with a regular file', () => {
  const cwd = freshRepository();
  writeFileSync(join(cwd, 'target.txt'), 'target\n');
  symlinkSync('target.txt', join(cwd, 'link.txt'));
  runGit(cwd, ['add', 'target.txt', 'link.txt']);
  runGit(cwd, ['commit', '-q', '-m', 'add symlink']);
  rmSync(join(cwd, 'link.txt'));
  writeFileSync(join(cwd, 'link.txt'), 'regular file\n');
  runGit(cwd, ['add', 'link.txt']);
  const result = executeGate(cwd);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Symbolic-link mode changes are not permitted/);
});

test('PR gate rejects deletion of an existing symlink', () => {
  const cwd = freshRepository();
  writeFileSync(join(cwd, 'target.txt'), 'target\n');
  symlinkSync('target.txt', join(cwd, 'link.txt'));
  runGit(cwd, ['add', 'target.txt', 'link.txt']);
  runGit(cwd, ['commit', '-q', '-m', 'add symlink']);
  rmSync(join(cwd, 'link.txt'));
  runGit(cwd, ['add', '-u', 'link.txt']);
  const result = executeGate(cwd);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Symbolic-link mode changes are not permitted/);
});

test('PR gate rejects renaming a protected workflow file into an ordinary directory', () => {
  const cwd = freshRepository();
  writeRepoFile(cwd, '.github/workflows/policy.yml', 'name: protected\n');
  runGit(cwd, ['commit', '-q', '-m', 'add protected workflow']);
  mkdirSync(join(cwd, 'docs'), { recursive: true });
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
