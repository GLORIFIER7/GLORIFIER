import assert from 'node:assert/strict';
import { buildGLRAIServiceQuote, divideDecimal } from './glr-commerce';
import test from 'node:test';

const now = new Date('2026-10-13T07:00:00.000Z');

test('GLR decimal division is exact and rejects invalid divisors', () => {
  assert.equal(divideDecimal('0.05', '0.01', 9), '5');
  assert.equal(divideDecimal('1', '3', 6), '0.333333');
  assert.throws(() => divideDecimal('1', '0'));
});

test('USD quote discloses the service tariff without inventing a GLR market rate', () => {
  const quote = buildGLRAIServiceQuote({ currency: 'USD', now });
  assert.equal(quote.priceGLR, '1');
  assert.equal(quote.fiatReferenceAmount, '0.05');
  assert.equal(quote.quoteStatus, 'GLR_RATE_NOT_CONFIGURED');
  assert.equal(quote.executable, false);
});

test('LAK conversion multiplies the USD tariff by the supplied FX rate', () => {
  const quote = buildGLRAIServiceQuote({
    currency: 'LAK',
    fiatRate: {
      currency: 'LAK', ratePerUsd: '22000',
      source: 'test-fixture', observedAt: '2026-10-13T06:59:00.000Z',
      retrievedAt: '2026-10-13T06:59:30.000Z', maxAgeSeconds: 3600,
    },
    now,
  });
  assert.equal(quote.fiatReferenceAmount, '1100');
  assert.equal(quote.quoteStatus, 'GLR_RATE_NOT_CONFIGURED');
});

test('fractional EUR FX rates are converted before currency precision rounding', () => {
  const quote = buildGLRAIServiceQuote({
    currency: 'EUR',
    fiatRate: {
      currency: 'EUR', ratePerUsd: '0.80',
      source: 'test-fixture', observedAt: '2026-10-13T06:59:00.000Z',
      retrievedAt: '2026-10-13T06:59:30.000Z', maxAgeSeconds: 3600,
    },
    now,
  });
  assert.equal(quote.fiatReferenceAmount, '0.04');
  assert.equal(quote.quoteStatus, 'GLR_RATE_NOT_CONFIGURED');
});

test('realistic EUR-per-USD fixture rounds the service tariff to EUR 0.05', () => {
  const quote = buildGLRAIServiceQuote({
    currency: 'EUR',
    fiatRate: {
      currency: 'EUR', ratePerUsd: '0.92',
      source: 'realistic-rate-regression-fixture', observedAt: '2026-10-13T06:59:00.000Z',
      retrievedAt: '2026-10-13T06:59:30.000Z', maxAgeSeconds: 3600,
    },
    now,
  });
  assert.equal(quote.fiatReferenceAmount, '0.05');
  assert.equal(quote.quoteStatus, 'GLR_RATE_NOT_CONFIGURED');
});

test('EUR conversion multiplies ratePerUsd instead of inverting it', () => {
  const quote = buildGLRAIServiceQuote({
    currency: 'EUR',
    fiatRate: {
      currency: 'EUR', ratePerUsd: '1.70',
      source: 'direction-regression-fixture', observedAt: '2026-10-13T06:59:00.000Z',
      retrievedAt: '2026-10-13T06:59:30.000Z', maxAgeSeconds: 3600,
    },
    now,
  });
  assert.equal(quote.fiatReferenceAmount, '0.09');
  assert.equal(quote.quoteStatus, 'GLR_RATE_NOT_CONFIGURED');
});

test('stale FX evidence cannot create a fiat amount', () => {
  const quote = buildGLRAIServiceQuote({
    currency: 'EUR',
    fiatRate: {
      currency: 'EUR', ratePerUsd: '0.92',
      source: 'test-fixture', observedAt: '2026-10-12T00:00:00.000Z',
      retrievedAt: '2026-10-12T00:00:00.000Z', maxAgeSeconds: 3600,
    },
    now,
  });
  assert.equal(quote.fiatReferenceAmount, null);
  assert.equal(quote.quoteStatus, 'STALE_FIAT_RATE');
});
