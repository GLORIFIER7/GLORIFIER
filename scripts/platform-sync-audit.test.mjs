import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateManifest, evaluateProbe, runProbes, renderAuditSummary } from './platform-sync-audit.mjs';

const config = JSON.parse(readFileSync(new URL('../config/platform-sync-targets.json', import.meta.url)));

test('canonical repository remains authoritative and no target can receive writes', () => {
  assert.equal(config.canonicalRepository, 'GLORIFIER7/GLORIFIER');
  assert.equal(validateManifest(config).ok, true);
  assert.ok(config.targets.length >= 7);
  for (const target of config.targets) {
    assert.equal(target.writeEnabled, false, target.id);
  }
});

test('rejects hostile and unapproved public probing targets', () => {
  for (const endpoint of [
    'https://evil.example.test/api/health',
    'http://glorifier.pages.dev/api/health',
    'https://glorifier.pages.dev.evil.test/api/health',
    'https://username:password@glorifier.pages.dev/api/health',
    'https://glorifier.pages.dev/api/health?token=secret',
    'https://glorifier.pages.dev/api/health#fragment',
    'https://glorifier.pages.dev/private',
  ]) {
    const altered = structuredClone(config);
    altered.targets.find(x => x.id === 'cloudflare-pages').url = endpoint;
    assert.equal(validateManifest(altered).ok, false, endpoint);
  }
});

test('health alone never certifies release synchronization', () => {
  const target = config.targets.find(x => x.id === 'cloudflare-pages');
  const report = evaluateProbe(target, { status: 200, body: { ok: true, status: 'worker-ready', layer: 'cloudflare-worker' } }, 'a'.repeat(40));
  assert.equal(report.status, 'PARTIALLY VERIFIED');
  assert.equal(report.releaseParity, 'NOT VERIFIED');
});

test('successful static HTML does not establish code parity', () => {
  const target = config.targets.find(x => x.id === 'github-pages');
  const report = evaluateProbe(target, { status: 200, body: null }, 'b'.repeat(40));
  assert.equal(report.status, 'PARTIALLY VERIFIED');
  assert.equal(report.releaseParity, 'NOT VERIFIED');
});

test('failure, mismatch and unavailable targets cannot be called synchronized', () => {
  const pages = config.targets.find(x => x.id === 'cloudflare-pages');
  assert.equal(evaluateProbe(pages, {status: 502, body: null}, 'a'.repeat(40)).status, 'DEGRADED');
  assert.equal(evaluateProbe(pages, {status: 200, body: {ok: true}}, 'a'.repeat(40)).status, 'NOT VERIFIED');
  assert.equal(evaluateProbe(config.targets.find(x => x.id === 'vercel'), null, 'a'.repeat(40)).status, 'NOT VERIFIED');
});

test('probes are bounded, credentialless, read-only and redirect-resistant', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({url, options});
    return {status: 200, text: async () => JSON.stringify({ok: true, status: 'worker-ready', layer: 'cloudflare-worker'})};
  };
  const result = await runProbes(config, 'c'.repeat(40), request);
  assert.ok(calls.length >= 2);
  for (const call of calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.headers.Accept.startsWith('application/'), true);
    assert.ok(!('Authorization' in call.options.headers));
  }
  assert.ok(result.every(x => x.releaseParity !== 'VERIFIED'));
});

test('audit summary uses actual newlines for its Markdown table', () => {
  const report = { id: 'github-pages', status: 'PARTIALLY VERIFIED', releaseParity: 'NOT VERIFIED' };
  const summary = renderAuditSummary('d'.repeat(40), [report]);
  assert.match(summary, /^## GLORIFIER platform reconciliation — read-only\nSource: GLORIFIER7\/GLORIFIER @ /);
  assert.ok(summary.includes('\n| Target | Evidence | Release parity |\n| --- | --- | --- |\n| github-pages | PARTIALLY VERIFIED | NOT VERIFIED |\n'));
  assert.equal(summary.includes('\\n'), false, 'summary must not contain escaped newline literals');
});
