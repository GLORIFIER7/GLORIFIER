import {
  buildCurrencyQuote,
  getCurrencyRateStatus,
  multiplyCurrencyAmount,
  type CurrencyAsset,
  type CurrencyRateEvidence,
} from './currency-intelligence';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const usd: CurrencyAsset = {
  id: 'fiat:USD', name: 'US Dollar', symbol: 'USD', assetClass: 'fiat',
  decimals: 2, canonicalIdentityVerified: true,
};
const eur: CurrencyAsset = {
  id: 'fiat:EUR', name: 'Euro', symbol: 'EUR', assetClass: 'fiat',
  decimals: 2, canonicalIdentityVerified: true,
};
const now = new Date('2026-10-09T12:00:00.000Z');
const rate: CurrencyRateEvidence = {
  baseAssetId: usd.id, quoteAssetId: eur.id, rate: '0.92345',
  source: 'test-fixture', observedAt: '2026-10-09T11:59:00.000Z',
  retrievedAt: '2026-10-09T11:59:30.000Z', maxAgeSeconds: 300,
  status: 'INDICATIVE', providerFeeBps: 25, slippageBps: 10,
};

expect(multiplyCurrencyAmount('10.00', '0.92345', 2) === '9.23', 'decimal multiplication must round to target precision');
expect(getCurrencyRateStatus(rate, now) === 'INDICATIVE', 'fresh source evidence should retain its indicative status');

const quote = buildCurrencyQuote({ amount: '100', base: usd, quote: eur, evidence: rate, now });
expect(quote.grossOutputAmount === '92.35', 'gross quote should use target precision');
expect(quote.estimatedFees === '0.32', 'fee and slippage estimates should be itemized and summed');
expect(quote.estimatedNetOutputAmount === '92.03', 'net amount should subtract estimated costs');
expect(quote.executable === false, 'quotes must never execute transactions');
expect(quote.warnings.some((item) => item.includes('Indicative quote only')), 'quote should disclose indicative status');

const stale = buildCurrencyQuote({
  amount: '100', base: usd, quote: eur, evidence: { ...rate, observedAt: '2026-10-09T10:00:00.000Z' }, now,
});
expect(stale.status === 'STALE' && stale.grossOutputAmount === null, 'stale rates must not produce an amount');

const unsupported = buildCurrencyQuote({ amount: '100', base: usd, quote: eur });
expect(unsupported.status === 'UNSUPPORTED_PAIR', 'missing evidence must not invent a rate');

let invalidRejected = false;
try { multiplyCurrencyAmount('-1', '2', 2); } catch { invalidRejected = true; }
expect(invalidRejected, 'negative monetary amounts must be rejected');

let invalidFeeRejected = false;
try { buildCurrencyQuote({ amount: '1', base: usd, quote: eur, evidence: { ...rate, providerFeeBps: 10001 }, now }); } catch { invalidFeeRejected = true; }
expect(invalidFeeRejected, 'invalid fee basis points must be rejected');

console.log('Currency Intelligence Engine tests passed.');
