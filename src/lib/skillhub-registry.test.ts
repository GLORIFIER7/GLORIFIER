import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createSkillFingerprint,
  diffSkillFiles,
  evaluateSkillPromotion,
  normalizeSkillEntryPath,
  validateSkillCandidate
} from './skillhub-registry.js';

const skillMd = `---
name: meeting-action-extractor
description: Extract decisions and action items from meeting notes.
---

# Meeting Action Extractor

Produce a concise, evidence-linked action list from supplied meeting notes.
`;

function packageFile(path: string, content = 'reviewed content', extra: Record<string, unknown> = {}) {
  return {
    path,
    sizeBytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
    contentBytes: Buffer.from(content),
    ...extra
  };
}

function validCandidate(overrides: Record<string, unknown> = {}) {
  return {
    name: 'meeting-action-extractor',
    version: '1.0.0',
    description: 'Extract decisions and action items from meeting notes.',
    sourceUrl: 'https://github.com/example/meeting-action-extractor',
    sourceRevision: 'a'.repeat(40),
    license: 'Apache-2.0',
    dependencies: [],
    permissions: ['filesystem:read'],
    networkHosts: [],
    skillMdContent: skillMd,
    files: [packageFile('SKILL.md', skillMd)],
    ...overrides
  };
}

test('accepts a valid, pinned skill package without granting runtime authority', () => {
  const result = validateSkillCandidate(validCandidate());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.canonicalFilePaths[0], 'SKILL.md');
});

test('rejects non-string root file digests without throwing', () => {
  const result = validateSkillCandidate(validCandidate({
    files: [packageFile('SKILL.md', skillMd, { sha256: 42 })]
  }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /SHA-256 digest/i);
});

test('normalizes Windows separators and rejects path traversal, absolute and drive paths', () => {
  assert.equal(normalizeSkillEntryPath('references\\guide.md'), 'references/guide.md');
  for (const path of ['../secrets.txt', 'references/../../secret', '/etc/passwd', 'C:\\windows\\win.ini', 'a//b.md', 'a/./b.md']) {
    assert.throws(() => normalizeSkillEntryPath(path));
  }
});

test('rejects duplicate case-folded paths and symbolic links', () => {
  const duplicate = validCandidate({
    files: [packageFile('SKILL.md', skillMd), packageFile('references/Guide.md'), packageFile('references/guide.md')]
  });
  assert.match(validateSkillCandidate(duplicate).errors.join(' '), /duplicate/i);

  const symlink = validCandidate({
    files: [packageFile('SKILL.md', skillMd), packageFile('references/link.md', 'link', { isSymlink: true })]
  });
  assert.match(validateSkillCandidate(symlink).errors.join(' '), /symbolic link/i);
});

test('enforces package file allowlist and size/count limits', () => {
  const unsupported = validCandidate({
    files: [packageFile('SKILL.md', skillMd), packageFile('payload.exe')]
  });
  assert.match(validateSkillCandidate(unsupported).errors.join(' '), /extension/i);

  const oversizedContent = 'x'.repeat(10 * 1024 * 1024 + 1);
  const oversized = validCandidate({
    files: [packageFile('SKILL.md', skillMd), packageFile('large.md', oversizedContent)]
  });
  assert.match(validateSkillCandidate(oversized).errors.join(' '), /file size/i);

  const tooMany = Array.from({ length: 501 }, (_, index) => packageFile(index === 0 ? 'SKILL.md' : 'docs/file-' + index + '.md', index === 0 ? skillMd : 'x'));
  assert.match(validateSkillCandidate(validCandidate({ files: tooMany })).errors.join(' '), /file count/i);
});

test('requires root SKILL.md with bounded, matching frontmatter', () => {
  const nested = validCandidate({
    files: [packageFile('nested/SKILL.md', skillMd)]
  });
  assert.match(validateSkillCandidate(nested).errors.join(' '), /root.*SKILL\.md/i);

  const mismatched = skillMd.replace('name: meeting-action-extractor', 'name: other-skill');
  const result = validateSkillCandidate(validCandidate({
    skillMdContent: mismatched,
    files: [packageFile('SKILL.md', mismatched)]
  }));
  assert.match(result.errors.join(' '), /name.*does not match/i);
});

test('rejects floating or insecure source references and unpinned dependencies', () => {
  const floating = validateSkillCandidate(validCandidate({ sourceRevision: 'main' }));
  assert.match(floating.errors.join(' '), /sourceRevision.*immutable/i);

  const insecure = validateSkillCandidate(validCandidate({ sourceUrl: 'http://example.com/skill' }));
  assert.match(insecure.errors.join(' '), /https/i);

  const unpinned = validateSkillCandidate(validCandidate({
    dependencies: [{ name: 'example-lib', version: '^2.1.0' }]
  }));
  assert.match(unpinned.errors.join(' '), /pinned/i);
});


test('rejects a supplied digest that does not match the actual file bytes', () => {
  const result = validateSkillCandidate(validCandidate({
    files: [packageFile('SKILL.md', skillMd, { sha256: '0'.repeat(64) })]
  }));
  assert.match(result.errors.join(' '), /does not match its SHA-256 digest/i);
});

test('requires actual bytes instead of accepting digest-only metadata', () => {
  const result = validateSkillCandidate(validCandidate({
    files: [packageFile('SKILL.md', skillMd, { contentBytes: undefined })]
  }));
  assert.match(result.errors.join(' '), /actual file content bytes are required/i);
});

test('flags executable scripts and network access for explicit review', () => {
  const result = validateSkillCandidate(validCandidate({
    files: [packageFile('SKILL.md', skillMd), packageFile('scripts/run.sh', '#!/bin/sh', { executable: true })],
    networkHosts: ['api.example.com'],
    permissions: ['filesystem:read', 'network:connect']
  }));
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((warning) => /script|executable/i.test(warning)));
  assert.ok(result.warnings.some((warning) => /network/i.test(warning)));
});

test('computes order-independent package fingerprints and reports version diffs', () => {
  const first = [packageFile('SKILL.md', skillMd), packageFile('references/a.md', 'A')];
  const reversed = [...first].reverse();
  const changed = [packageFile('SKILL.md', skillMd), packageFile('references/a.md', 'B')];
  assert.equal(createSkillFingerprint(first), createSkillFingerprint(reversed));
  assert.notEqual(createSkillFingerprint(first), createSkillFingerprint(changed));

  const localeSensitive = [
    packageFile('references/a_b.md', 'underscore'),
    packageFile('references/aB.md', 'uppercase'),
    packageFile('references/a-b.md', 'hyphen')
  ];
  const canonical = localeSensitive
    .map((file) => ({ path: normalizeSkillEntryPath(file.path), digest: file.sha256 }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
    .map((entry) => entry.path + ':' + entry.digest + '\n')
    .join('');
  const expectedFingerprint = 'sha256:' + createHash('sha256').update(canonical, 'utf8').digest('hex');
  assert.equal(createSkillFingerprint(localeSensitive), expectedFingerprint);

  assert.deepEqual(
    diffSkillFiles(undefined, {
      'SKILL.md': first[0].sha256,
      'references/a.md': first[1].sha256
    }),
    ['SKILL.md', 'references/a.md']
  );
  assert.deepEqual(
    diffSkillFiles(
      { 'SKILL.md': first[0].sha256, 'references/a.md': first[1].sha256 },
      { 'SKILL.md': first[0].sha256, 'references/b.md': packageFile('references/b.md', 'B').sha256 }
    ),
    ['references/a.md', 'references/b.md']
  );
});

test('promotion requires every review gate and never authorizes execution', () => {
  const approved = evaluateSkillPromotion({
    sourceRevisionPinned: true,
    licenseReviewed: true,
    dependenciesReviewed: true,
    permissionsReviewed: true,
    securityScan: 'passed',
    contractTests: 'passed',
    leastPrivilegeReviewed: true,
    humanApproved: true,
    humanReviewer: 'reviewer@example.com',
    auditReference: 'GEAS-REVIEW-001'
  });
  assert.equal(approved.eligible, true);
  assert.equal(approved.runtimeExecutionAuthorized, false);

  const blocked = evaluateSkillPromotion({
    sourceRevisionPinned: true,
    licenseReviewed: true,
    dependenciesReviewed: true,
    permissionsReviewed: true,
    securityScan: 'failed',
    contractTests: 'not-run',
    leastPrivilegeReviewed: false,
    humanApproved: false,
    humanReviewer: '',
    auditReference: ''
  });
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.blockers.length, 6);
  assert.equal(blocked.runtimeExecutionAuthorized, false);
});

test('checked-in policy keeps the SkillHub connector disabled and fail-closed', async () => {
  const policyUrl = new URL('../../config/skillhub-registry-policy.json', import.meta.url);
  const policy = JSON.parse(await readFile(policyUrl, 'utf8'));
  assert.equal(policy.integration.mode, 'manual-candidate-intake');
  assert.equal(policy.integration.enabled, false);
  assert.equal(policy.trust.registryIsUntrustedInput, true);
  assert.equal(policy.trust.autoInstall, false);
  assert.equal(policy.trust.autoExecute, false);
  assert.equal(policy.trust.networkFetchDuringProductionRequests, false);
  assert.equal(policy.promotion.securityScanFailureBlocksPromotion, true);
  assert.equal(policy.trust.scannerFailureBlocksPromotion, true);
});
