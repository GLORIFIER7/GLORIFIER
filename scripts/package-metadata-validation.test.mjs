import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function extractJsonObject(source, propertyName) {
  const escapedName = propertyName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
  const match = new RegExp(`"${escapedName}"\\\\s*:\\\\s*\\\\{`).exec(source);
  assert.ok(match, `package.json must declare ${propertyName}`);

  const openingBrace = match.index + match[0].lastIndexOf('{');
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace, index + 1);
    }
  }

  assert.fail(`unterminated JSON object for ${propertyName}`);
}

function assertUniqueObjectKeys(source, sectionName) {
  const objectSource = extractJsonObject(source, sectionName);
  const seen = new Set();

  for (const line of objectSource.split(/\\r?\\n/)) {
    const match = /^\\s*"((?:[^"\\\\]|\\\\.)+)"\\s*:/.exec(line);
    if (!match) continue;

    const key = JSON.parse(`"${match[1]}"`);
    assert.ok(!seen.has(key), `duplicate ${sectionName} key: ${key}`);
    seen.add(key);
  }
}

test('package dependency declarations are unique and match the lockfile root', () => {
  const manifestSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const lockSource = readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8');
  const manifest = JSON.parse(manifestSource);
  const lock = JSON.parse(lockSource);

  assertUniqueObjectKeys(manifestSource, 'dependencies');
  assertUniqueObjectKeys(manifestSource, 'devDependencies');
  assert.deepEqual(lock.packages?.['']?.dependencies, manifest.dependencies,
    'package-lock.json root dependencies must match package.json');
  assert.deepEqual(lock.packages?.['']?.devDependencies, manifest.devDependencies,
    'package-lock.json root devDependencies must match package.json');
});
