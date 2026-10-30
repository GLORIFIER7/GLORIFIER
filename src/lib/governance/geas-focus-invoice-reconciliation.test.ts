import assert from 'node:assert/strict';
import { reconcileFocusInvoice, type FocusInvoiceCharge } from './geas-focus-invoice-reconciliation';

const input = {
  invoiceIssuerName: 'Example Cloud Billing',
  invoiceId: 'INV-2026-001',
  billingCurrency: 'USD',
  roundingTolerance: '0.01',
  costAndUsage: [
    { invoiceIssuerName: 'Example Cloud Billing', invoiceId: 'INV-2026-001', invoiceDetailId: 'line-1', chargeCategory: 'Usage', billingCurrency: 'USD', billedCost: '4.00' },
    { invoiceIssuerName: 'Example Cloud Billing', invoiceId: 'INV-2026-001', invoiceDetailId: 'line-1', chargeCategory: 'Usage', billingCurrency: 'USD', billedCost: '6.00' },
    { invoiceIssuerName: 'Example Cloud Billing', invoiceId: 'INV-2026-001', invoiceDetailId: 'line-2', chargeCategory: 'Usage', billingCurrency: 'USD', billedCost: '20.005' },
  ] satisfies FocusInvoiceCharge[],
  invoiceDetail: [
    { invoiceIssuerName: 'Example Cloud Billing', invoiceId: 'INV-2026-001', invoiceDetailId: 'line-1', chargeCategory: 'Usage', billingCurrency: 'USD', billedCost: '10.00' },
    { invoiceIssuerName: 'Example Cloud Billing', invoiceId: 'INV-2026-001', invoiceDetailId: 'line-2', chargeCategory: 'Usage', billingCurrency: 'USD', billedCost: '20.00' },
    { invoiceIssuerName: 'Example Cloud Billing', invoiceId: 'INV-2026-001', invoiceDetailId: 'tax-1', chargeCategory: 'Tax', billingCurrency: 'USD', billedCost: '2.40' },
  ] satisfies FocusInvoiceCharge[],
};

const aligned = reconcileFocusInvoice(input);
assert.equal(aligned.status, 'RECONCILED');
assert.equal(aligned.evidenceClass, 'analysis');
assert.equal(aligned.reconciliationScope, 'provided-dataset-consistency-only');
assert.equal(aligned.reconciliationBasis, 'non-tax-line-items-only', 'RECONCILED must not imply tax amounts were compared');
assert.equal(aligned.costAndUsageNonTaxTotal, '30.005');
assert.equal(aligned.invoiceDetailNonTaxTotal, '30');
assert.equal(aligned.costAndUsageTaxTotal, '0');
assert.equal(aligned.invoiceDetailTaxTotal, '2.4');
assert.equal(aligned.invoiceDetailGrandTotal, '32.4');
assert.equal(aligned.lineItems.find((item) => item.invoiceDetailId === 'line-2')?.withinTolerance, true);
assert.deepEqual(aligned.reasons, []);

const localeSortedIds = ['line-z', 'line-ä', 'line-a', 'line-a\\u200B'];
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
  [...localeSortedIds].sort((left, right) => left < right ? -1 : left > right ? 1 : 0),
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
  invoiceDetailId: 'large-' + index,
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

process.stdout.write('GEAS FOCUS invoice reconciliation tests passed.\n');
