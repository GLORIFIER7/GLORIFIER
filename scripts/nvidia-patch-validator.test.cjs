'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePatchResponse } = require('./nvidia-patch-validator.cjs');

const valid = [
  'BEGIN_PATCH',
  'diff --git a/scripts/example.cjs b/scripts/example.cjs',
  'index 1111111..2222222 100644',
  '--- a/scripts/example.cjs',
  '+++ b/scripts/example.cjs',
  '@@ -1 +1 @@',
  '-oldValue();',
  '+newValue();',
  'END_PATCH'
].join('\n');

test('accepts a small existing-file unified diff within the allowlist', () => {
  const expected = valid.split('BEGIN_PATCH\n')[1].split('\nEND_PATCH')[0] + '\n';
  assert.deepEqual(validatePatchResponse(valid), { kind: 'patch', patch: expected });
});

test('accepts an explicit NO_PATCH response', () => {
  assert.deepEqual(validatePatchResponse('NO_PATCH'), { kind: 'no_patch' });
});

test('rejects missing patch envelopes', () => {
  assert.throws(() => validatePatchResponse('diff --git a/scripts/a b/scripts/a'), /BEGIN_PATCH.*END_PATCH/);
});

test('rejects patches exceeding the byte budget with a distinct reason', () => {
  const large = valid.replace('+newValue();', '+' + 'x'.repeat(13000));
  assert.throws(() => validatePatchResponse(large), /byte limit/);
});

test('rejects patches touching more than two files', () => {
  const threeFiles = valid.replace('END_PATCH', [
    'diff --git a/scripts/second.cjs b/scripts/second.cjs',
    '--- a/scripts/second.cjs', '+++ b/scripts/second.cjs', '@@ -1 +1 @@', '-a', '+b',
    'diff --git a/docs/third.md b/docs/third.md',
    '--- a/docs/third.md', '+++ b/docs/third.md', '@@ -1 +1 @@', '-c', '+d',
    'END_PATCH'
  ].join('\n'));
  assert.throws(() => validatePatchResponse(threeFiles), /file limit/);
});

test('rejects patches exceeding the changed-line budget', () => {
  const additions = Array.from({ length: 101 }, (_, i) => '+line-' + i).join('\n');
  const tooManyLines = valid.replace('+newValue();', additions);
  assert.throws(() => validatePatchResponse(tooManyLines), /changed-line limit/);
});

test('rejects paths outside the approved source directories', () => {
  const denied = valid.replaceAll('scripts/example.cjs', '.github/workflows/evil.yml');
  assert.throws(() => validatePatchResponse(denied), /path is not allowed/);
});

test('rejects creation and deletion file headers', () => {
  const newFile = valid.replace('--- a/scripts/example.cjs', '--- /dev/null');
  assert.throws(() => validatePatchResponse(newFile), /creating or deleting files/);
});

test('rejects a second file header smuggled after a validated hunk', () => {
  const hiddenFile = valid.replace('END_PATCH', [
    '--- a/.github/workflows/privileged.yml',
    '+++ b/.github/workflows/privileged.yml',
    '@@ -1 +1 @@',
    '-old secret-bearing workflow',
    '+untrusted replacement',
    'END_PATCH'
  ].join('\n'));
  assert.throws(() => validatePatchResponse(hiddenFile), /unexpected content|unvalidated file header|hunk/i);
});

test('rejects mismatched git and unified-diff paths', () => {
  const mismatch = valid.replace('+++ b/scripts/example.cjs', '+++ b/docs/example.cjs');
  assert.throws(() => validatePatchResponse(mismatch), /path mismatch/);
});

test('accepts a valid two-file patch with no index header lines', () => {
  const twoFiles = [
    'BEGIN_PATCH',
    'diff --git a/scripts/one.cjs b/scripts/one.cjs',
    '--- a/scripts/one.cjs', '+++ b/scripts/one.cjs', '@@ -1 +1 @@', '-a', '+b',
    'diff --git a/docs/two.md b/docs/two.md',
    '--- a/docs/two.md', '+++ b/docs/two.md', '@@ -1 +1 @@', '-c', '+d',
    'END_PATCH'
  ].join('\n');
  assert.equal(validatePatchResponse(twoFiles).kind, 'patch');
});

test('does not mistake deleted source lines that resemble file headers for diff headers', () => {
  const headerLikeLines = valid.replace('-oldValue();', '--- old comment').replace('+newValue();', '+++ new comment');
  assert.equal(validatePatchResponse(headerLikeLines).kind, 'patch');
});

test('normalizes CRLF patch headers and still rejects denied paths', () => {
  const crlf = valid.replaceAll('\n', '\r\n');
  assert.equal(validatePatchResponse(crlf).kind, 'patch');
  const denied = crlf.replaceAll('scripts/example.cjs', 'src/lib/auth/evil.ts');
  assert.throws(() => validatePatchResponse(denied), /path is not allowed/);
});

test('rejects denied sensitive paths inside otherwise allowed prefixes', () => {
  const denied = valid.replaceAll('scripts/example.cjs', 'src/lib/auth/evil.ts');
  assert.throws(() => validatePatchResponse(denied), /path is not allowed/);
});

test('rejects model patches that target the validator implementation', () => {
  const validatorEdit = valid.replaceAll('scripts/example.cjs', 'scripts/nvidia-patch-validator.cjs');
  assert.throws(() => validatePatchResponse(validatorEdit), /path is not allowed/);
});

test('rejects model patches that target the validator tests', () => {
  const testEdit = valid.replaceAll('scripts/example.cjs', 'scripts/nvidia-patch-validator.test.cjs');
  assert.throws(() => validatePatchResponse(testEdit), /path is not allowed/);
});


test('rejects arbitrary text before or after the patch envelope', () => {
  const withPrefix = 'Here is the requested patch:\n' + valid;
  const withSuffix = valid + '\nPatch applied successfully.';
  assert.throws(() => validatePatchResponse(withPrefix), /complete.*envelope|surrounding content/i);
  assert.throws(() => validatePatchResponse(withSuffix), /complete.*envelope|surrounding content/i);
});

test('CLI rejects malformed response JSON without writing a patch file', (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nvidia-validator-cli-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, 'response.json');
  const outputPath = path.join(directory, 'patch.diff');
  fs.writeFileSync(inputPath, '{ invalid json', 'utf8');
  const result = spawnSync(process.execPath, [require.resolve('./nvidia-patch-validator.cjs'), inputPath, outputPath], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /response JSON is malformed/i);
  assert.equal(fs.existsSync(outputPath), false);
});

test('CLI writes a validated patch and creates an empty output for NO_PATCH', (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nvidia-validator-cli-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, 'response.json');
  const outputPath = path.join(directory, 'patch.diff');
  const run = (response) => {
    fs.writeFileSync(inputPath, JSON.stringify({ choices: [{ message: { content: response } }] }), 'utf8');
    return spawnSync(process.execPath, [require.resolve('./nvidia-patch-validator.cjs'), inputPath, outputPath], { encoding: 'utf8' });
  };
  const accepted = run(valid);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(fs.readFileSync(outputPath, 'utf8'), valid.split('BEGIN_PATCH\n')[1].split('\nEND_PATCH')[0] + '\n');
  const noPatch = run('NO_PATCH');
  assert.equal(noPatch.status, 0, noPatch.stderr);
  assert.equal(fs.readFileSync(outputPath, 'utf8'), '');
});
