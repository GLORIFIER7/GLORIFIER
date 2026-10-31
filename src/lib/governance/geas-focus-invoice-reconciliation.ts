import { compareCodeUnits } from '../deterministic-string-order';

/**
 * Deterministic FOCUS 1.4 invoice-line reconciliation.
 *
 * This checks only the supplied Cost and Usage / Invoice Detail datasets.
 * It does not authenticate the invoice issuer, verify a legal invoice document,
 * or promote the result beyond analysis evidence. Monetary values are decimal
 * strings so comparisons avoid IEEE-754 floating-point rounding.
 */

export type FocusInvoiceReconciliationStatus = 'RECONCILED' | 'VARIANCE' | 'UNKNOWN';

export interface FocusInvoiceCharge {
  invoiceIssuerName: string;
  invoiceId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  invoiceDetailId?: string | null;
  chargeCategory: string;
  billingCurrency: string;
  billedCost: string;
}

export interface FocusInvoiceReconciliationInput {
  invoiceIssuerName: string;
  invoiceId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingCurrency: string;
  costAndUsage: readonly FocusInvoiceCharge[];
  invoiceDetail: readonly FocusInvoiceCharge[];
  /** Must be explicitly supplied from the applicable reconciliation policy. */
  roundingTolerance: string;
}

export interface FocusInvoiceLineItemReconciliation {
  invoiceDetailId: string;
  costAndUsageBilledCost: string;
  invoiceDetailBilledCost: string;
  variance: string;
  withinTolerance: boolean;
}

export interface FocusInvoiceReconciliationResult {
  specVersion: 'FOCUS-1.4';
  status: FocusInvoiceReconciliationStatus;
  /** A dataset reconciliation is analysis, not proof of invoice authenticity. */
  evidenceClass: 'analysis';
  reconciliationScope: 'provided-dataset-consistency-only';
  /** RECONCILED applies only to non-tax line items; tax totals are reported, not compared. */
  reconciliationBasis: 'non-tax-line-items-only';
  invoiceIssuerName: string | null;
  invoiceId: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  billingCurrency: string | null;
  roundingTolerance: string | null;
  costAndUsageNonTaxTotal: string | null;
  costAndUsageTaxTotal: string | null;
  invoiceDetailNonTaxTotal: string | null;
  invoiceDetailTaxTotal: string | null;
  invoiceDetailGrandTotal: string | null;
  lineItems: FocusInvoiceLineItemReconciliation[];
  reasons: string[];
}

interface NormalizedCharge {
  invoiceIssuerName: string;
  invoiceId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  invoiceDetailId: string | null;
  chargeCategory: string;
  billingCurrency: string;
  billedCost: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** FOCUS DateTimeFormat requires a UTC ISO 8601 timestamp ending in Z. */
function utcTimestamp(value: unknown): number | null {
  const timestamp = textValue(value);
  if (!timestamp || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp)) return null;
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString().replace('.000Z', 'Z') === timestamp ? milliseconds : null;
}

function decimalScale(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const scale = match[3]?.length ?? 0;
  return scale <= 12 ? scale : null;
}

function decimalUnits(value: string, scale: number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error('invalid decimal amount');
  const fraction = match[3] ?? '';
  if (!Number.isInteger(scale) || scale < 0 || fraction.length > scale) {
    throw new Error('decimal scale is smaller than amount precision');
  }
  const units = BigInt(match[2] + fraction.padEnd(scale, '0'));
  return match[1] === '-' ? -units : units;
}

function formatUnits(value: bigint, scale: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const digits = absolute.toString().padStart(scale + 1, '0');
  if (scale === 0) return (negative ? '-' : '') + digits;
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return (negative ? '-' : '') + whole + (fraction ? '.' + fraction : '');
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function isTax(row: NormalizedCharge): boolean {
  return row.chargeCategory.toLowerCase() === 'tax';
}

function unknownResult(
  invoiceIssuerName: string | null,
  invoiceId: string | null,
  billingPeriodStart: string | null,
  billingPeriodEnd: string | null,
  billingCurrency: string | null,
  roundingTolerance: string | null,
  reasons: string[],
): FocusInvoiceReconciliationResult {
  return {
    specVersion: 'FOCUS-1.4',
    status: 'UNKNOWN',
    evidenceClass: 'analysis',
    reconciliationScope: 'provided-dataset-consistency-only',
    reconciliationBasis: 'non-tax-line-items-only',
    invoiceIssuerName,
    invoiceId,
    billingPeriodStart,
    billingPeriodEnd,
    billingCurrency,
    roundingTolerance,
    costAndUsageNonTaxTotal: null,
    costAndUsageTaxTotal: null,
    invoiceDetailNonTaxTotal: null,
    invoiceDetailTaxTotal: null,
    invoiceDetailGrandTotal: null,
    lineItems: [],
    reasons: [...new Set(reasons)],
  };
}

function normalizeRows(
  values: unknown[],
  datasetName: 'CostAndUsage' | 'InvoiceDetail',
  invoiceIssuerName: string,
  invoiceId: string,
  billingPeriodStart: string,
  billingPeriodEnd: string,
  billingCurrency: string,
  reasons: string[],
): NormalizedCharge[] {
  const rows: NormalizedCharge[] = [];
  values.forEach((value, index) => {
    const row = asRecord(value);
    if (!row) {
      reasons.push(datasetName + ' row ' + index + ' must be an object');
      return;
    }
    const issuer = textValue(row.invoiceIssuerName);
    const id = textValue(row.invoiceId);
    const rowPeriodStart = textValue(row.billingPeriodStart);
    const rowPeriodEnd = textValue(row.billingPeriodEnd);
    const category = textValue(row.chargeCategory);
    const currency = textValue(row.billingCurrency);
    const amount = textValue(row.billedCost);
    const detailIdValue = row.invoiceDetailId;
    const detailId = detailIdValue === null || detailIdValue === undefined
      ? null
      : textValue(detailIdValue);

    if (!issuer || !id || !rowPeriodStart || !rowPeriodEnd || !category || !currency || !amount || decimalScale(amount) === null) {
      reasons.push(datasetName + ' row ' + index + ' has missing or invalid required fields');
      return;
    }
    const rowPeriodStartMs = utcTimestamp(rowPeriodStart);
    const rowPeriodEndMs = utcTimestamp(rowPeriodEnd);
    if (rowPeriodStartMs === null || rowPeriodEndMs === null || rowPeriodStartMs >= rowPeriodEndMs) {
      reasons.push(datasetName + ' row ' + index + ' has invalid FOCUS UTC billing-period bounds');
      return;
    }
    if (rowPeriodStart !== billingPeriodStart || rowPeriodEnd !== billingPeriodEnd) {
      reasons.push(datasetName + ' row ' + index + ' has a billing-period mismatch');
      return;
    }
    if (detailIdValue !== null && detailIdValue !== undefined && !detailId) {
      reasons.push(datasetName + ' row ' + index + ' has an invalid InvoiceDetailId');
      return;
    }
    if (issuer !== invoiceIssuerName || id !== invoiceId) {
      reasons.push(datasetName + ' row ' + index + ' is outside the target invoice');
      return;
    }
    if (currency !== billingCurrency || !/^[A-Z]{3}$/.test(currency)) {
      reasons.push(datasetName + ' row ' + index + ' has a billing-currency mismatch');
      return;
    }
    rows.push({
      invoiceIssuerName: issuer,
      invoiceId: id,
      billingPeriodStart: rowPeriodStart,
      billingPeriodEnd: rowPeriodEnd,
      invoiceDetailId: detailId,
      chargeCategory: category,
      billingCurrency: currency,
      billedCost: amount,
    });
  });
  return rows;
}

/**
 * Compare non-tax charges by InvoiceDetailId within one exact FOCUS billing
 * period, aggregate granular usage rows, and report invoice tax separately.
 * Missing lineage, invalid UTC period bounds or cross-period rows fail closed
 * as UNKNOWN; matched IDs with amounts outside tolerance become VARIANCE.
 */
export function reconcileFocusInvoice(
  input: FocusInvoiceReconciliationInput,
): FocusInvoiceReconciliationResult {
  const record = asRecord(input);
  const issuer = textValue(record?.invoiceIssuerName);
  const invoiceId = textValue(record?.invoiceId);
  const billingPeriodStart = textValue(record?.billingPeriodStart);
  const billingPeriodEnd = textValue(record?.billingPeriodEnd);
  const billingPeriodStartMs = utcTimestamp(billingPeriodStart);
  const billingPeriodEndMs = utcTimestamp(billingPeriodEnd);
  const currency = textValue(record?.billingCurrency);
  const tolerance = textValue(record?.roundingTolerance);
  const reasons: string[] = [];

  if (!issuer || !invoiceId) reasons.push('invoice issuer and invoice ID are required');
  if (billingPeriodStartMs === null || billingPeriodEndMs === null) reasons.push('billing period bounds must use FOCUS UTC ISO 8601 format YYYY-MM-DDTHH:mm:ssZ');
  else if (billingPeriodStartMs >= billingPeriodEndMs) reasons.push('billing period end must be later than billing period start');
  if (!currency || !/^[A-Z]{3}$/.test(currency)) reasons.push('billing currency must be an uppercase three-letter code');
  const toleranceScale = decimalScale(tolerance);
  if (!tolerance || toleranceScale === null) reasons.push('an explicit decimal rounding tolerance is required');
  else if (decimalUnits(tolerance, toleranceScale) < 0n) reasons.push('rounding tolerance must not be negative');

  const usageValues = Array.isArray(record?.costAndUsage) ? record.costAndUsage as unknown[] : [];
  const detailValues = Array.isArray(record?.invoiceDetail) ? record.invoiceDetail as unknown[] : [];
  if (!Array.isArray(record?.costAndUsage)) reasons.push('CostAndUsage rows are required');
  if (!Array.isArray(record?.invoiceDetail)) reasons.push('InvoiceDetail rows are required');
  if (usageValues.length === 0) reasons.push('CostAndUsage dataset is empty');
  if (detailValues.length === 0) reasons.push('InvoiceDetail dataset is empty');

  if (reasons.length > 0 || !issuer || !invoiceId || !billingPeriodStart || !billingPeriodEnd || !currency || !tolerance || toleranceScale === null) {
    return unknownResult(issuer, invoiceId, billingPeriodStart, billingPeriodEnd, currency, tolerance, reasons);
  }

  const usageRows = normalizeRows(usageValues, 'CostAndUsage', issuer, invoiceId, billingPeriodStart, billingPeriodEnd, currency, reasons);
  const detailRows = normalizeRows(detailValues, 'InvoiceDetail', issuer, invoiceId, billingPeriodStart, billingPeriodEnd, currency, reasons);
  const allRows = [...usageRows, ...detailRows];
  const scales = allRows.map((row) => decimalScale(row.billedCost));
  if (scales.some((scale) => scale === null)) reasons.push('all billed costs must be decimal strings with at most 12 fractional digits');
  if (reasons.length > 0) return unknownResult(issuer, invoiceId, billingPeriodStart, billingPeriodEnd, currency, tolerance, reasons);

  let scale = toleranceScale;
  for (const candidateScale of scales) {
    if (candidateScale !== null && candidateScale > scale) scale = candidateScale;
  }
  const toleranceUnits = decimalUnits(tolerance, scale);
  const detailIds = new Set<string>();
  for (const row of detailRows) {
    if (!row.invoiceDetailId) reasons.push('every InvoiceDetail row must have an InvoiceDetailId');
    else if (detailIds.has(row.invoiceDetailId)) reasons.push('InvoiceDetailId must be unique within the invoice');
    else detailIds.add(row.invoiceDetailId);
  }
  for (const row of usageRows) {
    if (!isTax(row) && !row.invoiceDetailId) reasons.push('non-tax CostAndUsage rows require InvoiceDetailId for line-item reconciliation');
  }

  const usageNonTaxRows = usageRows.filter((row) => !isTax(row));
  const detailNonTaxRows = detailRows.filter((row) => !isTax(row));
  if (usageNonTaxRows.length === 0) reasons.push('no non-tax CostAndUsage rows are available for comparison');
  if (detailNonTaxRows.length === 0) reasons.push('no non-tax InvoiceDetail rows are available for comparison');

  if (reasons.length > 0) return unknownResult(issuer, invoiceId, billingPeriodStart, billingPeriodEnd, currency, formatUnits(decimalUnits(tolerance, scale), scale), reasons);

  const sum = (rows: NormalizedCharge[]): bigint =>
    rows.reduce((total, row) => total + decimalUnits(row.billedCost, scale), 0n);
  const usageByDetailId = new Map<string, bigint>();
  for (const row of usageNonTaxRows) {
    const id = row.invoiceDetailId as string;
    usageByDetailId.set(id, (usageByDetailId.get(id) ?? 0n) + decimalUnits(row.billedCost, scale));
  }
  const detailById = new Map<string, bigint>();
  for (const row of detailNonTaxRows) {
    const id = row.invoiceDetailId as string;
    detailById.set(id, decimalUnits(row.billedCost, scale));
  }

  const ids = [...new Set([...usageByDetailId.keys(), ...detailById.keys()])].sort(compareCodeUnits);
  const lineItems: FocusInvoiceLineItemReconciliation[] = [];
  let hasMissingMapping = false;
  let hasVariance = false;
  for (const id of ids) {
    const hasUsage = usageByDetailId.has(id);
    const hasDetail = detailById.has(id);
    if (!hasUsage || !hasDetail) {
      hasMissingMapping = true;
      reasons.push('InvoiceDetailId ' + id + ' is not present in both datasets');
    }
    const usageAmount = usageByDetailId.get(id) ?? 0n;
    const detailAmount = detailById.get(id) ?? 0n;
    const variance = usageAmount - detailAmount;
    const withinTolerance = hasUsage && hasDetail && absolute(variance) <= toleranceUnits;
    if (hasUsage && hasDetail && !withinTolerance) {
      hasVariance = true;
      reasons.push('BilledCost variance for InvoiceDetailId ' + id + ' exceeds tolerance');
    }
    lineItems.push({
      invoiceDetailId: id,
      costAndUsageBilledCost: formatUnits(usageAmount, scale),
      invoiceDetailBilledCost: formatUnits(detailAmount, scale),
      variance: formatUnits(variance, scale),
      withinTolerance,
    });
  }

  return {
    specVersion: 'FOCUS-1.4',
    status: hasMissingMapping ? 'UNKNOWN' : hasVariance ? 'VARIANCE' : 'RECONCILED',
    evidenceClass: 'analysis',
    reconciliationScope: 'provided-dataset-consistency-only',
    reconciliationBasis: 'non-tax-line-items-only',
    invoiceIssuerName: issuer,
    invoiceId,
    billingPeriodStart,
    billingPeriodEnd,
    billingCurrency: currency,
    roundingTolerance: formatUnits(toleranceUnits, scale),
    costAndUsageNonTaxTotal: formatUnits(sum(usageNonTaxRows), scale),
    costAndUsageTaxTotal: formatUnits(sum(usageRows.filter(isTax)), scale),
    invoiceDetailNonTaxTotal: formatUnits(sum(detailNonTaxRows), scale),
    invoiceDetailTaxTotal: formatUnits(sum(detailRows.filter(isTax)), scale),
    invoiceDetailGrandTotal: formatUnits(sum(detailRows), scale),
    lineItems,
    reasons: [...new Set(reasons)],
  };
}
