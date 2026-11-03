import assert from 'node:assert/strict';
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
  assert.equal(paidResult.status, 'VERIFIED', 'complete paid-delivery evidence should pass');
  assert.equal(paidResult.failedChecks.length, 0, 'complete paid-delivery evidence should have no failed checks');
  assert.equal(paidResult.evidenceBundleSha256, digest, 'verified result should preserve provenance');

  const testPayment = validatePaidDeliveryEvidence({ ...paid, environment: 'test' });
  assert.equal(testPayment.status, 'NOT VERIFIED', 'test-mode payment must fail closed');
  assert.ok(testPayment.failedChecks.includes('production_environment'), 'test-mode failure should be explicit');

  assert.equal(
    validatePaidDeliveryEvidence({ ...paid, settlementIndependentlyVerified: false }).status,
    'NOT VERIFIED',
    'unverified payment must fail closed',
  );
  assert.equal(
    validatePaidDeliveryEvidence({ ...paid, unexplainedVarianceMinorUnits: '1' }).status,
    'NOT VERIFIED',
    'unreconciled variance must fail closed',
  );
  assert.ok(
    validatePaidDeliveryEvidence({ ...paid, evidenceBundleSha256: 'bad' }).failedChecks.includes('references_and_digests_valid'),
    'invalid evidence-bundle digest must be reported',
  );
  assert.equal(
    validatePaidDeliveryEvidence({ ...paid, customerRef: '   ' }).status,
    'NOT VERIFIED',
    'blank evidence references must fail closed',
  );

  const customer = {
    environment: 'production' as const,
    customerRef: 'customer:1',
    onboardingCompletedRef: 'onboarding:1',
    independentlyVerifiedSettlementRef: 'settlement:1',
    settlementIndependentlyVerified: true,
    deliveryAcceptanceRef: 'acceptance:1',
    evidenceBundleSha256: digest,
  };
  assert.equal(
    validatePayingCustomerEvidence(customer).status,
    'VERIFIED',
    'complete production paying-customer evidence should pass',
  );
  assert.equal(
    validatePayingCustomerEvidence({ ...customer, environment: 'staging' }).status,
    'NOT VERIFIED',
    'staging customer must not count as production customer',
  );
  assert.ok(
    validatePayingCustomerEvidence({ ...customer, settlementIndependentlyVerified: false }).failedChecks.includes('settlement_independently_verified'),
    'unverified settlement must be explicitly reported as a failed check',
  );

  const revenue = {
    environment: 'production' as const,
    ledgerSnapshotRef: 'ledger:1',
    authoritativeSettlementReportRef: 'provider-report:1',
    reconciliationReportRef: 'reconciliation:1',
    reconciled: true,
    unexplainedVarianceMinorUnits: '0',
    evidenceBundleSha256: digest,
  };
  assert.equal(
    validateRevenueReconciliationEvidence(revenue).status,
    'VERIFIED',
    'zero-variance authoritative reconciliation should pass',
  );
  assert.equal(
    validateRevenueReconciliationEvidence({ ...revenue, reconciled: false }).status,
    'NOT VERIFIED',
    'unreconciled ledger must fail closed',
  );
  assert.equal(
    validateRevenueReconciliationEvidence({ ...revenue, unexplainedVarianceMinorUnits: '00' }).status,
    'NOT VERIFIED',
    'non-canonical zero variance must fail closed',
  );

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
  assert.equal(
    validateRuntimeSecurityEvidence(security).status,
    'VERIFIED',
    'complete runtime security evidence should pass',
  );
  assert.ok(
    validateRuntimeSecurityEvidence({ ...security, unauthorizedToolDenied: false }).failedChecks.includes('unauthorized_tool_denied'),
    'unauthorized tool access failure must be explicit',
  );

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
  assert.equal(
    validateA2AConformanceEvidence(a2a).status,
    'VERIFIED',
    'complete A2A conformance evidence should pass',
  );
  assert.equal(
    validateA2AConformanceEvidence({ ...a2a, skippedTests: 1 }).status,
    'NOT VERIFIED',
    'skipped conformance tests must not pass',
  );
  assert.ok(
    validateA2AConformanceEvidence({ ...a2a, failedTests: 1 }).failedChecks.includes('zero_failed_tests'),
    'failed conformance tests must be explicit',
  );
  assert.equal(
    validateA2AConformanceEvidence({ ...a2a, reportSha256: 'not-a-digest' }).status,
    'NOT VERIFIED',
    'invalid report integrity must fail closed',
  );

  const successMarker = 'OUTCOME_EVIDENCE_GATES_TEST_OK\n';
  assert.equal(
    successMarker,
    `OUTCOME_EVIDENCE_GATES_TEST_OK${String.fromCharCode(10)}`,
    'success marker must end with a real newline for CI log parsing',
  );
  process.stdout.write(successMarker);
});
