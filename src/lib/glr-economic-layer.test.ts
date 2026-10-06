import { canMarkGLRSettled, normalizeGLRAmount, glrEconomicPolicy } from './glr-economic-layer';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

expect(normalizeGLRAmount('001.2300') === '1.23', 'amount normalization should canonicalize decimals');
expect(normalizeGLRAmount(10) === '10', 'numeric compatibility should remain supported');
let rejected = false;
try { normalizeGLRAmount('-1'); } catch { rejected = true; }
expect(rejected, 'negative GLR amounts must be rejected');

const authorizedEvidence = canMarkGLRSettled({
  humanAuthorized: true,
  settlementTxRef: 'tx:example',
  evidenceRef: 'evidence:example'
});
expect(authorizedEvidence.evidenceBacked === true, 'authorized evidence should be evidence-backed');
expect(authorizedEvidence.settled === false, 'evidence references alone must not produce VERIFIED settlement');

const verified = canMarkGLRSettled({
  humanAuthorized: true,
  settlementTxRef: 'tx:example',
  evidenceRef: 'evidence:example',
  externallyVerified: true,
  verificationMethod: 'chain-rpc',
  verifierRef: 'rpc-observation:example'
});
expect(verified.settled === true, 'externally verified settlement should be settleable');

const unauthorized = canMarkGLRSettled({
  humanAuthorized: false,
  settlementTxRef: 'tx:example',
  evidenceRef: 'evidence:example',
  externallyVerified: true,
  verificationMethod: 'chain-rpc',
  verifierRef: 'rpc-observation:example'
});
expect(unauthorized.settled === false, 'external evidence cannot bypass human authorization');

const policy = glrEconomicPolicy();
expect(policy.positioning === 'GLORIFIER (GLR) — The native economic unit for governed AI-agent commerce.', 'canonical GLR positioning must be present');
expect(policy.asset.authority === 'economic-unit-only', 'GLR must not grant agent authority');

console.log('GLR economic layer tests passed');
