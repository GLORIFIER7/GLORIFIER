# GLORIFIER (GLR) Mainnet Evidence Registry

**Registry status:** Updated after explorer recheck and supplied successful workflow evidence.  
**Last checked:** 2026-10-09 (UTC date; explorer snapshots and workflow records reviewed during this update).  
**Scope:** Contract/mint identity and reported on-chain verification. This is not a security audit, market-liquidity certification, legal opinion, or investment endorsement.

## Status definitions

- **FULLY VERIFIED (technical evidence)** — the network identity, reported on-chain assertions, source/provenance checks, and publication evidence listed here passed. This label does not imply safety, liquidity, market value, or legal compliance.
- **PARTIALLY VERIFIED** — some required checks passed, but material checks remain outstanding.
- **NOT VERIFIED** — the required evidence could not be confirmed.
- **NOT OBSERVABLE** — the available public evidence is insufficient to determine the property.

## Mainnet identities

| Network | Asset identity | Explorer | Status | Last checked |
|---|---|---|---|---|
| Ethereum Mainnet (chain ID 1) | ERC-20 contract: `0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb` | [Etherscan contract/source](https://etherscan.io/address/0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb#code) · [Token page](https://etherscan.io/token/0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb) · [Deployment transaction](https://etherscan.io/tx/0x8b92e5b669ea3188fe55052ed68d3eae0cc7715a0cf8c96e71ee7e95d846f81a) | **FULLY VERIFIED — technical evidence**. Etherscan displays GLORIFIER (GLR) and “Source Code Verified — Exact Match”; deployment workflow run #37222502787 completed successfully, including deployment verification and evidence publication steps. | 2026-10-09 |
| BNB Smart Chain Mainnet (chain ID 56) | BEP-20 contract: `0x5e0B0A449232FDA7cA6Ea3419A50873b08F64804` | [BscScan contract/source](https://bscscan.com/address/0x5e0b0a449232fda7ca6ea3419a50873b08f64804#code) · [Token page](https://bscscan.com/token/0x5e0b0a449232fda7ca6ea3419a50873b08f64804) · [Deployment transaction](https://bscscan.com/tx/0xf5698f6bbde7ff173be1cbd0bb83da53f03389842c68ca2f6e4e287b89d9bbc0) | **FULLY VERIFIED — technical evidence**. BscScan displays GLORIFIER (GLR), “Source Code Verified — Exact Match,” and the deployment transaction at block 125836150 records 1,000,000,000 GLR minted to the reported initial holder. The supplied verify-existing reconciliation reports on-chain assertions passed. | 2026-10-09 |
| Solana Mainnet Beta | Token-2022 mint: `7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9` | [Solscan token page](https://solscan.io/token/7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9) · [Solana Explorer mint](https://explorer.solana.com/address/7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9) · [Mint transaction](https://explorer.solana.com/tx/Ast4qmsxwCDcA5eLjrNJ4QH6q9H7GwdAi1CwFMDgCySVHChmY7MEdz8vdfpszFn3SqSyF95fejgLyzMeU9aswQa) | **FULLY VERIFIED — technical evidence**. Solscan identifies GLORIFIER (GLR), Token-2022, supply 1,000,000,000, 9 decimals, and authority N/A. The linked mint transaction is successful and finalized on Mainnet Beta. Supplied Run #87 reports reconciliation, metadata, transaction provenance, and authority checks passed. | 2026-10-09 |

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
