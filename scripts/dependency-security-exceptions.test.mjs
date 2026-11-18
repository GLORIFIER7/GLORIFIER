import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policy = JSON.parse(
  await readFile(new URL('../security/dependency-exceptions.json', import.meta.url), 'utf8'),
);
const localPackage = JSON.parse(
  await readFile(new URL('../vendor/picomatch/package.json', import.meta.url), 'utf8'),
);

test('Picomatch advisory remains visible as an active, time-boxed exception', () => {
  assert.equal(policy.schemaVersion, 1);
  assert.equal(policy.exceptions.length, 1);

  const exception = policy.exceptions[0];
  assert.equal(exception.advisoryId, 'GHSA-fc5q-39xc-vjpf');
  assert.equal(exception.package, 'picomatch');
  assert.equal(exception.registryAffectedVersion, '4.0.7');
  assert.equal(exception.localMitigationVersion, localPackage.version);
  assert.equal(exception.status, 'temporary-local-mitigation');
  assert.equal(exception.mitigationPath, 'vendor/picomatch');
  assert.match(exception.disclosure, /npm audit does not provide registry-advisory coverage/);
  assert.match(exception.disclosure, /must not be read as withdrawal/);
  assert.ok(Array.isArray(exception.reviewRequirements) && exception.reviewRequirements.length >= 2);

  const createdAt = Date.parse(`${exception.createdAt}T00:00:00Z`);
  const expiresAt = Date.parse(`${exception.expiresAt}T00:00:00Z`);
  const now = Date.now();
  const maximumWindow = 30 * 24 * 60 * 60 * 1000;

  assert.ok(Number.isFinite(createdAt), 'exception must have a valid creation date');
  assert.ok(Number.isFinite(expiresAt), 'exception must have a valid expiry date');
  assert.ok(createdAt <= now, 'exception creation date cannot be in the future');
  assert.ok(expiresAt > now, `exception expired on ${exception.expiresAt}; it must be reviewed and renewed or removed`);
  assert.ok(expiresAt > createdAt, 'exception expiry must follow creation');
  assert.ok(expiresAt - createdAt <= maximumWindow, 'exception window must not exceed 30 days');

  console.log(`ACTIVE TEMPORARY DEPENDENCY EXCEPTION: ${exception.advisoryId}; expires ${exception.expiresAt}. npm audit does not audit this local fork as an upstream release.`);
});
