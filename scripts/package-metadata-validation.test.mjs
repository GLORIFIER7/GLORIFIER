import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function dependencyKeys(source, section) {
  const match = source.match(new RegExp('"' + section + '"\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\}'));
  assert.ok(match, 'package.json must declare ' + section);
  return [...match[1].matchAll(/^\s*"([^"]+)"\s*:/gm)].map(([, key]) => key);
}

test('package dependency declarations are unique and match the lockfile root', () => {
  const manifestSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const lockSource = readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8');
  const manifest = JSON.parse(manifestSource);
  const lock = JSON.parse(lockSource);

  for (const section of ['dependencies', 'devDependencies']) {
    const keys = dependencyKeys(manifestSource, section);
    assert.equal(new Set(keys).size, keys.length, 'duplicate key in package.json ' + section);
  }

  assert.deepEqual(lock.packages?.['']?.dependencies, manifest.dependencies,
    'package-lock.json root dependencies must match package.json');
  assert.deepEqual(lock.packages?.['']?.devDependencies, manifest.devDependencies,
    'package-lock.json root devDependencies must match package.json');
});
