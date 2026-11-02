import { buildGLRAIServiceQuote, divideDecimal } from './glr-commerce';

/** Throws a descriptive error when a GLR commerce regression expectation fails. */
const assertCondition = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

assertCondition(divideDecimal('0.05', '0.01', 9) === '5', 'decimal division should be exact');
assertCondition(divideDecimal('1', '3', 6) === '0.333333', 'decimal division should round half-up at target precision');
let rejected = false;
try { divideDecimal('1', '0'); } catch { rejected = true; }
assertCondition(rejected, 'division by zero must be rejected');

const now = new Date('2026-10-13T07:00:00.000Z');
const usd = buildGLRAIServiceQuote({ currency: 'USD', now });
assertCondition(usd.priceGLR === '1' && usd.fiatReferenceAmount === '0.05', 'USD service tariff should be explicit');
assertCondition(usd.quoteStatus === 'GLR_RATE_NOT_CONFIGURED', 'missing GLR market rate must be disclosed');
assertCondition(usd.executable === false, 'quotes must never execute a payment');

const lak = buildGLRAIServiceQuote({
  currency: 'LAK',
  fiatRate: {
    currency: 'LAK', ratePerUsd: '22000',
    source: 'test-fixture', observedAt: '2026-10-13T06:59:00.000Z',
    retrievedAt: '2026-10-13T06:59:30.000Z', maxAgeSeconds: 3600,
  },
  now,
});
assertCondition(lak.fiatReferenceAmount === '1100', 'fiat quote should multiply the USD service tariff by the supplied FX rate');
assertCondition(lak.quoteStatus === 'GLR_RATE_NOT_CONFIGURED', 'fiat conversion does not invent a GLR market rate');

const eur = buildGLRAIServiceQuote({
  currency: 'EUR',
  fiatRate: {
    currency: 'EUR', ratePerUsd: '0.80',
    source: 'test-fixture', observedAt: '2026-10-13T06:59:00.000Z',
    retrievedAt: '2026-10-13T06:59:30.000Z', maxAgeSeconds: 3600,
  },
  now,
});
assertCondition(eur.fiatReferenceAmount === '0.04', 'fractional FX rates must convert USD 0.05 before currency precision rounding');
assertCondition(eur.quoteStatus === 'GLR_RATE_NOT_CONFIGURED', 'fractional fiat conversion must not invent a GLR market rate');

// Preserve the stated realistic EUR-per-USD fixture as well as the edge cases.
const realisticEur = buildGLRAIServiceQuote({
  currency: 'EUR',
  fiatRate: {
    currency: 'EUR', ratePerUsd: '0.92',
    source: 'realistic-rate-regression-fixture', observedAt: '2026-10-13T06:59:00.000Z',
    retrievedAt: '2026-10-13T06:59:30.000Z', maxAgeSeconds: 3600,
  },
  now,
});
assertCondition(realisticEur.fiatReferenceAmount === '0.05', '0.05 USD × 0.92 EUR per USD should round to EUR 0.05');
assertCondition(realisticEur.quoteStatus === 'GLR_RATE_NOT_CONFIGURED', 'realistic FX conversion must not invent a GLR market rate');

// A deliberately discriminating fixture: 0.05 USD × 1.70 = 0.085,
// which rounds to 0.09 at two decimal places. Inverting the rate would
// produce 0.03, so this catches accidental division instead of multiplication.
const directionCheck = buildGLRAIServiceQuote({
  currency: 'EUR',
  fiatRate: {
    currency: 'EUR', ratePerUsd: '1.70',
    source: 'direction-regression-fixture', observedAt: '2026-10-13T06:59:00.000Z',
    retrievedAt: '2026-10-13T06:59:30.000Z', maxAgeSeconds: 3600,
  },
  now,
});
assertCondition(directionCheck.fiatReferenceAmount === '0.09', 'ratePerUsd must be multiplied by the USD tariff, not inverted');
assertCondition(directionCheck.quoteStatus === 'GLR_RATE_NOT_CONFIGURED', 'direction regression fixture must not imply a GLR market rate');

const stale = buildGLRAIServiceQuote({
  currency: 'EUR',
  fiatRate: {
    currency: 'EUR', ratePerUsd: '0.92',
    source: 'test-fixture', observedAt: '2026-10-12T00:00:00.000Z',
    retrievedAt: '2026-10-12T00:00:00.000Z', maxAgeSeconds: 3600,
  },
  now,
});
assertCondition(stale.fiatReferenceAmount === null && stale.quoteStatus === 'STALE_FIAT_RATE', 'stale FX evidence must not create a fiat amount');

process.stdout.write('GLR commerce quote tests passed.\n');
