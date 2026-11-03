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
    '--- a/docs/third.md', '+++ b/docs/third.md', '@@ -1 +1 @@', '-a', '+b',
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

test('rejects mismatched git and unified-diff paths', () => {
  const mismatch = valid.replace('+++ b/scripts/example.cjs', '+++ b/docs/example.cjs');
  assert.throws(() => validatePatchResponse(mismatch), /path mismatch/);
});
