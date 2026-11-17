import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker';

test('Cloudflare scheduled handler registers a fail-closed Autopilot cycle', async () => {
  const scheduled = (worker as unknown as {
    scheduled?: (
      controller: unknown,
      environment: Record<string, unknown>,
      context: { waitUntil(promise: Promise<unknown>): void },
    ) => Promise<void>;
  }).scheduled;
  assert.equal(typeof scheduled, 'function');

  let background: Promise<unknown> | null = null;
  await scheduled?.(
    { cron: '*/5 * * * *' },
    { GLORIFIER_WORKERS_PLAN: 'unverified' },
    { waitUntil(promise) { background = promise; } },
  );
  assert.ok(background, 'The Cron handler must register its work with waitUntil.');
  await background;
});
