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


const findDuplicateTopLevelJsonKeys = (source) => {
  let offset = 0;
  const duplicates = [];
  const seen = new Set();
  const skipWhitespace = () => {
    while (offset < source.length && /\s/.test(source[offset])) offset += 1;
  };
  const readString = () => {
    const start = offset;
    offset += 1;
    while (offset < source.length) {
      if (source[offset] === '\\') {
        offset += 2;
        continue;
      }
      if (source[offset] === '"') {
        offset += 1;
        return JSON.parse(source.slice(start, offset));
      }
      offset += 1;
    }
    throw new Error('Unterminated JSON string.');
  };

  skipWhitespace();
  if (source[offset] !== '{') throw new Error('Expected a top-level JSON object.');
  offset += 1;

  while (offset < source.length) {
    skipWhitespace();
    if (source[offset] === '}') break;

    const key = readString();
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);

    skipWhitespace();
    if (source[offset] !== ':') throw new Error('Expected a colon after a JSON object key.');
    offset += 1;
    skipWhitespace();

    let depth = 0;
    let inString = false;
    let escaped = false;
    while (offset < source.length) {
      const character = source[offset];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        offset += 1;
        continue;
      }
      if (character === '"') {
        inString = true;
        offset += 1;
        continue;
      }
      if (character === '{' || character === '[') {
        depth += 1;
        offset += 1;
        continue;
      }
      if (character === '}' || character === ']') {
        if (depth === 0 && character === '}') break;
        depth -= 1;
        offset += 1;
        continue;
      }
      if (character === ',' && depth === 0) break;
      offset += 1;
    }

    skipWhitespace();
    if (source[offset] === ',') {
      offset += 1;
      continue;
    }
    if (source[offset] === '}') break;
    throw new Error('Expected a top-level JSON object delimiter.');
  }

  return duplicates;
};

test('interoperability JSON documents do not repeat top-level object keys', async () => {
  for (const documentUrl of documents) {
    const content = await readFile(documentUrl, 'utf8');
    assert.deepEqual(
      findDuplicateTopLevelJsonKeys(content),
      [],
      `${fileURLToPath(documentUrl)} must not repeat top-level JSON object keys`,
    );
  }
});
