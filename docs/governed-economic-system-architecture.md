# GLORIFIER Governed Economic System — Architecture and Delivery Plan

**Status:** Architecture plan; implementation is partial. This document does not claim live FX rates, production payment execution, service delivery guarantees, or market liquidity are available.

## Objective

Integrate three capabilities as one governed economic system:

1. **Currency intelligence** explains what an asset is and calculates source-backed indicative quotes.
2. **Agent commerce governance** determines whether a principal and agent may request a service or propose a payment.
3. **Settlement evidence** reconciles an authorized intent with external evidence and the task outcome.

GLR is an optional, chain-specific settlement asset—not a permission token, stablecoin, guaranteed store of value, or mandatory currency for all agents.

## Existing repository foundations

- `src/lib/currency-intelligence.ts` (PR #226): typed asset metadata, decimal arithmetic, rate freshness, indicative quote and fee primitives. It does not fetch live rates or execute transactions.
- `src/lib/glr-economic-layer.ts` (main): GLR payment-intent state machine, human authorization, evidence references, and external-verification gate.
- `src/lib/glr-economic-layer.test.ts` (main): tests for amount normalization and settlement authorization/evidence rules.
- `docs/GLR-EVIDENCE-REGISTRY.md` (main): dated, chain-specific identity evidence for Ethereum, BNB Smart Chain, and Solana. Technical identity is not proof of liquidity, audit, market value, or adoption.
- `docs/currency-intelligence-engine.md` and `docs/glr-agent-commerce-utility-roadmap.md` (PR #226): currency data and opt-in commerce roadmaps.

The currency-intelligence engine is not yet wired into the payment-intent lifecycle. This is a plan for that integration, not a claim that the integration exists.

## Trust boundaries

- **Human owner / policy authority:** highest authority for consequential economic actions.
- **Agent and service identity:** establishes who is asking and what capability is requested; token ownership does not grant identity or permissions.
- **Currency intelligence:** read-only data and calculations; it cannot authorize or execute a payment.
- **Governance decision:** validates principal, purpose, allowed asset pair/network, recipient, spend cap, quote freshness, and required approval.
- **Payment intent:** durable proposal/authorization state; it is not a blockchain transaction.
- **Signer/provider adapter:** future separately reviewed integration, outside the quote engine; disabled until explicitly authorized and reviewed.
- **Evidence verifier:** independent chain RPC, explorer, authorized provider, or authoritative ledger evidence, with verifier identity and timestamp.
- **Task outcome evidence:** receipt/result reference distinct from settlement evidence; payment does not prove service quality.
- **Audit trail:** append-only decision and evidence references, without secrets or private keys.

## End-to-end flow

1. **Identify assets.** Resolve canonical asset ID, jurisdiction/issuer where relevant, and exact chain + contract/mint + decimals for tokens. If identity is ambiguous, return `NOT OBSERVABLE` or reject the pair.
2. **Quote read-only.** Require rate source, direction, observed/retrieved timestamps, freshness policy, precision and itemized known costs. Unknown costs remain unknown; stale data produces no amount. A quote is always non-executable.
3. **Build a service offer.** Record service/provider identity, task scope, quoted price denomination, quote evidence, expiry, cancellation/refund policy, and expected result evidence.
4. **Evaluate policy.** Check the requesting principal, agent capability, permitted network/asset, recipient, maximum spend, quote expiry, risk rules, duplicate/idempotency key, and human-approval requirement. Default deny when required data is missing.
5. **Create intent.** Persist a `PROPOSED` intent. Authorization must bind to the exact task, recipient, chain, asset, amount, fee ceiling and expiry; any material change requires a new approval.
6. **Authorize and commit.** Record explicit human approval before any consequential execution. A committed intent is still not proof of settlement.
7. **Execute only through a separately approved adapter.** This phase is out of scope for this PR. Never collect seed phrases or expose private keys to the intelligence layer. No automatic mint, transfer, bridge, swap, withdrawal, or trading.
8. **Reconcile external evidence.** Verify transaction/provider reference, network, asset, amount, recipient and finality using an identified authoritative verifier. Record evidence provenance and observed time. Missing or conflicting evidence remains `EVIDENCE_PENDING` / `NOT VERIFIED`.
9. **Verify the service outcome separately.** Attach a task result hash or evidence reference, provider result, and dispute state. Do not treat payment confirmation as proof that the task succeeded.
10. **Publish a truthful receipt.** Link task, quote, policy decision, approval, settlement evidence and outcome evidence. Redact secrets and minimize personal data.

## Canonical lifecycle and truth labels

Keep economic lifecycle separate from evidence truth:

- Lifecycle: `PROPOSED → AUTHORIZED → COMMITTED → EVIDENCE_PENDING → SETTLED`; `REJECTED` or `EXPIRED` are terminal alternatives where appropriate.
- Truth: `NOT VERIFIED`, `EVIDENCE-BACKED`, `VERIFIED`.
- A transition to verified settlement requires human authorization, transaction/evidence references, an explicit verification method, an identifiable verifier, and successful external verification. A model response or self-reported transaction hash alone is not enough.
- Task outcome status is a separate dimension: `UNKNOWN`, `SUCCEEDED`, `FAILED`, or `DISPUTED`, backed by task evidence.
- Never collapse quote freshness, token identity, payment finality, service outcome, legal eligibility, security review, and liquidity into one “verified” flag.

## Chain and asset rules

- Ethereum GLR, BNB Chain GLR and Solana Token-2022 GLR are distinct canonical asset identities.
- No cross-chain equivalence, bridge support, redemption at par, USD peg, or guaranteed market quote is assumed.
- Token identity must be loaded from the canonical evidence registry and rechecked against its evidence date/status before a consequential operation.
- If no reliable market quote or executable liquidity evidence exists, show `NO_RELIABLE_QUOTE`; never derive a price from supply, allocation plans, deployment, or token transfers.
- Fiat, e-money, stablecoins, CBDCs, tokenized deposits and floating crypto-assets need different metadata and risk fields. Do not infer backing or redemption rights from branding.

## Proposed module boundaries

| Module | Responsibility | Must not do |
|---|---|---|
| Asset registry | Canonical IDs, classifications, chain identifiers and evidence pointers | Invent peg, backing, market price or adoption |
| Rate adapters | Fetch licensed, sourced rates and preserve provenance/freshness | Execute trades or claim liquidity from a reference rate |
| Quote engine | Exact decimal calculations and transparent cost estimates | Authorize or execute a payment |
| Service offer | Task scope, provider, price denomination, expiry and outcome criteria | Claim a task succeeded without evidence |
| Policy gate | Principal, capability, spend cap, recipient, network, risk and approval | Allow token balance to bypass permissions |
| Intent ledger | Idempotent lifecycle and authorization evidence | Treat intent creation as settlement |
| Execution adapter | Future separately reviewed provider/wallet boundary | Access seed phrases or run without explicit approval |
| Reconciler | Independent settlement and task-evidence checks | Accept model-generated claims as authoritative proof |
| Receipt/audit layer | Reproducible references and redacted history | Store credentials or merge unrelated truth states |

## Implementation phases and gates

### Phase A — Architecture and testable domain contracts (current)
- Keep quote logic pure and read-only.
- Document data contracts between currency quote, service offer, payment intent, and evidence receipt.
- Add tests for wrong chain/asset identity, stale quote, unauthorized intent, duplicate/idempotent requests, partial/contradictory evidence, and task failure.
- Ensure sample fixtures are clearly marked illustrative and never used as live rate evidence.

### Phase B — Read-only integration
- Add a typed quote reference to a service offer/payment proposal without introducing execution.
- Enforce expiry and exact asset/network identity at the policy boundary.
- Store evidence pointers and quote inputs needed to reproduce a decision.
- Validate that no private key, wallet signer, or transaction-send method is reachable from quote endpoints.

### Phase C — Sandbox service pilot
- Select one useful AI service and test a sandbox ledger only; label sandbox units as having no real monetary value.
- Add service receipt, task result evidence, cancellation/dispute handling and idempotency.
- Measure task success, cost, repeat use and disputes without claiming production adoption.

### Phase D — Read-only live rates and provider comparison
- Integrate one approved rate source with license/terms review, source timestamps, pair-specific freshness, outage handling and confidence.
- Show known fees separately; unknown network or provider costs are not zero.
- Do not show a GLR market conversion unless a credible source and usable market evidence actually exist.

### Phase E — Optional production settlement (separate authorization gate)
Require independent security review, threat model, jurisdiction-specific legal/privacy review, provider authorization, wallet/signer isolation, exact-transaction human confirmation, spend limits, replay/idempotency controls, finality/reorg handling, reconciliation, refunds/disputes and recovery tests. No production execution is enabled by this architecture document.

## Required tests and acceptance criteria

- Exact decimal arithmetic, target precision, and documented rounding; no binary floating-point money arithmetic.
- Missing, malformed, future-dated or stale evidence fails closed.
- Wrong chain, wrong token address, unsupported asset pair and unknown decimals are rejected.
- No payment can be authorized or committed without the required principal, policy decision and explicit approval.
- Changed recipient, chain, asset, amount, fee ceiling or expired quote invalidates the approval.
- Duplicate requests do not create duplicate economic effects.
- Transaction reference without independent verification remains unverified.
- Verified payment does not automatically mark the service task successful.
- Quote calculation performs no network transaction and has no access to signing secrets.
- Logs and receipts omit secrets and minimize sensitive data.
- CI includes currency-engine tests, GLR economic-layer tests, type-check/lint, and architecture/governance checks.

## Operational truth dashboard

Report independent dimensions, each with source and last-checked time:

1. Asset identity and canonical registry freshness.
2. Rate availability, freshness and source disagreement.
3. Quote calculation status and known/unknown fees.
4. Policy decision and approval status.
5. Payment lifecycle and external settlement verification.
6. Task outcome and dispute status.
7. Security review, legal eligibility, liquidity and real usage evidence.

Use `FULLY VERIFIED`, `VERIFIED`, `PARTIALLY VERIFIED`, `NOT VERIFIED`, `DEGRADED`, and `NOT OBSERVABLE` only with explicit scope. “Fully verified” must name exactly what was verified and must not imply market readiness, safety, liquidity or adoption.

## Immediate next actions

1. Review this architecture and PR #226 together.
2. Add the currency quote tests to the required CI path and run them.
3. Review the duplicated Solana identity PRs (#223 and #225) for whether one supersedes the other; do not merge both blindly.
4. Integrate quote references into payment-intent proposals only after the domain contract and tests are agreed.
5. Keep all payment execution disabled until the separate security and authorization gate is approved.

**Core rule:** identify the asset, explain the quote, authorize the exact action, independently verify settlement, and separately prove the service outcome.
