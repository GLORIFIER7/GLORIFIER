import { assertCondition } from './test-assertion';
import { canMarkGLRSettled, normalizeGLRAmount, glrEconomicPolicy } from './glr-economic-layer';
import { before, test } from 'node:test';

before(async () => {
assertCondition(normalizeGLRAmount('001.2300') === '1.23', 'amount normalization should canonicalize decimals');
assertCondition(normalizeGLRAmount(10) === '10', 'numeric compatibility should remain supported');
let rejected = false;
try { normalizeGLRAmount('-1'); } catch { rejected = true; }
assertCondition(rejected, 'negative GLR amounts must be rejected');
rejected = false;
try { normalizeGLRAmount(0.1); } catch { rejected = true; }
assertCondition(rejected, 'fractional JS numbers must be rejected to avoid precision loss');
rejected = false;
try { normalizeGLRAmount('1e3'); } catch { rejected = true; }
assertCondition(rejected, 'scientific notation must be rejected for canonical decimal strings');

const authorizedEvidence = canMarkGLRSettled({
  humanAuthorized: true,
  settlementTxRef: 'tx:example',
  evidenceRef: 'evidence:example'
});
assertCondition(authorizedEvidence.evidenceBacked === true, 'authorized evidence should be evidence-backed');
assertCondition(authorizedEvidence.settled === false, 'evidence references alone must not produce VERIFIED settlement');

const verified = canMarkGLRSettled({
  humanAuthorized: true,
  settlementTxRef: 'tx:example',
  evidenceRef: 'evidence:example',
  externallyVerified: true,
  verificationMethod: 'chain-rpc',
  verifierRef: 'rpc-observation:example'
});
assertCondition(verified.settled === true, 'externally verified settlement should be settleable');
const invalidMethod = canMarkGLRSettled({
  humanAuthorized: true, settlementTxRef: 'tx:example', evidenceRef: 'evidence:example',
  externallyVerified: true, verificationMethod: 'model-assertion' as any, verifierRef: 'agent-claim:example'
});
assertCondition(invalidMethod.settled === false, 'unsupported verification methods must not verify settlement');
const blankEvidence = canMarkGLRSettled({
  humanAuthorized: true, settlementTxRef: '   ', evidenceRef: 'evidence:example',
  externallyVerified: true, verificationMethod: 'chain-rpc', verifierRef: 'rpc-observation:example'
});
assertCondition(blankEvidence.settled === false, 'blank transaction references must not verify settlement');

const unauthorized = canMarkGLRSettled({
  humanAuthorized: false,
  settlementTxRef: 'tx:example',
  evidenceRef: 'evidence:example',
  externallyVerified: true,
  verificationMethod: 'chain-rpc',
  verifierRef: 'rpc-observation:example'
});
assertCondition(unauthorized.settled === false, 'external evidence cannot bypass human authorization');

const policy = glrEconomicPolicy();
assertCondition(policy.positioning === 'GLORIFIER (GLR) — The native economic unit for governed AI-agent commerce.', 'canonical GLR positioning must be present');
assertCondition(policy.asset.authority === 'economic-unit-only', 'GLR must not grant agent authority');

console.log('GLR economic layer tests passed');
});

test('existing assertions completed in setup hook', () => {});
