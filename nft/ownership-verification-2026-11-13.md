# Official Logo #001 — ownership and provenance verification

**Observed at:** 2026-11-13T09:40:28Z  
**Local observation time:** 2026-11-13 16:40:28 Asia/Vientiane (UTC+07:00)  
**Repository:** GLORIFIER7/GLORIFIER  
**Network:** Ethereum Mainnet (chain ID 1)  
**Overall status:** PARTIALLY VERIFIED

## Scope and method

This is a read-only verification refresh of the already-minted GLORIFIER SERVICES — Official Logo #001 ERC-721. It uses Etherscan V2 source, creation, receipt and ERC-721 transfer responses plus Alchemy Ethereum Mainnet `eth_call`, `eth_getCode`, NFT metadata, owner and marketplace-indexer responses. No transaction, wallet connection, signature, approval, listing, transfer, mint, deployment or expenditure was initiated.

## Contract and deployment

| Check | Observed result |
|---|---|
| Contract | `0xd62EB4963423f6e224Af0BccCabF75f566Fb9ad7` |
| Standard | ERC-721 |
| Verified source | Etherscan status `1 / OK`; contract `ERC721SeaDropCloneable` |
| Compiler | `v0.8.17+commit.8df45f5f` |
| Proxy type | `2` |
| Implementation | `0x09a26fc8fcef18192e267d7a6da9dfb4be81dd6a` |
| Creator | `0xe0589195995cb373c856953cfaddaeeaf2088a06` |
| Factory | `0x008ebccae39d001200c3003c3225ce0a00690066` |
| Creation transaction | [Etherscan](https://etherscan.io/tx/0x8a41d16bc9c0a26f0f286e1b36ced6d78506c81ae2ad706446444be942550f79) |
| Creation block | `26,235,674` |
| Creation receipt | SUCCESS; includes `OwnershipTransferred(address(0), 0xe058...a088a06)` |

The Etherscan contract-creation lookup links the contract address to the creator and factory transaction above. The creation transaction was submitted by the same address. The successful receipt includes an ownership-transfer event from the zero address to that address, establishing the initial on-chain owner recorded during initialization.

## Token and mint verification

| Check | Observed result |
|---|---|
| Token ID | `1` |
| Contract `name()` / `symbol()` | `GLORIFIER` / `GLR` |
| `owner()` | `0xe0589195995cb373c856953cfaddaeeaf2088a06` |
| `ownerOf(1)` | `0xe0589195995cb373c856953cfaddaeeaf2088a06` |
| `totalSupply()` | `1` |
| `tokenURI(1)` | `ipfs://Qme1tGfPb4g8xJQKnvtHbSdVUZXAHCAVgahKciUQ9JUqst/1` |
| ERC-165 interface `0x01ffc9a7` | `true` |
| ERC-721 interface `0x80ac58cd` | `true` |
| ERC-721 Metadata interface `0x5b5e139f` | `true` |
| Holding address bytecode | `eth_getCode = 0x` (externally owned account at observation time) |

Mint transaction: [`0x47b2136666b4dbd00e17b39e181fadb1fad14abb124aca4c43a6ed480250a1a9`](https://etherscan.io/tx/0x47b2136666b4dbd00e17b39e181fadb1fad14abb124aca4c43a6ed480250a1a9).

The receipt status is `0x1` (success). At block `26,275,697`, the contract emitted the ERC-721 `Transfer` event from the zero address to `0xe0589195995cb373c856953cfaddaeeaf2088a06` for token ID 1. Etherscan's ERC-721 transfer query returned this mint record for the contract. A current `ownerOf(1)` call independently returns the same address.

**Conclusion:** Official Logo #001 is already minted and is currently held on-chain by the address above. Do not mint a duplicate.

## Metadata and indexer reconciliation

The current direct contract read returns token URI `ipfs://Qme1tGfPb4g8xJQKnvtHbSdVUZXAHCAVgahKciUQ9JUqst/1`.

The earlier evidence record dated 2026-11-03 documents Pinata and Filebase returning the same Official Logo #001 metadata and image CID. It also records that the image CID's SHA-256 digest matched the committed repository logo bytes. That is prior gateway evidence; this refresh did not independently download the gateway payloads again.

The refreshed Alchemy NFT metadata response conflicts with direct chain state: it reports cached contract `totalSupply = 0` and a different cached token URI, `ipfs://bafkreidi4jhs2vhtgjeufh7dt5uwzlpnvxdktdxjyqlcfsz6ng6ggualzm`. The same response lists the current owner address and an `original_image_url` matching the image CID returned by the live contract. Alchemy's collection record shows a last-ingested timestamp of 2026-10-20 and the token record shows an update timestamp of 2026-10-26. Treat these as stale or discordant indexer fields, not as current contract state. Direct Ethereum reads are authoritative for `ownerOf(1)`, `totalSupply()` and `tokenURI(1)`.

## Marketplace status

The cached indexed NFT response includes an OpenSea item URL and collection label `glorifier7`:

- [OpenSea collection](https://opensea.io/collection/glorifier7)
- [OpenSea token #1 item](https://opensea.io/assets/ethereum/0xd62eb4963423f6e224af0bccabf75f566fb9ad7/1)

This establishes an indexed marketplace reference, not current trading status. Active listings, received offers, sale events and floor price were **not verified** in this refresh. The Alchemy NFT-sales request returned 404 because that endpoint has been deprecated; its floor-price response could not fetch a price. Those failures do not establish that there are no offers or sales.

OpenSea's current API documentation describes per-NFT best-listing, offer and event queries. A fresh query with an OpenSea API key is still required:
- [OpenSea API overview](https://docs.opensea.io/reference/api-overview)
- [Best listing for an NFT](https://docs.opensea.io/reference/get_best_listing_nft)
- [Offers for an NFT](https://docs.opensea.io/reference/get_offers_nft)
- [Events for an NFT](https://docs.opensea.io/reference/list_events_by_nft)

## Wallet-control signature — supplementary, not an ownership blocker

The current on-chain holder address is **VERIFIED at the address level** by the direct Ethereum Mainnet `ownerOf(1)` read and the successful mint receipt. A message signature is not required to establish that the token is currently assigned to this address on-chain. Do not hold the NFT's address-level ownership record open solely because the holder cannot connect MetaMask to Etherscan.

An EIP-191 message signature can provide additional evidence that a person can control the private key for the holder address at signing time. It does not change the NFT, does not replace the direct `ownerOf(1)` read, and does not independently prove the signer's legal identity, beneficial ownership, or authority to represent GLORIFIER SERVICES ADVERTISING.

The user supplied screenshots of two Etherscan records:
- [Signature #341854](https://etherscan.io/verifySig/341854) displays **Message Signature Verified**, but its visible signer address is `0xc9B7c2f97537EFE526F10e05aABE532531a7b1`, which does **not** match the current on-chain holder address.
- [Signature #341855](https://etherscan.io/verifySig/341855) displays **Message Signature Verified**, but the supplied screenshot does not show the signer address or the complete message. Its signer therefore cannot be reconciled against `ownerOf(1)` from the available evidence.

No further wallet-signing action is required for the address-level NFT ownership record. Any previously issued challenge messages are superseded for this evidence task and should not be signed or reused. If a future, separate identity/control attestation is needed, the signature must be verified against the exact message and current holder address; it remains supplementary evidence only.

## Verification ledger

| Verification item | Status |
|---|---|
| Etherscan verified source and proxy implementation | VERIFIED |
| Contract creation transaction and factory provenance | VERIFIED |
| Initial ownership event | VERIFIED |
| ERC-721 token ID 1 mint receipt and Transfer event | VERIFIED |
| Current `owner()` and `ownerOf(1)` | VERIFIED (address-level) |
| `totalSupply()`, `tokenURI(1)`, name and symbol | VERIFIED by direct read-only contract calls |
| ERC-165, ERC-721 and Metadata interfaces | VERIFIED |
| Holding address is an EOA at observation time | VERIFIED |
| Previous Pinata/Filebase metadata retrieval and image digest | VERIFIED in 2026-11-03 record; not re-fetched in this refresh |
| Current human wallet control / signer identity | NOT VERIFIED from the supplied signature screenshots; supplementary only, not required for on-chain holder verification |
| Organizational authority / legal beneficial ownership | NOT INDEPENDENTLY VERIFIED |
| Current OpenSea listings, offers, sales and floor price | NOT VERIFIED |
| Alchemy cached supply/token URI | DISAGREES with direct chain reads; not authoritative |

**Overall: PARTIALLY VERIFIED.** The on-chain NFT identity, mint and current holder address are VERIFIED. The human identity/control of the address, legal beneficial ownership or organizational authority, and current marketplace listings/offers/sales/floor remain NOT VERIFIED. A wallet signature is supplementary identity evidence, not a prerequisite for confirming the on-chain holder address. No blockchain or marketplace write action is authorized or required for this verification.

## Safety and execution record

The repository maintenance process did not connect a wallet or sign a message. The user later supplied screenshots of Etherscan Signature #341854 and #341855 as documented above. No transaction, token transfer, approval, listing, mint or deployment was submitted by this maintenance process. No paid service or expenditure was initiated. No duplicate Official Logo #001 was created.
