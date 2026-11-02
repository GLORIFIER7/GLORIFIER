import { assertCondition } from './test-assertion';
import {
  buildCurrencyQuote,
  getCurrencyRateStatus,
  multiplyCurrencyAmount,
  type CurrencyAsset,
  type CurrencyRateEvidence,
} from './currency-intelligence';


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

assertCondition(multiplyCurrencyAmount('10.00', '0.92345', 2) === '9.23', 'decimal multiplication must round to target precision');
assertCondition(getCurrencyRateStatus(rate, now) === 'INDICATIVE', 'fresh source evidence should retain its indicative status');

const quote = buildCurrencyQuote({ amount: '100', base: usd, quote: eur, evidence: rate, now });
assertCondition(quote.grossOutputAmount === '92.35', 'gross quote should use target precision');
assertCondition(quote.estimatedFees === '0.32', 'fee and slippage estimates should be itemized and summed');
assertCondition(quote.estimatedNetOutputAmount === '92.03', 'net amount should subtract estimated costs');
assertCondition(quote.executable === false, 'quotes must never execute transactions');
assertCondition(quote.warnings.some((item) => item.includes('Indicative quote only')), 'quote should disclose indicative status');

const stale = buildCurrencyQuote({
  amount: '100', base: usd, quote: eur, evidence: { ...rate, observedAt: '2026-10-09T10:00:00.000Z' }, now,
});
assertCondition(stale.status === 'STALE' && stale.grossOutputAmount === null, 'stale rates must not produce an amount');

const staleRetrieved = buildCurrencyQuote({
  amount: '100', base: usd, quote: eur,
  evidence: { ...rate, retrievedAt: '2026-10-09T11:50:00.000Z' }, now,
});
assertCondition(staleRetrieved.status === 'STALE' && staleRetrieved.grossOutputAmount === null,
  'recently observed but old retrieved evidence must not produce an amount');

const futureRetrieved = getCurrencyRateStatus({
  ...rate, retrievedAt: '2026-10-09T12:01:00.000Z',
}, now);
assertCondition(futureRetrieved === 'NO_RELIABLE_QUOTE', 'future retrieval timestamps must fail closed');

const unsupported = buildCurrencyQuote({ amount: '100', base: usd, quote: eur });
assertCondition(unsupported.status === 'UNSUPPORTED_PAIR', 'missing evidence must not invent a rate');

let invalidRejected = false;
try { multiplyCurrencyAmount('-1', '2', 2); } catch { invalidRejected = true; }
assertCondition(invalidRejected, 'negative monetary amounts must be rejected');

let invalidFeeRejected = false;
try { buildCurrencyQuote({ amount: '1', base: usd, quote: eur, evidence: { ...rate, providerFeeBps: 10001 }, now }); } catch { invalidFeeRejected = true; }
assertCondition(invalidFeeRejected, 'invalid fee basis points must be rejected');

const tinyGross = buildCurrencyQuote({
  amount: '0.01', base: usd, quote: eur,
  evidence: { ...rate, rate: '1', providerFeeBps: 5000, slippageBps: 5000 }, now,
});
assertCondition(tinyGross.estimatedNetOutputAmount === '0', 'rounded fee components must never produce a negative net amount');
assertCondition(tinyGross.estimatedFees === '0.01' && tinyGross.grossOutputAmount === '0.01',
  'combined rounded fee estimates must be capped at gross output using exact decimal strings');

const malformedSourceStatus = getCurrencyRateStatus({
  ...rate, source: undefined as unknown as string,
}, now);
assertCondition(malformedSourceStatus === 'NO_RELIABLE_QUOTE', 'malformed source metadata must fail closed instead of throwing');

console.log('Currency Intelligence Engine tests passed.');
