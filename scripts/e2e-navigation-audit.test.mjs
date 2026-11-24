import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const header = readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8');
const spec = readFileSync(new URL('../tests/e2e/production.spec.ts', import.meta.url), 'utf8');
const extract = (text) => [...text.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
const modules = [...header.matchAll(/\{ id: '([a-z_]+)', label:/g)].map(m => m[1]);
const sourcePrimary = extract(header.match(/const primaryIds = new Set\((\[[^\]]+\])\)/)?.[1] ?? '');
const tested = extract(spec.match(/const (?:MODULE_IDS|tabs) = (\[[^\]]+\])/)?.[1] ?? '');
const testedPrimary = extract(spec.match(/const (?:PRIMARY_MODULE_IDS|primaryTabs) = new Set\((\[[^\]]+\])\)/)?.[1] ?? '');
test('every Header module occurs exactly once in the E2E inventory', () => {
  assert.ok(modules.length > 0);
  assert.equal(new Set(tested).size, tested.length);
  assert.deepEqual([...tested].sort(), [...modules].sort());
});
test('primary navigation classification agrees with the Header', () => {
  assert.deepEqual([...testedPrimary].sort(), [...sourcePrimary].sort());
});
test('mobile uses all module IDs rather than obsolete labels', () => {
  const mobile = spec.split("test('mobile navigation remains usable'")[1] ?? '';
  assert.match(mobile, /for \(const tab of MODULE_IDS\)/);
  assert.match(mobile, /#mobile-navigation/);
  assert.doesNotMatch(mobile, /binance/i);
});
test('authentication failure emits status-only diagnostics, with no raw network payload', () => {
  assert.match(spec, /AUTH_E2E_FAILED/);
  assert.match(spec, /identitytoolkit\.googleapis\.com/);
  assert.match(spec, /response\.status\(\)/);
  assert.doesNotMatch(spec, /response\.(?:json|text|body|allHeaders|headers)\(/);
});
const authPanel = readFileSync(new URL('../src/components/AuthPanel.tsx', import.meta.url), 'utf8');
test('authentication icon controls have accessible names and errors are announced', () => {
  assert.match(authPanel, /aria-label="Close sign-in panel"/);
  assert.match(authPanel, /aria-label=\{showPassword \? 'Hide password' : 'Show password'\}/);
  assert.match(authPanel, /role=\{message.type === 'error' \? 'alert' : 'status'\}/);
});
test('navigation exposes the active location and brand text is not a page heading', () => {
  assert.match(header, /aria-current=\{isActive \? 'page' : undefined\}/);
  assert.doesNotMatch(header, /<h1\b/);
});
