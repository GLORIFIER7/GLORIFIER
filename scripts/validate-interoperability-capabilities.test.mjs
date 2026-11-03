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
    assert.doesNotThrow(() => JSON.parse(content), `${fileURLToPath(documentUrl)} must contain valid JSON`);
  }
});

const isJsonWhitespace = (character) =>
  character === ' ' || character === '\\t' || character === '\\n' || character === '\\r';

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
