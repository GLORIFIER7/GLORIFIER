import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractFirstFencedContent,
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


test('fenced content preserves inline backticks and requires a standalone closing fence', () => {
  const json = JSON.stringify({ summary: 'Keep the marker ```typescript as data.' });
  const response = [
    'Model response:',
    '```json',
    json,
    '```',
    'Trailing explanation',
  ].join('\n');

  assert.equal(extractFirstFencedContent(response, 'json', { requireStandaloneClosing: true }), json + '\n');
  assert.equal(extractFirstFencedContent(response, 'jsonc'), null);
});

test('fenced content supports unlabeled fences and CRLF line endings', () => {
  assert.equal(extractFirstFencedContent('Before\n```\r\nvalue\r\n```\r\nAfter'), 'value\r\n');
});

test('outer code-fence stripping requires an exact language label', () => {
  assert.equal(stripOuterCodeFence('```jsonc\n{"ok":true}\n```', 'json'), 'jsonc\n{"ok":true}');
  assert.equal(stripOuterCodeFence('```json\n{"ok":true}\n```', 'json'), '{"ok":true}');
});