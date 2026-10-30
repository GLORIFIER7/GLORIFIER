import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [registryText, schemaText, gapRegister, mcpPlan] = await Promise.all([
  read('docs/architecture/interoperability-capabilities.json'),
  read('docs/architecture/interoperability-capabilities.schema.json'),
  read('docs/architecture/interoperability-gap-register.md'),
  read('docs/architecture/mcp-reference-conformance.md'),
]);

const registry = JSON.parse(registryText);
const schema = JSON.parse(schemaText);
const statuses = [
  'VERIFIED',
  'PARTIALLY VERIFIED',
  'NOT VERIFIED',
  'DEGRADED',
  'NOT OBSERVABLE',
];

test('registry, JSON Schema, and capability status vocabulary remain aligned', () => {
  assert.deepEqual(registry.statusVocabulary, statuses);
  assert.deepEqual(schema.properties.statusVocabulary.items.enum, statuses);
  assert.deepEqual(schema.$defs.capability.properties.status.enum, statuses);
  assert.equal(schema.properties.schemaVersion.const, registry.schemaVersion);
  assert.ok(registry.capabilities.length > 0);
  for (const capability of registry.capabilities) {
    assert.ok(schema.$defs.capability.required.every((field) => Object.hasOwn(capability, field)));
    assert.ok(statuses.includes(capability.status), `unsupported status for ${capability.id}`);
    assert.ok(capability.limitations.length > 0, `missing limitations for ${capability.id}`);
  }
});

test('A2A capability remains NOT VERIFIED and targets the latest pinned 1.0.1 specification', () => {
  const capability = registry.capabilities.find((item) => item.id === 'protocol.a2a-mcp-adapters');
  assert.ok(capability, 'protocol capability record must exist');
  assert.equal(capability.status, 'NOT VERIFIED');
  assert.match(capability.scope, /A2A 1\.0\.1/);
  assert.match(gapRegister, /A2A target: specification 1\.0\.1/);
  assert.match(gapRegister, /a2aproject\/A2A\/blob\/3303592588e388e62e0f69f701af531d2f4e3991\/docs\/specification\.md/);
  assert.match(gapRegister, /382185a53b312cd6a60f5ac536ec5a356437ce77/);
  assert.doesNotMatch(gapRegister, /a2aproject\/A2A\/blob\/main\//);
});

test('MCP revision, immutable source commit, and discovery document digest are consistent', () => {
  const capability = registry.capabilities.find((item) => item.id === 'protocol.a2a-mcp-adapters');
  assert.match(capability.scope, /MCP 2026-07-28/);
  assert.match(mcpPlan, /Target protocol revision:\*\* `2026-07-28`/);
  assert.match(mcpPlan, /modelcontextprotocol\/modelcontextprotocol\/blob\/b488c16623e5202a3961e551886044577ae0f096\/docs\/specification\/2026-07-28\/server\/discover\.mdx/);
  assert.match(mcpPlan, /f6fc1acf974819d99338d2be25ad953fcb9e57a6/);
  assert.match(mcpPlan, /modelcontextprotocol\/servers\/tree\/cabf72d388c0b9a82d4ac77aee1843c215a23e8b\//);
  assert.doesNotMatch(mcpPlan, /modelcontextprotocol\/(?:modelcontextprotocol|servers)\/(?:blob|tree)\/main\//);
});

test('cross-document protocol target is consistent and never promotes conformance by documentation alone', () => {
  const capability = registry.capabilities.find((item) => item.id === 'protocol.a2a-mcp-adapters');
  assert.match(gapRegister, /MCP target: specification revision 2026-07-28/);
  assert.match(mcpPlan, /2026-07-28/);
  assert.equal(capability.status, 'NOT VERIFIED');
  assert.match(capability.limitations.join('\n'), /no MCP server transport/i);
  assert.match(capability.limitations.join('\n'), /do not establish A2A 1\.0/i);
});


test('governance and exact target metadata are preserved', () => {
  const capability = registry.capabilities.find((item) => item.id === 'protocol.a2a-mcp-adapters');
  const sourceAudit = capability.evidence.find((item) => item.reference.includes('interoperability-gap-register.md'));
  assert.ok(sourceAudit, 'source audit evidence must remain present');
  assert.match(sourceAudit.targetEnvironment, /A2A 1\.0\.1 specification target/);
  assert.match(sourceAudit.notes, /A2A 1\.0\.1 message\/task binding/);
  assert.ok(capability.limitations.includes('No arbitrary proxy or implied provider fallback is authorized.'));
});

test('MCP discovery documents supported capabilities without claiming capability negotiation', () => {
  assert.match(mcpPlan, /its supported capabilities/);
  assert.doesNotMatch(mcpPlan, /negotiated capabilities/);
});
