import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractAngleBracketContent,
  extractFirstFencedContent,
  extractGreedyBracedText,
  hasFingerprintAssetSegment,
  stripBase64Padding,
  stripHtmlTags,
  stripOuterCodeFence,
  stripTrailingCharacter,
  stripTrailingSlashes,
  stripTrailingZeros,
} from './linear-string.js';

test('trims only a repeated suffix character', () => {
  assert.equal(stripTrailingCharacter('path///', '/'), 'path');
  assert.equal(stripTrailingCharacter('1.2300', '0'), '1.23');
  assert.equal(stripTrailingCharacter('token===', '='), 'token');
  assert.equal(stripTrailingCharacter('middle/value', '/'), 'middle/value');
  assert.throws(() => stripTrailingCharacter('value', ''), TypeError);
});

test('URL slash and numeric suffix helpers preserve interior characters', () => {
  assert.equal(stripTrailingSlashes('https://example.test///'), 'https://example.test');
  assert.equal(stripTrailingSlashes('/'), '');
  assert.equal(stripTrailingZeros('100.000'), '100.');
  assert.equal(stripBase64Padding('YWJj=='), 'YWJj');
});

test('recognizes only fingerprinted asset name segments', () => {
  assert.equal(hasFingerprintAssetSegment('app-01234567.js'), true);
  assert.equal(hasFingerprintAssetSegment('app.0123456789.js'), true);
  assert.equal(hasFingerprintAssetSegment('app-1234567.js'), false);
  assert.equal(hasFingerprintAssetSegment('app-1234567!.js'), false);
  assert.equal(hasFingerprintAssetSegment('app--1234567.js'), false);
  assert.equal(hasFingerprintAssetSegment('app---1234567.js'), false);
  assert.equal(hasFingerprintAssetSegment('app-abc-defgh.js'), true);
});

test('strips tag-shaped markup in one forward scan', () => {
  assert.equal(stripHtmlTags('<b>GLORIFIER</b> <i>GLR</i>'), ' GLORIFIER   GLR ');
  assert.equal(stripHtmlTags('plain text'), 'plain text');
  assert.equal(stripHtmlTags('<> remains'), '<> remains');
});

test('extracts the greedy outer braced span used by JSON recovery', () => {
  assert.equal(extractGreedyBracedText('prefix {"a":1} middle {"b":2} suffix'), '{"a":1} middle {"b":2}');
  assert.equal(extractGreedyBracedText('no JSON here'), null);
});

test('extracts the first non-empty angle-bracket value', () => {
  assert.equal(extractAngleBracketContent('Sender <user@example.test>'), 'user@example.test');
  assert.equal(extractAngleBracketContent('empty <> then <valid>'), 'valid');
  assert.equal(extractAngleBracketContent('no address'), null);
});

test('normalizes outer JSON and diff fences without regular expressions', () => {
  assert.equal(stripOuterCodeFence('```json\n{"ok":true}\n```', 'json'), '{"ok":true}');
  assert.equal(stripOuterCodeFence('```diff\n+line\n```', 'diff'), '+line');
  assert.equal(stripOuterCodeFence('plain text  ', 'diff'), 'plain text');
  assert.equal(stripOuterCodeFence('plain content```'), 'plain content```');
  assert.equal(stripOuterCodeFence('bare JSON `{}```'), 'bare JSON `{}```');
});

test('extracts the first fenced block with an optional language marker', () => {
  assert.equal(extractFirstFencedContent('answer ```json\n{"ok":true}\n``` tail', 'json'), '{"ok":true}\n');
  assert.equal(extractFirstFencedContent('no fence here', 'json'), null);
});

test('shared fenced-content extraction ignores inline backticks and requires exact labels', () => {
  const response = [
    'Model response: ```json',
    '{"summary":"preserve the inline marker ``` in this value"}',
    '```',
    'Trailing explanation',
  ].join('\n');

  assert.equal(
    extractFirstFencedContent(response, 'json', { requireStandaloneClosing: true }),
    '{"summary":"preserve the inline marker ``` in this value"}\n',
  );
  assert.equal(
    extractFirstFencedContent('before ```jsonc\n{"ok":true}\n```', 'json', { requireStandaloneClosing: true }),
    null,
  );
});
