import assert from 'node:assert/strict';
import test from 'node:test';
import { validateIntelligenceEndpoint } from './validate-intelligence-endpoint.mjs';

test('rejects an unset endpoint', () => {
  assert.equal(validateIntelligenceEndpoint(undefined).ok, false);
  assert.match(validateIntelligenceEndpoint('').reason, /not configured/);
});

test('rejects non-HTTPS schemes', () => {
  assert.match(validateIntelligenceEndpoint('http://example.com/report').reason, /HTTPS/);
  assert.match(validateIntelligenceEndpoint('ftp://example.com/report').reason, /HTTPS/);
});

test('rejects malformed URLs and missing hostnames', () => {
  assert.equal(validateIntelligenceEndpoint('not a url').ok, false);
  assert.equal(validateIntelligenceEndpoint('https://').ok, false);
  assert.equal(validateIntelligenceEndpoint('https://?q=1').ok, false);
});

test('rejects embedded credentials', () => {
  assert.match(validateIntelligenceEndpoint('https://user:password@example.com/report').reason, /credentials/);
});

test('rejects fragments and surrounding whitespace', () => {
  assert.match(validateIntelligenceEndpoint('https://example.com/report#section').reason, /fragment/);
  assert.match(validateIntelligenceEndpoint(' https://example.com/report').reason, /whitespace/);
});

test('accepts an absolute HTTPS endpoint with a path and query', () => {
  assert.deepEqual(
    validateIntelligenceEndpoint('https://api.example.com/api/intelligence/report?refresh=true'),
    { ok: true, reason: null },
  );
});
