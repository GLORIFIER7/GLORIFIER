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
| Creation receipt | SUCCESS; includes `OwnershipTransferred(address(0), 0xe058...a08a06)` |

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

## Wallet-control attestation — pending

The contract and token state identify the holding address, but chain state alone does not prove that the human owner controls the wallet or is authorized to represent the company. The address currently returns empty bytecode (`0x`), so it is an externally owned account and can use a standard EIP-191 personal message signature.

The following message is prepared for the holder to sign in their wallet. It is **not yet signed**:

```text
GLORIFIER SERVICES ADVERTISING
ERC-721 WALLET-CONTROL ATTESTATION

Network: Ethereum Mainnet
Chain ID: 1
Contract: 0xd62EB4963423f6e224Af0BccCabF75f566Fb9ad7
Token ID: 1
Expected owner wallet: 0xe0589195995cb373c856953cfaddaeeaf2088a06

I confirm that I control the wallet listed above and am authorized to act for GLORIFIER SERVICES ADVERTISING for this verification.

Nonce: GLORIFIER-ERC721-OWNER-CONTROL-2026-11-13T09:40:28Z

This is an off-chain message signature only. It does not authorize a transaction, transfer, sale, listing, approval, mint, deployment, or expenditure.
```

Verification rule: recover the signer from the exact message using the Ethereum personal-sign/EIP-191 prefix and compare the recovered address with the current `ownerOf(1)` address. Record the signature and observation time only after it is supplied and successfully verified. Never request a seed phrase or private key. Do not use a transaction signature. The signed statement is the signer's attestation of authority; it is not independent proof of legal beneficial ownership or company registration.

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
| Current human wallet control | PENDING signed message |
| Organizational authority / legal beneficial ownership | NOT INDEPENDENTLY VERIFIED |
| Current OpenSea listings, offers, sales and floor price | NOT VERIFIED |
| Alchemy cached supply/token URI | DISAGREES with direct chain reads; not authoritative |

**Overall: PARTIALLY VERIFIED.** The on-chain NFT identity, mint and current holder address are verified. Completion requires the holder's valid off-chain message signature and a separate marketplace order/event check. No blockchain or marketplace write action is authorized or required for this verification.

## Safety and execution record

No wallet was connected. No message was signed. No transaction, token transfer, approval, listing, mint or deployment was submitted. No paid service or expenditure was initiated. No duplicate Official Logo #001 was created.
