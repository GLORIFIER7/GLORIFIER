/**
 * GLORIFIER Currency Intelligence Engine — pure, read-only domain primitives.
 *
 * This module calculates indicative quotes from explicitly supplied rate evidence.
 * It does not fetch rates, assert liquidity, custody assets, or execute payments.
 */

export type CurrencyAssetClass =
  | 'fiat'
  | 'bank-deposit'
  | 'e-money'
  | 'commodity-linked'
  | 'stablecoin'
  | 'floating-crypto'
  | 'cbdc'
  | 'tokenized-deposit';

export type CurrencyQuoteStatus =
  | 'VERIFIED_SOURCE'
  | 'INDICATIVE'
  | 'STALE'
  | 'DEGRADED'
  | 'NO_RELIABLE_QUOTE'
  | 'UNSUPPORTED_PAIR'
  | 'NOT_OBSERVABLE';

export interface CurrencyAsset {
  id: string;
  name: string;
  symbol: string;
  assetClass: CurrencyAssetClass;
  decimals: number;
  iso4217?: string;
  issuer?: string;
  jurisdiction?: string;
  chainId?: string;
  contractAddress?: string;
  canonicalIdentityVerified: boolean;
  pegTarget?: string;
  redemptionClaim?: string;
}

export interface CurrencyRateEvidence {
  baseAssetId: string;
  quoteAssetId: string;
  /** Units of quote asset per one unit of base asset. Decimal string only. */
  rate: string;
  source: string;
  observedAt: string;
  retrievedAt: string;
  maxAgeSeconds: number;
  status: 'VERIFIED_SOURCE' | 'INDICATIVE' | 'DEGRADED' | 'NOT_OBSERVABLE';
  /** Optional provider/spread fee in basis points. */
  providerFeeBps?: number;
  /** Optional estimated slippage in basis points; not an execution guarantee. */
  slippageBps?: number;
}

export interface CurrencyQuote {
  status: CurrencyQuoteStatus;
  baseAssetId: string;
  quoteAssetId: string;
  inputAmount: string;
  grossOutputAmount: string | null;
  estimatedFees: string | null;
  estimatedNetOutputAmount: string | null;
  effectiveRate: string | null;
  rateSource: string | null;
  observedAt: string | null;
  retrievedAt: string | null;
  staleAfterSeconds: number | null;
  feeBreakdown: { providerFee: string; estimatedSlippage: string };
  warnings: string[];
  executable: false;
}

const DECIMAL_RE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function parseDecimal(value: string, label: string): { units: bigint; scale: number } {
  if (typeof value !== 'string' || !DECIMAL_RE.test(value)) {
    throw new Error(`${label} must be a non-negative decimal string`);
  }
  const [whole, fraction = ''] = value.split('.');
  return { units: BigInt(whole + fraction), scale: fraction.length };
}

function formatDecimal(units: bigint, scale: number): string {
  if (units < 0n) throw new Error('Amount cannot be negative');
  if (scale <= 0) return units.toString();
  const digits = units.toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

function pow10(n: number): bigint {
  if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error('Invalid decimal precision');
  return 10n ** BigInt(n);
}

function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('Denominator must be positive');
  return (numerator + denominator / 2n) / denominator;
}

function assertBps(value: number | undefined, label: string): number {
  const bps = value ?? 0;
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new Error(`${label} must be an integer between 0 and 10000 basis points`);
  }
  return bps;
}

/** Exact decimal multiplication with explicit target precision and half-up rounding. */
export function multiplyCurrencyAmount(
  amount: string,
  rate: string,
  targetDecimals: number,
): string {
  if (!Number.isInteger(targetDecimals) || targetDecimals < 0 || targetDecimals > 100) {
    throw new Error('Invalid target precision');
  }
  const a = parseDecimal(amount, 'Amount');
  const r = parseDecimal(rate, 'Rate');
  const numerator = a.units * r.units * pow10(targetDecimals);
  const denominator = pow10(a.scale + r.scale);
  return formatDecimal(roundDiv(numerator, denominator), targetDecimals);
}

export function getCurrencyRateStatus(
  evidence: CurrencyRateEvidence,
  now = new Date(),
): CurrencyQuoteStatus {
  const observed = Date.parse(evidence.observedAt);
  const retrieved = Date.parse(evidence.retrievedAt);
  if (!evidence.source.trim() || !Number.isFinite(observed) || !Number.isFinite(retrieved)) {
    return 'NO_RELIABLE_QUOTE';
  }
  if (!Number.isFinite(evidence.maxAgeSeconds) || evidence.maxAgeSeconds < 0) {
    return 'NO_RELIABLE_QUOTE';
  }
  if (now.getTime() < observed || now.getTime() < retrieved) return 'NO_RELIABLE_QUOTE';
  // Both the provider observation and our retrieval must remain within the freshness window.
  // A recently fetched cache entry must not make an old upstream observation look fresh.
  const observedAgeSeconds = (now.getTime() - observed) / 1000;
  const retrievedAgeSeconds = (now.getTime() - retrieved) / 1000;
  if (observedAgeSeconds > evidence.maxAgeSeconds || retrievedAgeSeconds > evidence.maxAgeSeconds) return 'STALE';
  if (evidence.status === 'NOT_OBSERVABLE') return 'NOT_OBSERVABLE';
  if (evidence.status === 'DEGRADED') return 'DEGRADED';
  return evidence.status;
}

/**
 * Build a transparent indicative quote. No external calls and no transaction execution.
 * Unknown or stale rates never turn into a zero-price quote.
 */
export function buildCurrencyQuote(input: {
  amount: string;
  base: CurrencyAsset;
  quote: CurrencyAsset;
  evidence?: CurrencyRateEvidence | null;
  now?: Date;
}): CurrencyQuote {
  const { amount, base, quote, evidence } = input;
  parseDecimal(amount, 'Amount');
  if (!Number.isInteger(base.decimals) || base.decimals < 0 || base.decimals > 100) {
    throw new Error('Invalid base asset decimals');
  }
  if (!Number.isInteger(quote.decimals) || quote.decimals < 0 || quote.decimals > 100) {
    throw new Error('Invalid quote asset decimals');
  }

  const blank = (status: CurrencyQuoteStatus, warning: string): CurrencyQuote => ({
    status,
    baseAssetId: base.id,
    quoteAssetId: quote.id,
    inputAmount: amount,
    grossOutputAmount: null,
    estimatedFees: null,
    estimatedNetOutputAmount: null,
    effectiveRate: null,
    rateSource: evidence?.source ?? null,
    observedAt: evidence?.observedAt ?? null,
    retrievedAt: evidence?.retrievedAt ?? null,
    staleAfterSeconds: evidence?.maxAgeSeconds ?? null,
    feeBreakdown: { providerFee: 'UNKNOWN', estimatedSlippage: 'UNKNOWN' },
    warnings: [warning],
    executable: false,
  });

  if (!evidence || evidence.baseAssetId !== base.id || evidence.quoteAssetId !== quote.id) {
    return blank('UNSUPPORTED_PAIR', 'No matching rate evidence was supplied for this exact asset pair.');
  }
  const status = getCurrencyRateStatus(evidence, input.now ?? new Date());
  if (status === 'STALE') return blank('STALE', 'Rate evidence is stale; request a fresh quote.');
  if (status === 'NO_RELIABLE_QUOTE') return blank('NO_RELIABLE_QUOTE', 'Rate evidence is incomplete or invalid.');
  if (status === 'NOT_OBSERVABLE') return blank('NOT_OBSERVABLE', 'The rate source is not observable.');
  if (status === 'DEGRADED') return blank('DEGRADED', 'The rate source is degraded; no conversion amount is presented.');
  const rate = parseDecimal(evidence.rate, 'Rate');
  if (rate.units <= 0n) return blank('NO_RELIABLE_QUOTE', 'Rate must be greater than zero.');

  const providerFeeBps = assertBps(evidence.providerFeeBps, 'Provider fee');
  const slippageBps = assertBps(evidence.slippageBps, 'Slippage');
  const gross = parseDecimal(multiplyCurrencyAmount(amount, evidence.rate, quote.decimals), 'Gross output');
  const feeBps = providerFeeBps + slippageBps;
  if (feeBps > 10_000) throw new Error('Combined fee and slippage cannot exceed 10000 basis points');
  const providerFeeUnits = roundDiv(gross.units * BigInt(providerFeeBps), 10_000n);
  const slippageUnits = roundDiv(gross.units * BigInt(slippageBps), 10_000n);
  const fees = providerFeeUnits + slippageUnits;
  const net = gross.units - fees;
  const warnings: string[] = ['Indicative quote only; not an executable price or payment instruction.'];
  if (base.assetClass === 'stablecoin' || quote.assetClass === 'stablecoin') {
    warnings.push('Stablecoin price parity, reserves, redemption access, and liquidity are not guaranteed by this quote.');
  }
  if (base.assetClass === 'floating-crypto' || quote.assetClass === 'floating-crypto') {
    warnings.push('Floating crypto-asset prices and liquidity may change materially before settlement.');
  }
  if ((base.chainId && !base.canonicalIdentityVerified) || (quote.chainId && !quote.canonicalIdentityVerified)) {
    warnings.push('At least one token identity is not verified; do not use this quote for settlement.');
  }
  return {
    status,
    baseAssetId: base.id,
    quoteAssetId: quote.id,
    inputAmount: amount,
    grossOutputAmount: formatDecimal(gross.units, gross.scale),
    estimatedFees: formatDecimal(fees, quote.decimals),
    estimatedNetOutputAmount: formatDecimal(net, quote.decimals),
    effectiveRate: evidence.rate,
    rateSource: evidence.source,
    observedAt: evidence.observedAt,
    retrievedAt: evidence.retrievedAt,
    staleAfterSeconds: evidence.maxAgeSeconds,
    feeBreakdown: {
      providerFee: formatDecimal(providerFeeUnits, quote.decimals),
      estimatedSlippage: formatDecimal(slippageUnits, quote.decimals),
    },
    warnings,
    executable: false,
  };
}

/** The registry is illustrative metadata only; it is not a market-rate source. */
export const CURRENCY_INTELLIGENCE_SAMPLE_ASSETS: CurrencyAsset[] = [
  { id: 'fiat:USD', name: 'US Dollar', symbol: 'USD', iso4217: 'USD', assetClass: 'fiat', decimals: 2, jurisdiction: 'United States', canonicalIdentityVerified: true },
  { id: 'fiat:EUR', name: 'Euro', symbol: 'EUR', iso4217: 'EUR', assetClass: 'fiat', decimals: 2, jurisdiction: 'Euro area', canonicalIdentityVerified: true },
  { id: 'fiat:LAK', name: 'Lao Kip', symbol: 'LAK', iso4217: 'LAK', assetClass: 'fiat', decimals: 0, jurisdiction: 'Lao PDR', canonicalIdentityVerified: true },
  { id: 'crypto:GLR:ethereum', name: 'GLORIFIER (Ethereum)', symbol: 'GLR', assetClass: 'floating-crypto', decimals: 18, chainId: '1', contractAddress: '0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb', canonicalIdentityVerified: true },
  { id: 'crypto:GLR:bnb', name: 'GLORIFIER (BNB Chain)', symbol: 'GLR', assetClass: 'floating-crypto', decimals: 18, chainId: '56', contractAddress: '0x5e0B0A449232FDA7cA6Ea3419A50873b08F64804', canonicalIdentityVerified: true },
  { id: 'crypto:GLR:solana', name: 'GLORIFIER (Solana Token-2022)', symbol: 'GLR', assetClass: 'floating-crypto', decimals: 9, chainId: 'solana-mainnet-beta', contractAddress: '7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9', canonicalIdentityVerified: true },
];
