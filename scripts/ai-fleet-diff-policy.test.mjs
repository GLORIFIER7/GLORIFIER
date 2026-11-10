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
    'src/lib/auth/session.ts',
    'src/lib/governance/agent-control-plane.ts',
    'src/lib/db/postgres.ts',
    'src/worker.ts',
    'server.ts',
    'scripts/ai-fleet-diff-policy.mjs',
    'scripts/ai-fleet-diff-policy.test.mjs',
    'scripts/validate-ai-fleet-diff.mjs',
    'scripts/validate-ai-fleet-diff.test.mjs',
    'scripts/ai-fleet-authorization.sh',
    'scripts/ai-fleet-authorization.test.sh',
    'scripts/ai-fleet-workflow-contract.test.mjs',
    'scripts/ai-fleet-paid-inference-authorization.sh',
    'scripts/ai-fleet-paid-inference-authorization.test.sh',
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

test('AI fleet rejects path traversal, absolute paths and control characters', () => {
  for (const path of ['../outside.txt', '/tmp/secret.txt', 'src/../../outside.txt', 'src/\\\\..\\\\outside.txt', 'src/unsafe\nname.ts']) {
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

test('AI fleet permits removing secret-like material without reintroducing it', () => {
  const result = validateAiFleetDiff({
    files: [safeChange],
    diffText: "-const leaked = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';\n+const removed = true;\n",
  });
  assert.equal(result.allowed, true);
});

test('AI fleet rejects symbolic links as non-reviewable changes', () => {
  assert.equal(validateAiFleetDiff({
    files: [{ ...safeChange, symlink: true }],
    diffText: '',
  }).allowed, false);
});

test('AI fleet rejects empty diff descriptions instead of treating them as approved', () => {
  assert.equal(validateAiFleetDiff({ files: [], diffText: '' }).allowed, false);
});

test('AI fleet scans added lines whose content begins with plus signs', () => {
  for (const secret of [
    '++ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    '++-----BEGIN PRIVATE KEY-----',
    '++ b/ghp_abcdefghijklmnopqrstuvwxyz0123456789',
  ]) {
    const result = validateAiFleetDiff({
      files: [safeChange],
      diffText: `diff --git a/src/lib/example.ts b/src/lib/example.ts
index 1111111..2222222 100644
--- a/src/lib/example.ts
+++ b/src/lib/example.ts
@@ -1,0 +1,1 @@
+${secret}
`,
    });
    assert.equal(result.allowed, false, `expected secret to be detected: ${secret}`);
    assert.equal(result.reason, 'secret_like_material_detected');
  }
});

test('AI fleet does not scan unified-diff file headers as added source content', () => {
  const result = validateAiFleetDiff({
    files: [safeChange],
    diffText: 'diff --git a/src/lib/example.ts b/src/lib/example.ts\n--- a/src/lib/example.ts\n+++ b/src/lib/example.ts\n@@ -1,0 +1,1 @@\n+export const safe = true;\n',
  });
  assert.equal(result.allowed, true);
});
