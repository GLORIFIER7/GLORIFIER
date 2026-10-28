import test from 'node:test';
import assert from 'node:assert/strict';
import { isEvidenceTimestampFresh, LIVE_EVIDENCE_MAX_AGE_MS } from './interoperability-evidence-policy.mjs';

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

