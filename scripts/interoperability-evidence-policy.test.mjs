import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasEvidenceForDeclaredTargetEnvironment,
  hasEvidenceForEveryDeclaredTargetEnvironment,
  isEvidenceTimestampFresh,
  LIVE_EVIDENCE_MAX_AGE_MS,
} from './interoperability-evidence-policy.mjs';

const now = Date.parse('2026-10-28T12:00:00.000Z');

test('live evidence within 24 hours is fresh', () => {
  assert.equal(isEvidenceTimestampFresh('2026-10-28T11:00:00.000Z', { live: true, now }), true);
});

test('live evidence older than 24 hours is stale', () => {
  assert.equal(isEvidenceTimestampFresh(new Date(now - LIVE_EVIDENCE_MAX_AGE_MS - 1).toISOString(), { live: true, now }), false);
});

test('old non-live CI evidence remains valid as historical evidence', () => {
  assert.equal(isEvidenceTimestampFresh('2020-01-01T00:00:00.000Z', { live: false, now }), true);
});

test('timestamps too far in the future are rejected', () => {
  assert.equal(isEvidenceTimestampFresh('2026-10-28T12:10:00.000Z', { live: true, now }), false);
});

test('missing and malformed timestamps are rejected', () => {
  assert.equal(isEvidenceTimestampFresh(null, { live: true, now }), false);
  assert.equal(isEvidenceTimestampFresh('not-a-date', { live: true, now }), false);
});

test('VERIFIED evidence must match a declared operating environment, not merely share a runtime version', () => {
  assert.equal(
    hasEvidenceForDeclaredTargetEnvironment(
      'GitHub Actions Windows Server 2022 x86_64; Go 1.26.9; exact CI run',
      [
        'GitHub-hosted Ubuntu 24.04 x86_64 with Go 1.26.9 on main',
        'Go 1.26.x / macOS 15 ARM64',
      ],
    ),
    false,
    'Windows evidence must not substantiate a capability declared for Ubuntu or macOS',
  );
});

test('VERIFIED evidence accepts a matching platform, architecture, and runtime family/version', () => {
  assert.equal(
    hasEvidenceForDeclaredTargetEnvironment(
      'GitHub Actions Ubuntu 24.04 x86_64; Go 1.26.9; exact CI run',
      [
        'GitHub-hosted Ubuntu 24.04 x86_64 with Go 1.26.9 on main',
        'Go 1.26.x / Windows Server 2022 x86_64',
      ],
    ),
    true,
  );
});

test('VERIFIED evidence matches a declared platform even when evidence adds run metadata', () => {
  assert.equal(
    hasEvidenceForDeclaredTargetEnvironment(
      'Ubuntu 22.04 x86_64; exact main commit a40dbe2',
      ['GitHub-hosted ubuntu-22.04 x86_64', 'GitHub-hosted ubuntu-24.04 x86_64'],
    ),
    true,
  );
});

test('VERIFIED environment matching treats an omitted .NET patch component as the same major runtime', () => {
  assert.equal(
    hasEvidenceForDeclaredTargetEnvironment(
      '.NET 8 / Ubuntu 24.04 x86_64; exact CI run',
      ['GitHub-hosted Ubuntu 24.04 x86_64; .NET 8.0'],
    ),
    true,
  );
});

test('VERIFIED Linux targets reject Windows evidence even when the Linux distribution is unspecified', () => {
  assert.equal(
    hasEvidenceForDeclaredTargetEnvironment(
      'Windows Server 2022 x86_64; Go 1.26.9',
      ['Linux x86_64; Go 1.26.x'],
    ),
    false,
  );
});

test('VERIFIED Linux distribution targets reject evidence from a different distribution', () => {
  assert.equal(
    hasEvidenceForDeclaredTargetEnvironment(
      'Alpine Linux 3.20 x86_64; Python 3.12',
      ['Debian 12 x86_64; Python 3.12'],
    ),
    false,
  );
});

test('generic Linux targets accept supported Linux distribution evidence', () => {
  assert.equal(
    hasEvidenceForDeclaredTargetEnvironment(
      'Ubuntu 24.04 x86_64; Python 3.12',
      ['Linux x86_64; Python 3.12'],
    ),
    true,
  );
});

test('VERIFIED capabilities require timestamped evidence for every declared target environment', () => {
  const targets = [
    'Python 3.12 / Windows Server 2022 x86_64',
    'Python 3.12 / macOS 15 ARM64',
  ];
  const windowsEvidence = {
    kind: 'ci-run',
    reference: 'https://example.invalid/windows-run',
    targetEnvironment: 'Python 3.12 / Windows Server 2022 x86_64',
    observedAt: '2026-11-10T07:00:00.000Z',
  };
  const macEvidence = {
    kind: 'ci-run',
    reference: 'https://example.invalid/macos-run',
    targetEnvironment: 'Python 3.12 / macOS 15 ARM64',
    observedAt: '2026-11-10T07:00:00.000Z',
  };

  assert.equal(
    hasEvidenceForEveryDeclaredTargetEnvironment([windowsEvidence], targets, {
      now: Date.parse('2026-11-10T07:30:00.000Z'),
    }),
    false,
    'one successful platform must not verify the other declared platform',
  );
  assert.equal(
    hasEvidenceForEveryDeclaredTargetEnvironment([windowsEvidence, macEvidence], targets, {
      now: Date.parse('2026-11-10T07:30:00.000Z'),
    }),
    true,
  );
});

test('one evidence record covering an OS matrix must contain every declared platform version', () => {
  const target = 'GitHub-hosted Ubuntu 22.04 and Ubuntu 24.04 x86_64';
  assert.equal(
    hasEvidenceForDeclaredTargetEnvironment(
      'GitHub-hosted Ubuntu 22.04 x86_64; exact workflow run',
      [target],
    ),
    false,
    'Ubuntu 22.04 evidence alone must not verify the Ubuntu 24.04 matrix target',
  );
  assert.equal(
    hasEvidenceForDeclaredTargetEnvironment(
      'GitHub-hosted Ubuntu 22.04 and Ubuntu 24.04 x86_64; exact workflow run',
      [target],
    ),
    true,
  );
});
