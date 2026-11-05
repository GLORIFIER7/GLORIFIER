import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAiFleetDiff } from './ai-fleet-diff-policy.mjs';

const safeChange = {
  path: 'src/lib/example.ts',
  additions: 24,
  deletions: 8,
  binary: false,
};

test('AI fleet accepts a small, reviewable change to an ordinary source file', () => {
  const result = validateAiFleetDiff({
    files: [safeChange],
    diffText: '+export const answer = 42;\n',
  });
  assert.equal(result.allowed, true);
  assert.equal(result.additions, 24);
  assert.equal(result.deletions, 8);
});

test('AI fleet rejects automatic changes to security and release-control paths', () => {
  for (const path of [
    '.github/workflows/ci.yml',
    'src/lib/capability-authorization.ts',
    'package.json',
    'package-lock.json',
    'contracts/GLORIFIER.sol',
    'migrations/001.sql',
    '.env.production',
    'credentials/service-account.json',
    'certs/deploy.pem',
  ]) {
    const result = validateAiFleetDiff({
      files: [{ ...safeChange, path }],
      diffText: '',
    });
    assert.equal(result.allowed, false, `expected ${path} to require human-controlled changes`);
  }
});

test('AI fleet rejects path traversal and absolute paths', () => {
  for (const path of ['../outside.txt', '/tmp/secret.txt', 'src/../../outside.txt']) {
    const result = validateAiFleetDiff({
      files: [{ ...safeChange, path }],
      diffText: '',
    });
    assert.equal(result.allowed, false);
  }
});

test('AI fleet rejects oversized and binary diffs', () => {
  assert.equal(validateAiFleetDiff({
    files: [{ ...safeChange, additions: 801 }],
    diffText: '',
  }).allowed, false);
  assert.equal(validateAiFleetDiff({
    files: [{ ...safeChange, binary: true }],
    diffText: '',
  }).allowed, false);
  assert.equal(validateAiFleetDiff({
    files: Array.from({ length: 21 }, (_, index) => ({ ...safeChange, path: `src/file-${index}.ts` })),
    diffText: '',
  }).allowed, false);
});

test('AI fleet rejects private keys and known API-token formats in proposed diffs', () => {
  const markers = [
    '-----BEGIN PRIVATE KEY-----',
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789',
    'AKIA1234567890ABCDEF',
  ];
  for (const marker of markers) {
    const result = validateAiFleetDiff({
      files: [safeChange],
      diffText: `+const leaked = '${marker}';\n`,
    });
    assert.equal(result.allowed, false);
  }
});

test('AI fleet rejects empty diff descriptions instead of treating them as approved', () => {
  assert.equal(validateAiFleetDiff({ files: [], diffText: '' }).allowed, false);
});
