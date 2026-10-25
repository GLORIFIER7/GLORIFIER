# Revenue Pipeline Remediation Plan

## Status

This document is a remediation specification, not evidence that the controls below are implemented or that the production pipeline is healthy. Until implementation and verification are complete, revenue totals must be reported as `NOT VERIFIED` when authoritative data is unavailable.

## Non-negotiable economic classifications

Keep these measures separate in storage, API responses, reports, and dashboards:

- `opportunity_estimate`: advertised or model-estimated value; never revenue.
- `reward_promised`: a promise or award announcement; never revenue.
- `accepted_work`: evidence that a deliverable was accepted; not settlement.
- `cash_settled`: payment-provider settlement independently verified.
- `glr_chain_settled`: canonical GLR transaction independently verified on the correct chain/mint and recipient, with required finality.
- `reconciled_revenue`: settled payment matched to accepted work/service delivery and an authoritative ledger entry.

Missing or unavailable evidence must yield `UNKNOWN` / `NOT VERIFIED`, not zero and not success.

## Required implementation controls

### 1. Settlement verifier boundary

- A caller-supplied `paid`, `confirmed`, evidence URL, or transaction hash is not proof of settlement.
- Verify payments against the authoritative provider API or independent chain RPC/verifier before any ledger write.
- For GLR, validate chain/network, canonical token or mint, payer, configured recipient, exact amount, transaction success/finality, and binding to the server-created payment intent.
- Store verifier name/version, verification timestamp, canonical transaction ID, intent ID, and a digest/reference to the verification evidence.
- Fail closed when credentials, provider APIs, RPC, finality, or evidence are unavailable.

### 2. Idempotency and duplicate prevention

- Use a canonical uniqueness key for each settlement: `(provider, canonical_transaction_id)`; for chain payments include network/chain and transaction signature/hash.
- Do not derive settlement identity from a caller-provided evidence URL.
- Reject reuse of a canonical transaction for a different customer, intent, amount, asset, or service.
- Enforce the uniqueness constraint in the database and handle conflicts as duplicate/replay attempts.
- Before adding constraints, audit and reconcile existing duplicates; do not silently delete or rewrite financial records.

### 3. Owner approval and authorization

- Enforce authorization at the API/service boundary; an `actor` string supplied by a caller is not authentication.
- Record authenticated principal, approval record ID, scope, timestamp, action, and relevant evidence for claim, submission, payout, release, and other externally consequential actions.
- Keep discovery and reporting read-only by default.
- Do not automate claims, customer commitments, payouts, transfers, trades, wallet signatures, or production releases without explicit owner authorization.

### 4. Acceptance-to-settlement lifecycle

Permitted state progression must be validated server-side and transactionally:

`DISCOVERED → FUNDING_VERIFIED → ELIGIBILITY_VERIFIED → CLAIMED → IN_PROGRESS → SUBMITTED → ACCEPTED → SETTLEMENT_PENDING → SETTLED`

- Funding and eligibility transitions require source-backed evidence.
- `ACCEPTED` requires evidence from the customer/program authority.
- `SETTLED` requires independent settlement verification; never infer it from acceptance or a non-empty URL.
- Preserve rejected, expired, disputed, refunded, and reversed states as separate outcomes.
- Store state transitions in an append-only audit log; reject invalid transitions and concurrent stale updates.

### 5. Revenue ledger semantics

- A revenue writer must accept only a verifier-produced settlement result, not arbitrary caller status.
- Use integer minor units for fiat; use exact integer/base-unit quantities for tokens. Never use floating-point arithmetic for settlement amounts.
- Maintain distinct fields for gross receipts, refunds, disputes, fees, and net receipts.
- Do not count `reward-promised`, advertised rewards, token balances, offers, quotes, test transactions, or unverified references as revenue.
- Reconcile ledger entries to accepted work, provider/chain evidence, and delivered service using a stable intent ID.
- Reports must disclose source coverage and reconciliation exceptions.

### 6. Data availability and fail-safe reporting

- Expose separate health for database connectivity, schema/migration readiness, discovery freshness, provider verification, chain verification, and ledger reconciliation.
- A database quota/error must surface as degraded/unavailable; do not silently switch to an empty database and report zero revenue.
- Before treating Supabase as a Neon fallback, verify schema parity, record counts, checksums, ownership, migration history, RLS policies, and tested rollback/recovery.
- Use least-privilege RLS policies and test both authorized and unauthorized access paths.
- Health probes must be read-only and must not perform a payment or sign a transaction.

## Acceptance tests required before marking complete

- [ ] Advertised reward cannot increase actual or verified revenue.
- [ ] A caller-supplied `paid` / `confirmed` status without verifier evidence is rejected.
- [ ] Invalid or unavailable provider/chain verification fails closed.
- [ ] Wrong chain, token/mint, payer, recipient, amount, or finality is rejected.
- [ ] The same canonical transaction cannot settle twice, even with a different evidence URL.
- [ ] The same transaction cannot be bound to two customers or service intents.
- [ ] An unauthenticated or non-owner actor cannot advance protected stages or approve financial actions.
- [ ] Acceptance alone cannot set `SETTLED`.
- [ ] Refunds, disputes, reversals, and fees reconcile correctly.
- [ ] Neon quota failure produces `NOT OBSERVABLE`, not an empty/zero financial report.
- [ ] Supabase fallback passes schema, record, RLS, and recovery verification before use.
- [ ] A controlled test-mode customer journey reconciles intent → payment verification → service delivery → ledger entry.
- [ ] No live funds, wallet signatures, or production financial actions are used by automated tests.

## Current blockers requiring evidence

- Neon read-only queries previously returned HTTP 402 quota exceeded.
- Supabase's inspected public tables did not provide a populated opportunity/revenue-ledger fallback.
- The current bounty payout helper records a `paid` event from caller-provided payment reference/evidence URL without independently verifying settlement.
- The generic revenue ledger uses event ID uniqueness, but the canonical provider transaction reference is not itself uniquely constrained.
- The bounty revenue writer accepts caller-supplied `confirmed` status.
- The inspected bounty stage helper accepts an actor string without enforcing owner identity itself.
- No completed customer pilot and acceptance evidence have been established.

These observations require fresh verification during implementation. This document alone does not resolve the runtime, database, onboarding, or settlement blockers.
