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
export type FocusPaymentCurrencyStatus = 'NOT_PROVIDED' | 'ANALYZED' | 'UNKNOWN';
export type FocusTaxReconciliationStatus = 'NOT_COMPARABLE' | 'RECONCILED' | 'VARIANCE';

export interface FocusPaymentCurrencyGroup {
  paymentCurrency: string;
  paymentCurrencyInvoiceDetailId: string;
  billingCurrencyBilledCost: string;
  paymentCurrencyBilledCost: string;
}

export interface FocusInvoiceCharge {
  invoiceIssuerName: string;
  invoiceId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  invoiceDetailId?: string | null;
  paymentCurrency?: string | null;
  paymentCurrencyBilledCost?: string | null;
  paymentCurrencyInvoiceDetailId?: string | null;
  chargeCategory: string;
  billingCurrency: string;
  billedCost: string;
}

export interface FocusBillingPeriod {
  invoiceIssuerName: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingPeriodCreated: string;
  billingPeriodLastUpdated: string;
  billingPeriodStatus: string;
}

export interface FocusInvoiceReconciliationInput {
  invoiceIssuerName: string;
  invoiceId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingCurrency: string;
  /** Explicit issuer capability declaration; unknown capability must fail closed. */
  invoiceIssuerSupportsPayableInvoices: boolean;
  /** FOCUS 1.4 supporting dataset, joined by InvoiceIssuerName + BillingPeriodStart. */
  billingPeriod?: readonly FocusBillingPeriod[];
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
  /** The overall status is limited to non-tax billing-currency line items. */
  reconciliationBasis: 'non-tax-line-items-only';
  /** Deterministic payment-currency lineage analysis; never proof that payment settled. */
  paymentCurrencyStatus: FocusPaymentCurrencyStatus;
  paymentCurrencyGroups: FocusPaymentCurrencyGroup[];
  /** Tax comparison is independent because CostAndUsage commonly omits tax rows. */
  taxReconciliationStatus: FocusTaxReconciliationStatus;
  /** CostAndUsage tax total minus InvoiceDetail tax total; null when not comparable. */
  taxVariance: string | null;
  invoiceIssuerName: string | null;
  invoiceId: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  billingCurrency: string | null;
  billingPeriodStatus: string | null;
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
  paymentCurrency: string | null;
  paymentCurrencyBilledCost: string | null;
  paymentCurrencyInvoiceDetailId: string | null;
  paymentCurrencyFieldsPresent: boolean;
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const textValue = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const hasPaymentCurrencyInput = (values: unknown): boolean =>
  Array.isArray(values) && values.some((value) => {
    const row = asRecord(value);
    return Boolean(row && [
      'paymentCurrency',
      'paymentCurrencyBilledCost',
      'paymentCurrencyInvoiceDetailId',
    ].some((key) => row[key] !== undefined && row[key] !== null));
  });

/** FOCUS DateTimeFormat requires a UTC ISO 8601 timestamp ending in Z. */
const hasCanonicalUtcTimestampShape = (value: string): boolean =>
  value.trim() === value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value);

const utcTimestamp = (value: unknown): number | null => {
  if (typeof value !== 'string' || !hasCanonicalUtcTimestampShape(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString().replace('.000Z', 'Z') === value ? milliseconds : null;
};

const decimalScale = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const scale = match[3]?.length ?? 0;
  return scale <= 12 ? scale : null;
};

const hasValidDecimalScale = (scale: number, fractionLength: number): boolean => {
  return Number.isInteger(scale) && scale >= 0 && fractionLength <= scale;
};

const decimalUnits = (value: string, scale: number): bigint => {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error('invalid decimal amount');
  const fraction = match[3] ?? '';
  if (!hasValidDecimalScale(scale, fraction.length)) {
    throw new Error('decimal scale is smaller than amount precision');
  }
  const units = BigInt(`${match[2]}${fraction.padEnd(scale, '0')}`);
  return match[1] === '-' ? -units : units;
};

const formatUnits = (value: bigint, scale: number): string => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const digits = absolute.toString().padStart(scale + 1, '0');
  const sign = negative ? '-' : '';
  if (scale === 0) return `${sign}${digits}`;
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
};

const absolute = (value: bigint): bigint => {
  return value < 0n ? -value : value;
};

const isTax = (row: NormalizedCharge): boolean => {
  return row.chargeCategory.toLowerCase() === 'tax';
};

const unknownResult = (
  invoiceIssuerName: string | null,
  invoiceId: string | null,
  billingPeriodStart: string | null,
  billingPeriodEnd: string | null,
  billingCurrency: string | null,
  roundingTolerance: string | null,
  reasons: string[],
  billingPeriodStatus: string | null = null,
  paymentCurrencyStatus: FocusPaymentCurrencyStatus = 'NOT_PROVIDED',
): FocusInvoiceReconciliationResult => {
  return {
    specVersion: 'FOCUS-1.4',
    status: 'UNKNOWN',
    evidenceClass: 'analysis',
    reconciliationScope: 'provided-dataset-consistency-only',
    reconciliationBasis: 'non-tax-line-items-only',
    paymentCurrencyStatus,
    paymentCurrencyGroups: [],
    taxReconciliationStatus: 'NOT_COMPARABLE',
    taxVariance: null,
    invoiceIssuerName,
    invoiceId,
    billingPeriodStart,
    billingPeriodEnd,
    billingCurrency,
    billingPeriodStatus,
    roundingTolerance,
    costAndUsageNonTaxTotal: null,
    costAndUsageTaxTotal: null,
    invoiceDetailNonTaxTotal: null,
    invoiceDetailTaxTotal: null,
    invoiceDetailGrandTotal: null,
    lineItems: [],
    reasons: [...new Set(reasons)],
  };
};

interface NormalizeRowsContext {
  datasetName: 'CostAndUsage' | 'InvoiceDetail';
  invoiceIssuerName: string;
  invoiceId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingCurrency: string;
  reasons: string[];
}

const isUppercaseCurrencyCode = (value: string): boolean =>
  value.length === 3 && [...value].every((character) => character >= 'A' && character <= 'Z');

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
  paymentCurrency: string | null;
  paymentCurrencyValue: unknown;
  paymentCurrencyBilledCost: string | null;
  paymentCurrencyBilledCostValue: unknown;
  paymentCurrencyInvoiceDetailId: string | null;
  paymentCurrencyInvoiceDetailIdValue: unknown;
  paymentCurrencyFieldsPresent: boolean;
}

const hasRequiredChargeFields = (values: readonly (string | null)[]): boolean =>
  values.every((value) => Boolean(value));

interface NormalizedChargeFields {
  invoiceIssuerName: string;
  invoiceId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  chargeCategory: string;
  billingCurrency: string;
  billedCost: string;
}

const readNormalizedChargeFields = (row: Record<string, unknown>): NormalizedChargeFields | null => {
  const fields = {
    invoiceIssuerName: textValue(row.invoiceIssuerName),
    invoiceId: textValue(row.invoiceId),
    billingPeriodStart: typeof row.billingPeriodStart === 'string' ? row.billingPeriodStart : null,
    billingPeriodEnd: typeof row.billingPeriodEnd === 'string' ? row.billingPeriodEnd : null,
    chargeCategory: textValue(row.chargeCategory),
    billingCurrency: textValue(row.billingCurrency),
    billedCost: textValue(row.billedCost),
  };
  const values = Object.values(fields);
  if (!hasRequiredChargeFields(values) || decimalScale(fields.billedCost) === null) return null;
  return {
    invoiceIssuerName: fields.invoiceIssuerName as string,
    invoiceId: fields.invoiceId as string,
    billingPeriodStart: fields.billingPeriodStart as string,
    billingPeriodEnd: fields.billingPeriodEnd as string,
    chargeCategory: fields.chargeCategory as string,
    billingCurrency: fields.billingCurrency as string,
    billedCost: fields.billedCost as string,
  };
};

const parseNormalizedCharge = (row: Record<string, unknown>): ParsedNormalizedCharge | null => {
  const fields = readNormalizedChargeFields(row);
  if (!fields) return null;
  const invoiceDetailIdValue = row.invoiceDetailId;
  const paymentCurrencyValue = row.paymentCurrency;
  const paymentCurrencyBilledCostValue = row.paymentCurrencyBilledCost;
  const paymentCurrencyInvoiceDetailIdValue = row.paymentCurrencyInvoiceDetailId;
  const paymentCurrencyFieldsPresent = [
    paymentCurrencyValue,
    paymentCurrencyBilledCostValue,
    paymentCurrencyInvoiceDetailIdValue,
  ].some((value) => value !== undefined && value !== null);
  return {
    ...fields,
    invoiceDetailId: textValue(invoiceDetailIdValue),
    invoiceDetailIdValue,
    paymentCurrency: textValue(paymentCurrencyValue),
    paymentCurrencyValue,
    paymentCurrencyBilledCost: textValue(paymentCurrencyBilledCostValue),
    paymentCurrencyBilledCostValue,
    paymentCurrencyInvoiceDetailId: textValue(paymentCurrencyInvoiceDetailIdValue),
    paymentCurrencyInvoiceDetailIdValue,
    paymentCurrencyFieldsPresent,
  };
};

const hasValidRowBillingPeriod = (row: ParsedNormalizedCharge): boolean => {
  const startMs = utcTimestamp(row.billingPeriodStart);
  const endMs = utcTimestamp(row.billingPeriodEnd);
  return startMs !== null && endMs !== null && startMs < endMs;
};

const matchesInvoiceBillingPeriod = (row: ParsedNormalizedCharge, context: NormalizeRowsContext): boolean =>
  row.billingPeriodStart === context.billingPeriodStart
  && row.billingPeriodEnd === context.billingPeriodEnd;

const billingPeriodFailure = (
  row: ParsedNormalizedCharge,
  context: NormalizeRowsContext,
): string | null => {
  if (!hasValidRowBillingPeriod(row)) return 'has invalid FOCUS UTC billing-period bounds';
  return matchesInvoiceBillingPeriod(row, context) ? null : 'has a billing-period mismatch';
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
  row.billingCurrency === context.billingCurrency && isUppercaseCurrencyCode(row.billingCurrency)
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
  if (parsed.paymentCurrencyFieldsPresent) {
    if (context.datasetName !== 'InvoiceDetail') {
      context.reasons.push(`${context.datasetName} row ${index} must not contain InvoiceDetail payment-currency fields`);
      return null;
    }
    if (!parsed.paymentCurrency
        || !isUppercaseCurrencyCode(parsed.paymentCurrency)
        || !parsed.paymentCurrencyBilledCost
        || decimalScale(parsed.paymentCurrencyBilledCost) === null
        || !parsed.paymentCurrencyInvoiceDetailId) {
      context.reasons.push(`InvoiceDetail row ${index} has incomplete or invalid PaymentCurrency, PaymentCurrencyBilledCost, or PaymentCurrencyInvoiceDetailId fields`);
      return null;
    }
  }
  return {
    invoiceIssuerName: parsed.invoiceIssuerName,
    invoiceId: parsed.invoiceId,
    invoiceDetailId: parsed.invoiceDetailId,
    chargeCategory: parsed.chargeCategory,
    billingCurrency: parsed.billingCurrency,
    billedCost: parsed.billedCost,
    paymentCurrency: parsed.paymentCurrency,
    paymentCurrencyBilledCost: parsed.paymentCurrencyBilledCost,
    paymentCurrencyInvoiceDetailId: parsed.paymentCurrencyInvoiceDetailId,
    paymentCurrencyFieldsPresent: parsed.paymentCurrencyFieldsPresent,
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
  invoiceIssuerSupportsPayableInvoices: boolean | null;
  billingPeriodValues: unknown;
  usageValues: unknown[];
  detailValues: unknown[];
}

type InvoiceMetadataValidationInput = Omit<InvoiceMetadataDraft, 'billingPeriodValues' | 'usageValues' | 'detailValues'>;

interface InvoiceMetadata {
  issuer: string;
  invoiceId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  currency: string;
  tolerance: string;
  toleranceScale: number;
  invoiceIssuerSupportsPayableInvoices: boolean;
  billingPeriodValues: unknown;
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

interface PaymentCurrencyAnalysis {
  status: FocusPaymentCurrencyStatus;
  groups: FocusPaymentCurrencyGroup[];
}

interface TaxReconciliationAnalysis {
  status: FocusTaxReconciliationStatus;
  variance: string | null;
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

const validateInvoiceIdentity = (
  values: InvoiceMetadataValidationInput,
  reasons: string[],
): void => {
  if (!values.issuer || !values.invoiceId) reasons.push('invoice issuer and invoice ID are required');
};

const invoicePeriodValidationFailure = (startMs: number | null, endMs: number | null): string | null => {
  if (startMs === null || endMs === null) {
    return 'billing period bounds must use FOCUS UTC ISO 8601 format YYYY-MM-DDTHH:mm:ssZ';
  }
  return startMs >= endMs ? 'billing period end must be later than billing period start' : null;
};

const validateInvoiceBillingPeriod = (
  values: InvoiceMetadataValidationInput,
  reasons: string[],
): void => {
  const startMs = values.billingPeriodStart ? utcTimestamp(values.billingPeriodStart) : null;
  const endMs = values.billingPeriodEnd ? utcTimestamp(values.billingPeriodEnd) : null;
  const failure = invoicePeriodValidationFailure(startMs, endMs);
  if (failure) reasons.push(failure);
};

const validateInvoiceCurrency = (
  currency: string | null,
  reasons: string[],
): void => {
  if (!currency || !isUppercaseCurrencyCode(currency)) {
    reasons.push('billing currency must be an uppercase three-letter code');
  }
};

const validateRoundingTolerance = (
  tolerance: string | null,
  toleranceScale: number | null,
  reasons: string[],
): void => {
  if (!tolerance || toleranceScale === null) {
    reasons.push('an explicit decimal rounding tolerance is required');
  } else if (decimalUnits(tolerance, toleranceScale) < 0n) {
    reasons.push('rounding tolerance must not be negative');
  }
};

const validateInvoiceMetadata = (
  values: InvoiceMetadataValidationInput,
  reasons: string[],
): void => {
  validateInvoiceIdentity(values, reasons);
  if (typeof values.invoiceIssuerSupportsPayableInvoices !== 'boolean') {
    reasons.push('invoice issuer payable-invoice support must be explicitly true or false');
  }
  validateInvoiceBillingPeriod(values, reasons);
  validateInvoiceCurrency(values.currency, reasons);
  validateRoundingTolerance(values.tolerance, values.toleranceScale, reasons);
};

const hasRequiredInvoiceTextValues = (draft: InvoiceMetadataDraft): boolean =>
  [draft.issuer, draft.invoiceId, draft.billingPeriodStart, draft.billingPeriodEnd, draft.currency, draft.tolerance]
    .every((value) => typeof value === 'string' && value.length > 0);

const hasValidToleranceScale = (scale: number | null): scale is number =>
  scale !== null && Number.isInteger(scale) && scale >= 0;

const isCompleteInvoiceMetadata = (draft: InvoiceMetadataDraft): draft is InvoiceMetadata =>
  hasRequiredInvoiceTextValues(draft) && hasValidToleranceScale(draft.toleranceScale)
  && typeof draft.invoiceIssuerSupportsPayableInvoices === 'boolean';

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
    invoiceIssuerSupportsPayableInvoices: typeof record?.invoiceIssuerSupportsPayableInvoices === 'boolean'
      ? record.invoiceIssuerSupportsPayableInvoices : null,
    billingPeriodValues: record?.billingPeriod,
  };
  validateInvoiceMetadata(values, reasons);
  const usageValues = requiredDatasetRows(record?.costAndUsage, 'CostAndUsage', reasons);
  const detailValues = requiredDatasetRows(record?.invoiceDetail, 'InvoiceDetail', reasons);
  return { ...values, usageValues, detailValues };
};

interface NormalizedBillingPeriod {
  invoiceIssuerName: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingPeriodCreated: string;
  billingPeriodLastUpdated: string;
  billingPeriodStatus: string;
}

const validateBillingPeriodDataset = (
  metadata: InvoiceMetadata,
  reasons: string[],
): string | null => {
  const rawRows = metadata.billingPeriodValues;
  if (rawRows === undefined || rawRows === null) {
    if (metadata.invoiceIssuerSupportsPayableInvoices) {
      reasons.push('BillingPeriod dataset is required when the invoice issuer supports payable invoices');
    }
    return null;
  }
  if (!Array.isArray(rawRows)) {
    reasons.push('BillingPeriod dataset must be an array when supplied');
    return null;
  }
  if (rawRows.length === 0) {
    reasons.push('BillingPeriod dataset is empty');
    return null;
  }

  const parsedRows: NormalizedBillingPeriod[] = [];
  const keys = new Set<string>();
  rawRows.forEach((value, index) => {
    const row = asRecord(value);
    const invoiceIssuer = textValue(row?.invoiceIssuerName);
    const start = typeof row?.billingPeriodStart === 'string' ? row.billingPeriodStart : null;
    const end = typeof row?.billingPeriodEnd === 'string' ? row.billingPeriodEnd : null;
    const created = typeof row?.billingPeriodCreated === 'string' ? row.billingPeriodCreated : null;
    const updated = typeof row?.billingPeriodLastUpdated === 'string' ? row.billingPeriodLastUpdated : null;
    const status = textValue(row?.billingPeriodStatus);
    const startMs = utcTimestamp(start);
    const endMs = utcTimestamp(end);
    const createdMs = utcTimestamp(created);
    const updatedMs = utcTimestamp(updated);
    if (!invoiceIssuer || !start || !end || !created || !updated || !status
        || startMs === null || endMs === null || createdMs === null || updatedMs === null
        || startMs >= endMs || createdMs > updatedMs) {
      reasons.push('BillingPeriod row ' + index + ' has invalid FOCUS UTC timestamps or period bounds');
      return;
    }
    if (status !== 'Open' && status !== 'Closed') {
      reasons.push('BillingPeriod row ' + index + ' has a status outside the FOCUS 1.4 allowed values Open or Closed');
      return;
    }
    const key = JSON.stringify([invoiceIssuer, start]);
    if (keys.has(key)) {
      reasons.push('BillingPeriod must contain unique InvoiceIssuerName and BillingPeriodStart keys');
      return;
    }
    keys.add(key);
    parsedRows.push({
      invoiceIssuerName: invoiceIssuer,
      billingPeriodStart: start,
      billingPeriodEnd: end,
      billingPeriodCreated: created,
      billingPeriodLastUpdated: updated,
      billingPeriodStatus: status,
    });
  });

  if (reasons.length > 0) return null;
  const matchingRows = parsedRows.filter((row) =>
    row.invoiceIssuerName === metadata.issuer && row.billingPeriodStart === metadata.billingPeriodStart,
  );
  if (matchingRows.length !== 1 || matchingRows[0].billingPeriodEnd !== metadata.billingPeriodEnd) {
    reasons.push('BillingPeriod record does not match the target invoice issuer and billing period');
    return null;
  }
  return matchingRows[0].billingPeriodStatus;
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
  const scales = [
    ...[...usageRows, ...detailRows].map((row) => decimalScale(row.billedCost)),
    ...detailRows.filter((row) => row.paymentCurrencyFieldsPresent)
      .map((row) => decimalScale(row.paymentCurrencyBilledCost)),
  ];
  if (scales.some((scale) => scale === null)) {
    reasons.push('all billed costs, including payment-currency amounts, must be decimal strings with at most 12 fractional digits');
  }
  if (reasons.length > 0) return null;
  const scale = scales.reduce<number>((maximum, value) => value === null ? maximum : Math.max(maximum, value), metadata.toleranceScale);
  return { usageRows, detailRows, scale };
};

const validateInvoiceDetailIdentifiers = (
  rows: NormalizedCharge[],
  reasons: string[],
): void => {
  const seenIds = new Set<string>();
  for (const row of rows) {
    if (!row.invoiceDetailId) {
      reasons.push('every InvoiceDetail row must have an InvoiceDetailId');
    } else if (seenIds.has(row.invoiceDetailId)) {
      reasons.push('InvoiceDetailId must be unique within the invoice');
    } else {
      seenIds.add(row.invoiceDetailId);
    }
  }
};

const validateUsageIdentifiers = (rows: NormalizedCharge[], reasons: string[]): void => {
  for (const row of rows) {
    if (!isTax(row) && !row.invoiceDetailId) {
      reasons.push('non-tax CostAndUsage rows require InvoiceDetailId for line-item reconciliation');
    }
  }
};

const isPaymentCurrencyAggregateOnlyRow = (row: NormalizedCharge, scale: number): boolean =>
  row.paymentCurrencyFieldsPresent
  && row.paymentCurrencyBilledCost !== null
  && decimalUnits(row.billedCost, scale) === 0n
  && decimalUnits(row.paymentCurrencyBilledCost, scale) !== 0n;

const getComparableInvoiceRows = (
  usageRows: NormalizedCharge[],
  detailRows: NormalizedCharge[],
  scale: number,
  reasons: string[],
): { usageNonTaxRows: NormalizedCharge[]; detailNonTaxRows: NormalizedCharge[] } => {
  const usageNonTaxRows = usageRows.filter((row) => !isTax(row));
  // A payment-currency aggregate is a settlement record, not an independent
  // usage charge in the billing currency. Keep it in payment lineage analysis.
  const detailNonTaxRows = detailRows.filter((row) => !isTax(row) && !isPaymentCurrencyAggregateOnlyRow(row, scale));
  if (usageNonTaxRows.length === 0) reasons.push('no non-tax CostAndUsage rows are available for comparison');
  if (detailNonTaxRows.length === 0) reasons.push('no non-tax InvoiceDetail rows are available for comparison');
  return { usageNonTaxRows, detailNonTaxRows };
};

const validateInvoiceLineage = (
  usageRows: NormalizedCharge[],
  detailRows: NormalizedCharge[],
  scale: number,
  tolerance: string,
  reasons: string[],
): ComparableInvoiceRows | null => {
  validateInvoiceDetailIdentifiers(detailRows, reasons);
  validateUsageIdentifiers(usageRows, reasons);
  const comparable = getComparableInvoiceRows(usageRows, detailRows, scale, reasons);
  if (reasons.length > 0) return null;
  return {
    ...comparable,
    toleranceUnits: decimalUnits(tolerance, scale),
  };
};

const sumBilledCosts = (rows: NormalizedCharge[], scale: number): bigint =>
  rows.reduce((total, row) => total + decimalUnits(row.billedCost, scale), 0n);

const analyzePaymentCurrency = (
  detailRows: NormalizedCharge[],
  scale: number,
  reasons: string[],
): PaymentCurrencyAnalysis => {
  const paymentRows = detailRows.filter((row) => row.paymentCurrencyFieldsPresent);
  if (paymentRows.length === 0) return { status: 'NOT_PROVIDED', groups: [] };

  const initialReasonCount = reasons.length;
  if (paymentRows.length !== detailRows.length) {
    reasons.push('PaymentCurrency fields must be provided for every InvoiceDetail row when the dataset uses payment currency');
  }
  const detailById = new Map<string, NormalizedCharge>();
  for (const row of detailRows) {
    if (!row.invoiceDetailId) continue;
    if (detailById.has(row.invoiceDetailId)) {
      reasons.push('PaymentCurrencyInvoiceDetailId validation requires unique InvoiceDetailId values');
    } else {
      detailById.set(row.invoiceDetailId, row);
    }
  }

  const groups = new Map<string, {
    paymentCurrency: string;
    targetId: string;
    billingCurrencyBilledCost: bigint;
    paymentCurrencyBilledCost: bigint;
  }>();
  const currencyByTarget = new Map<string, string>();

  for (const row of paymentRows) {
    const currency = row.paymentCurrency;
    const targetId = row.paymentCurrencyInvoiceDetailId;
    const paymentAmount = row.paymentCurrencyBilledCost;
    if (!row.invoiceDetailId || !currency || !targetId || paymentAmount === null) {
      reasons.push('PaymentCurrency, PaymentCurrencyBilledCost, and PaymentCurrencyInvoiceDetailId are required together');
      continue;
    }
    const targetRow = detailById.get(targetId);
    if (!targetRow) {
      reasons.push(`PaymentCurrencyInvoiceDetailId ${targetId} does not resolve to an InvoiceDetailId in the invoice`);
      continue;
    }
    if (!targetRow.paymentCurrencyFieldsPresent
        || targetRow.paymentCurrency !== currency
        || targetRow.paymentCurrencyInvoiceDetailId !== targetId) {
      reasons.push(`PaymentCurrencyInvoiceDetailId ${targetId} does not resolve to its matching payment-currency aggregate record`);
    }
    if (decimalUnits(paymentAmount, scale) !== 0n && row.invoiceDetailId !== targetId) {
      reasons.push('non-zero PaymentCurrencyBilledCost requires PaymentCurrencyInvoiceDetailId to equal the row InvoiceDetailId');
    }
    const priorCurrency = currencyByTarget.get(targetId);
    if (priorCurrency && priorCurrency !== currency) {
      reasons.push(`PaymentCurrency values conflict for PaymentCurrencyInvoiceDetailId ${targetId}`);
    } else {
      currencyByTarget.set(targetId, currency);
    }
    const key = JSON.stringify([currency, targetId]);
    const aggregate = groups.get(key) ?? {
      paymentCurrency: currency,
      targetId,
      billingCurrencyBilledCost: 0n,
      paymentCurrencyBilledCost: 0n,
    };
    aggregate.billingCurrencyBilledCost += decimalUnits(row.billedCost, scale);
    aggregate.paymentCurrencyBilledCost += decimalUnits(paymentAmount, scale);
    groups.set(key, aggregate);
  }

  if (reasons.length > initialReasonCount) return { status: 'UNKNOWN', groups: [] };
  const result = [...groups.values()]
    .sort((left, right) => compareCodeUnits(left.targetId, right.targetId))
    .map((group) => ({
      paymentCurrency: group.paymentCurrency,
      paymentCurrencyInvoiceDetailId: group.targetId,
      billingCurrencyBilledCost: formatUnits(group.billingCurrencyBilledCost, scale),
      paymentCurrencyBilledCost: formatUnits(group.paymentCurrencyBilledCost, scale),
    }));
  return { status: 'ANALYZED', groups: result };
};

const analyzeTaxReconciliation = (
  usageRows: NormalizedCharge[],
  detailRows: NormalizedCharge[],
  toleranceUnits: bigint,
  scale: number,
): TaxReconciliationAnalysis => {
  const usageTaxRows = usageRows.filter(isTax);
  const detailTaxRows = detailRows.filter(isTax);
  if (usageTaxRows.length === 0 || detailTaxRows.length === 0) {
    return { status: 'NOT_COMPARABLE', variance: null };
  }
  const variance = sumBilledCosts(usageTaxRows, scale) - sumBilledCosts(detailTaxRows, scale);
  return {
    status: absolute(variance) <= toleranceUnits ? 'RECONCILED' : 'VARIANCE',
    variance: formatUnits(variance, scale),
  };
};

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

interface InvoiceLineItemComparison {
  lineItem: FocusInvoiceLineItemReconciliation;
  missingMapping: boolean;
  variance: boolean;
  reasons: string[];
}

const isInvoiceLineWithinTolerance = (
  hasUsage: boolean,
  hasDetail: boolean,
  variance: bigint,
  toleranceUnits: bigint,
): boolean => hasUsage && hasDetail && absolute(variance) <= toleranceUnits;

const invoiceLineItemReasons = (
  id: string,
  missingMapping: boolean,
  hasVariance: boolean,
): string[] => [
  ...(missingMapping ? [`InvoiceDetailId ${id} is not present in both datasets`] : []),
  ...(hasVariance ? [`BilledCost variance for InvoiceDetailId ${id} exceeds tolerance`] : []),
];

interface InvoiceLineAmounts {
  hasUsage: boolean;
  hasDetail: boolean;
  usageAmount: bigint;
  detailAmount: bigint;
  varianceAmount: bigint;
  withinTolerance: boolean;
}

const calculateInvoiceLineAmounts = (
  id: string,
  usageById: Map<string, bigint>,
  detailById: Map<string, bigint>,
  toleranceUnits: bigint,
): InvoiceLineAmounts => {
  const hasUsage = usageById.has(id);
  const hasDetail = detailById.has(id);
  const usageAmount = usageById.get(id) ?? 0n;
  const detailAmount = detailById.get(id) ?? 0n;
  const varianceAmount = usageAmount - detailAmount;
  return {
    hasUsage,
    hasDetail,
    usageAmount,
    detailAmount,
    varianceAmount,
    withinTolerance: isInvoiceLineWithinTolerance(hasUsage, hasDetail, varianceAmount, toleranceUnits),
  };
};

const hasMissingInvoiceLineMapping = (amounts: InvoiceLineAmounts): boolean =>
  !amounts.hasUsage || !amounts.hasDetail;

const hasInvoiceLineVariance = (amounts: InvoiceLineAmounts): boolean =>
  amounts.hasUsage && amounts.hasDetail && !amounts.withinTolerance;

const createInvoiceLineItem = (
  id: string,
  amounts: InvoiceLineAmounts,
  scale: number,
): FocusInvoiceLineItemReconciliation => ({
  invoiceDetailId: id,
  costAndUsageBilledCost: formatUnits(amounts.usageAmount, scale),
  invoiceDetailBilledCost: formatUnits(amounts.detailAmount, scale),
  variance: formatUnits(amounts.varianceAmount, scale),
  withinTolerance: amounts.withinTolerance,
});

const compareOneInvoiceLineItem = (
  id: string,
  usageById: Map<string, bigint>,
  detailById: Map<string, bigint>,
  toleranceUnits: bigint,
  scale: number,
): InvoiceLineItemComparison => {
  const amounts = calculateInvoiceLineAmounts(id, usageById, detailById, toleranceUnits);
  const missingMapping = hasMissingInvoiceLineMapping(amounts);
  const hasVariance = hasInvoiceLineVariance(amounts);
  return {
    lineItem: createInvoiceLineItem(id, amounts, scale),
    missingMapping,
    variance: hasVariance,
    reasons: invoiceLineItemReasons(id, missingMapping, hasVariance),
  };
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
    const comparison = compareOneInvoiceLineItem(id, usageById, detailById, toleranceUnits, scale);
    lineItems.push(comparison.lineItem);
    hasMissingMapping ||= comparison.missingMapping;
    hasVariance ||= comparison.variance;
    reasons.push(...comparison.reasons);
  }

  return { lineItems, hasMissingMapping, hasVariance };
};

const buildInvoiceResult = (
  metadata: InvoiceMetadata,
  datasets: NormalizedInvoiceDatasets,
  comparableRows: ComparableInvoiceRows,
  comparison: InvoiceLineComparison,
  paymentCurrency: PaymentCurrencyAnalysis,
  tax: TaxReconciliationAnalysis,
  reasons: string[],
  billingPeriodStatus: string | null,
): FocusInvoiceReconciliationResult => ({
  specVersion: 'FOCUS-1.4',
  status: comparison.hasMissingMapping ? 'UNKNOWN' : comparison.hasVariance ? 'VARIANCE' : 'RECONCILED',
  evidenceClass: 'analysis',
  reconciliationScope: 'provided-dataset-consistency-only',
  reconciliationBasis: 'non-tax-line-items-only',
  paymentCurrencyStatus: paymentCurrency.status,
  paymentCurrencyGroups: paymentCurrency.groups,
  taxReconciliationStatus: tax.status,
  taxVariance: tax.variance,
  invoiceIssuerName: metadata.issuer,
  invoiceId: metadata.invoiceId,
  billingPeriodStart: metadata.billingPeriodStart,
  billingPeriodEnd: metadata.billingPeriodEnd,
  billingCurrency: metadata.currency,
  billingPeriodStatus,
  roundingTolerance: formatUnits(comparableRows.toleranceUnits, datasets.scale),
  costAndUsageNonTaxTotal: formatUnits(sumBilledCosts(comparableRows.usageNonTaxRows, datasets.scale), datasets.scale),
  costAndUsageTaxTotal: formatUnits(sumBilledCosts(datasets.usageRows.filter(isTax), datasets.scale), datasets.scale),
  invoiceDetailNonTaxTotal: formatUnits(sumBilledCosts(comparableRows.detailNonTaxRows, datasets.scale), datasets.scale),
  invoiceDetailTaxTotal: formatUnits(sumBilledCosts(datasets.detailRows.filter(isTax), datasets.scale), datasets.scale),
  invoiceDetailGrandTotal: formatUnits(sumBilledCosts(datasets.detailRows, datasets.scale), datasets.scale),
  lineItems: comparison.lineItems,
  reasons: [...new Set(reasons)],
});

export const reconcileFocusInvoice = (
  input: FocusInvoiceReconciliationInput,
): FocusInvoiceReconciliationResult => {
  const reasons: string[] = [];
  const paymentCurrencyWasSupplied = hasPaymentCurrencyInput(input?.invoiceDetail);
  const unknownPaymentCurrencyStatus: FocusPaymentCurrencyStatus = paymentCurrencyWasSupplied ? 'UNKNOWN' : 'NOT_PROVIDED';
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
      null,
      unknownPaymentCurrencyStatus,
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
      null,
      unknownPaymentCurrencyStatus,
    );
  }
  const metadata: InvoiceMetadata = metadataDraft;
  const billingPeriodStatus = validateBillingPeriodDataset(metadata, reasons);
  if (reasons.length > 0) return unknownResult(
    metadata.issuer, metadata.invoiceId, metadata.billingPeriodStart, metadata.billingPeriodEnd,
    metadata.currency, metadata.tolerance, reasons, billingPeriodStatus, unknownPaymentCurrencyStatus,
  );
  const datasets = normalizeInvoiceDatasets(metadata, reasons);
  if (!datasets) return unknownResult(
    metadata.issuer, metadata.invoiceId, metadata.billingPeriodStart, metadata.billingPeriodEnd,
    metadata.currency, metadata.tolerance, reasons, null, unknownPaymentCurrencyStatus,
  );
  const paymentCurrency = analyzePaymentCurrency(datasets.detailRows, datasets.scale, reasons);
  if (paymentCurrency.status === 'UNKNOWN') {
    return unknownResult(
      metadata.issuer, metadata.invoiceId, metadata.billingPeriodStart, metadata.billingPeriodEnd,
      metadata.currency, metadata.tolerance, reasons, billingPeriodStatus, 'UNKNOWN',
    );
  }
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
      null,
      paymentCurrency.status,
    );
  }
  const comparison = compareInvoiceLineItems(
    comparableRows.usageNonTaxRows,
    comparableRows.detailNonTaxRows,
    comparableRows.toleranceUnits,
    datasets.scale,
    reasons,
  );
  const tax = analyzeTaxReconciliation(
    datasets.usageRows,
    datasets.detailRows,
    comparableRows.toleranceUnits,
    datasets.scale,
  );
  return buildInvoiceResult(
    metadata, datasets, comparableRows, comparison, paymentCurrency, tax, reasons, billingPeriodStatus,
  );
};


