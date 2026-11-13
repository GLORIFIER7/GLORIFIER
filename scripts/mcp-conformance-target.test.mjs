import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMcpConformanceTarget } from './mcp-conformance-target.mjs';

const target = 'https://glorifier.pages.dev/mcp';
const allowed = 'glorifier.pages.dev';

test('accepts an HTTPS MCP endpoint on the exact allowlisted public hostname', () => {
  assert.equal(validateMcpConformanceTarget(target, allowed), target);
});

test('normalizes case and whitespace in an explicit hostname allowlist', () => {
  assert.equal(
    validateMcpConformanceTarget(target, ' GLORIFIER.PAGES.DEV\n'),
    target,
  );
});

test('rejects the account-protected direct Worker hostname even when allowlisted', () => {
  assert.throws(
    () => validateMcpConformanceTarget(
      'https://glorifier.glorifier.workers.dev/mcp',
      'glorifier.glorifier.workers.dev',
    ),
    /Cloudflare Access|public Pages/i,
  );
});

test('rejects a missing target or missing allowlist', () => {
  assert.throws(() => validateMcpConformanceTarget('', allowed), /URL/i);
  assert.throws(() => validateMcpConformanceTarget(target, ''), /allowlist/i);
});

test('rejects non-HTTPS schemes', () => {
  assert.throws(
    () => validateMcpConformanceTarget('http://glorifier.pages.dev/mcp', allowed),
    /HTTPS/i,
  );
});

test('rejects user information, non-default ports, noncanonical paths, queries and fragments', () => {
  for (const candidate of [
    'https://user:pass@glorifier.pages.dev/mcp',
    'https://glorifier.pages.dev:8443/mcp',
    'https://glorifier.pages.dev/other',
    'https://glorifier.pages.dev/mcp/',
    'https://glorifier.pages.dev/mcp?debug=1',
    'https://glorifier.pages.dev/mcp#fragment',
  ]) {
    assert.throws(() => validateMcpConformanceTarget(candidate, allowed));
  }
});

test('rejects hosts not explicitly allowlisted', () => {
  assert.throws(
    () => validateMcpConformanceTarget('https://attacker.example.net/mcp', allowed),
    /allowlist/i,
  );
});

test('rejects wildcard, IP, localhost and non-public hostnames in the allowlist', () => {
  for (const badAllowlist of [
    '*',
    '*.workers.dev',
    '127.0.0.1',
    'localhost',
    'service.internal',
    'service.local',
    'service.test',
    'service.example',
    'https://glorifier.pages.dev',
    'glorifier.pages.dev:443',
    'glorifier.pages.dev/mcp',
  ]) {
    assert.throws(() => validateMcpConformanceTarget(target, badAllowlist), badAllowlist);
  }
});

test('rejects IP literals and local-only target hosts even when allowlisted', () => {
  for (const host of ['127.0.0.1', '[::1]', 'localhost', 'host.internal', 'host.local']) {
    assert.throws(
      () => validateMcpConformanceTarget(`https://${host}/mcp`, host.replace(/^\[|\]$/g, '')),
    );
  }
});

test('rejects empty entries in comma- and newline-separated allowlists', () => {
  for (const invalid of [
    'glorifier.pages.dev,',
    'glorifier.pages.dev,,other.example.net',
    'glorifier.pages.dev\n\nother.example.net',
    ',,',
  ]) {
    assert.throws(() => validateMcpConformanceTarget(target, invalid), /empty entry/i);
  }
});
