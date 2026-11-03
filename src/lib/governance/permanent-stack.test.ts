import {
  authorizePermanentStackAction,
  createEvidenceReceipt,
  getPermanentGlorifierStack,
  validatePermanentStack,
  verifyEconomicTruth
} from './permanent-stack';
import { before, test } from 'node:test';

let assertionsCompleted = false;

before(async () => {
const stack = getPermanentGlorifierStack();
const validation = validatePermanentStack(stack);
if (!validation.valid) throw new Error(validation.errors.join('; '));
if (stack.orchestration.implicitFallback) throw new Error('implicit fallback invariant failed');
if (!stack.humanAuthority.finalControl) throw new Error('human authority invariant failed');

const merge = authorizePermanentStackAction({
  capability: stack.capabilities.find(x => x.id === 'repository-merge')!,
  authorityGranted: true
});
if (merge.allowed || !merge.requiresHumanApproval) throw new Error('irreversible action must require human approval');

const receipt = createEvidenceReceipt({
  sourceRef: 'test:external',
  observedAt: new Date().toISOString(),
  externallyVerifiable: true,
  verificationStatus: 'verified',
  content: { amount: 10, currency: 'USD' }
});
const truth = verifyEconomicTruth({
  id: 'economic-test',
  kind: 'verified-value',
  amount: 10,
  currency: 'USD',
  metric: 'test value',
  truthStatus: 'verified',
  evidenceRefs: [receipt.id]
}, [receipt]);
if (!truth.verified) throw new Error(truth.reason);

console.log('Permanent GLORIFIER stack invariants: PASS');
  assertionsCompleted = true;
});

test('existing assertions completed in setup hook', () => {
  assert.ok(assertionsCompleted, 'existing assertions completed before the test case');
});
