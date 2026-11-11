# GEAS mandatory provider billing integrity control

## Decision

GEAS treats provider billing reconciliation as a mandatory financial-integrity prerequisite before GLORIFIER may label AI provider costs or AI operations `economically-verified`.

**Current state: NOT VERIFIED.** The generic GEAS evidence-record endpoint must reject `truth: "economically-verified"`. A caller-supplied `authoritative: true`, status string, amount, content hash, or evidence reference is not independent source authentication.

## Existing implementation boundary

`src/lib/governance/geas-focus-invoice-reconciliation.ts` implements deterministic FOCUS 1.4 consistency checks over caller-supplied CostAndUsage and InvoiceDetail datasets. It uses decimal-string / integer arithmetic, exact billing-period and currency checks, line-item mapping, tax analysis, and payment-currency lineage analysis.

That module's output is explicitly analysis of supplied-dataset consistency. A `RECONCILED` result does **not** prove that the provider issued the data, that the export is complete, that the invoice is authentic, that a charge was paid, or that a business outcome settled. GEAS therefore records the FOCUS implementation as present while keeping its evidence status NOT VERIFIED until it is run against authenticated provider-origin data.

## Mandatory controls

| Control | Current implementation | Evidence required before promotion |
|---|---|---|
| Provider-issued usage authenticity | NOT IMPLEMENTED | Read-only provider-native usage export; independently established provider account/project identity; bounded source period; integrity provenance |
| GLORIFIER request metering completeness | NOT IMPLEMENTED | Complete per-request records correlated to provider request IDs where available; provider/account/project; model and version; timestamp; input/output/cache usage; retries; exact period coverage |
| Provider invoice authenticity | NOT IMPLEMENTED | Provider-issued invoice or billing export with issuer identity and source integrity independently established |
| FOCUS 1.4 usage-to-invoice consistency | IMPLEMENTED; live evidence NOT VERIFIED | Authenticated CostAndUsage and InvoiceDetail datasets for the same invoice, period and currency; no missing mappings or unexplained variance; explicit tolerance |
| Credits, vouchers, discounts, taxes, refunds and adjustments | NOT IMPLEMENTED | Provider source records for credits and all adjustments, including late-arriving corrections; missing fields must never be converted to zero |
| Period completeness and duplicate control | NOT IMPLEMENTED | Idempotent import, duplicate detection, immutable source hashes, gap checks, exact period boundaries, controlled close/reopen audit trail |

A billing reconciliation must not silently collapse distinct currencies. Cost amounts remain exact decimal strings; any currency conversion requires an explicitly identified, authorized source and timestamp. No cost is inferred from token counts without a provider-issued rate/charge record.

## Evidence and status semantics

- `NOT CONNECTED`: no authorized provider source is connected.
- `PENDING`: source records exist but the complete required evidence set is not yet reconciled.
- `PARTIALLY RECONCILED`: only a bounded portion of the period or dataset is matched.
- `RECONCILED`: authenticated provider usage and invoice sources match complete GLORIFIER metering for the exact period, including supported credits and adjustments, within an explicit policy tolerance.
- `DISCREPANCY`: unexplained variance, missing usage, duplicate charges, invalid mapping, or conflicting source records exist.

Only a `RECONCILED` state, with all mandatory controls satisfied and evidence retained, may be considered by a future dedicated server-side GEAS verifier. A `DISCREPANCY` state is never eligible and must remain blocked pending investigation and reconciliation. The generic record endpoint is not that verifier and must remain blocked for economic truth. A dataset reconciler's status alone cannot promote the claim.

Provider cost reconciliation is also distinct from verified revenue or independently verified economic outcomes. Revenue and settlement claims require their own authoritative external settlement evidence and verification path.

## Zero-spend / no-surprise-charge policy

This implementation is source code, deterministic tests, and documentation only. It does not call provider APIs, submit prompts, enable inference, buy credits, consume paid quota, change billing settings, write production data, or modify secrets.

No paid provider call, subscription, upgrade, or unexpected charge is authorized. Voucher, free-credit, sponsor, or monetization support may be evaluated only when available and explicitly approved by the human owner. Free credits are not assumed to exist and must not be treated as permission for automatic usage. Keep inference, external egress, and paid inference default-deny until separately authorized.

## Promotion acceptance gate

GEAS may only reconsider this control after all of the following are evidenced for the exact provider account and billing period:

1. Provider-native usage and invoice data are obtained through a source-authenticated read-only process.
2. The internal GLORIFIER metering ledger covers every applicable request, retry, model, and usage dimension for the same period.
3. FOCUS 1.4 CostAndUsage and InvoiceDetail rows reconcile by invoice line, currency and period, with tax and payment currency handled separately.
4. Credits, vouchers, discounts, taxes, refunds and later adjustments are included; duplicates and missing records are resolved.
5. Source artifacts, timestamps, issuer/account identity, source hashes, verifier identity, policy version, tolerances and all exceptions are retained.
6. A dedicated server-side GEAS verifier evaluates the complete evidence set. Client-supplied booleans or self-declared authority flags cannot satisfy this gate.

Until then, the authoritative status is **NOT VERIFIED**, and GLORIFIER must not claim that its AI operations are economically verified.
