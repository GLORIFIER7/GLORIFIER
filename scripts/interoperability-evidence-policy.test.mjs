import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasEvidenceForDeclaredTargetEnvironment,
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
