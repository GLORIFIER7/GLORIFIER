# GLORIFIER SERVICES NFT — evidence status

**Observed:** 2026-11-03  
**Repository:** GLORIFIER7/GLORIFIER

## Existing Official Logo #001 — verified minted

The official-logo NFT already exists on Ethereum Mainnet. Do not deploy a duplicate Logo #001 contract or mint a second copy of this edition.

| Field | Verified value |
|---|---|
| Contract | `0xd62EB4963423f6e224Af0BccCabF75f566Fb9ad7` |
| Standard | ERC-721 (verified SeaDrop proxy implementation) |
| Token ID | `1` |
| Current owner / ownerOf(1) | `0xe0589195995cb373c856953cfaddaeeaf2088a06` |
| On-chain tokenURI(1) | `ipfs://Qme1tGfPb4g8xJQKnvtHbSdVUZXAHCAVgahKciUQ9JUqst/1` |
| Published metadata name | `GLORIFIER SERVICES — Official Logo #001` |
| Published image URI | `ipfs://bafkreidnoy2bugujfuc5prawef3onhrxihyo3inoi5s73dhlrm2f5bnxsa` |
| Mint transaction | [`0x47b2136666b4dbd00e17b39e181fadb1fad14abb124aca4c43a6ed480250a1a9`](https://etherscan.io/tx/0x47b2136666b4dbd00e17b39e181fadb1fad14abb124aca4c43a6ed480250a1a9) |
| Receipt | SUCCESS |

The live contract reads returned owner, ownerOf(1), name, symbol, totalSupply, and tokenURI. The exact tokenURI metadata JSON was retrieved from both Pinata and Filebase on 2026-11-03; both named Official Logo #001 and referenced the same image CID. The returned description and separate Motto attribute use slightly different phrasings; both exact values are preserved verbatim in the evidence record rather than silently altering immutable published metadata.

The image CID SHA-256 multihash is `6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790`. The committed `GLORIFIER SERVICES.png` was fetched from main commit `cac4d64ac8c367eabf50a1c3717a1b823af45a45` and measured 55,886 bytes, Git blob `c01f73f2551db4fb98573e87b8bd80c38a5dc0cc`, SHA-256 `6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790`. Its SHA-256 exactly matches the live token image CID digest. Filebase also returned the expected circular GLORIFIER SERVICES logo with EST 2022. The older historical source PNG hash `0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513` is different; that older file is not the current canonical repository asset.

See `metadata/observed-ethereum-mainnet-official-logo-001.json` and `metadata/ethereum-mainnet-token-001-observation.json` for the gateway metadata and read-only chain observation.

## Repository image inventory

At main commit `cac4d64ac8c367eabf50a1c3717a1b823af45a45`, the repository contains 99 image paths and 84 unique Git blob contents. In the JPG/JPEG scope there are 96 paths and 82 unique byte-identical blobs. The 2 unique non-JPEG assets are listed separately. The 82 JPEG candidates remain inventory-only; they have not all been visually classified, assigned final metadata, or minted. The PNG logo asset is recorded separately and must not be minted again as Logo #001.

Inventory: `image-inventory-2026-11-03.json`.

## Contract implementation distinction

The verified existing contract is a SeaDrop ERC-721 proxy and it already contains the official logo token. The separate `nft/contracts/src/GLORIFIERServicesLogo721.sol` file is only a review/test implementation with a fixed single-token ID; it is not deployed and is not a batch solution for the remaining image candidates.

The NFT contract review workflows compile and test only. They do not deploy, mint, connect a wallet, or sign transactions.

## Remaining work before additional photo mints

1. Visually classify the 82 unique JPG/JPEG candidates, identify unrelated media and near-duplicates, and establish provenance/rights.
2. Prepare a per-item metadata and image-content manifest; verify every CID and record pin receipts separately from gateway reachability.
3. Obtain a complete intended destination address. The older registry candidate `0x393c19Ff12e1624181fBF1938b80982b9dfC427` has only 39 hexadecimal characters and is invalid; it was not used for Logo #001.
4. Select a multi-item Ethereum or Solana NFT design. The existing one-token review contract is unsuitable for batch minting.
5. Simulate the exact final transactions and itemize costs. Present the asset list, recipient, network, standard/program, metadata URIs, quantity, and fees for transaction-specific approval.

**No additional mint, deployment, signature, or expenditure occurred during this reconciliation.**
