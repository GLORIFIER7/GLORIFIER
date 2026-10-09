# GLORIFIER Currency Intelligence Engine

**Status:** Feature specification and staged implementation plan. This document is not evidence that currency conversion, live rates, payment execution, custody, or GLR settlement is already implemented.

## 1. Product goal

Build a provider-neutral **Currency Intelligence Engine** that helps people and authorized AI agents understand currencies, compare payment options, calculate indicative conversions and total costs, and produce auditable payment decisions.

The engine should support the real-world monetary ecosystem rather than assume every asset is equivalent:

- Sovereign fiat currencies and their cash/bank payment rails.
- Bank deposits, electronic money, and mobile-money balances where supported by an authorized provider.
- Commodity-linked or redeemable instruments only where the redemption claim and evidence are documented.
- Fiat-backed stablecoins, with issuer, reserve disclosure, redemption access, chain, and depeg risk represented explicitly.
- Floating crypto-assets, including GLR, with market prices, liquidity, volatility, network fees, and chain identity represented explicitly.
- Central-bank digital currency or tokenized deposits only when an authorized, real integration exists.

The three traditional functions of money—unit of account, medium of exchange, and store of value—are evaluation dimensions, not assumed properties. A currency's price, backing, acceptance, and usefulness are separate facts.

## 2. Currency and asset registry

Each supported asset should have a typed registry record with:

- Canonical identifier and ISO 4217 code where applicable; do not invent ISO codes for crypto-assets.
- Display name, symbol, jurisdiction/issuer, asset class, and minor-unit precision.
- For tokens: chain ID, token standard, contract or mint address, decimals, and canonical-identity evidence.
- Valuation method: official reference rate, market quote, issuer redemption claim, or no reliable quote.
- Issuance and redemption model, known reserve disclosures, transfer restrictions, and source links.
- Supported payment rails, geographic availability, and eligibility constraints.
- Data source, observed-at timestamp, retrieval timestamp, freshness window, and confidence/status.
- Known risks: FX volatility, depeg, counterparty/issuer, custody, liquidity, settlement finality, reversibility, and legal/regulatory uncertainty.

Never infer backing, redemption rights, government endorsement, exchange listing, or cross-chain fungibility from an asset's name or symbol.

## 3. Quote and conversion engine

Given an amount and a source/target asset, produce an **indicative quote** with:

1. Source and target asset identifiers, including chain and contract for tokens.
2. Exchange rate, direction, rate source, timestamp, and expiry/freshness status.
3. Gross converted amount and precision/rounding method.
4. Provider fee, payment-rail fee, blockchain/network fee, spread, estimated slippage, and any disclosed tax estimate as separate line items.
5. Estimated net received amount and total effective cost.
6. Quote confidence, risk flags, and what is unknown.
7. A quote ID and evidence record so the decision can be reproduced later.

Use direct market quotes when reliable; otherwise calculate a cross-rate through a documented intermediate asset and mark it as derived. Never present a stale, indicative, or estimated rate as a guaranteed execution price. If no reliable rate exists, return `UNKNOWN / NO_RELIABLE_QUOTE` rather than fabricate a number.

### Precision and arithmetic rules

- Use decimal or integer minor-unit arithmetic; never binary floating point for money calculations.
- Preserve source precision and apply explicit, documented rounding at the final target amount.
- Keep token decimals separate from fiat minor units.
- Guard against zero, negative, overflow, invalid precision, unsupported pair, stale rates, and divide-by-zero.
- Show both the exchange rate and the amount that the recipient is expected to receive.
- Requote before any eventual execution if the quote has expired or market conditions changed.

## 4. Payment-option comparison

For a requested payment, compare only genuinely available and authorized methods. Consider:

- Total cost (not just the headline FX rate).
- Estimated delivery and settlement finality.
- Volatility between quote and settlement.
- Liquidity, slippage, and minimum/maximum transaction size.
- Refundability, dispute path, chargeback risk, and counterparty risk.
- Network availability, confirmation requirements, and recipient compatibility.
- Geographic access, identity checks, provider terms, and legal constraints.
- Privacy and data minimization.

Return a transparent ranked comparison with reasons and trade-offs. Do not optimize solely for the lowest fee if it creates materially greater risk or violates the user's constraints.

## 5. GLORIFIER (GLR) integration

GLR is a floating crypto-asset unless a separately reviewed and genuinely implemented arrangement establishes different properties. The engine must not assume a USD peg, reserve backing, redemption at par, guaranteed price, exchange listing, meaningful liquidity, or universal AI acceptance.

For GLR quotes:

- Require the exact chain, contract/mint address, decimals, and current canonical registry status.
- Treat Ethereum GLR, BNB Chain GLR, and Solana GLR as separate chain-specific assets. Do not imply they are interchangeable or bridged without verified bridge evidence.
- Use a timestamped, sourced market quote only where a real, sufficiently reliable market exists. Show market depth, spread, and slippage limits when available.
- If there is no reliable market price or executable liquidity, show **NO RELIABLE MARKET QUOTE**; do not manufacture a USD value from total supply, a tokenomics allocation, a mint event, or an arbitrary price.
- Let service providers quote work in fiat or a supported stablecoin and optionally show an indicative GLR equivalent. The service price and GLR market value must remain distinct.
- Treat GLR as an optional payment method accepted by a specific participating provider—not as the default currency of every agent.
- Do not mint, transfer, swap, bridge, custody, or execute a payment automatically as part of quote generation.

## 6. AI-agent authorization and governance

The engine is an intelligence and decision-support feature first, not an autonomous trading bot.

Every agent request must include a principal, purpose, allowed asset pairs, maximum spend, allowed providers/chains, quote freshness limit, and whether human confirmation is required. Apply least privilege and fail closed.

Before a payment can be executed by a future separately approved integration, require a fresh quote, explicit authorization for the exact asset/chain/recipient/amount/fee ceiling, duplicate-request protection, and a clear confirmation summary. High-risk, cross-chain, irreversible, or out-of-policy actions require human approval. Quote and comparison endpoints must be read-only.

Never request or store seed phrases. Keep private keys outside the intelligence layer and use an independently reviewed signer/wallet boundary if execution is later authorized. Log the policy decision, rate sources, quote inputs, approval, transaction reference, and settlement result. Do not log secrets.

## 7. Suggested API contract

These are proposed interfaces, not a claim that routes already exist:

- `GET /api/currency/assets` — supported asset registry and evidence.
- `GET /api/currency/rates?base=USD&quote=EUR` — indicative sourced rate with freshness metadata.
- `POST /api/currency/quote` — calculate an indicative conversion and itemized costs.
- `POST /api/currency/compare-payment-options` — compare supported methods for a stated task/payment.
- `GET /api/currency/quotes/{quoteId}` — retrieve the immutable quote/evidence record.

Suggested response status values: `VERIFIED_SOURCE`, `INDICATIVE`, `STALE`, `DEGRADED`, `NO_RELIABLE_QUOTE`, `UNSUPPORTED_PAIR`, `NOT_OBSERVABLE`. These describe data quality and must not be confused with asset safety.

## 8. Provider adapters and source governance

Use an adapter interface so exchange-rate providers can be changed without coupling business logic to one vendor. Each adapter should declare supported pairs, source attribution, update cadence, outage behavior, licensing/terms, and whether rates are indicative or executable.

- Cache rates only within a pair-specific freshness policy.
- Record provider outages, outliers, and disagreement across sources.
- Where the value is consequential, compare independent sources and expose divergence.
- Do not scrape or reuse data contrary to provider terms.
- Keep market data, official reference rates, issuer claims, and actual execution receipts as distinct evidence types.
- A rate API does not itself provide liquidity, permission to transact, or an executable exchange.

## 9. Phased delivery

### Phase A — Safe foundation
Implement typed asset metadata, a mock/test fixture provider, decimal arithmetic, conversion calculations, clear indicative labels, and unit tests. No money movement.

### Phase B — Read-only live quotes
Add one approved rate source through a provider adapter, freshness checks, source timestamps, outage handling, and rate provenance. Do not imply broad coverage until each pair is tested.

### Phase C — Payment comparison
Add fee and delivery estimates for providers whose terms and data are known. Mark unavailable cost fields as unknown rather than zero.

### Phase D — GLR quote visibility
Show a GLR equivalent only when a credible timestamped market quote is available. Show chain identity, quote uncertainty, and liquidity limitations. If not available, show no reliable quote.

### Phase E — Optional settlement (separate gate)
Only after independent security review, privacy and threat modelling, legal review for target jurisdictions, provider authorization, and user acceptance tests: design a separate payment integration with exact-transaction approval, spend caps, replay protection, failure handling, and receipts. This phase is not authorized by this specification.

## 10. Acceptance criteria

- Every displayed rate has a source, direction, timestamp, and freshness status.
- Stale or unavailable rates never silently appear current or convert to zero.
- Monetary calculations use decimal/integer arithmetic with tested rounding.
- Fees, spread, network costs, and net received amount are separated.
- Unsupported assets, wrong token contracts, wrong chains, and unknown decimals fail closed.
- GLR price is never inferred from supply, market capitalization assumptions, tokenomics plans, or technical deployment verification.
- GLR's three chain-specific deployments are never treated as fungible without separately verified bridge/settlement evidence.
- Quote endpoints perform no transactions and require no private keys.
- Tests cover stale data, source disagreement, precision edges, invalid amounts, provider outage, unsupported pairs, duplicate requests, and policy denial.
- Documentation clearly separates technical asset identity, market pricing, liquidity, security audit, legal eligibility, and actual settlement.

## 11. Evidence and references

This design follows the distinction used in monetary-system analysis between unit of account, medium of exchange, store of value, settlement arrangements, issuer claims, and liquidity. Stablecoins may aim for parity, but the quality and liquidity of reserves, redemption access, and operational capacity matter; parity must not be assumed from branding.

- IMF, *Understanding Stablecoins* (2025): https://www.imf.org/-/media/files/publications/dp/2025/english/usea.pdf
- IMF, *Tokenized Finance and Money* (May 2026): https://www.imf.org/en/news/articles/2026/05/11/sp051126-tokenized-finance-and-money
- BIS, *The future monetary system* (2022): https://www.bis.org/publications/aer-2022/future-monetary-system
- IMF, *Digital Money, Cross-Border Payments, International Reserves, and the Global Financial Safety Net* (2024): https://www.imf.org/-/media/Files/Publications/IMF-Notes/2024/English/INSEA2024001.ashx

**Core principle:** understand every asset before quoting it; show the full cost and evidence; require authorization before moving value; never manufacture a rate, a peg, or liquidity.
