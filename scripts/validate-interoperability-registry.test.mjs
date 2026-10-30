import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateInteroperabilityRegistry } from './validate-interoperability-registry.mjs';

const fixturesRoot = fileURLToPath(new URL('../docs/architecture/', import.meta.url));

const validRegistry = () => ({
  schemaVersion: '1.0.0',
  updatedAt: '2026-10-29T00:00:00.000Z',
  statusVocabulary: ['VERIFIED', 'PARTIALLY VERIFIED', 'NOT VERIFIED', 'DEGRADED', 'NOT OBSERVABLE'],
  capabilities: [{
    id: 'mcp.example.read',
    title: 'Example MCP read-only discovery',
    boundary: 'Inspector to MCP server',
    scope: 'read-only discovery',
    status: 'PARTIALLY VERIFIED',
    targetEnvironments: ['ci'],
    limitations: ['Fixture-only; no live MCP server contacted.'],
    evidence: [{
      kind: 'automated-test',
      reference: 'test/fixture.mjs',
      targetEnvironment: 'ci',
      notes: 'Deterministic fixture test.',
      observedAt: null,
    }],
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

test('rejects unsupported evidence kinds and incomplete evidence metadata', () => {
  const registry = validRegistry();
  registry.capabilities[0].evidence[0].kind = 'anything';
  registry.capabilities[0].evidence[0].targetEnvironment = '';
  registry.capabilities[0].evidence[0].notes = '';
  const errors = validateInteroperabilityRegistry(registry);
  assert.ok(errors.some((e) => e.path.endsWith('.kind')));
  assert.ok(errors.some((e) => e.path.endsWith('.targetEnvironment')));
  assert.ok(errors.some((e) => e.path.endsWith('.notes')));
});

test('rejects unknown properties at registry, capability, and evidence levels', () => {
  const rootExtra = validRegistry();
  rootExtra.unexpected = true;
  assert.ok(validateInteroperabilityRegistry(rootExtra).some((e) => e.path === '$.unexpected'));

  const capabilityExtra = validRegistry();
  capabilityExtra.capabilities[0].unexpected = true;
  assert.ok(validateInteroperabilityRegistry(capabilityExtra).some((e) => e.path.endsWith('.unexpected')));

  const evidenceExtra = validRegistry();
  evidenceExtra.capabilities[0].evidence[0].unexpected = true;
  assert.ok(validateInteroperabilityRegistry(evidenceExtra).some((e) => e.path.endsWith('.unexpected')));
});

test('VERIFIED capabilities require fresh evidence of an acceptable kind', () => {
  const registry = validRegistry();
  registry.capabilities[0].status = 'VERIFIED';
  registry.capabilities[0].evidence = [];
  assert.ok(validateInteroperabilityRegistry(registry).some((e) => e.message.includes('VERIFIED requires fresh timestamped')));
});

test('live scopes require a live-probe rather than a unit-test claim', () => {
  const registry = validRegistry();
  registry.capabilities[0].status = 'VERIFIED';
  registry.capabilities[0].scope = 'live production integration';
  registry.capabilities[0].evidence = [{
    kind: 'automated-test',
    reference: 'test/fixture.mjs',
    targetEnvironment: 'production',
    notes: 'Local test only.',
    observedAt: '2026-10-29T00:00:00.000Z',
  }];
  assert.ok(validateInteroperabilityRegistry(registry).some((e) => e.message.includes('live-probe no older than 24 hours')));
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

test('CLI succeeds when invoked with an absolute entrypoint and valid JSON', () => {
  const directory = mkdtempSync(join(fixturesRoot, '.test-fixtures-'));
  try {
    const input = join(directory, 'registry.json');
    writeFileSync(input, JSON.stringify(validRegistry()));
    const script = fileURLToPath(new URL('./validate-interoperability-registry.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script, input], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Interoperability registry valid/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI rejects registry paths outside the architecture registry directory', () => {
  const directory = mkdtempSync(join(tmpdir(), 'glorifier-mcp-registry-outside-'));
  try {
    const input = join(directory, 'registry.json');
    writeFileSync(input, JSON.stringify(validRegistry()));
    const script = fileURLToPath(new URL('./validate-interoperability-registry.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script, input], { encoding: 'utf8' });
    assert.equal(result.status, 2, 'out-of-tree CLI paths must be rejected before file contents are parsed');
    assert.match(result.stderr, /must remain inside docs\\/architecture/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI rejects malformed JSON with a non-zero exit code', () => {
  const directory = mkdtempSync(join(fixturesRoot, '.test-fixtures-'));
  try {
    const input = join(directory, 'registry.json');
    writeFileSync(input, '{broken');
    const script = fileURLToPath(new URL('./validate-interoperability-registry.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script, input], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /JSON parse failed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI rejects structurally invalid registry data with a non-zero exit code', () => {
  const directory = mkdtempSync(join(fixturesRoot, '.test-fixtures-'));
  try {
    const input = join(directory, 'registry.json');
    const invalid = validRegistry();
    invalid.capabilities[0].evidence[0].kind = 'unknown-kind';
    writeFileSync(input, JSON.stringify(invalid));
    const script = fileURLToPath(new URL('./validate-interoperability-registry.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script, input], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unsupported evidence kind/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
