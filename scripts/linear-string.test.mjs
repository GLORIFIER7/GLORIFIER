import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasFingerprintAssetSegment,
  stripOuterCodeFence,
  stripTrailingCharacter,
  stripTrailingSlashes,
} from './linear-string.mjs';

test('suffix trimming removes only repeated trailing characters', () => {
  assert.equal(stripTrailingCharacter('value///', '/'), 'value');
  assert.equal(stripTrailingCharacter('value', '/'), 'value');
  assert.equal(stripTrailingSlashes('https://example.test///'), 'https://example.test');
  assert.throws(() => stripTrailingCharacter('value', ''), TypeError);
});

test('fingerprint matcher preserves the existing filename constraints', () => {
  assert.equal(hasFingerprintAssetSegment('index-aBcD1234.js'), true);
  assert.equal(hasFingerprintAssetSegment('index.01234567.css'), true);
  assert.equal(hasFingerprintAssetSegment('index-1234567.js'), false);
  assert.equal(hasFingerprintAssetSegment('index-12345678!.js'), false);
});

test('outer code-fence stripping handles optional language labels', () => {
  assert.equal(stripOuterCodeFence('```diff\n+one\n```', 'diff'), '+one');
  assert.equal(stripOuterCodeFence('```\ncontent\n```'), 'content');
  assert.equal(stripOuterCodeFence('not fenced  '), 'not fenced');
  assert.equal(stripOuterCodeFence('plain content```'), 'plain content```');
  assert.equal(stripOuterCodeFence('bare JSON `{}```'), 'bare JSON `{}```');
});
