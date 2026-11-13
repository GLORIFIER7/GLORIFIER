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

No registry state may claim verification without evidence from the corresponding chain/explorer reconciliation.

**Read-only Ethereum reconciliation — 2026-11-09:** Independent public Etherscan source/creation queries and Ethereum JSON-RPC calls confirm that the owner-designated canonical contract `0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb` has non-empty runtime bytecode, verified source, `name() = GLORIFIER`, `symbol() = GLR`, 18 decimals, and a total supply of 1,000,000,000 GLR. Its recorded deployment transaction succeeded and created that exact address at block 26,120,635. The same deployer also created a second independently source-verified GLORIFIER/GLR contract candidate, `0x1f8e7FEC258fD1B8A866a323565B276d82EFb353`, at block 26,120,404; it also has non-empty bytecode, the same name/symbol/decimals, and a separate 1,000,000,000-token supply. Both creation receipts succeeded and point to their respective contract addresses. The candidate is not listed as a canonical GLR deployment in this registry. Its relationship to the owner-designated canonical asset (e.g. earlier deployment, replacement, or separate token) requires owner determination; do not add its supply to canonical GLR supply or silently substitute the canonical address. Ethereum therefore remains **PARTIALLY VERIFIED** for canonical-asset identity pending that owner decision and a controlled registry reconciliation. No contract, key, wallet, or token state was changed. **Code/data consistency blocker:** at the base revision inspected for this refresh, `src/lib/asset-registry.ts` still seeds the Ethereum deployment with `status: 'fully_verified'`, while this registry and the evidence registry conservatively classify it as partially verified. The seed uses an upsert that can update the persisted canonical deployment record during application initialization. This PR does not change that seed or alter production database rows. An owner-approved, separately reviewed registry-status correction is required before changing the production record; until then, consumers must treat the documentation's partial status and the runtime seed discrepancy as an unresolved data-truth defect.

**Read-only Solana reconciliation — 2026-11-09:** Solana Mainnet Beta finalized RPC confirmed the Token-2022 mint `7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9`, 1,000,000,000 GLR supply, 9 decimals, and null mint/freeze authorities. A finalized `getTransaction` result for the `HChmY7` signature returned slot 454519862, `meta.err = null`, and a Token-2022 `mintToChecked` instruction targeting that mint for 1,000,000,000 GLR at 9 decimals; the competing `HChyV7` signature returned null from the same RPC. A second provider previously returned null for `HChmY7`; retain **PARTIALLY VERIFIED** until independent reviewer confirmation and the cross-file provenance CI gate pass. No signing, transfer, or metadata update was performed.

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
| `glorifier-erc721` | ERC-721 | [glorifier7](https://opensea.io/collection/glorifier7) · [Token #1 item](https://opensea.io/item/ethereum/0xd62eb4963423f6e224af0bccabf75f566fb9ad7/1) | Ethereum Mainnet contract `0xd62EB4963423f6e224Af0BccCabF75f566Fb9ad7`; [latest verification report](../nft/ownership-verification-2026-11-13.md) | PARTIALLY VERIFIED — 2026-11-13 Etherscan reports verified `ERC721SeaDropCloneable` proxy source (type 2; implementation `0x09a26fc8fcef18192e267d7a6da9dfb4be81dd6a`); successful factory creation receipt at block 26,235,674 records initial ownership to `0xe0589195995cb373c856953cfaddaeeaf2088a06`; successful mint receipt at block 26,275,697 emits ERC-721 Transfer from zero address to that same address for token ID 1; current read-only calls confirm `owner()`, `ownerOf(1)`, `totalSupply() = 1`, `tokenURI(1)`, and ERC-165/ERC-721/ERC-721 Metadata support. The on-chain holder address is VERIFIED by the current `ownerOf(1)` read. The supplied Etherscan signature screenshots do not establish a matching signer: #341854 shows a different address, while #341855 does not expose the signer address in the supplied screenshot. Human identity, legal beneficial ownership and organizational authority remain NOT VERIFIED; live marketplace listings/offers/sales also remain NOT VERIFIED. A wallet-control signature is supplementary evidence, not a prerequisite for verifying the on-chain holder address. Refreshed Alchemy indexer fields conflict with direct chain reads and are documented as stale/discordant cache data. |
| `glorifier-erc1155` | ERC-1155 | [glorifier1](https://opensea.io/collection/glorifier1) · [Token #1 item](https://opensea.io/item/ethereum/0x355c94e4b6b353421de956e87d643bb036d6a417/1) | Ethereum Mainnet contract `0x355C94e4b6B353421De956e87D643bB036d6a417`; OpenSea item page identifies Token #1 / ERC-1155 / Ethereum | PARTIALLY VERIFIED — 2026-11-09 read-only Ethereum RPC confirms ERC-165/ERC-1155/ERC-1155 Metadata URI interface support, `uri(1)` returns a template URI, and `totalSupply(1)` returns 1. Current holder attribution, mint/transfer event history and deployment provenance still require reconciliation |

The collection-to-standard mapping above reflects the owner's explicit confirmation. The ERC-721 record received a fresh read-only Ethereum Mainnet reconciliation on 2026-11-13. Etherscan's verified-source response identifies `ERC721SeaDropCloneable`, compiler `v0.8.17+commit.8df45f5f`, proxy type `2`, and implementation `0x09a26fc8fcef18192e267d7a6da9dfb4be81dd6a`. Etherscan's contract-creation lookup identifies creator `0xe0589195995cb373c856953cfaddaeeaf2088a06`, factory `0x008ebccae39d001200c3003c3225ce0a00690066`, and creation transaction `0x8a41d16bc9c0a26f0f286e1b36ced6d78506c81ae2ad706446444be942550f79`; its successful receipt at block 26,235,674 includes an `OwnershipTransferred` event from the zero address to that creator. The successful mint receipt at block 26,275,697 and Etherscan ERC-721 transfer history record token ID 1 minted from the zero address to the same wallet. Current read-only Alchemy calls return that address for both `owner()` and `ownerOf(1)`, `totalSupply() = 1`, the on-chain IPFS `tokenURI(1)`, and `true` for ERC-165, ERC-721 and ERC-721 Metadata interfaces. A separate `eth_getCode` read returns `0x` for the holding address, indicating an externally owned account at the observation time.

These chain results verify the deployment, mint and current on-chain holder address. They do not independently prove the human identity, legal beneficial ownership, or organizational authority associated with that address. A message signature could supplement the record by demonstrating control of the address at signing time, but is not required to establish the on-chain `ownerOf(1)` result. The user-supplied Etherscan screenshots #341854 and #341855 are assessed in the linked verification report; neither currently establishes a verified signer match. Any statement of authority for GLORIFIER SERVICES must be assessed separately and is not inferred from blockchain state.

The prior 2026-11-03 evidence report documents successful metadata retrieval through Pinata and Filebase, with the same Official Logo #001 metadata and image CID; the image CID digest matched the committed repository logo bytes. This refresh reconfirmed the on-chain token URI but did not fetch new gateway bytes. A refreshed Alchemy metadata response returned a different cached `tokenUri` (`ipfs://bafkreidi4jhs2vhtgjeufh7dt5uwzlpnvxdktdxjyqlcfsz6ng6ggualzm`) and cached contract `totalSupply = 0`, while its owner entry still shows the same address and its `original_image_url` matches the image CID returned by the contract. The cached response's collection ingestion timestamp is 2026-10-20 and its token record timestamp is 2026-10-26. These conflicts are recorded as indexer/cache inconsistency; direct Mainnet contract reads take precedence for current ownership, supply and token URI.

OpenSea indexing has been observed through the cached NFT record, which includes the item URL and collection label `glorifier7`. Current active listing, offer, sale history and floor price were not independently verified in this refresh. The Alchemy NFT-sales request returned HTTP 404 because its endpoint has been deprecated; the Alchemy floor-price lookup could not fetch a price. These errors do not prove that the NFT has no offers or sales. OpenSea documents current per-NFT best-listing, offer and event endpoints; a fresh API query is still required. Marketplace item records are not substitutes for direct chain evidence.

The ERC-1155 record remains PARTIALLY VERIFIED based on the 2026-11-09 evidence: interface support, `uri(1)` and `totalSupply(1)` were read, but its current holder and transfer provenance were not refreshed in this review. The owner's statement that all NFTs are minted is retained as owner-reported status, not chain-verified fact. The Solana mint `7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9` remains a separate Token-2022 GLR fungible-token record; do not classify it as a Solana NFT without separate NFT-standard evidence.

These are NFT collection identities, separate from the fungible `glr` economic asset. The seed is idempotent: it inserts missing NFT identities/deployment records but does not overwrite existing canonical metadata or evidence on conflict. It records owner-supplied metadata/evidence status; it does not submit blockchain transactions, deploy contracts, mint NFTs, or register assets with Axelar/ENS/any third-party registry. Regression tests cover the two collection identities, the single known ERC-721 deployment, pending ERC-1155 address, and conflict-preservation behavior.

## API

- `GET /api/assets/canonical?assetId=glr` returns one canonical asset and its chain deployments.
- `GET /api/assets/canonical/all` returns all canonical assets.

Secrets, private keys, and credentials are never stored in the canonical asset registry.

## Governance invariant

**ONE CANONICAL ASSET → MANY CHAIN DEPLOYMENTS → INDEPENDENT EVIDENCE**

The canonical registry is an identity and evidence index. It is not a bridge, custody system, trading engine, or automatic cross-chain settlement mechanism.
