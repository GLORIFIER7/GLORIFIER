import assert from 'node:assert/strict';
import test from 'node:test';
import { getSafeExternalUrl } from './safe-external-url';

test('accepts canonical HTTPS links for external integration destinations', () => {
  assert.equal(getSafeExternalUrl('https://example.com/path?q=1'), 'https://example.com/path?q=1');
  assert.equal(getSafeExternalUrl('https://example.com'), 'https://example.com/');
  assert.equal(
    getSafeExternalUrl('https://example.com:443/path?q=1'),
    'https://example.com/path?q=1',
    'the explicit standard HTTPS port is accepted and normalized',
  );
});

test('rejects non-HTTPS, relative, malformed, and credential-bearing destinations', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://example.com',
    '//example.com/path',
    '/relative/path',
    'not a URL',
    'https://user:pass@example.com/path',
  ]) {
    assert.equal(getSafeExternalUrl(value), null, `expected rejection for ${value}`);
  }
});

test('rejects non-string and blank values', () => {
  assert.equal(getSafeExternalUrl(null), null);
  assert.equal(getSafeExternalUrl(undefined), null);
  assert.equal(getSafeExternalUrl('   '), null);
});
