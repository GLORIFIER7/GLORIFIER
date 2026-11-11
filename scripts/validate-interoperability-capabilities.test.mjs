import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const documents = [
  new URL('../docs/architecture/interoperability-capabilities.json', import.meta.url),
  new URL('../docs/architecture/interoperability-capabilities.schema.json', import.meta.url),
  new URL('../docs/architecture/openapi/glorifier-neural-adapter.openapi.json', import.meta.url),
];

const gapRegister = new URL('../docs/architecture/interoperability-gap-register.md', import.meta.url);

test('interoperability registry, schema, and OpenAPI documents are valid JSON', async () => {
  for (const documentUrl of documents) {
    const content = await readFile(documentUrl, 'utf8');
    assert.doesNotThrow(() => JSON.parse(content), `${fileURLToPath(documentUrl)} must contain valid JSON`);
  }
});

const isJsonWhitespace = (character) =>
  character === ' ' || character === '\t' || character === '\n' || character === '\r';

const isJsonDelimiter = (character) =>
  isJsonWhitespace(character) || character === ',' || character === '}' || character === ']';

const skipWhitespace = (source, cursor) => {
  while (cursor.offset < source.length && isJsonWhitespace(source[cursor.offset])) cursor.offset += 1;
};

const readJsonString = (source, cursor) => {
  const start = cursor.offset++;
  while (cursor.offset < source.length) {
    if (source[cursor.offset] === '\\') {
      cursor.offset += 2;
      continue;
    }
    if (source[cursor.offset] === '"') {
      cursor.offset += 1;
      return JSON.parse(source.slice(start, cursor.offset));
    }
    cursor.offset += 1;
  }
  throw new Error('Unterminated JSON string.');
};

const parseJsonArray = (source, cursor, path, duplicates) => {
  cursor.offset += 1;
  skipWhitespace(source, cursor);
  let index = 0;
  if (source[cursor.offset] === ']') {
    cursor.offset += 1;
    return;
  }
  while (cursor.offset < source.length) {
    parseJsonValue(source, cursor, `${path}[${index}]`, duplicates);
    index += 1;
    skipWhitespace(source, cursor);
    if (source[cursor.offset] === ']') {
      cursor.offset += 1;
      return;
    }
    if (source[cursor.offset++] !== ',') throw new Error(`Expected array delimiter at ${cursor.offset}.`);
  }
  throw new Error(`Unterminated JSON array at ${path}.`);
};

const parseJsonObject = (source, cursor, path, duplicates) => {
  cursor.offset += 1;
  skipWhitespace(source, cursor);
  const seen = new Set();
  if (source[cursor.offset] === '}') {
    cursor.offset += 1;
    return;
  }
  while (cursor.offset < source.length) {
    skipWhitespace(source, cursor);
    const key = readJsonString(source, cursor);
    if (seen.has(key)) duplicates.push(`${path}.${key}`);
    seen.add(key);
    skipWhitespace(source, cursor);
    if (source[cursor.offset++] !== ':') throw new Error(`Expected object key delimiter at ${cursor.offset}.`);
    parseJsonValue(source, cursor, `${path}.${key}`, duplicates);
    skipWhitespace(source, cursor);
    if (source[cursor.offset] === '}') {
      cursor.offset += 1;
      return;
    }
    if (source[cursor.offset++] !== ',') throw new Error(`Expected object delimiter at ${cursor.offset}.`);
  }
  throw new Error(`Unterminated JSON object at ${path}.`);
};

const parseJsonValue = (source, cursor, path, duplicates) => {
  skipWhitespace(source, cursor);
  const character = source[cursor.offset];
  if (character === '{') return parseJsonObject(source, cursor, path, duplicates);
  if (character === '[') return parseJsonArray(source, cursor, path, duplicates);
  if (character === '"') {
    readJsonString(source, cursor);
    return;
  }
  const start = cursor.offset;
  while (cursor.offset < source.length && !isJsonDelimiter(source[cursor.offset])) cursor.offset += 1;
  if (cursor.offset === start) throw new Error(`Unexpected JSON token at ${cursor.offset}.`);
};

const findDuplicateJsonKeys = (source) => {
  const cursor = { offset: 0 };
  const duplicates = [];
  parseJsonValue(source, cursor, '$', duplicates);
  skipWhitespace(source, cursor);
  if (cursor.offset !== source.length) throw new Error('Unexpected content after the JSON document.');
  return duplicates;
};

test('interoperability JSON documents do not repeat keys in any nested object', async () => {
  for (const documentUrl of documents) {
    const content = await readFile(documentUrl, 'utf8');
    assert.deepEqual(
      findDuplicateJsonKeys(content),
      [],
      `${fileURLToPath(documentUrl)} must not repeat keys in any JSON object`,
    );
  }
});


test('interoperability gap register reflects merged NEURAL PR and refreshed GLR chain evidence', async () => {
  const content = await readFile(gapRegister, 'utf8');
  assert.ok(content.includes('merged at `2026-11-09T15:46:39Z`'));
  assert.ok(content.includes('main commit `92d209544c02a3bf9c6f45eeb9d459b4a468426b`'));
  assert.ok(!content.includes('PR #83 remains open'));
  assert.ok(!content.includes('existing evidence is from 2026-11-03'));
  assert.ok(content.includes('read-only Alchemy RPC probes were refreshed at `2026-11-09T16:25:54Z`'));
  assert.ok(content.includes('second same-deployer Ethereum GLORIFIER/GLR contract'));
  assert.ok(content.includes('transfer receipts/payment-path evidence'));
  assert.ok(content.includes('current live readiness is therefore NOT VERIFIED'));

  const registry = JSON.parse(await readFile(documents[0], 'utf8'));
  for (const id of [
    'blockchain.ethereum-readonly-transfer-verifier',
    'blockchain.bnb-readonly-transfer-verifier',
    'blockchain.solana-readonly-transfer-verifier',
  ]) {
    const capability = registry.capabilities.find((item) => item.id === id);
    assert.ok(capability, `missing capability ${id}`);
    assert.ok(Array.isArray(capability.evidence), `${id} must expose an evidence array`);
    assert.ok(
      capability.evidence.some((item) => item.kind === 'live-probe' && item.observedAt === '2026-11-09T16:25:54Z'),
      `${id} must retain the refreshed read-only probe evidence`,
    );
  }
});


test('latest production checkpoint reconciles the exact current main deployment without claiming external conformance', async () => {
  const registry = JSON.parse(await readFile(documents[0], 'utf8'));
  const gap = await readFile(gapRegister, 'utf8');
  const evidenceIds = [
    'worker.neural-route-contract',
    'neural.runtime-live-readiness',
    'worker.live-runtime-verification',
    'worker.live-operational-report',
    'worker.production-read-model-release',
  ];

  for (const id of evidenceIds) {
    const capability = registry.capabilities.find((item) => item.id === id);
    assert.ok(capability, `missing capability ${id}`);
    assert.ok(
      capability.evidence.some((item) =>
        item.kind === 'live-probe' &&
        item.reference === 'https://github.com/GLORIFIER7/GLORIFIER/actions/runs/42969134766' &&
        item.targetEnvironment.includes('Worker v1002') &&
        item.notes.includes('038fe738e9fdc5fbbb0472343198c19d75cd7643')),
      `${id} must cite the exact current-main production smoke`,
    );
  }

  const protocol = registry.capabilities.find((item) => item.id === 'protocol.a2a-mcp-adapters');
  assert.equal(protocol.status, 'NOT VERIFIED');
  assert.match(protocol.limitations.join(' '), /external MCP client\/server integration/);
  assert.match(protocol.limitations.join(' '), /A2A 1\.0\.1/);
  assert.match(gap, /Superseding production release and smoke checkpoint — 2026-11-11/);
  assert.match(gap, /Cloudflare Worker `glorifier` version \\*\\*1002\\*\\*/);
  assert.match(gap, /Worker-to-NEURAL liveness/);
  assert.match(gap, /MCP was not probed/);
  assert.match(gap, /Issue #471 remains OPEN/);
});
