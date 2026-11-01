import { compareCodeUnits } from '../deterministic-string-order';

/**
 * Deterministic FOCUS 1.4 invoice-line reconciliation.
 *
 * This checks only the supplied Cost and Usage / Invoice Detail datasets for
 * one exact billing period. It does not authenticate the invoice issuer, verify
 * a legal invoice document, or promote the result beyond analysis evidence.
 * Monetary values are decimal strings to avoid IEEE-754 rounding.
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
  invoiceDetailId: string | null;
  chargeCategory: string;
  billingCurrency: string;
  billedCost: string;
}

// TypeScript ES-module declarations are module-scoped, not global script bindings.
// skipcq: JS-0067
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

// TypeScript ES-module declarations are module-scoped, not global script bindings.
// skipcq: JS-0067
function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** FOCUS DateTimeFormat requires a UTC ISO 8601 timestamp ending in Z. */
// TypeScript ES-module declarations are module-scoped, not global script bindings.
// skipcq: JS-0067
function hasCanonicalUtcTimestampShape(value: string): boolean {
  return value.trim() === value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value);
}

// TypeScript ES-module declarations are module-scoped, not global script bindings.
// skipcq: JS-0067
function utcTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  if (!hasCanonicalUtcTimestampShape(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const canonicalValue = new Date(milliseconds).toISOString().replace('.000Z', 'Z');
  return canonicalValue === value ? milliseconds : null;
}

// TypeScript ES-module declarations are module-scoped, not global script bindings.
// skipcq: JS-0067
function decimalScale(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const scale = match[3]?.length ?? 0;
  return scale <= 12 ? scale : null;
}

// TypeScript ES-module declarations are module-scoped, not global script bindings.
// skipcq: JS-0067
function hasValidDecimalScale(scale: number, fractionLength: number): boolean {
  return Number.isInteger(scale) && scale >= 0 && fractionLength <= scale;
}

// TypeScript ES-module declarations are module-scoped, not global script bindings.
// skipcq: JS-0067
function decimalUnits(value: string, scale: number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error('invalid decimal amount');
  const fraction = match[3] ?? '';
  if (!hasValidDecimalScale(scale, fraction.length)) {
    throw new Error('decimal scale is smaller than amount precision');
  }
  const units = BigInt(`${match[2]}${fraction.padEnd(scale, '0')}`);
  return match[1] === '-' ? -units : units;
}

// TypeScript ES-module declarations are module-scoped, not global script bindings.
// skipcq: JS-0067
function formatUnits(value: bigint, scale: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const digits = absolute.toString().padStart(scale + 1, '0');
  const sign = negative ? '-' : '';
  if (scale === 0) return `${sign}${digits}`;
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

// TypeScript ES-module declarations are module-scoped, not global script bindings.
// skipcq: JS-0067
function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

// TypeScript ES-module declarations are module-scoped, not global script bindings.
// skipcq: JS-0067
function isTax(row: NormalizedCharge): boolean {
  return row.chargeCategory.toLowerCase() === 'tax';
}

// TypeScript ES-module declarations are module-scoped, not global script bindings.
// skipcq: JS-0067
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

interface NormalizeRowsContext {
  datasetName: 'CostAndUsage' | 'InvoiceDetail';
  invoiceIssuerName: string;
  invoiceId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingCurrency: string;
  reasons: string[];
}

interface ParsedNormalizedCharge {
  invoiceIssuerName: string;
  invoiceId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  invoiceDetailId: string | null;
  invoiceDetailIdValue: unknown;
  chargeCategory: string;
  billingCurrency: string;
  billedCost: string;
}

const hasRequiredChargeFields = (values: readonly (string | null)[]): boolean =>
  values.every((value) => Boolean(value));

const parseNormalizedCharge = (row: Record<string, unknown>): ParsedNormalizedCharge | null => {
  const issuer = textValue(row.invoiceIssuerName);
  const id = textValue(row.invoiceId);
  const billingPeriodStart = typeof row.billingPeriodStart === 'string' ? row.billingPeriodStart : null;
  const billingPeriodEnd = typeof row.billingPeriodEnd === 'string' ? row.billingPeriodEnd : null;
  const category = textValue(row.chargeCategory);
  const currency = textValue(row.billingCurrency);
  const amount = textValue(row.billedCost);
  const invoiceDetailIdValue = row.invoiceDetailId;
  const invoiceDetailId = textValue(invoiceDetailIdValue);

  const requiredFields = [issuer, id, billingPeriodStart, billingPeriodEnd, category, currency, amount];
  if (!hasRequiredChargeFields(requiredFields) || decimalScale(amount) === null) return null;
  return {
    invoiceIssuerName: issuer as string,
    invoiceId: id as string,
    billingPeriodStart: billingPeriodStart as string,
    billingPeriodEnd: billingPeriodEnd as string,
    invoiceDetailId,
    invoiceDetailIdValue,
    chargeCategory: category as string,
    billingCurrency: currency as string,
    billedCost: amount as string,
  };
};

const billingPeriodFailure = (
  row: ParsedNormalizedCharge,
  context: NormalizeRowsContext,
): string | null => {
  const startMs = utcTimestamp(row.billingPeriodStart);
  const endMs = utcTimestamp(row.billingPeriodEnd);
  if (startMs === null || endMs === null || startMs >= endMs) return 'has invalid FOCUS UTC billing-period bounds';
  return row.billingPeriodStart === context.billingPeriodStart && row.billingPeriodEnd === context.billingPeriodEnd
    ? null
    : 'has a billing-period mismatch';
};

const invoiceDetailIdFailure = (row: ParsedNormalizedCharge): string | null =>
  row.invoiceDetailIdValue !== null && row.invoiceDetailIdValue !== undefined && !row.invoiceDetailId
    ? 'has an invalid InvoiceDetailId'
    : null;

const invoiceIdentityFailure = (row: ParsedNormalizedCharge, context: NormalizeRowsContext): string | null =>
  row.invoiceIssuerName === context.invoiceIssuerName && row.invoiceId === context.invoiceId
    ? null
    : 'is outside the target invoice';

const invoiceCurrencyFailure = (row: ParsedNormalizedCharge, context: NormalizeRowsContext): string | null =>
  row.billingCurrency === context.billingCurrency && /^[A-Z]{3}$/.test(row.billingCurrency)
    ? null
    : 'has a billing-currency mismatch';

const normalizedChargeFailure = (
  row: ParsedNormalizedCharge,
  context: NormalizeRowsContext,
): string | null =>
  billingPeriodFailure(row, context)
  ?? invoiceDetailIdFailure(row)
  ?? invoiceIdentityFailure(row, context)
  ?? invoiceCurrencyFailure(row, context);

const normalizeSingleRow = (
  value: unknown,
  index: number,
  context: NormalizeRowsContext,
): NormalizedCharge | null => {
  const row = asRecord(value);
  if (!row) {
    context.reasons.push(`${context.datasetName} row ${index} must be an object`);
    return null;
  }
  const parsed = parseNormalizedCharge(row);
  if (!parsed) {
    context.reasons.push(`${context.datasetName} row ${index} has missing or invalid required fields`);
    return null;
  }
  const failure = normalizedChargeFailure(parsed, context);
  if (failure) {
    context.reasons.push(`${context.datasetName} row ${index} ${failure}`);
    return null;
  }
  return {
    invoiceIssuerName: parsed.invoiceIssuerName,
    invoiceId: parsed.invoiceId,
    invoiceDetailId: parsed.invoiceDetailId,
    chargeCategory: parsed.chargeCategory,
    billingCurrency: parsed.billingCurrency,
    billedCost: parsed.billedCost,
  };
};

const normalizeRows = (values: unknown[], context: NormalizeRowsContext): NormalizedCharge[] => {
  const rows: NormalizedCharge[] = [];
  values.forEach((value, index) => {
    const row = normalizeSingleRow(value, index, context);
    if (row) rows.push(row);
  });
  return rows;
};

/**
 * Compare non-tax charges by InvoiceDetailId within one exact FOCUS billing
 * period, aggregate granular usage rows, and report invoice tax separately.
 * Missing lineage, invalid UTC period bounds or cross-period rows fail closed
 * as UNKNOWN; matched IDs with amounts outside tolerance become VARIANCE.
 */
interface InvoiceMetadataDraft {
  issuer: string | null;
  invoiceId: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  currency: string | null;
  tolerance: string | null;
  toleranceScale: number | null;
  usageValues: unknown[];
  detailValues: unknown[];
}

interface InvoiceMetadata {
  issuer: string;
  invoiceId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  currency: string;
  tolerance: string;
  toleranceScale: number;
  usageValues: unknown[];
  detailValues: unknown[];
}

interface NormalizedInvoiceDatasets {
  usageRows: NormalizedCharge[];
  detailRows: NormalizedCharge[];
  scale: number;
}

interface ComparableInvoiceRows {
  usageNonTaxRows: NormalizedCharge[];
  detailNonTaxRows: NormalizedCharge[];
  toleranceUnits: bigint;
}

interface InvoiceLineComparison {
  lineItems: FocusInvoiceLineItemReconciliation[];
  hasMissingMapping: boolean;
  hasVariance: boolean;
}

const requiredDatasetRows = (
  value: unknown,
  datasetName: 'CostAndUsage' | 'InvoiceDetail',
  reasons: string[],
): unknown[] => {
  const rows = Array.isArray(value) ? value : [];
  if (!Array.isArray(value)) reasons.push(`${datasetName} rows are required`);
  if (rows.length === 0) reasons.push(`${datasetName} dataset is empty`);
  return rows;
};

const validateInvoiceMetadata = (
  values: Omit<InvoiceMetadataDraft, 'usageValues' | 'detailValues'>,
  reasons: string[],
): void => {
  if (!values.issuer || !values.invoiceId) reasons.push('invoice issuer and invoice ID are required');
  const startMs = values.billingPeriodStart ? utcTimestamp(values.billingPeriodStart) : null;
  const endMs = values.billingPeriodEnd ? utcTimestamp(values.billingPeriodEnd) : null;
  if (startMs === null || endMs === null) {
    reasons.push('billing period bounds must use FOCUS UTC ISO 8601 format YYYY-MM-DDTHH:mm:ssZ');
  } else if (startMs >= endMs) {
    reasons.push('billing period end must be later than billing period start');
  }
  if (!values.currency || !/^[A-Z]{3}$/.test(values.currency)) {
    reasons.push('billing currency must be an uppercase three-letter code');
  }
  if (!values.tolerance || values.toleranceScale === null) {
    reasons.push('an explicit decimal rounding tolerance is required');
  } else if (decimalUnits(values.tolerance, values.toleranceScale) < 0n) {
    reasons.push('rounding tolerance must not be negative');
  }
};

const isCompleteInvoiceMetadata = (draft: InvoiceMetadataDraft): draft is InvoiceMetadata =>
  Boolean(draft.issuer && draft.invoiceId && draft.billingPeriodStart && draft.billingPeriodEnd
    && draft.currency && draft.tolerance && draft.toleranceScale !== null);

const parseInvoiceMetadata = (
  input: FocusInvoiceReconciliationInput,
  reasons: string[],
): InvoiceMetadataDraft => {
  const record = asRecord(input);
  const values = {
    issuer: textValue(record?.invoiceIssuerName),
    invoiceId: textValue(record?.invoiceId),
    billingPeriodStart: typeof record?.billingPeriodStart === 'string' ? record.billingPeriodStart : null,
    billingPeriodEnd: typeof record?.billingPeriodEnd === 'string' ? record.billingPeriodEnd : null,
    currency: textValue(record?.billingCurrency),
    tolerance: textValue(record?.roundingTolerance),
    toleranceScale: decimalScale(textValue(record?.roundingTolerance)),
  };
  validateInvoiceMetadata(values, reasons);
  const usageValues = requiredDatasetRows(record?.costAndUsage, 'CostAndUsage', reasons);
  const detailValues = requiredDatasetRows(record?.invoiceDetail, 'InvoiceDetail', reasons);
  return { ...values, usageValues, detailValues };
};

const normalizeInvoiceDatasets = (
  metadata: InvoiceMetadata,
  reasons: string[],
): NormalizedInvoiceDatasets | null => {
  const sharedContext = {
    invoiceIssuerName: metadata.issuer,
    invoiceId: metadata.invoiceId,
    billingPeriodStart: metadata.billingPeriodStart,
    billingPeriodEnd: metadata.billingPeriodEnd,
    billingCurrency: metadata.currency,
    reasons,
  };
  const usageRows = normalizeRows(metadata.usageValues, { ...sharedContext, datasetName: 'CostAndUsage' });
  const detailRows = normalizeRows(metadata.detailValues, { ...sharedContext, datasetName: 'InvoiceDetail' });
  const scales = [...usageRows, ...detailRows].map((row) => decimalScale(row.billedCost));
  if (scales.some((scale) => scale === null)) {
    reasons.push('all billed costs must be decimal strings with at most 12 fractional digits');
  }
  if (reasons.length > 0) return null;
  const scale = scales.reduce((maximum, value) => value === null ? maximum : Math.max(maximum, value), metadata.toleranceScale);
  return { usageRows, detailRows, scale };
};

const validateInvoiceLineage = (
  usageRows: NormalizedCharge[],
  detailRows: NormalizedCharge[],
  scale: number,
  tolerance: string,
  reasons: string[],
): ComparableInvoiceRows | null => {
  const detailIds = new Set<string>();
  for (const row of detailRows) {
    if (!row.invoiceDetailId) reasons.push('every InvoiceDetail row must have an InvoiceDetailId');
    else if (detailIds.has(row.invoiceDetailId)) reasons.push('InvoiceDetailId must be unique within the invoice');
    else detailIds.add(row.invoiceDetailId);
  }
  for (const row of usageRows) {
    if (!isTax(row) && !row.invoiceDetailId) {
      reasons.push('non-tax CostAndUsage rows require InvoiceDetailId for line-item reconciliation');
    }
  }
  const usageNonTaxRows = usageRows.filter((row) => !isTax(row));
  const detailNonTaxRows = detailRows.filter((row) => !isTax(row));
  if (usageNonTaxRows.length === 0) reasons.push('no non-tax CostAndUsage rows are available for comparison');
  if (detailNonTaxRows.length === 0) reasons.push('no non-tax InvoiceDetail rows are available for comparison');
  if (reasons.length > 0) return null;
  return {
    usageNonTaxRows,
    detailNonTaxRows,
    toleranceUnits: decimalUnits(tolerance, scale),
  };
};

const sumBilledCosts = (rows: NormalizedCharge[], scale: number): bigint =>
  rows.reduce((total, row) => total + decimalUnits(row.billedCost, scale), 0n);

const aggregateUsageByDetailId = (rows: NormalizedCharge[], scale: number): Map<string, bigint> => {
  const amounts = new Map<string, bigint>();
  for (const row of rows) {
    if (!row.invoiceDetailId) continue;
    amounts.set(row.invoiceDetailId, (amounts.get(row.invoiceDetailId) ?? 0n) + decimalUnits(row.billedCost, scale));
  }
  return amounts;
};

const aggregateInvoiceDetailById = (rows: NormalizedCharge[], scale: number): Map<string, bigint> => {
  const amounts = new Map<string, bigint>();
  for (const row of rows) {
    if (!row.invoiceDetailId) continue;
    amounts.set(row.invoiceDetailId, decimalUnits(row.billedCost, scale));
  }
  return amounts;
};

const compareInvoiceLineItems = (
  usageRows: NormalizedCharge[],
  detailRows: NormalizedCharge[],
  toleranceUnits: bigint,
  scale: number,
  reasons: string[],
): InvoiceLineComparison => {
  const usageById = aggregateUsageByDetailId(usageRows, scale);
  const detailById = aggregateInvoiceDetailById(detailRows, scale);
  const ids = [...new Set([...usageById.keys(), ...detailById.keys()])].sort(compareCodeUnits);
  const lineItems: FocusInvoiceLineItemReconciliation[] = [];
  let hasMissingMapping = false;
  let hasVariance = false;

  for (const id of ids) {
    const hasUsage = usageById.has(id);
    const hasDetail = detailById.has(id);
    if (!hasUsage || !hasDetail) {
      hasMissingMapping = true;
      reasons.push(`InvoiceDetailId ${id} is not present in both datasets`);
    }
    const usageAmount = usageById.get(id) ?? 0n;
    const detailAmount = detailById.get(id) ?? 0n;
    const variance = usageAmount - detailAmount;
    const withinTolerance = hasUsage && hasDetail && absolute(variance) <= toleranceUnits;
    if (hasUsage && hasDetail && !withinTolerance) {
      hasVariance = true;
      reasons.push(`BilledCost variance for InvoiceDetailId ${id} exceeds tolerance`);
    }
    lineItems.push({
      invoiceDetailId: id,
      costAndUsageBilledCost: formatUnits(usageAmount, scale),
      invoiceDetailBilledCost: formatUnits(detailAmount, scale),
      variance: formatUnits(variance, scale),
      withinTolerance,
    });
  }
  return { lineItems, hasMissingMapping, hasVariance };
};

const buildInvoiceResult = (
  metadata: InvoiceMetadata,
  datasets: NormalizedInvoiceDatasets,
  comparableRows: ComparableInvoiceRows,
  comparison: InvoiceLineComparison,
  reasons: string[],
): FocusInvoiceReconciliationResult => ({
  specVersion: 'FOCUS-1.4',
  status: comparison.hasMissingMapping ? 'UNKNOWN' : comparison.hasVariance ? 'VARIANCE' : 'RECONCILED',
  evidenceClass: 'analysis',
  reconciliationScope: 'provided-dataset-consistency-only',
  reconciliationBasis: 'non-tax-line-items-only',
  invoiceIssuerName: metadata.issuer,
  invoiceId: metadata.invoiceId,
  billingPeriodStart: metadata.billingPeriodStart,
  billingPeriodEnd: metadata.billingPeriodEnd,
  billingCurrency: metadata.currency,
  roundingTolerance: formatUnits(comparableRows.toleranceUnits, datasets.scale),
  costAndUsageNonTaxTotal: formatUnits(sumBilledCosts(comparableRows.usageNonTaxRows, datasets.scale), datasets.scale),
  costAndUsageTaxTotal: formatUnits(sumBilledCosts(datasets.usageRows.filter(isTax), datasets.scale), datasets.scale),
  invoiceDetailNonTaxTotal: formatUnits(sumBilledCosts(comparableRows.detailNonTaxRows, datasets.scale), datasets.scale),
  invoiceDetailTaxTotal: formatUnits(sumBilledCosts(datasets.detailRows.filter(isTax), datasets.scale), datasets.scale),
  invoiceDetailGrandTotal: formatUnits(sumBilledCosts(datasets.detailRows, datasets.scale), datasets.scale),
  lineItems: comparison.lineItems,
  reasons: [...new Set(reasons)],
});

// TypeScript ES-module declarations are module-scoped, not global script bindings.
// skipcq: JS-0067
export function reconcileFocusInvoice(
  input: FocusInvoiceReconciliationInput,
): FocusInvoiceReconciliationResult {
  const reasons: string[] = [];
  const metadataDraft = parseInvoiceMetadata(input, reasons);
  if (reasons.length > 0) {
    return unknownResult(
      metadataDraft.issuer,
      metadataDraft.invoiceId,
      metadataDraft.billingPeriodStart,
      metadataDraft.billingPeriodEnd,
      metadataDraft.currency,
      metadataDraft.tolerance,
      reasons,
    );
  }
  if (!isCompleteInvoiceMetadata(metadataDraft)) {
    return unknownResult(
      metadataDraft.issuer,
      metadataDraft.invoiceId,
      metadataDraft.billingPeriodStart,
      metadataDraft.billingPeriodEnd,
      metadataDraft.currency,
      metadataDraft.tolerance,
      ['invoice metadata is incomplete'],
    );
  }
  const metadata: InvoiceMetadata = metadataDraft;
  const datasets = normalizeInvoiceDatasets(metadata, reasons);
  if (!datasets) return unknownResult(metadata.issuer, metadata.invoiceId, metadata.billingPeriodStart, metadata.billingPeriodEnd, metadata.currency, metadata.tolerance, reasons);
  const comparableRows = validateInvoiceLineage(
    datasets.usageRows,
    datasets.detailRows,
    datasets.scale,
    metadata.tolerance,
    reasons,
  );
  if (!comparableRows) {
    return unknownResult(
      metadata.issuer,
      metadata.invoiceId,
      metadata.billingPeriodStart,
      metadata.billingPeriodEnd,
      metadata.currency,
      formatUnits(decimalUnits(metadata.tolerance, datasets.scale), datasets.scale),
      reasons,
    );
  }
  const comparison = compareInvoiceLineItems(
    comparableRows.usageNonTaxRows,
    comparableRows.detailNonTaxRows,
    comparableRows.toleranceUnits,
    datasets.scale,
    reasons,
  );
  return buildInvoiceResult(metadata, datasets, comparableRows, comparison, reasons);
}
