import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('package dependency keys are unique and match the lockfile root', () => {
  const source = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const manifest = JSON.parse(source);
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

  assert.equal((source.match(/"@capacitor\/core"\s*:/g) ?? []).length, 1);
  assert.equal((source.match(/"@google\/genai"\s*:/g) ?? []).length, 1);
  assert.equal((source.match(/"express-rate-limit"\s*:/g) ?? []).length, 1);
  assert.equal((source.match(/"firebase"\s*:/g) ?? []).length, 1);
  assert.deepEqual(lock.packages?.['']?.dependencies, manifest.dependencies,
    'package-lock.json root dependencies must match package.json');
  assert.deepEqual(lock.packages?.['']?.devDependencies, manifest.devDependencies,
    'package-lock.json root devDependencies must match package.json');
});
