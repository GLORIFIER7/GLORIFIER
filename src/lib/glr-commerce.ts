import { stripTrailingZeros } from './linear-string.js';
/**
 * GLORIFIER paid AI service primitives.
 *
 * Quotes are informational. Service execution is gated on a persisted intent
 * whose settlement has already been independently verified by the server.
 */
export const GLR_AI_SUMMARY_SERVICE = {
  id: 'ai-summary',
  version: 'v1',
  taskRef: 'glr-service:ai-summary:v1',
  priceGLR: '1',
  maxPromptCharacters: 8000,
  maxOutputTokens: 1200,
} as const;

const DECIMAL_RE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** Parse a non-negative decimal string into integer units and scale. */
const parseDecimal = (value: string, label: string) => {
  if (typeof value !== 'string' || !DECIMAL_RE.test(value)) {
    throw new Error(`${label} must be a non-negative decimal string`);
  }
  const [whole, fraction = ''] = value.split('.');
  return { units: BigInt(whole + fraction), scale: fraction.length };
};

/** Return an exact power of ten for supported decimal precision. */
const pow10 = (exponent: number): bigint => {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 100) throw new Error('Invalid decimal precision');
  return 10n ** BigInt(exponent);
};

/** Format integer decimal units without trailing fractional zeroes. */
const formatDecimal = (units: bigint, scale: number): string => {
  const digits = units.toString().padStart(scale + 1, '0');
  if (scale === 0) return digits;
  const whole = digits.slice(0, -scale);
  const fraction = stripTrailingZeros(digits.slice(-scale));
  return fraction ? `${whole}.${fraction}` : whole;
};

/** Exact decimal division, rounded half-up at the requested precision. */
export const divideDecimal = (numerator: string, denominator: string, precision = 9): string => {
  const numeratorDecimal = parseDecimal(numerator, 'Numerator');
  const denominatorDecimal = parseDecimal(denominator, 'Denominator');
  if (denominatorDecimal.units <= 0n) throw new Error('Denominator must be greater than zero');
  if (!Number.isInteger(precision) || precision < 0 || precision > 30) throw new Error('Invalid precision');
  const scaledNumerator = numeratorDecimal.units * pow10(denominatorDecimal.scale + precision);
  const scaledDenominator = denominatorDecimal.units * pow10(numeratorDecimal.scale);
  const rounded = (scaledNumerator + scaledDenominator / 2n) / scaledDenominator;
  return formatDecimal(rounded, precision);
};

export interface FiatRateEvidence {
  currency: string;
  ratePerUsd: string;
  source: string;
  observedAt: string;
  retrievedAt: string;
  maxAgeSeconds: number;
}

export interface GLRPriceEvidence {
  usdPerGlr: string;
  source: string;
  observedAt: string;
  maxAgeSeconds: number;
}

export interface GLRAIServiceQuote {
  service: typeof GLR_AI_SUMMARY_SERVICE.id;
  serviceVersion: typeof GLR_AI_SUMMARY_SERVICE.version;
  priceGLR: string;
  currency: string;
  fiatReferenceAmount: string | null;
  fiatRateSource: string | null;
  fiatRateObservedAt: string | null;
  glrUsdReferencePrice: string | null;
  glrPriceSource: string | null;
  glrPriceObservedAt: string | null;
  quoteStatus: 'INDICATIVE' | 'GLR_RATE_NOT_CONFIGURED' | 'STALE_FIAT_RATE' | 'STALE_GLR_RATE' | 'NO_RELIABLE_FIAT_RATE';
  executable: false;
  warnings: string[];
}

/** Check whether a timestamp is not in the future and falls within an age limit. */
const timestampWithinAge = (timestamp: number, current: number, maxAgeMs: number): boolean =>
  Number.isFinite(timestamp) && timestamp <= current && current - timestamp <= maxAgeMs;

/** Return true only when both FX timestamps are valid, current, and within age limits. */
const isFresh = (observedAt: string, retrievedAt: string, maxAgeSeconds: number, now: Date): boolean => {
  const observed = Date.parse(observedAt);
  const retrieved = Date.parse(retrievedAt);
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds < 0) return false;
  const current = now.getTime();
  const maxAgeMs = maxAgeSeconds * 1000;
  return timestampWithinAge(observed, current, maxAgeMs)
    && timestampWithinAge(retrieved, current, maxAgeMs);
};

type FiatQuoteFields = {
  fiatReferenceAmount: string | null;
  fiatRateSource: string | null;
  fiatRateObservedAt: string | null;
  fiatStatus: GLRAIServiceQuote['quoteStatus'];
};

/** Return the fixed USD reference tariff without external FX evidence. */
const getUsdFiatQuote = (now: Date): FiatQuoteFields => ({
  fiatReferenceAmount: '0.05',
  fiatRateSource: 'GLORIFIER service tariff (USD reference)',
  fiatRateObservedAt: now.toISOString(),
  fiatStatus: 'INDICATIVE',
});

/** Mark a missing or mismatched FX source as unavailable. */
const getMissingFiatQuote = (): FiatQuoteFields => ({
  fiatReferenceAmount: null,
  fiatRateSource: null,
  fiatRateObservedAt: null,
  fiatStatus: 'NO_RELIABLE_FIAT_RATE',
});

/** Build a stale FX result without publishing a converted amount. */
const getStaleFiatQuote = (rate: FiatRateEvidence): FiatQuoteFields => ({
  fiatReferenceAmount: null,
  fiatRateSource: rate.source || null,
  fiatRateObservedAt: rate.observedAt || null,
  fiatStatus: 'STALE_FIAT_RATE',
});

/** Convert the USD tariff with a fresh foreign-currency rate. */
const getFreshFiatQuote = (rate: FiatRateEvidence): FiatQuoteFields => {
  const decimal = parseDecimal(rate.ratePerUsd, 'Fiat rate');
  const scale = Math.min(6, Math.max(0, decimal.scale));
  const amountUnits = 5n * decimal.units * pow10(scale);
  const divisor = pow10(decimal.scale + 2);
  const rounded = (amountUnits + divisor / 2n) / divisor;
  return {
    fiatReferenceAmount: formatDecimal(rounded, scale),
    fiatRateSource: rate.source,
    fiatRateObservedAt: rate.observedAt,
    fiatStatus: 'INDICATIVE',
  };
};

/** Resolve a supplied FX source as either fresh or stale evidence. */
const getValidatedFiatQuote = (rate: FiatRateEvidence, now: Date): FiatQuoteFields => {
  const decimal = parseDecimal(rate.ratePerUsd, 'Fiat rate');
  const fresh = decimal.units > 0n
    && isFresh(rate.observedAt, rate.retrievedAt, rate.maxAgeSeconds, now);
  return fresh ? getFreshFiatQuote(rate) : getStaleFiatQuote(rate);
};

/** Validate and resolve an indicative fiat amount for a requested currency. */
const getFiatQuote = (currency: string, rate: FiatRateEvidence | null | undefined, now: Date): FiatQuoteFields => {
  if (currency === 'USD') return getUsdFiatQuote(now);
  if (!rate || rate.currency.toUpperCase() !== currency) return getMissingFiatQuote();
  return getValidatedFiatQuote(rate, now);
};

/** Determine quote status from fiat evidence and optional GLR reference pricing. */
const getQuoteStatus = (
  fiatStatus: GLRAIServiceQuote['quoteStatus'],
  glrPrice: GLRPriceEvidence | null | undefined,
  now: Date,
): GLRAIServiceQuote['quoteStatus'] => {
  if (!glrPrice) return fiatStatus === 'INDICATIVE' ? 'GLR_RATE_NOT_CONFIGURED' : fiatStatus;
  const price = parseDecimal(glrPrice.usdPerGlr, 'GLR USD price');
  if (price.units <= 0n) throw new Error('GLR USD price must be greater than zero');
  return isFresh(glrPrice.observedAt, now.toISOString(), glrPrice.maxAgeSeconds, now)
    ? fiatStatus
    : 'STALE_GLR_RATE';
};

/** Keep quote caveats consistent and explicit for both configured and absent GLR pricing. */
const getQuoteWarnings = (glrPrice: GLRPriceEvidence | null | undefined): string[] => {
  const warnings = [
    'Indicative service-price reference only; not an exchange offer, peg, redemption promise, or payment instruction.',
    'The 1 GLR service tariff is not a market valuation of GLR.',
  ];
  warnings.push(glrPrice
    ? 'The GLR/USD reference is operator-configured evidence and is not independently validated by this quote endpoint.'
    : 'No GLR/USD price source is configured; a fiat value for GLR is not presented.');
  return warnings;
};

/** Normalize a three-letter ISO currency code for quote generation. */
const normalizeQuoteCurrency = (currency: string): string => {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error('Currency must be a three-letter ISO currency code');
  return normalized;
};

/** Build a non-executable informational service quote from supplied evidence. */
export const buildGLRAIServiceQuote = (input: {
  currency: string;
  fiatRate?: FiatRateEvidence | null;
  glrPrice?: GLRPriceEvidence | null;
  now?: Date;
}): GLRAIServiceQuote => {
  const now = input.now ?? new Date();
  const currency = normalizeQuoteCurrency(input.currency);
  const fiat = getFiatQuote(currency, input.fiatRate, now);
  const glrPrice = input.glrPrice;
  return {
    service: GLR_AI_SUMMARY_SERVICE.id,
    serviceVersion: GLR_AI_SUMMARY_SERVICE.version,
    priceGLR: GLR_AI_SUMMARY_SERVICE.priceGLR,
    currency,
    fiatReferenceAmount: fiat.fiatReferenceAmount,
    fiatRateSource: fiat.fiatRateSource,
    fiatRateObservedAt: fiat.fiatRateObservedAt,
    glrUsdReferencePrice: glrPrice?.usdPerGlr ?? null,
    glrPriceSource: glrPrice?.source ?? null,
    glrPriceObservedAt: glrPrice?.observedAt ?? null,
    quoteStatus: getQuoteStatus(fiat.fiatStatus, glrPrice, now),
    executable: false,
    warnings: getQuoteWarnings(glrPrice),
  };
};
