import assert from 'node:assert/strict';
import test from 'node:test';
import {
  estimateRepositoryInputTokenUpperBound,
  reserveRepositoryProviderRequest,
  type RepositoryProviderUsageLimits
} from './repository-provider-budget.ts';

const limits: RepositoryProviderUsageLimits = {
  requestsPerMinute: 3,
  requestsPerDay: 20,
  maxTokensPerDay: 40_000,
  maxInputTokens: 8_000,
  maxOutputTokens: 1_000
};

function fakePool(responses: Array<{ rowCount?: number; rows?: unknown[] }> = [{ rowCount: 1 }, { rowCount: 1 }]) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  let index = 0;
  let released = false;
  return {
    calls,
    get released() { return released; },
    async connect() {
      return {
        async query(sql: string, values?: unknown[]) {
          calls.push({ sql, values });
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: null, rows: [] };
          if (sql.startsWith('DELETE FROM glorifier_repository_provider_usage')) return { rowCount: 0, rows: [] };
          const response = responses[index++];
          return response ?? { rowCount: 1, rows: [] };
        },
        release() { released = true; }
      };
    }
  };
}

test('estimates a conservative byte upper bound and rejects empty or invalid message sets', () => {
  assert.equal(estimateRepositoryInputTokenUpperBound([{ role: 'user', content: 'abc' }]), 55);
  assert.equal(estimateRepositoryInputTokenUpperBound([{ role: 'user', content: 'é' }]), 54);
  assert.throws(() => estimateRepositoryInputTokenUpperBound([]), /required/);
  assert.throws(() => estimateRepositoryInputTokenUpperBound([{ role: 'user', content: '' }]), /invalid/);
});

test('reserves request and token ceilings for minute and daily windows in one transaction', async () => {
  const pool = fakePool();
  const result = await reserveRepositoryProviderRequest({
    providerId: 'gemini',
    limits,
    inputTokenUpperBound: 200,
    now: new Date('2026-11-16T15:47:55.000Z'),
    pool
  });
  assert.deepEqual(result, {
    providerId: 'gemini',
    inputTokenUpperBound: 200,
    maxOutputTokens: 1000,
    reservedTokens: 1200
  });
  assert.equal(pool.calls[0].sql, 'BEGIN');
  const minuteReservation = pool.calls.find(call => call.values?.[1] === 'minute');
  assert.ok(minuteReservation);
  assert.match(minuteReservation.sql, /window_kind/);
  assert.equal(minuteReservation.values?.[1], 'minute');
  const dailyReservation = pool.calls.find(call => call.values?.[1] === 'day');
  assert.equal(minuteReservation?.values?.[2], '2026-11-16T15:47:00.000Z');
  assert.equal(minuteReservation?.values?.[4], 3);
  assert.equal(minuteReservation?.values?.[5], null);
  assert.equal(dailyReservation?.values?.[2], '2026-11-16T00:00:00.000Z');
  assert.equal(dailyReservation?.values?.[3], 1200);
  assert.equal(dailyReservation?.values?.[4], 20);
  assert.equal(dailyReservation?.values?.[5], 40_000);
  assert.equal(pool.calls.at(-1)?.sql, 'COMMIT');
  assert.equal(pool.released, true);
});

test('rolls back and blocks a request when the minute ceiling is already exhausted', async () => {
  const pool = fakePool([{ rowCount: 0 }]);
  await assert.rejects(
    () => reserveRepositoryProviderRequest({
      providerId: 'nvidia',
      limits,
      inputTokenUpperBound: 200,
      now: new Date('2026-11-16T15:47:55.000Z'),
      pool
    }),
    /free minute quota is exhausted/
  );
  assert.equal(pool.calls.at(-1)?.sql, 'ROLLBACK');
  assert.equal(pool.released, true);
});

test('rolls back the minute reservation when the daily request/token ceiling is exhausted', async () => {
  const pool = fakePool([{ rowCount: 1 }, { rowCount: 0 }]);
  await assert.rejects(
    () => reserveRepositoryProviderRequest({
      providerId: 'anthropic',
      limits,
      inputTokenUpperBound: 200,
      now: new Date('2026-11-16T15:47:55.000Z'),
      pool
    }),
    /free day quota is exhausted/
  );
  assert.equal(pool.calls.at(-1)?.sql, 'ROLLBACK');
  assert.equal(pool.released, true);
});

test('fails closed when input exceeds its attested limit or one request cannot fit daily token budget', async () => {
  const pool = fakePool();
  await assert.rejects(
    () => reserveRepositoryProviderRequest({ providerId: 'gemini', limits, inputTokenUpperBound: 8001, pool }),
    /maximum input-token limit/
  );
  await assert.rejects(
    () => reserveRepositoryProviderRequest({
      providerId: 'gemini',
      limits: { ...limits, maxTokensPerDay: 1000 },
      inputTokenUpperBound: 200,
      pool
    }),
    /exceeds the owner-attested daily token budget/
  );
  assert.equal(pool.calls.length, 0);
});

test('rejects zero, invalid, and unsafe provider limits before opening a transaction', async () => {
  const pool = fakePool();
  await assert.rejects(
    () => reserveRepositoryProviderRequest({
      providerId: 'gemini',
      limits: { ...limits, requestsPerMinute: 0 },
      inputTokenUpperBound: 200,
      pool
    }),
    /must be a positive integer/
  );
  await assert.rejects(
    () => reserveRepositoryProviderRequest({
      providerId: 'gemini',
      limits: { ...limits, maxInputTokens: Number.NaN },
      inputTokenUpperBound: 200,
      pool
    }),
    /must be a positive integer/
  );
  await assert.rejects(
    () => reserveRepositoryProviderRequest({
      providerId: 'gemini',
      limits: { ...limits, maxOutputTokens: 1.5 },
      inputTokenUpperBound: 200,
      pool
    }),
    /must be a positive integer/
  );
  await assert.rejects(
    () => reserveRepositoryProviderRequest({
      providerId: 'gemini',
      limits: { ...limits, maxTokensPerDay: -1 },
      inputTokenUpperBound: 200,
      pool
    }),
    /must be a positive integer/
  );
  await assert.rejects(
    () => reserveRepositoryProviderRequest({
      providerId: 'gemini',
      limits: { ...limits, requestsPerDay: Number.MAX_SAFE_INTEGER + 1 },
      inputTokenUpperBound: 200,
      pool
    }),
    /must be a positive integer/
  );
  await assert.rejects(
    () => reserveRepositoryProviderRequest({
      providerId: 'invalid provider',
      limits,
      inputTokenUpperBound: 200,
      pool
    }),
    /provider ID is invalid/
  );
  assert.equal(pool.calls.length, 0);
});
