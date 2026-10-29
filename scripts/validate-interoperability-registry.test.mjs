import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInteroperabilityRegistry } from './validate-interoperability-registry.mjs';

const validRegistry = () => ({
  schemaVersion: '1.0.0',
  statusVocabulary: ['VERIFIED', 'PARTIALLY VERIFIED', 'NOT VERIFIED', 'DEGRADED', 'NOT OBSERVABLE'],
  capabilities: [{
    id: 'mcp.example.read',
    title: 'Example MCP read-only discovery',
    boundary: 'Inspector to MCP server',
    scope: 'read-only discovery',
    status: 'PARTIALLY VERIFIED',
    evidence: [{ kind: 'automated-test', reference: 'test/fixture.mjs' }],
  }],
});

test('accepts a well-formed capability registry', () => {
  assert.deepEqual(validateInteroperabilityRegistry(validRegistry()), []);
});

test('rejects duplicate capability identifiers', () => {
  const registry = validRegistry();
  registry.capabilities.push({ ...registry.capabilities[0] });
  assert.ok(validateInteroperabilityRegistry(registry).some((e) => e.message.includes('duplicate capability id')));
});

test('rejects unsupported verification status', () => {
  const registry = validRegistry();
  registry.capabilities[0].status = 'FULLY VERIFIED';
  assert.ok(validateInteroperabilityRegistry(registry).some((e) => e.path.endsWith('.status')));
});

test('requires evidence references to be explicit', () => {
  const registry = validRegistry();
  registry.capabilities[0].evidence = [{ kind: 'test', reference: '' }];
  assert.ok(validateInteroperabilityRegistry(registry).some((e) => e.path.endsWith('.reference')));
});

test('VERIFIED capabilities require evidence', () => {
  const registry = validRegistry();
  registry.capabilities[0].status = 'VERIFIED';
  registry.capabilities[0].evidence = [];
  assert.ok(validateInteroperabilityRegistry(registry).some((e) => e.message.includes('require at least one evidence reference')));
});

test('rejects secret-like fields anywhere in registry objects', () => {
  const registry = validRegistry();
  registry.capabilities[0].auth = { clientSecret: 'must-not-be-here', github_token: 'also-forbidden' };
  const errors = validateInteroperabilityRegistry(registry);
  assert.ok(errors.some((e) => e.path.endsWith('.auth.clientSecret')));
  assert.ok(errors.some((e) => e.path.endsWith('.auth.github_token')));
});

test('rejects duplicate status vocabulary entries', () => {
  const registry = validRegistry();
  registry.statusVocabulary.push('VERIFIED');
  assert.ok(validateInteroperabilityRegistry(registry).some((e) => e.message.includes('duplicate status')));
});

test('rejects a non-object registry and missing evidence arrays', () => {
  assert.ok(validateInteroperabilityRegistry(null).length > 0);
  const registry = validRegistry();
  delete registry.capabilities[0].evidence;
  assert.ok(validateInteroperabilityRegistry(registry).some((e) => e.path.endsWith('.evidence')));
});
