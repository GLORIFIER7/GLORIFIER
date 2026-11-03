# GLORIFIER SERVICES Official Logo #001 — Contract Review

**Status: existing Official Logo #001 is already minted on a separate verified SeaDrop ERC-721 proxy; this repository contract remains review-only and undeployed.**

## Existing deployed token

- Network: Ethereum Mainnet (chain ID 1)
- Existing contract: `0xd62EB4963423f6e224Af0BccCabF75f566Fb9ad7`
- Verified implementation: `ERC721SeaDropCloneable`, proxy type 2
- Token ID: `1`
- Metadata name: `GLORIFIER SERVICES — Official Logo #001`
- Current owner: `0xe0589195995cb373c856953cfaddaeeaf2088a06`
- Token URI: `ipfs://Qme1tGfPb4g8xJQKnvtHbSdVUZXAHCAVgahKciUQ9JUqst/1`
- Mint transaction: `0x47b2136666b4dbd00e17b39e181fadb1fad14abb124aca4c43a6ed480250a1a9` (successful receipt)

The on-chain URI returned the official-logo metadata through both Pinata and Filebase. Do not deploy or mint another Logo #001 token.

## Separate review-only custom contract

`src/GLORIFIERServicesLogo721.sol` is a test-only custom implementation. It uses ERC-721 name `GLORIFIER SERVICES — Official Logo #001`, symbol `GLORIFIER-LOGO-001`, and fixed token ID `1`.

- Constructor does not mint.
- Only owner can call `mint(address recipient)`, once.
- Metadata URI is fixed at construction.
- Empty metadata URI and zero recipient are rejected.
- No public mint, upgrade, withdrawal, or URI mutation method.

This contract is **not deployed** and must not be used to create a duplicate of the already minted Official Logo #001. It is also not suitable for minting the remaining 82 JPEG candidate files because it only supports one token.

`src/GlorifierServicesLogo001.sol` and its matching test are legacy duplicates; do not deploy both implementations.

## Remaining batch collection design

The remaining candidate image set needs a separate reviewed multi-item NFT design. Before any deployment or mint:
1. Classify the candidate assets and resolve provenance/rights.
2. Verify each original image and final metadata URI through independent retrieval paths.
3. Confirm a complete valid destination address and intended network.
4. Select a standard/program that supports the intended item quantity and metadata model.
5. Run compile, tests, and exact transaction simulations.
6. Present assets, recipient, network, metadata URIs, quantities, and itemized current fees for transaction-specific approval.

Passing review tests are not an independent security audit, proof of provider pin permanence, or legal clearance. No new deployment, mint, wallet signature, or expenditure is performed by this documentation change.
