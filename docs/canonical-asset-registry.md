# GLORIFIER Canonical Asset Registry

## Purpose

GLORIFIER maintains one canonical economic identity for each asset and records each blockchain deployment as a separately reconciled deployment.

For GLR:

- Canonical asset ID: `glr`
- Namespace: `glorifier`
- Name: `GLORIFIER`
- Symbol: `GLR`
- Decimals: 18
- Supply policy: fixed maximum supply of 1,000,000,000 GLR

A chain deployment is **not** a second GLR identity. It is a network-specific representation of the same canonical asset identity.

## Verification rule

Each deployment is verified independently. A verified Ethereum deployment does not automatically make a BNB deployment verified, and vice versa.

Allowed deployment states:

- `fully_verified`
- `verified`
- `partially_verified`
- `not_verified`
- `degraded`
- `not_observable`

No registry state may claim verification without evidence from the corresponding chain/explorer reconciliation. During the 2026-10-25 read-only audit, an explorer-level contract-name discrepancy was reported for the Ethereum GLR address (the explorer label reportedly showed `BreakfastBall` while token metadata/source identified `GLORIFIER` / `GLR`). A second GLORIFIER-labelled token candidate, `0x1f8e7FEC258fD1B8A866a323565B276d82EFb353`, was also surfaced in a wallet token query. Neither discrepancy is resolved here; treat the Ethereum GLR canonical identity as partially verified until the address, bytecode, metadata, supply, and deployment transaction are reconciled against independent chain evidence.

## Current GLR deployments

| Network | Chain ID | Contract | Deployment TX | Status |
|---|---:|---|---|---|
| Ethereum Mainnet | 1 | `0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb` | `0x8b92e5b669ea3188fe55052ed68d3eae0cc7715a0cf8c96e71ee7e95d846f81a` | PARTIALLY VERIFIED |
| BNB Smart Chain Mainnet | 56 | `0x5e0B0A449232FDA7cA6Ea3419A50873b08F64804` | `0xf5698f6bbde7ff173be1cbd0bb83da53f03389842c68ca2f6e4e287b89d9bbc0` | FULLY VERIFIED |
| Solana Mainnet Beta | `solana:mainnet-beta` | `7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9` (Token-2022 mint) | Not selected — conflicting signatures are documented in the provenance review | PARTIALLY VERIFIED |

The BNB record is based on an existing-deployment reconciliation; the verification mode is `verify-existing` and does not broadcast a new blockchain transaction.

The Solana Mainnet Beta mint's on-chain identity reconciliation is recorded in [`solana/canonical-mainnet-identity.json`](../solana/canonical-mainnet-identity.json) and the provenance review in [`docs/solana-signature-provenance-review.md`](solana-signature-provenance-review.md). Historical records contained different mint transaction signatures (`HChmY7` versus `HChyV7`). A finalized mainnet-beta RPC response supports `HChmY7` at slot `454519862` with `meta.err: null`; the same endpoint returned null for `HChyV7`, while a second provider returned null for `HChmY7`. The repository records `HChmY7` as the evidence-supported candidate but keeps overall status `partially_verified` pending independent review and the provenance gate. The mint authority is recorded as revoked and the freeze authority as absent at initialization; the empty freeze-authority revocation transaction is intentional.

The immutable on-chain metadata URI points to `solana/token.json` at commit `d0d5c16fc4a74099c125c8aac594352d53675177`. That pinned JSON was fetched and contains name, symbol, description, external URL, and attributes, but no `image` or `mint` field. The current `main/solana/token.json` contains both as supplemental repository metadata; it does not change the immutable on-chain URI. Because the metadata pointer and update authorities are disabled, do not claim the on-chain metadata image was updated or attempt a redeployment to change it.

## NFT collection identities

The canonical asset registry also records the two owner-designated Ethereum NFT collections as separate canonical collection identities:

| Canonical asset ID | Standard | OpenSea reference | Deployment record | Status |
|---|---|---|---|---|
| `glorifier-erc721` | ERC-721 | [glorifier7](https://opensea.io/collection/glorifier7) | Ethereum Mainnet contract `0xd62eb4963423f6e224af0bcccabf75f566fb9ad7` | PARTIALLY VERIFIED — contract source/interface reported verified; token mint and ownership not confirmed |
| `glorifier-erc1155` | ERC-1155 | [glorifier1](https://opensea.io/collection/glorifier1) | Ethereum Mainnet contract `0x355C94e4b6B353421De956e87D643bB036d6a417` | PARTIALLY VERIFIED — contract source/interface reported verified; token IDs, supply and mint controls not confirmed |

The collection-to-standard mapping above reflects the owner's explicit confirmation. A prior Blockscout read-only inspection reported verified source/interface for both contract addresses, including SeaDrop-style contract behavior. This is evidence of contract/interface publication only; it does not establish that an NFT was successfully minted, identify a token ID, prove current ownership, establish collection indexing, or prove that minting is limited to one unique token. The ERC-721 token ID and current owner remain unconfirmed. For ERC-1155, token IDs, balances, total supply, and mint controls remain unconfirmed. Recheck the live Ethereum explorer and transaction/receipt logs before upgrading these statuses.

These are NFT collection identities, separate from the fungible `glr` economic asset. The seed is idempotent: it inserts missing NFT identities/deployment records but does not overwrite existing canonical metadata or evidence on conflict. It records owner-supplied metadata/evidence status; it does not submit blockchain transactions, deploy contracts, mint NFTs, or register assets with Axelar/ENS/any third-party registry. Regression tests cover the two collection identities, the single known ERC-721 deployment, pending ERC-1155 address, and conflict-preservation behavior.

## API

- `GET /api/assets/canonical?assetId=glr` returns one canonical asset and its chain deployments.
- `GET /api/assets/canonical/all` returns all canonical assets.

Secrets, private keys, and credentials are never stored in the canonical asset registry.

## Governance invariant

**ONE CANONICAL ASSET → MANY CHAIN DEPLOYMENTS → INDEPENDENT EVIDENCE**

The canonical registry is an identity and evidence index. It is not a bridge, custody system, trading engine, or automatic cross-chain settlement mechanism.
