import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import picomatch from 'picomatch';
import utils from '../vendor/picomatch/lib/utils.js';

test('literalizes repeated extglob patterns identified by CVE-2026-112366', () => {
  const cases = [
    ['+(*)', '^(?:\\+\\(\\*\\))$'],
    ['+(*a)', '^(?:\\+\\(\\*a\\))$'],
    ['+(a*)', '^(?:\\+\\(a\\*\\))$'],
    ['*(a*|b)', '^(?:\\*\\(a\\*\\|b\\))$'],
    ['+(ab|abab)', '^(?:\\+\\(ab\\|abab\\))$'],
  ];

  for (const [pattern, expectedSource] of cases) {
    assert.equal(picomatch.makeRe(pattern).source, expectedSource, pattern);
    assert.equal(picomatch.isMatch(pattern, pattern), true, `literal form should match: ${pattern}`);
    assert.equal(picomatch.isMatch('a'.repeat(100) + '!', pattern), false, pattern);
  }
});

test('adversarial repeated-extglob inputs complete within a bounded time', () => {
  const probes = [
    ['a'.repeat(100) + '!', '+(*a)'],
    ['a'.repeat(100) + '!', '+(*)a'],
    ['a'.repeat(100) + '/', '+(a*)'],
    ['ab'.repeat(80) + 'c', '+(ab|abab)'],
    ['a'.repeat(100) + '!', '*(a*|b)'],
  ];

  const started = performance.now();
  for (const [input, pattern] of probes) {
    assert.equal(picomatch.isMatch(input, pattern), false, pattern);
  }
  assert.ok(performance.now() - started < 500, 'risky patterns must not cause catastrophic regex backtracking');
});

test('preserves representative non-risky extglob behavior', () => {
  assert.equal(picomatch.isMatch('jsjsx', '+(js|jsx)'), true);
  assert.equal(picomatch.isMatch('foobar', '*(foo|bar)'), true);
  assert.equal(picomatch.isMatch('foofoobar', '+(foo|foobar)'), true);
});

test('backslash cleanup preserves the legacy escaped-empty-class case', () => {
  assert.equal(utils.removeBackslashes('\\[]'), '\\[]');
  assert.equal(utils.removeBackslashes('\\[abc]'), '[abc]');
  assert.equal(utils.removeBackslashes('\\[abc\\]'), '[abc]');
  assert.equal(utils.removeBackslashes('foo\\ bar\\\\baz\\'), 'foo barbaz\\');
});
test('backslash cleanup processes repeated unmatched opening brackets in bounded time', () => {
  const count = 25000;
  const input = '\\\\['.repeat(count);
  const started = performance.now();
  const output = utils.removeBackslashes(input);

  assert.equal(output, '['.repeat(count));
  assert.ok(performance.now() - started < 500, 'backslash cleanup must be linear for unmatched escaped brackets');
});
