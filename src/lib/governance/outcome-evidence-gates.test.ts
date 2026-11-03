import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateA2AConformanceEvidence,
  validatePaidDeliveryEvidence,
  validatePayingCustomerEvidence,
  validateRevenueReconciliationEvidence,
  validateRuntimeSecurityEvidence,
} from './outcome-evidence-gates';

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

test('paid delivery requires production settlement, delivery and zero-variance reconciliation', () => {
  const result = validatePaidDeliveryEvidence(paid);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.failedChecks.length, 0);
  assert.equal(result.evidenceBundleSha256, digest);
  const testPayment = validatePaidDeliveryEvidence({ ...paid, environment: 'test' });
  assert.equal(testPayment.status, 'NOT VERIFIED');
  assert.ok(testPayment.failedChecks.includes('production_environment'));
  assert.equal(validatePaidDeliveryEvidence({ ...paid, settlementIndependentlyVerified: false }).status, 'NOT VERIFIED');
  assert.equal(validatePaidDeliveryEvidence({ ...paid, unexplainedVarianceMinorUnits: '1' }).status, 'NOT VERIFIED');
  assert.equal(validatePaidDeliveryEvidence({ ...paid, evidenceBundleSha256: 'bad' }).failedChecks.includes('references_and_digests_valid'), true);
  assert.equal(validatePaidDeliveryEvidence({ ...paid, customerRef: '   ' }).status, 'NOT VERIFIED');
});

const customer = {
  environment: 'production' as const,
  customerRef: 'customer:1',
  onboardingCompletedRef: 'onboarding:1',
  independentlyVerifiedSettlementRef: 'settlement:1',
  settlementIndependentlyVerified: true,
  deliveryAcceptanceRef: 'acceptance:1',
  evidenceBundleSha256: digest,
};

test('paying customer evidence requires production settlement and delivery acceptance', () => {
  assert.equal(validatePayingCustomerEvidence(customer).status, 'VERIFIED');
  assert.equal(validatePayingCustomerEvidence({ ...customer, environment: 'staging' }).status, 'NOT VERIFIED');
  assert.ok(validatePayingCustomerEvidence({ ...customer, settlementIndependentlyVerified: false }).failedChecks.includes('settlement_independently_verified'));
});

const revenue = {
  environment: 'production' as const,
  ledgerSnapshotRef: 'ledger:1',
  authoritativeSettlementReportRef: 'provider-report:1',
  reconciliationReportRef: 'reconciliation:1',
  reconciled: true,
  unexplainedVarianceMinorUnits: '0',
  evidenceBundleSha256: digest,
};

test('revenue reconciliation requires an authoritative zero-variance production ledger', () => {
  assert.equal(validateRevenueReconciliationEvidence(revenue).status, 'VERIFIED');
  assert.equal(validateRevenueReconciliationEvidence({ ...revenue, reconciled: false }).status, 'NOT VERIFIED');
  assert.equal(validateRevenueReconciliationEvidence({ ...revenue, unexplainedVarianceMinorUnits: '00' }).status, 'NOT VERIFIED');
});

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

test('runtime security evidence requires deny-egress, tool isolation, audit and stop controls', () => {
  assert.equal(validateRuntimeSecurityEvidence(security).status, 'VERIFIED');
  assert.ok(validateRuntimeSecurityEvidence({ ...security, unauthorizedToolDenied: false }).failedChecks.includes('unauthorized_tool_denied'));
});

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

test('A2A conformance requires zero failed and skipped tests with report integrity', () => {
  assert.equal(validateA2AConformanceEvidence(a2a).status, 'VERIFIED');
  assert.equal(validateA2AConformanceEvidence({ ...a2a, skippedTests: 1 }).status, 'NOT VERIFIED');
  assert.ok(validateA2AConformanceEvidence({ ...a2a, failedTests: 1 }).failedChecks.includes('zero_failed_tests'));
  assert.equal(validateA2AConformanceEvidence({ ...a2a, reportSha256: 'not-a-digest' }).status, 'NOT VERIFIED');
});
