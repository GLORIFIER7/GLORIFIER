# GLORIFIER SERVICES NFT Preparation Record

**Status:** EXISTING OFFICIAL LOGO #001 MINTED AND VERIFIED; REMAINING PHOTO CANDIDATES IN PREPARATION  
**Last updated:** 2026-11-03  
**Repository:** GLORIFIER7/GLORIFIER

## Existing Official Logo #001

The official-logo edition already exists on Ethereum Mainnet and must not be minted again.

- Contract: `0xd62EB4963423f6e224Af0BccCabF75f566Fb9ad7`
- Token standard: ERC-721 SeaDrop proxy
- Token ID: `1`
- Current owner and `ownerOf(1)`: `0xe0589195995cb373c856953cfaddaeeaf2088a06`
- On-chain `tokenURI(1)`: `ipfs://Qme1tGfPb4g8xJQKnvtHbSdVUZXAHCAVgahKciUQ9JUqst/1`
- Mint transaction: `0x47b2136666b4dbd00e17b39e181fadb1fad14abb124aca4c43a6ed480250a1a9` (successful receipt)
- Published metadata name: `GLORIFIER SERVICES — Official Logo #001`
- Published image CID: `bafkreidnoy2bugujfuc5prawef3onhrxihyo3inoi5s73dhlrm2f5bnxsa`

The on-chain metadata JSON was retrieved from Pinata and Filebase on 2026-11-03 and both gateways returned the same name, description and image URI. The Filebase image gateway returned the expected circular logo depiction and EST 2022. The committed `GLORIFIER SERVICES.png` is 55,886 bytes and its freshly computed SHA-256 equals the image CID sha2-256 digest; the current repository file is byte-for-byte identical to the published token image. The older historical source PNG remains a distinct file with a different hash.

The recorded historical source PNG SHA-256 `0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513` differs from the current canonical repository image hash `6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790`. The current repository file matches the on-chain image CID exactly; only the older historical PNG remains a distinct source file.

## Remaining repository photo candidates

At main commit `cac4d64ac8c367eabf50a1c3717a1b823af45a45`, the repository contains 99 image paths and 84 unique Git blob contents overall. The JPG/JPEG scope contains 96 paths and 82 unique file blobs. Other formats are listed separately in `nft/image-inventory-2026-11-03.json`.

The 82 JPEGs are inventory candidates only. They still need visual classification, provenance/rights review, per-item metadata, image and metadata CID verification, and a decision on which items should be minted.

## Existing custom contract source

`nft/contracts/src/GLORIFIERServicesLogo721.sol` remains a review/test-only single-edition contract. It is not deployed. The already minted Official Logo #001 is on the existing SeaDrop proxy above. Do not deploy or mint a duplicate Logo #001 with the review-only contract.

## Remaining transaction controls

- The previous destination candidate `0x393c19Ff12e1624181fBF1938b80982b9dfC427` is invalid: 39 hex characters after `0x`. Do not guess the missing character.
- The observed current owner of token ID 1 is not automatically the intended recipient for future items.
- The remaining candidate collection requires a suitable multi-item contract/program; the one-token review contract is insufficient.
- Prepare exact per-item metadata and content verification records before a transaction plan.
- Present the exact network, standard/program, items, token URIs, recipient, simulation and current costs for transaction-specific approval before any further signing, deployment, minting or spending.

No new transaction was submitted during this update.
