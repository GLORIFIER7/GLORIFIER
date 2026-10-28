import test from 'node:test';
import assert from 'node:assert/strict';
import { getBrandTermsUnavailableMessage } from './brand-monitor-status.mjs';

test('classifies missing terms endpoint as not observable rather than crashing the workflow', () => {
  const message = getBrandTermsUnavailableMessage(404, false, 'https://example.invalid');
  assert.match(message, /NOT OBSERVABLE/);
  assert.match(message, /HTTP 404/);
  assert.match(message, /endpoint is missing or not routed/);
});

test('classifies unauthenticated endpoint as not observable when no secret is configured', () => {
  assert.match(getBrandTermsUnavailableMessage(401, false, 'https://example.invalid'), /BRAND_MONITOR_WEBHOOK_SECRET is not configured/);
  assert.match(getBrandTermsUnavailableMessage(403, false, 'https://example.invalid'), /NOT OBSERVABLE/);
});

test('does not hide server errors or authentication failures when a secret is configured', () => {
  assert.equal(getBrandTermsUnavailableMessage(500, false, 'https://example.invalid'), null);
  assert.equal(getBrandTermsUnavailableMessage(401, true, 'https://example.invalid'), null);
});
