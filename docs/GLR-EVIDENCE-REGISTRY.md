# GLORIFIER (GLR) Mainnet Evidence Registry

**Registry status:** Draft — identities below are reported project identities, not independently verified by this document.  
**Last reviewed:** 2026-10-09 (registry preparation date; live on-chain state was not independently validated during this review).  
**Purpose:** Provide a single, transparent reference for GLR's reported Ethereum, BNB Chain, and Solana Mainnet identities. This page is not a price, safety, audit, or investment endorsement.

## Status definitions

- **NOT VERIFIED** — the address is recorded, but current on-chain identity and required evidence have not been independently checked for this registry revision.
- **PARTIALLY VERIFIED** — some required checks passed, but one or more material checks remain outstanding.
- **VERIFIED ON-CHAIN** — the identity and specified on-chain properties were independently checked against the correct network and evidence was recorded.
- **FULLY VERIFIED** — all project-defined on-chain, source/provenance, metadata, and publication checks passed; this is not a security audit or guarantee of value.

## Mainnet identities

| Network | Asset identity | Explorer | Registry status | Last checked |
|---|---|---|---|---|
| Ethereum Mainnet | ERC-20 contract: `0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb` | [Etherscan contract page](https://etherscan.io/address/0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb) | **NOT VERIFIED in this registry revision** — reported identity; live contract, source verification, supply, permissions, and deployment receipt not independently rechecked here | 2026-10-09 — registry review only |
| BNB Smart Chain Mainnet | BEP-20/EVM contract: `0x5e0B0A449232FDA7cA6Ea3419A50873b08F64804` | [BscScan contract page](https://bscscan.com/address/0x5e0B0A449232FDA7cA6Ea3419A50873b08F64804) | **NOT VERIFIED in this registry revision** — reported identity; live contract, source verification, supply, permissions, and deployment receipt not independently rechecked here | 2026-10-09 — registry review only |
| Solana Mainnet | Mint: `7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9` | [Solscan token page](https://solscan.io/token/7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9) · [Solana Explorer](https://explorer.solana.com/address/7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9) | **NOT VERIFIED in this registry revision** — reported mint; network, Token Program, mint/freeze authorities, supply, metadata, and immutable provenance not independently rechecked here | 2026-10-09 — registry review only |

## Required evidence before changing status

For each identity, record evidence URLs or immutable transaction/signature IDs and the timestamp of the check.

### Ethereum Mainnet
- [ ] Confirm chain ID 1 and that the address has contract bytecode.
- [ ] Read `name()`, `symbol()`, `decimals()`, `totalSupply()`, and relevant owner/admin/mint/burn permissions.
- [ ] Confirm explorer source verification and match the verified source to deployed bytecode.
- [ ] Record deployment transaction, receipt, block number, and source-verification page.
- [ ] Check holder distribution and actual liquidity separately; neither is implied by contract verification.

### BNB Smart Chain Mainnet
- [ ] Confirm BNB Smart Chain Mainnet and that the address has contract bytecode.
- [ ] Read token name, symbol, decimals, supply, and relevant owner/admin/mint/burn permissions.
- [ ] Confirm BscScan source verification and match source to deployed bytecode.
- [ ] Record deployment transaction, receipt, block number, and source-verification page.
- [ ] Check holder distribution and actual liquidity separately.

### Solana Mainnet
- [ ] Confirm the mint exists on Mainnet Beta and record its owning Token Program (Token Program or Token-2022).
- [ ] Independently read decimals, raw mint supply, mint authority, freeze authority, and metadata.
- [ ] Record the creation transaction/signature and relevant deployment/provenance evidence.
- [ ] Confirm canonical identity with appropriate independent token-verification sources where applicable.
- [ ] Check holders and liquidity separately; explorer visibility alone is not a security or value endorsement.

## Publication rules

1. Do not treat a Devnet address as a Mainnet identity.
2. Do not create a replacement mint or contract to resolve an evidence gap without explicit human authorization and a documented migration plan.
3. Do not mark a network **VERIFIED ON-CHAIN** or **FULLY VERIFIED** based only on a workflow label, a publication PR, or a self-reported status.
4. Update the status only after the evidence above has been checked. Record the checker, UTC timestamp, evidence links, and any failed checks.
5. State clearly when evidence is unavailable. Unknown means **NOT VERIFIED**, not passed.
6. Contract/token identity verification does not establish market liquidity, fair value, legal compliance, or investment safety.

## Evidence update log

| Date (UTC) | Change | Evidence |
|---|---|---|
| 2026-10-09 | Initial registry draft created from previously reported project identities. No new deployment or mint was initiated; live on-chain verification is still pending. | This document; explorer links above |

---
*This registry is informational only. It does not promise a market price, liquidity, exchange listing, or return.*
