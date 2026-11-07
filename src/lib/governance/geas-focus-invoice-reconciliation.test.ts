import assert from 'node:assert/strict';
import { compareCodeUnits } from '../deterministic-string-order';
import { reconcileFocusInvoice, type FocusInvoiceCharge } from './geas-focus-invoice-reconciliation';
import test from 'node:test';

test("GEAS FOCUS invoice reconciliation regression cases", () => {
  
  const billingPeriod = {
    billingPeriodStart: '2026-01-01T00:00:00Z',
    billingPeriodEnd: '2026-02-01T00:00:00Z',
  };
  const invoiceIssuerName = 'Example Cloud Billing';
  const invoiceId = 'INV-2026-001';
  const billingCurrency = 'USD';
  
  const charge = (
    invoiceDetailId: string | null,
    chargeCategory: string,
    billedCost: string,
    overrides: Partial<FocusInvoiceCharge> = {},
  ): FocusInvoiceCharge => ({
    invoiceIssuerName,
    invoiceId,
    ...billingPeriod,
    invoiceDetailId,
    chargeCategory,
    billingCurrency,
    billedCost,
    ...overrides,
  });
  
  const input = {
    invoiceIssuerName,
    invoiceId,
    ...billingPeriod,
    billingCurrency,
    invoiceIssuerSupportsPayableInvoices: false,
    roundingTolerance: '0.01',
    costAndUsage: [
      charge('line-1', 'Usage', '4.00'),
      charge('line-1', 'Usage', '6.00'),
      charge('line-2', 'Usage', '20.005'),
    ] satisfies FocusInvoiceCharge[],
    invoiceDetail: [
      charge('line-1', 'Usage', '10.00'),
      charge('line-2', 'Usage', '20.00'),
      charge('tax-1', 'Tax', '2.40'),
    ] satisfies FocusInvoiceCharge[],
  };
  
  const aligned = reconcileFocusInvoice(input);
  assert.equal(aligned.status, 'RECONCILED');
  assert.equal(aligned.evidenceClass, 'analysis');
  assert.equal(aligned.reconciliationScope, 'provided-dataset-consistency-only');
  assert.equal(aligned.reconciliationBasis, 'non-tax-line-items-only', 'RECONCILED must not imply tax amounts were compared');
  assert.equal(aligned.billingPeriodStart, billingPeriod.billingPeriodStart);
  assert.equal(aligned.billingPeriodEnd, billingPeriod.billingPeriodEnd);
  assert.equal(aligned.costAndUsageNonTaxTotal, '30.005');
  assert.equal(aligned.invoiceDetailNonTaxTotal, '30');
  assert.equal(aligned.costAndUsageTaxTotal, '0');
  assert.equal(aligned.invoiceDetailTaxTotal, '2.4');
  assert.equal(aligned.invoiceDetailGrandTotal, '32.4');
  assert.equal(aligned.lineItems.find((item) => item.invoiceDetailId === 'line-2')?.withinTolerance, true);
  assert.deepEqual(aligned.reasons, []);
  
  const localeSortedIds = ['line-z', 'line-ä', 'line-a', `line-a${String.fromCharCode(0x200b)}`];
  const localeSortedRows = localeSortedIds.map((invoiceDetailId) => ({
    ...input.costAndUsage[0],
    invoiceDetailId,
    billedCost: '1.00',
  }));
  const localeSortedResult = reconcileFocusInvoice({
    ...input,
    costAndUsage: localeSortedRows,
    invoiceDetail: localeSortedRows.map((row) => ({ ...row })),
  });
  assert.deepEqual(
    localeSortedResult.lineItems.map((item) => item.invoiceDetailId),
    [...localeSortedIds].sort(compareCodeUnits),
    'invoice line items must use a deterministic locale-aware order for non-ASCII identifiers',
  );
  const reversedLocaleSortedRows = [...localeSortedRows].reverse();
  const reversedLocaleSortedResult = reconcileFocusInvoice({
    ...input,
    costAndUsage: reversedLocaleSortedRows,
    invoiceDetail: reversedLocaleSortedRows.map((row) => ({ ...row })),
  });
  assert.deepEqual(
    reversedLocaleSortedResult.lineItems.map((item) => item.invoiceDetailId),
    [...localeSortedIds].sort((left, right) => left < right ? -1 : left > right ? 1 : 0),
    'FOCUS line-item order must remain stable when input order changes, including locale-collation ties',
  );
  
  const variance = reconcileFocusInvoice({
    ...input,
    costAndUsage: input.costAndUsage.map((row) => row.invoiceDetailId === 'line-2' ? { ...row, billedCost: '21.00' } : row),
  });
  assert.equal(variance.status, 'VARIANCE');
  assert.ok(variance.reasons.some((reason) => reason.includes('exceeds tolerance')));
  
  const missingMapping = reconcileFocusInvoice({
    ...input,
    costAndUsage: input.costAndUsage.filter((row) => row.invoiceDetailId !== 'line-2'),
  });
  assert.equal(missingMapping.status, 'UNKNOWN');
  assert.equal(missingMapping.reconciliationBasis, 'non-tax-line-items-only');
  assert.ok(missingMapping.reasons.some((reason) => reason.includes('not present in both datasets')));
  
  const zeroAmountMissingMapping = reconcileFocusInvoice({
    ...input,
    costAndUsage: input.costAndUsage.filter((row) => row.invoiceDetailId !== 'line-2'),
    invoiceDetail: input.invoiceDetail.map((row) => row.invoiceDetailId === 'line-2' ? { ...row, billedCost: '0.00' } : row),
  });
  assert.equal(zeroAmountMissingMapping.status, 'UNKNOWN');
  assert.equal(
    zeroAmountMissingMapping.lineItems.find((item) => item.invoiceDetailId === 'line-2')?.withinTolerance,
    false,
    'a missing dataset mapping must not be reported within tolerance even when the present amount is zero',
  );
  
  const largeCount = 70_000;
  const largeUsage = Array.from({ length: largeCount }, (_, index) => ({
    ...input.costAndUsage[0],
    invoiceDetailId: `large-${index}`,
    billedCost: '1.00',
  }));
  const largeDetail = largeUsage.map((row) => ({ ...row }));
  const largeDatasetResult = reconcileFocusInvoice({
    ...input,
    costAndUsage: largeUsage,
    invoiceDetail: largeDetail,
  });
  assert.equal(largeDatasetResult.status, 'RECONCILED', 'large valid FOCUS datasets must not fail due to argument-count limits');
  
  const duplicateInvoiceDetailId = reconcileFocusInvoice({
    ...input,
    invoiceDetail: [...input.invoiceDetail, { ...input.invoiceDetail[0] }],
  });
  assert.equal(duplicateInvoiceDetailId.status, 'UNKNOWN');
  assert.ok(duplicateInvoiceDetailId.reasons.some((reason) => reason.includes('unique within the invoice')));
  
  const currencyMismatch = reconcileFocusInvoice({
    ...input,
    costAndUsage: input.costAndUsage.map((row) => row.invoiceDetailId === 'line-1' ? { ...row, billingCurrency: 'EUR' } : row),
  });
  assert.equal(currencyMismatch.status, 'UNKNOWN');
  assert.ok(currencyMismatch.reasons.some((reason) => reason.includes('billing-currency mismatch')));
  
  const invalidAmount = reconcileFocusInvoice({
    ...input,
    costAndUsage: input.costAndUsage.map((row) => row.invoiceDetailId === 'line-1' ? { ...row, billedCost: '1e3' } : row),
  });
  assert.equal(invalidAmount.status, 'UNKNOWN');
  assert.ok(invalidAmount.reasons.some((reason) => reason.includes('missing or invalid required fields')));
  
  
  const missingBillingPeriod = reconcileFocusInvoice({
    ...input,
    billingPeriodStart: undefined as unknown as string,
  });
  assert.equal(missingBillingPeriod.status, 'UNKNOWN');
  assert.ok(missingBillingPeriod.reasons.some((reason) => reason.includes('FOCUS UTC ISO 8601 format')));
  
  const mismatchedBillingPeriod = reconcileFocusInvoice({
    ...input,
    invoiceDetail: input.invoiceDetail.map((row) => row.invoiceDetailId === 'line-1'
      ? { ...row, billingPeriodStart: '2026-02-01T00:00:00Z', billingPeriodEnd: '2026-03-01T00:00:00Z' }
      : row),
  });
  assert.equal(mismatchedBillingPeriod.status, 'UNKNOWN');
  assert.ok(mismatchedBillingPeriod.reasons.some((reason) => reason.includes('billing-period mismatch')));
  
  const invalidCostAndUsageRowPeriod = reconcileFocusInvoice({
    ...input,
    costAndUsage: input.costAndUsage.map((row) => row.invoiceDetailId === 'line-1'
      ? { ...row, billingPeriodStart: '2026-02-30T00:00:00Z', billingPeriodEnd: '2026-03-01T00:00:00Z' }
      : row),
  });
  assert.equal(invalidCostAndUsageRowPeriod.status, 'UNKNOWN');
  assert.ok(invalidCostAndUsageRowPeriod.reasons.some((reason) => reason.includes('invalid FOCUS UTC billing-period bounds')));
  
  const invalidInvoiceDetailRowPeriod = reconcileFocusInvoice({
    ...input,
    invoiceDetail: input.invoiceDetail.map((row) => row.invoiceDetailId === 'line-1'
      ? { ...row, billingPeriodStart: '2026-02-30T00:00:00Z', billingPeriodEnd: '2026-03-01T00:00:00Z' }
      : row),
  });
  assert.equal(invalidInvoiceDetailRowPeriod.status, 'UNKNOWN');
  assert.ok(invalidInvoiceDetailRowPeriod.reasons.some((reason) => reason.includes('invalid FOCUS UTC billing-period bounds')));
  
  const invalidUtcOffset = reconcileFocusInvoice({
    ...input,
    billingPeriodStart: '2026-01-01T00:00:00+00:00',
  });
  assert.equal(invalidUtcOffset.status, 'UNKNOWN');
  assert.ok(invalidUtcOffset.reasons.some((reason) => reason.includes('FOCUS UTC ISO 8601 format')));
  
  const invalidCalendarDate = reconcileFocusInvoice({
    ...input,
    billingPeriodStart: '2026-02-30T00:00:00Z',
  });
  assert.equal(invalidCalendarDate.status, 'UNKNOWN');
  assert.ok(invalidCalendarDate.reasons.some((reason) => reason.includes('FOCUS UTC ISO 8601 format')));
  
  const whitespaceTimestamp = reconcileFocusInvoice({
    ...input,
    billingPeriodStart: ' 2026-01-01T00:00:00Z',
  });
  assert.equal(whitespaceTimestamp.status, 'UNKNOWN');
  assert.ok(whitespaceTimestamp.reasons.some((reason) => reason.includes('FOCUS UTC ISO 8601 format')));
  
  const lowercaseZulu = reconcileFocusInvoice({
    ...input,
    billingPeriodStart: '2026-01-01T00:00:00z',
  });
  assert.equal(lowercaseZulu.status, 'UNKNOWN');
  assert.ok(lowercaseZulu.reasons.some((reason) => reason.includes('FOCUS UTC ISO 8601 format')));
  
  const fractionalSeconds = reconcileFocusInvoice({
    ...input,
    billingPeriodStart: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(fractionalSeconds.status, 'UNKNOWN');
  assert.ok(fractionalSeconds.reasons.some((reason) => reason.includes('FOCUS UTC ISO 8601 format')));
  
  const reversedBillingPeriod = reconcileFocusInvoice({
    ...input,
    billingPeriodStart: '2026-02-01T00:00:00Z',
    billingPeriodEnd: '2026-01-01T00:00:00Z',
  });
  assert.equal(reversedBillingPeriod.status, 'UNKNOWN');
  assert.ok(reversedBillingPeriod.reasons.some((reason) => reason.includes('billing period end must be later')));
  
  const missingTolerance = reconcileFocusInvoice({
    ...input,
    roundingTolerance: undefined as unknown as string,
  });
  assert.equal(missingTolerance.status, 'UNKNOWN');
  assert.ok(missingTolerance.reasons.some((reason) => reason.includes('explicit decimal rounding tolerance')));
  
  const wrongInvoice = reconcileFocusInvoice({
    ...input,
    invoiceDetail: input.invoiceDetail.map((row) => row.invoiceDetailId === 'line-1' ? { ...row, invoiceId: 'INV-OTHER' } : row),
  });
  assert.equal(wrongInvoice.status, 'UNKNOWN');
  assert.ok(wrongInvoice.reasons.some((reason) => reason.includes('outside the target invoice')));
  
  
  
  
  const payableBillingPeriod = {
    invoiceIssuerName,
    ...billingPeriod,
    billingPeriodCreated: '2026-02-02T00:00:00Z',
    billingPeriodLastUpdated: '2026-02-03T00:00:00Z',
    billingPeriodStatus: 'Closed',
  };
  
  const unknownIssuerCapability = reconcileFocusInvoice({
    ...input,
    invoiceIssuerSupportsPayableInvoices: undefined as unknown as boolean,
  });
  assert.equal(unknownIssuerCapability.status, 'UNKNOWN');
  assert.ok(unknownIssuerCapability.reasons.some((reason) =>
    reason.includes('invoice issuer payable-invoice support must be explicitly true or false'),
  ));
  
  const explicitUnsupportedIssuer = {
    ...input,
    invoiceIssuerSupportsPayableInvoices: false,
  };
  assert.equal(
    reconcileFocusInvoice(explicitUnsupportedIssuer).status,
    'RECONCILED',
    'issuers explicitly not supporting payable invoices may omit the Billing Period dataset',
  );
  
  const payableIssuerMissingBillingPeriod = {
    ...input,
    invoiceIssuerSupportsPayableInvoices: true,
  };
  const missingRequiredBillingPeriodResult = reconcileFocusInvoice(payableIssuerMissingBillingPeriod);
  assert.equal(missingRequiredBillingPeriodResult.status, 'UNKNOWN');
  assert.ok(missingRequiredBillingPeriodResult.reasons.some((reason) =>
    reason.includes('BillingPeriod dataset is required when the invoice issuer supports payable invoices'),
  ));
  
  const payableIssuerWithBillingPeriod = {
    ...input,
    invoiceIssuerSupportsPayableInvoices: true,
    billingPeriod: [payableBillingPeriod],
  };
  assert.equal(
    reconcileFocusInvoice(payableIssuerWithBillingPeriod).status,
    'RECONCILED',
    'a unique Billing Period record joined by issuer and period start should be admitted',
  );
  
  const mismatchedBillingPeriodDataset = reconcileFocusInvoice({
    ...input,
    invoiceIssuerSupportsPayableInvoices: true,
    billingPeriod: [{
      ...payableBillingPeriod,
      billingPeriodStart: '2026-02-01T00:00:00Z',
      billingPeriodEnd: '2026-03-01T00:00:00Z',
    }],
  });
  assert.equal(mismatchedBillingPeriodDataset.status, 'UNKNOWN');
  assert.ok(mismatchedBillingPeriodDataset.reasons.some((reason) =>
    reason.includes('BillingPeriod record does not match the target invoice issuer and billing period'),
  ));
  
  const malformedBillingPeriodTimestamp = reconcileFocusInvoice({
    ...input,
    invoiceIssuerSupportsPayableInvoices: true,
    billingPeriod: [{
      ...payableBillingPeriod,
      billingPeriodCreated: '2026-02-30T00:00:00Z',
    }],
  });
  assert.equal(malformedBillingPeriodTimestamp.status, 'UNKNOWN');
  assert.ok(malformedBillingPeriodTimestamp.reasons.some((reason) =>
    reason.includes('BillingPeriod row 0 has invalid FOCUS UTC timestamps or period bounds'),
  ));
  
  const duplicateBillingPeriodKey = reconcileFocusInvoice({
    ...input,
    invoiceIssuerSupportsPayableInvoices: true,
    billingPeriod: [payableBillingPeriod, { ...payableBillingPeriod }],
  });
  assert.equal(duplicateBillingPeriodKey.status, 'UNKNOWN');
  assert.ok(duplicateBillingPeriodKey.reasons.some((reason) =>
    reason.includes('BillingPeriod must contain unique InvoiceIssuerName and BillingPeriodStart keys'),
  ));
  
  const invalidBillingPeriodStatus = reconcileFocusInvoice({
    ...input,
    invoiceIssuerSupportsPayableInvoices: true,
    billingPeriod: [{
      ...payableBillingPeriod,
      billingPeriodStatus: 'Pending',
    }],
  });
  assert.equal(invalidBillingPeriodStatus.status, 'UNKNOWN');
  assert.ok(invalidBillingPeriodStatus.reasons.some((reason) =>
    reason.includes('BillingPeriod row 0 has a status outside the FOCUS 1.4 allowed values Open or Closed'),
  ));
  
  
  
  const payableIssuerOpenBillingPeriod = {
    ...input,
    invoiceIssuerSupportsPayableInvoices: true,
    billingPeriod: [{
      ...payableBillingPeriod,
      billingPeriodStatus: 'Open',
    }],
  };
  assert.equal(reconcileFocusInvoice(payableIssuerOpenBillingPeriod).status, 'RECONCILED');
  assert.equal(reconcileFocusInvoice(payableIssuerOpenBillingPeriod).billingPeriodStatus, 'Open');
  

  const multiCurrencySettlement = reconcileFocusInvoice({
    ...input,
    costAndUsage: [
      charge('line-usage', 'Usage', '3.03'),
      charge('line-tax', 'Tax', '0.30'),
    ],
    invoiceDetail: [
      charge('line-usage', 'Usage', '3.03', {
        paymentCurrency: 'AUD',
        paymentCurrencyBilledCost: '0.00',
        paymentCurrencyInvoiceDetailId: 'line-settlement',
      }),
      charge('line-tax', 'Tax', '0.30', {
        paymentCurrency: 'AUD',
        paymentCurrencyBilledCost: '0.00',
        paymentCurrencyInvoiceDetailId: 'line-settlement',
      }),
      charge('line-settlement', 'Adjustment', '0.00', {
        paymentCurrency: 'AUD',
        paymentCurrencyBilledCost: '5.17',
        paymentCurrencyInvoiceDetailId: 'line-settlement',
      }),
    ],
  });
  assert.equal(
    multiCurrencySettlement.status,
    'RECONCILED',
    'the payment-currency aggregate record with zero billing-currency cost must not create a false missing usage mapping',
  );
  const multiCurrencyEvidence = multiCurrencySettlement as unknown as {
    paymentCurrencyStatus?: string;
    paymentCurrencyGroups?: Array<{
      paymentCurrency: string;
      paymentCurrencyInvoiceDetailId: string;
      billingCurrencyBilledCost: string;
      paymentCurrencyBilledCost: string;
    }>;
  };
  assert.equal(multiCurrencyEvidence.paymentCurrencyStatus, 'ANALYZED');
  assert.deepEqual(multiCurrencyEvidence.paymentCurrencyGroups, [{
    paymentCurrency: 'AUD',
    paymentCurrencyInvoiceDetailId: 'line-settlement',
    billingCurrencyBilledCost: '3.33',
    paymentCurrencyBilledCost: '5.17',
  }]);

  const partialPaymentCurrencyDataset = reconcileFocusInvoice({
    ...input,
    costAndUsage: [
      charge('line-1', 'Usage', '10.00'),
      charge('line-2', 'Usage', '20.00'),
    ],
    invoiceDetail: [
      charge('line-1', 'Usage', '10.00', {
        paymentCurrency: 'AUD',
        paymentCurrencyBilledCost: '9.00',
        paymentCurrencyInvoiceDetailId: 'line-1',
      }),
      charge('line-2', 'Usage', '20.00'),
    ],
  });
  assert.equal(partialPaymentCurrencyDataset.status, 'UNKNOWN');
  assert.ok(partialPaymentCurrencyDataset.reasons.some((reason) =>
    reason.includes('PaymentCurrency fields must be provided for every InvoiceDetail row'),
  ));
  assert.equal(partialPaymentCurrencyDataset.paymentCurrencyStatus, 'UNKNOWN');

  const brokenPaymentCurrencyLineage = reconcileFocusInvoice({
    ...input,
    invoiceDetail: input.invoiceDetail.map((row) => ({
      ...row,
      paymentCurrency: 'AUD',
      paymentCurrencyBilledCost: '1.00',
      paymentCurrencyInvoiceDetailId: 'missing-aggregate-row',
    })),
  });
  assert.equal(brokenPaymentCurrencyLineage.status, 'UNKNOWN');
  assert.ok(brokenPaymentCurrencyLineage.reasons.some((reason) =>
    reason.includes('PaymentCurrencyInvoiceDetailId'),
  ));
  const brokenPaymentEvidence = brokenPaymentCurrencyLineage as unknown as { paymentCurrencyStatus?: string };
  assert.equal(brokenPaymentEvidence.paymentCurrencyStatus, 'UNKNOWN');

  const taxComparable = reconcileFocusInvoice({
    ...input,
    costAndUsage: [...input.costAndUsage, charge('tax-1', 'Tax', '2.40')],
  });
  const taxComparableEvidence = taxComparable as unknown as {
    taxReconciliationStatus?: string;
    taxVariance?: string | null;
  };
  assert.equal(taxComparableEvidence.taxReconciliationStatus, 'RECONCILED');
  assert.equal(taxComparableEvidence.taxVariance, '0');

  const taxVariance = reconcileFocusInvoice({
    ...input,
    costAndUsage: [...input.costAndUsage, charge('tax-1', 'Tax', '2.50')],
  });
  const taxVarianceEvidence = taxVariance as unknown as {
    taxReconciliationStatus?: string;
    taxVariance?: string | null;
  };
  assert.equal(taxVariance.status, 'RECONCILED', 'the existing overall status remains explicitly limited to non-tax reconciliation');
  assert.equal(taxVarianceEvidence.taxReconciliationStatus, 'VARIANCE');
  assert.equal(taxVarianceEvidence.taxVariance, '0.1');

  const invoiceDetailOnlyTaxEvidence = aligned as unknown as { taxReconciliationStatus?: string };
  assert.equal(
    invoiceDetailOnlyTaxEvidence.taxReconciliationStatus,
    'NOT_COMPARABLE',
    'invoice-detail tax must be reported but not compared when CostAndUsage has no tax rows',
  );

  const explicitNullPaymentCurrency = reconcileFocusInvoice({
    ...input,
    invoiceDetail: input.invoiceDetail.map((row) => ({
      ...row,
      paymentCurrency: null,
      paymentCurrencyBilledCost: null,
      paymentCurrencyInvoiceDetailId: null,
    })),
  });
  assert.equal(explicitNullPaymentCurrency.status, 'UNKNOWN');
  assert.equal(explicitNullPaymentCurrency.paymentCurrencyStatus, 'UNKNOWN');
  assert.ok(explicitNullPaymentCurrency.reasons.some((reason) =>
    reason.includes('incomplete or invalid PaymentCurrency'),
  ));

  const explicitNullPaymentCurrencyWithTaxVariance = reconcileFocusInvoice({
    ...input,
    costAndUsage: [...input.costAndUsage, charge('tax-1', 'Tax', '2.50')],
    invoiceDetail: input.invoiceDetail.map((row) => ({
      ...row,
      paymentCurrency: null,
      paymentCurrencyBilledCost: null,
      paymentCurrencyInvoiceDetailId: null,
    })),
  });
  assert.equal(explicitNullPaymentCurrencyWithTaxVariance.status, 'UNKNOWN');
  assert.equal(explicitNullPaymentCurrencyWithTaxVariance.paymentCurrencyStatus, 'UNKNOWN');
  assert.equal(
    explicitNullPaymentCurrencyWithTaxVariance.taxReconciliationStatus,
    'VARIANCE',
    'invalid payment-currency metadata must not suppress independently comparable tax evidence',
  );
  assert.equal(explicitNullPaymentCurrencyWithTaxVariance.taxVariance, '0.1');

  const costAndUsagePaymentCurrencyFields = reconcileFocusInvoice({
    ...input,
    costAndUsage: [
      ...input.costAndUsage,
      charge('tax-1', 'Tax', '2.50', {
        paymentCurrency: 'AUD',
        paymentCurrencyBilledCost: '2.50',
        paymentCurrencyInvoiceDetailId: 'tax-1',
      }),
    ],
  });
  assert.equal(costAndUsagePaymentCurrencyFields.status, 'UNKNOWN');
  assert.equal(costAndUsagePaymentCurrencyFields.paymentCurrencyStatus, 'UNKNOWN');
  assert.equal(
    costAndUsagePaymentCurrencyFields.taxReconciliationStatus,
    'NOT_COMPARABLE',
    'invalid CostAndUsage payment-currency fields must not be admitted as tax evidence',
  );
  assert.equal(costAndUsagePaymentCurrencyFields.taxVariance, null);
  assert.ok(costAndUsagePaymentCurrencyFields.reasons.some((reason) =>
    reason.includes('CostAndUsage row 3 must not contain InvoiceDetail payment-currency fields'),
  ));

  const costAndUsagePaymentCurrencyWithNormalizationFailure = reconcileFocusInvoice({
    ...input,
    costAndUsage: [
      ...input.costAndUsage,
      charge('tax-1', 'Tax', '2.50', {
        paymentCurrency: 'AUD',
        paymentCurrencyBilledCost: '2.50',
        paymentCurrencyInvoiceDetailId: 'tax-1',
      }),
      charge('invalid-period', 'Usage', '1.00', {
        billingPeriodStart: 'not-a-timestamp',
      }),
    ],
  });
  assert.equal(costAndUsagePaymentCurrencyWithNormalizationFailure.status, 'UNKNOWN');
  assert.equal(costAndUsagePaymentCurrencyWithNormalizationFailure.paymentCurrencyStatus, 'UNKNOWN');
  assert.equal(costAndUsagePaymentCurrencyWithNormalizationFailure.taxReconciliationStatus, 'NOT_COMPARABLE');
  assert.equal(costAndUsagePaymentCurrencyWithNormalizationFailure.taxVariance, null);
  assert.ok(costAndUsagePaymentCurrencyWithNormalizationFailure.reasons.some((reason) =>
    reason.includes('CostAndUsage row 3 must not contain InvoiceDetail payment-currency fields'),
  ));
  assert.ok(costAndUsagePaymentCurrencyWithNormalizationFailure.reasons.some((reason) =>
    reason.includes('CostAndUsage row 4 has invalid FOCUS UTC billing-period bounds'),
  ));

  const invalidPaymentLineageWithTaxVariance = reconcileFocusInvoice({
    ...input,
    costAndUsage: [...input.costAndUsage, charge('tax-1', 'Tax', '2.50')],
    invoiceDetail: input.invoiceDetail.map((row) => ({
      ...row,
      paymentCurrency: 'AUD',
      paymentCurrencyBilledCost: '1.00',
      paymentCurrencyInvoiceDetailId: 'missing-aggregate-row',
    })),
  });
  assert.equal(invalidPaymentLineageWithTaxVariance.status, 'UNKNOWN');
  assert.equal(invalidPaymentLineageWithTaxVariance.paymentCurrencyStatus, 'UNKNOWN');
  assert.equal(invalidPaymentLineageWithTaxVariance.taxReconciliationStatus, 'VARIANCE');
  assert.equal(invalidPaymentLineageWithTaxVariance.taxVariance, '0.1');

  process.stdout.write('GEAS FOCUS invoice reconciliation tests passed.\n');
});
