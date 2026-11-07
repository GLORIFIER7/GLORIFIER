import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const keysIn = (source, section) => [
  ...source.match(new RegExp('"' + section + '"\\s*:\\s*\\{([^}]*)\\}'))?.[1]
    ?.matchAll(/"([^"]+)"\s*:/g) ?? [],
].map(([, key]) => key);

test('package dependency declarations are unique and match the lockfile root', () => {
  const manifestSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const manifest = JSON.parse(manifestSource);
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const dependencies = keysIn(manifestSource, 'dependencies');
  const devDependencies = keysIn(manifestSource, 'devDependencies');

  assert.ok(dependencies.length > 0, 'package.json dependencies must exist');
  assert.ok(devDependencies.length > 0, 'package.json devDependencies must exist');
  assert.equal(new Set(dependencies).size, dependencies.length, 'duplicate dependency key');
  assert.equal(new Set(devDependencies).size, devDependencies.length, 'duplicate devDependency key');
  assert.deepEqual(lock.packages?.['']?.dependencies, manifest.dependencies,
    'package-lock.json root dependencies must match package.json');
  assert.deepEqual(lock.packages?.['']?.devDependencies, manifest.devDependencies,
    'package-lock.json root devDependencies must match package.json');
});
