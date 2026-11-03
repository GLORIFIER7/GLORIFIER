import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const documents = [
  new URL('../docs/architecture/interoperability-capabilities.json', import.meta.url),
  new URL('../docs/architecture/interoperability-capabilities.schema.json', import.meta.url),
  new URL('../docs/architecture/openapi/glorifier-neural-adapter.openapi.json', import.meta.url),
];

test('interoperability registry, schema, and OpenAPI documents are valid JSON', async () => {
  for (const documentUrl of documents) {
    const content = await readFile(documentUrl, 'utf8');
    assert.doesNotThrow(
      () => JSON.parse(content),
      `${fileURLToPath(documentUrl)} must contain valid JSON`,
    );
  }
});
