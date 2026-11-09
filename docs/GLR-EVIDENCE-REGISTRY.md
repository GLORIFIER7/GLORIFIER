> **Verification notice (updated 2026-11-09):** A new read-only chain reconciliation independently confirmed the owner-designated Ethereum contract's bytecode, verified source, GLORIFIER/GLR metadata, 18 decimals, 1,000,000,000-token supply and successful deployment receipt. It also confirmed a second GLORIFIER/GLR contract created by the same deployer, with the same metadata and a separate 1,000,000,000-token supply. The second contract is not designated canonical in this registry; its relationship to the owner-designated contract requires owner determination. Ethereum remains **PARTIALLY VERIFIED** for canonical-asset identity. Solana's finalized mint and current mint state are corroborated by a fresh read-only RPC check, but independent second-provider/reviewer confirmation remains outstanding, so Solana remains **PARTIALLY VERIFIED**. BNB remains **FULLY VERIFIED — technical evidence**. These statuses do not imply liquidity, market value, legal compliance, or security-audit completion.

# GLORIFIER (GLR) Mainnet Evidence Registry

**Registry status:** PARTIALLY VERIFIED overall; Ethereum canonical identity and Solana cross-file provenance remain partially verified; BNB Smart Chain retains its recorded FULLY VERIFIED — technical evidence status.  
**Last checked:** 2026-11-09 (UTC; read-only chain reconciliation; see the verification notice above).  
**Scope:** Contract/mint identity and reported on-chain verification. This is not a security audit, market-liquidity certification, legal opinion, or investment endorsement.

## Status definitions

- **FULLY VERIFIED (technical evidence)** — the network identity, reported on-chain assertions, source/provenance checks, and publication evidence listed here passed. This label does not imply safety, liquidity, market value, or legal compliance.
- **PARTIALLY VERIFIED** — some required checks passed, but material checks remain outstanding.
- **NOT VERIFIED** — the required evidence could not be confirmed.
- **NOT OBSERVABLE** — the available public evidence is insufficient to determine the property.

## Mainnet identities

| Network | Asset identity | Explorer | Status | Last checked |
|---|---|---|---|---|
| Ethereum Mainnet (chain ID 1) | ERC-20 contract: `0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb` | [Etherscan contract/source](https://etherscan.io/address/0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb#code) · [Token page](https://etherscan.io/token/0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb) · [Deployment transaction](https://etherscan.io/tx/0x8b92e5b669ea3188fe55052ed68d3eae0cc7715a0cf8c96e71ee7e95d846f81a) | **PARTIALLY VERIFIED**. Fresh Etherscan source/creation data and independent Ethereum JSON-RPC confirm bytecode, verified source, GLORIFIER/GLR metadata, 18 decimals, 1,000,000,000 supply, and a successful receipt at block 26,120,635. A second same-deployer GLORIFIER/GLR contract at `0x1f8e7FEC258fD1B8A866a323565B276d82EFb353` has its own successful creation receipt at block 26,120,404 and a separate 1,000,000,000 supply. Its relationship to the canonical contract requires owner decision; it is not counted as a canonical GLR deployment. | 2026-11-09 |
| BNB Smart Chain Mainnet (chain ID 56) | BEP-20 contract: `0x5e0B0A449232FDA7cA6Ea3419A50873b08F64804` | [BscScan contract/source](https://bscscan.com/address/0x5e0b0a449232fda7ca6ea3419a50873b08f64804#code) · [Token page](https://bscscan.com/token/0x5e0b0a449232fda7ca6ea3419a50873b08f64804) · [Deployment transaction](https://bscscan.com/tx/0xf5698f6bbde7ff173be1cbd0bb83da53f03389842c68ca2f6e4e287b89d9bbc0) | **FULLY VERIFIED — technical evidence**. BscScan displays GLORIFIER (GLR), “Source Code Verified — Exact Match,” and the deployment transaction at block 125836150 records 1,000,000,000 GLR minted to the reported initial holder. The supplied verify-existing reconciliation reports on-chain assertions passed. | 2026-10-09 |
| Solana Mainnet Beta | Token-2022 mint: `7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9` | [Solscan token page](https://solscan.io/token/7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9) · [Solana Explorer mint](https://explorer.solana.com/address/7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9) · [Mint transaction](https://explorer.solana.com/tx/Ast4qmsxwCDcA5eLjrNJ4QH6q9H7GwdAi1CwFMDgCySVHChmY7MEdz8vdfpszFn3SqSyF95fejgLyzMeU9aswQa) | **PARTIALLY VERIFIED**. Fresh finalized Mainnet Beta RPC confirmed mint `7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9`, 1,000,000,000 supply, 9 decimals, Token-2022 program, and null mint/freeze authorities. `HChmY7` returned a successful finalized `mintToChecked` at slot 454519862; `HChyV7` returned null from the same endpoint. Keep partial pending independent reviewer and provenance-gate confirmation. | 2026-11-09 |

## Recorded evidence details

### Ethereum Mainnet

- Reported deployment transaction: `0x8b92e5b669ea3188fe55052ed68d3eae0cc7715a0cf8c96e71ee7e95d846f81a`.
- GitHub Actions run: [37222502787](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/37222502787).
- Live page recheck: Etherscan identifies the contract as GLORIFIER (GLR) and shows source code verified with an exact match.
- The workflow jobs API reports the release job and the “Verify deployment and source” and “Publish mainnet release evidence” steps completed successfully.
- Evidence artifact listed by GitHub: `glorifier-mainnet-release-evidence` (artifact ID `11310687242`, SHA-256 `970aa1c18ee9ab742962192f9d6bc0028c683ca47651b1d63647b26e0fdd5e19`).

### BNB Smart Chain Mainnet

- Chain ID: `56`.
- Reported deployment transaction: `0xf5698f6bbde7ff173be1cbd0bb83da53f03389842c68ca2f6e4e287b89d9bbc0`.
- Deployment block: `125836150`.
- Reported deployer and initial holder: `0x4533168d8359fE1EEd2A923dF332a6Cea2eb17ad`.
- Supplied verification mode: `verify-existing` (no new transaction broadcast); workflow commit: `8921c2e31b79107cf05aa3ba4bdb43715dda69d2`.
- Live page recheck: BscScan identifies GLORIFIER (GLR), shows source code verified with an exact match, and the deployment transaction records 1,000,000,000 GLR at the reported holder.

### Solana Mainnet Beta

- Canonical mint: `7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9`.
- Token program: Token-2022 (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`).
- Solscan current page reports supply `1,000,000,000`, decimals `9`, token name `GLORIFIER (GLR)`, and authority `N/A`.
- Mint transaction: `Ast4qmsxwCDcA5eLjrNJ4QH6q9H7GwdAi1CwFMDgCySVHChmY7MEdz8vdfpszFn3SqSyF95fejgLyzMeU9aswQa`; Solana Explorer reports Success and Finalized (Mainnet Beta).
- Supplied reconciliation report: Run #87, 2026-10-09; workflow and read-only reconciliation successful; metadata, transaction provenance, and mint/freeze authority checks passed.

## Separate adoption and market-status checks

Technical verification does **not** establish market liquidity or value. During the explorer review, Solscan showed one holder and one transfer for the Solana mint. Treat this as a snapshot, not a complete market survey. Holder and transfer counts on EVM chains, liquidity pools, actual executable depth, trading volume, and price discovery must be assessed separately. Do not infer organic adoption from deployment or minting activity.

## Publication and safety rules

1. Do not treat a Devnet address as a Mainnet identity.
2. Do not create a replacement mint or contract to resolve an evidence gap without explicit human authorization and a documented migration plan.
3. Do not interpret “FULLY VERIFIED — technical evidence” as a security audit, guarantee of safety, market-liquidity claim, price claim, or investment recommendation.
4. Keep the network, contract/mint, transaction/signature, explorer source, and check date attached to each status.
5. Preserve unknowns explicitly; do not report unavailable properties as passed.
6. No deployment, mint, transfer, or authority mutation was performed as part of this registry update.

## Evidence update log

| Date (UTC) | Change | Evidence |
|---|---|---|
| 2026-10-09 | Replaced the stale all-NOT-VERIFIED draft labels with evidence-linked technical statuses after live explorer-page rechecks and reconciliation reports supplied for all three networks. | Ethereum Actions run #37222502787 and Etherscan; BscScan contract and deployment transaction; Solscan token page and finalized Solana mint transaction; supplied Solana Run #87 reconciliation report. |

---
*Informational registry only. It does not promise a market price, liquidity, exchange listing, or return.*
