import {
  validateA2AConformanceEvidence,
  validatePaidDeliveryEvidence,
  validatePayingCustomerEvidence,
  validateRevenueReconciliationEvidence,
  validateRuntimeSecurityEvidence,
} from './outcome-evidence-gates';
import { test } from 'node:test';

test('outcome-evidence-gates regression suite', async () => {
const digest = 'a'.repeat(64);
const paid = {
  environment: 'production' as const,
  customerRef: 'customer:system-of-record:1',
  paymentIntentRef: 'intent:1',
  settlementRef: 'chain-rpc:tx:1',
  settlementIndependentlyVerified: true,
  deliveryArtifactRef: 'artifact:1',
  deliveryArtifactSha256: digest,
  customerAcceptanceRef: 'acceptance:1',
  reconciled: true,
  unexplainedVarianceMinorUnits: '0',
  evidenceBundleSha256: digest,
};
const paidResult = validatePaidDeliveryEvidence(paid);
if (paidResult.status !== 'VERIFIED' || paidResult.failedChecks.length !== 0 || paidResult.evidenceBundleSha256 !== digest) {
  throw new Error('complete paid-delivery evidence should pass with provenance');
}
const testPayment = validatePaidDeliveryEvidence({ ...paid, environment: 'test' });
if (testPayment.status !== 'NOT VERIFIED' || !testPayment.failedChecks.includes('production_environment')) {
  throw new Error('test-mode payment must fail closed with an explicit reason');
}
if (validatePaidDeliveryEvidence({ ...paid, settlementIndependentlyVerified: false }).status !== 'NOT VERIFIED') {
  throw new Error('unverified payment must fail closed');
}
if (validatePaidDeliveryEvidence({ ...paid, unexplainedVarianceMinorUnits: '1' }).status !== 'NOT VERIFIED') {
  throw new Error('unreconciled variance must fail closed');
}
if (validatePaidDeliveryEvidence({ ...paid, evidenceBundleSha256: 'bad' }).failedChecks.includes('references_and_digests_valid') === false) {
  throw new Error('invalid evidence-bundle digest must be reported');
}
if (validatePaidDeliveryEvidence({ ...paid, customerRef: '   ' }).status !== 'NOT VERIFIED') {
  throw new Error('blank evidence references must fail closed');
}

const customer = {
  environment: 'production' as const,
  customerRef: 'customer:1',
  onboardingCompletedRef: 'onboarding:1',
  independentlyVerifiedSettlementRef: 'settlement:1',
  settlementIndependentlyVerified: true,
  deliveryAcceptanceRef: 'acceptance:1',
  evidenceBundleSha256: digest,
};
if (validatePayingCustomerEvidence(customer).status !== 'VERIFIED') {
  throw new Error('complete production paying-customer evidence should pass');
}
if (validatePayingCustomerEvidence({ ...customer, environment: 'staging' }).status !== 'NOT VERIFIED') {
  throw new Error('staging customer must not count as production customer');
}
if (!validatePayingCustomerEvidence({ ...customer, settlementIndependentlyVerified: false }).failedChecks.includes('settlement_independently_verified')) {
  throw new Error('unverified settlement must be explicitly reported as a failed check');
}

const revenue = {
  environment: 'production' as const,
  ledgerSnapshotRef: 'ledger:1',
  authoritativeSettlementReportRef: 'provider-report:1',
  reconciliationReportRef: 'reconciliation:1',
  reconciled: true,
  unexplainedVarianceMinorUnits: '0',
  evidenceBundleSha256: digest,
};
if (validateRevenueReconciliationEvidence(revenue).status !== 'VERIFIED') {
  throw new Error('zero-variance authoritative reconciliation should pass');
}
if (validateRevenueReconciliationEvidence({ ...revenue, reconciled: false }).status !== 'NOT VERIFIED') {
  throw new Error('unreconciled ledger must fail closed');
}
if (validateRevenueReconciliationEvidence({ ...revenue, unexplainedVarianceMinorUnits: '00' }).status !== 'NOT VERIFIED') {
  throw new Error('non-canonical zero variance must fail closed');
}

const security = {
  environment: 'production' as const,
  runtimeIdentity: 'runtime:immutable-image-digest',
  defaultDenyEgressReportRef: 'report:egress',
  deniedEgressTestPassed: true,
  toolAllowlistReportRef: 'report:tools',
  unauthorizedToolDenied: true,
  auditTrailReportRef: 'report:audit',
  auditTrailComplete: true,
  operatorStopReportRef: 'report:stop',
  operatorStopPassed: true,
  evidenceBundleSha256: digest,
};
if (validateRuntimeSecurityEvidence(security).status !== 'VERIFIED') {
  throw new Error('complete runtime security evidence should pass');
}
if (validateRuntimeSecurityEvidence({ ...security, unauthorizedToolDenied: false }).failedChecks.includes('unauthorized_tool_denied') === false) {
  throw new Error('unauthorized tool access failure must be explicit');
}

const a2a = {
  environment: 'production' as const,
  endpoint: 'https://authorized.example.invalid/a2a',
  runtimeIdentity: 'runtime:immutable-image-digest',
  suiteName: 'A2A v1.0 TCK',
  suiteVersion: 'pinned-suite-version',
  reportRef: 'artifact:a2a-report',
  reportSha256: digest,
  passed: true,
  failedTests: 0,
  skippedTests: 0,
  evidenceBundleSha256: digest,
};
if (validateA2AConformanceEvidence(a2a).status !== 'VERIFIED') {
  throw new Error('complete A2A conformance evidence should pass');
}
if (validateA2AConformanceEvidence({ ...a2a, skippedTests: 1 }).status !== 'NOT VERIFIED') {
  throw new Error('skipped conformance tests must not pass');
}
if (validateA2AConformanceEvidence({ ...a2a, failedTests: 1 }).failedChecks.includes('zero_failed_tests') === false) {
  throw new Error('failed conformance tests must be explicit');
}
if (validateA2AConformanceEvidence({ ...a2a, reportSha256: 'not-a-digest' }).status !== 'NOT VERIFIED') {
  throw new Error('missing report integrity must fail closed');
}

process.stdout.write('OUTCOME_EVIDENCE_GATES_TEST_OK\n');
});
