# GLORIFIER Governed Economic System

**Status:** Architecture and implementation plan only. This does not enable live rates, authorize payments, create a wallet, or prove settlement.

## Goal
Connect three capabilities as one governed system:
1. **Currency intelligence:** identify assets, calculate indicative conversions, disclose freshness and costs.
2. **Transaction verification:** validate reported settlement against authoritative evidence, inspired by the distinction between a transaction reference and independently verified network state. This is not a claim that GLORIFIER uses Bitcoin consensus.
3. **AI-agent commerce:** connect task, provider, price, authorization, and outcome evidence to a governed economic intent. GLR is optional and only where a specific provider accepts that exact chain-specific asset.

## Architecture flow
Agent or human request → identity, capability, purpose → policy, budget, and jurisdiction gate → currency intelligence → payment/service option → human-authorized economic intent → separately approved execution boundary → external receipt → independent evidence verifier → settlement state and audit record.

Policy denial or missing authorization stops the flow. Currency intelligence and quote calculation remain read-only. No seed phrase or private key belongs in the intelligence layer.

## Components and responsibilities
| Component | Responsibility | Must not claim |
|---|---|---|
| Asset registry | Typed fiat, deposit/e-money, stablecoin, floating crypto, CBDC, and tokenized-deposit records; exact token chain and contract/mint | Similar symbols or chain deployments are interchangeable |
| Rate evidence adapter | Source, pair direction, observed/retrieved timestamps, freshness, provider health | A reference rate is executable or proves liquidity |
| Quote calculator | Exact decimal arithmetic, documented rounding, itemized fee/spread/slippage estimates | Guaranteed received amount or zero cost when unknown |
| Agent commerce policy | Principal, task, capability, provider, spend cap, allowed asset/rail, expiry, approval | Owning GLR grants authority or bypasses policy |
| Economic intent ledger | Proposal, authorization, commitment, pending evidence, settlement, rejection, expiry | Authorization or commitment equals settlement |
| Evidence verifier | Validate authoritative chain/provider/ledger evidence against exact approved intent | A screenshot, model summary, or transaction hash alone proves settlement |
| Human approval boundary | Confirm exact consequential action and bounded parameters | Approval covers changed recipient, amount, chain, fee, or expired quote |

## Separate state machines
- **Quote status:** VERIFIED_SOURCE, INDICATIVE, STALE, DEGRADED, NO_RELIABLE_QUOTE, UNSUPPORTED_PAIR, NOT_OBSERVABLE.
- **Economic intent:** PROPOSED → AUTHORIZED → COMMITTED → EVIDENCE_PENDING → SETTLED; side exits are REJECTED and EXPIRED.
- **Truth status:** NOT VERIFIED, EVIDENCE-BACKED, VERIFIED.

A successful quote is not payment authorization. An authorized intent is not execution. A transaction reference is not settlement proof. Only an independent verifier may mark SETTLED / VERIFIED after checking authoritative evidence against the exact approved intent. Missing or mismatched evidence remains UNKNOWN / NOT VERIFIED.

## GLR identity rules
The canonical evidence registry reports separate technical identities:
- Ethereum Mainnet: chain ID 1, ERC-20 0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb, 18 decimals.
- BNB Smart Chain: chain ID 56, contract 0x5e0B0A449232FDA7cA6Ea3419A50873b08F64804, 18 decimals.
- Solana Mainnet Beta: Token-2022 mint 7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9, 9 decimals.

These are reported technical identities, not proof of price, liquidity, audit completion, adoption, or cross-chain fungibility. Runtime code must read current registry evidence rather than treating compiled sample data as live truth. No bridge equivalence is implied.

## Implementation phases
### Phase 0 — Architecture and offline tests (current scope)
- Keep currency code pure and read-only.
- Test exact decimal rounding, invalid input, freshness of both observed and retrieved timestamps, unsupported pairs, fee bounds, and fail-closed statuses.
- Keep proposed API routes documented as proposals until implemented.
- Gate: relevant tests and required CI pass; no transaction capability added.

### Phase 1 — Evidence-backed asset registry
- Define a versioned schema for asset identity and provenance.
- Validate chain, contract/mint, decimals, source, and review timestamp.
- Treat examples as fixtures; runtime identity must come from current registry evidence.
- Gate: schema, collision, and mismatch tests pass.

### Phase 2 — Read-only live rates
- Add one approved provider behind an adapter.
- Record source, pair direction, observation and retrieval time, freshness, and provider health.
- Return NO_RELIABLE_QUOTE on outage, unsupported pair, stale evidence, or material source disagreement.
- Gate: outage/staleness tests and provider-terms review; no payment credentials.

### Phase 3 — Governed commerce intents
- Link agent identity, capability, task evidence, provider offer, quote ID, budget, and policy decision to the existing GLR intent state machine.
- Enforce idempotency, expiry, replay resistance, and exact-parameter approval.
- Keep service price and optional GLR equivalent separate; never invent a GLR market price.
- Gate: adversarial policy, duplicate-request, and state-transition tests.

### Phase 4 — Read-only settlement verification
- Verify authoritative state for a submitted transaction reference.
- Check exact network, asset, recipient, amount, finality, and linkage to the approved intent.
- Store evidence references and verifier version; do not accept an AI summary as proof.
- Gate: tests for wrong chain/recipient/amount, reverted or pending transaction, duplicate reference, stale finality, and unavailable RPC.

### Phase 5 — Optional execution (separate future authorization)
- Out of scope. Requires explicit human authorization, separate signer boundary, least-privilege spending controls, independent security/threat-model review, privacy/legal review, and incident procedures.
- This plan enables no autonomous trading, custody, minting, bridging, transfers, or payments.

## Minimum audit record
Record schema version, principal/task, provider offer, source and target asset IDs, exact chain/contract/mint, amount, rate source and timestamps, rounding version, itemized estimates, quote expiry, policy decision, human approval reference, transaction/receipt reference, verifier method/version, external evidence reference, and final truth state. Exclude secrets and seed phrases.

## Release acceptance checklist
- [ ] Three capabilities are connected by explicit IDs and evidence.
- [ ] Quotes are read-only and non-executable.
- [ ] Missing, stale, inconsistent, or unsupported rate evidence fails closed.
- [ ] Precision and fee boundaries are tested.
- [ ] Each GLR network uses its exact chain and contract/mint.
- [ ] No price or liquidity is inferred from supply or technical deployment verification.
- [ ] No intent is settled solely from authorization, a model output, or a transaction hash.
- [ ] GEAS policy and human authority cannot be bypassed by token ownership or agent capability.
- [ ] Relevant tests and required CI pass before merge.
- [ ] Any future execution integration is separately reviewed and explicitly authorized.

**Core rule:** currency intelligence explains value; governance authorizes action; independent evidence establishes settlement. GLR is an optional asset, not a substitute for identity, policy, evidence, or human authority.