# GEAS FOCUS 1.4 Invoice Reconciliation

## Evidence boundary

This module reconciles caller-supplied CostAndUsage and InvoiceDetail rows. Its results are **analysis of provided-dataset consistency** only. They do not authenticate an invoice issuer, establish that a legal invoice was issued, validate a bank transfer, or prove that payment settled.

## Forward-looking FOCUS 1.5 watch (non-normative)

As of 2026-11-09, FOCUS 1.4 remains the current published version. The FinOps Foundation's [FOCUS 1.5 release-scope page](https://focus.finops.org/focus-1-5-release-scope/) identifies 3 December 2026 as the planned ratification date; until ratification and publication, its contents are a working draft rather than normative FOCUS requirements.

The 1.5 scope includes proposed cross-provider AI billing dimensions for model identity, token direction, cached versus uncached tokens, provider-issued consumption currency, and requester attribution through `PrincipalId`, `CredentialId`, and `RequesterDetails`. A separate SKU Price dataset is also in final review. The working-group scope explicitly says principal and credential identifiers must not contain values that authenticate requests, such as API-key strings.

GEAS therefore keeps this reconciler pinned to `FOCUS-1.4`. Do not change the parser, required columns, or reconciliation semantics based on the 1.5 working draft. Reassess only after the ratified specification, machine-readable requirements model, and migration guidance are published. The roadmap source is monitored as analysis and cannot establish that GLORIFIER implements or conforms to FOCUS 1.5.

Authoritative references:

- [FOCUS 1.4 Invoice Detail dataset](https://focus.finops.org/docs/specification/v1-4/datasets/invoice-detail/)
- [FOCUS 1.4 Payment Currency Billed Cost](https://focus.finops.org/docs/specification/v1-4/columns/invoice-detail/payment-currency-billed-cost/)
- [FOCUS 1.4 Payment Currency Invoice Detail ID](https://focus.finops.org/docs/specification/v1-4/columns/invoice-detail/payment-currency-invoice-detail-id/)
- [FOCUS 1.4 Invoice Reconciliation feature](https://focus.finops.org/docs/specification/v1-4/features/invoice-reconciliation/)

## Independent result dimensions

### Billing-currency, non-tax lines

The overall `status` continues to compare non-tax CostAndUsage rows with non-tax InvoiceDetail rows by InvoiceDetailId using exact decimal-string arithmetic and an explicit rounding tolerance.

`RECONCILED` means only that these supplied non-tax billing-currency rows reconcile within the supplied tolerance. It does not imply tax reconciliation, payment-currency reconciliation, invoice authenticity, or actual settlement.

### Payment-currency lineage

When payment-currency columns are supplied, all InvoiceDetail rows in that dataset must include valid values for:

- `PaymentCurrency`
- `PaymentCurrencyBilledCost`
- `PaymentCurrencyInvoiceDetailId`

The implementation verifies that each PaymentCurrencyInvoiceDetailId resolves to an InvoiceDetailId in the same invoice, that a non-zero PaymentCurrencyBilledCost is carried by its referenced aggregate row, and that the referenced rows use one consistent PaymentCurrency.

It groups records deterministically by payment currency and aggregate InvoiceDetailId, summing BilledCost and PaymentCurrencyBilledCost using BigInt decimal units. Aggregate-only rows whose billing-currency BilledCost is zero and payment-currency amount is non-zero are excluded from the separate non-tax billing-line comparison but retained in payment-currency analysis and the full InvoiceDetail totals.

- `NOT_PROVIDED`: no payment-currency fields were supplied.
- `ANALYZED`: supplied payment-currency lineage and aggregates are internally consistent.
- `UNKNOWN`: fields are partial, malformed, inconsistent, or referentially incomplete.

`ANALYZED` is not proof of conversion-rate correctness or payment settlement. The module does not verify FX rates or external payment evidence.

### Tax variance

Tax analysis is independent from the overall non-tax status.

- `NOT_COMPARABLE`: one or both supplied datasets contain no tax rows.
- `RECONCILED`: both contain tax rows and their aggregate amounts differ by no more than the explicit tolerance.
- `VARIANCE`: both contain tax rows and the absolute difference exceeds the explicit tolerance.

`taxVariance` is CostAndUsage tax total minus InvoiceDetail tax total. A tax variance does not rewrite the overall status, which remains specifically scoped to non-tax billing-currency line items.

## Operational constraints

- Missing, partial, or invalid lineage fails closed.
- Decimal arithmetic avoids IEEE-754 rounding.
- No invoice, payment, or provider identity is inferred from dataset consistency.
- No live provider APIs, payment rails, production data, or credentials are accessed by this reconciler.
