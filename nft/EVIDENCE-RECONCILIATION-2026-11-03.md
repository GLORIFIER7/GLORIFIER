# NFT asset inventory and on-chain reconciliation

**Observed:** 2026-11-03  
**Repository:** GLORIFIER7/GLORIFIER  
**Main commit inspected:** `cac4d64ac8c367eabf50a1c3717a1b823af45a45`  
**Working branch:** `nft/official-logo-mint-reconciliation-20261103`

## Image inventory

The current recursive Git tree contains **99 image paths** representing **84 unique Git blob contents** across common image formats.

Within the previously approved JPG/JPEG candidate scope there are **96 paths** and **82 unique byte-identical Git blobs**. Other formats are separately inventoried in the JSON file. Git blob deduplication only groups byte-identical files; visual near-duplicates with different encodings remain separate candidates.

The 82 JPG/JPEG candidates have not all been visually classified, provenance/rights reviewed, or prepared with individual NFT metadata.

## Existing Official Logo #001 — live chain verification

**Conclusion: the official-logo NFT is already minted.** No second Logo #001 mint is needed.

Ethereum Mainnet contract: `0xd62EB4963423f6e224Af0BccCabF75f566Fb9ad7`.

Read-only direct `eth_call` results:
- `owner()`: `0xe0589195995cb373c856953cfaddaeeaf2088a06`
- `ownerOf(1)`: `0xe0589195995cb373c856953cfaddaeeaf2088a06`
- `name()`: `GLORIFIER`
- `symbol()`: `GLR`
- `totalSupply()`: `1`
- `tokenURI(1)`: `ipfs://Qme1tGfPb4g8xJQKnvtHbSdVUZXAHCAVgahKciUQ9JUqst/1`

The verified Etherscan implementation is `ERC721SeaDropCloneable` (Solidity `v0.8.17+commit.8df45f5f`), with proxy type `2` and implementation `0x09a26fc8fcef18192e267d7a6da9dfb4be81dd6a`.

Mint transaction: [`0x47b2136666b4dbd00e17b39e181fadb1fad14abb124aca4c43a6ed480250a1a9`](https://etherscan.io/tx/0x47b2136666b4dbd00e17b39e181fadb1fad14abb124aca4c43a6ed480250a1a9). Its successful ERC-721 Transfer event minted token ID 1 to the owner above at block 26275697 on 2026-10-26T08:34:11Z.

### Token metadata and image reconciliation

The live token URI was retrieved from two independent gateways:
- Pinata: `https://gateway.pinata.cloud/ipfs/Qme1tGfPb4g8xJQKnvtHbSdVUZXAHCAVgahKciUQ9JUqst/1`
- Filebase: `https://ipfs.filebase.io/ipfs/Qme1tGfPb4g8xJQKnvtHbSdVUZXAHCAVgahKciUQ9JUqst/1`

Both returned the same metadata identifying **GLORIFIER SERVICES — Official Logo #001**, with image URI:
`ipfs://bafkreidnoy2bugujfuc5prawef3onhrxihyo3inoi5s73dhlrm2f5bnxsa`.

Filebase independently retrieved the image CID and returned an image description matching the circular GLORIFIER SERVICES emblem, EST 2022 details, and central atom symbol.

The image CID decodes to raw codec + sha2-256 multihash. Its digest is `6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790`, matching the previously recorded 55,886-byte artwork retrieval from 2026-10-20.

The older historical source PNG hash is `0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513`, which differs. The later retrieved image content is matched to the token image CID, but raw-byte identity with that older source PNG is not claimed.

An Alchemy aggregated metadata response contained a conflicting cached token URI and totalSupply=0. Direct on-chain reads and both gateway responses are treated as authoritative for the current contract URI and supply.

## Destination address validation

The old candidate `0x393c19Ff12e1624181fBF1938b80982b9dfC427` has **39 hexadecimal characters** after `0x`; a valid EVM address requires 40. It was not used for Logo #001. The observed current owner is `0xe0589195995cb373c856953cfaddaeeaf2088a06`, but ownership does not establish that this is the intended recipient for additional tokens.

## Contract and network fit

- Existing Official Logo #001: minted as ERC-721 token ID 1 on Ethereum Mainnet.
- Separate custom `GLORIFIERServicesLogo721.sol`: review-only, not deployed, fixed token ID 1, and unsuitable for an 82-image batch.
- Existing Solana devnet Token-2022 recovery record is not an artwork NFT mint.
- No additional Ethereum or Solana artwork transaction was initiated during this reconciliation.

## Remaining work for other images

1. Visually inspect and classify the 82 unique JPG/JPEG blobs; identify unrelated media and visual near-duplicates.
2. Confirm provenance and rights for every selected asset.
3. Prepare per-item metadata JSON and verify image/metadata CIDs and pin receipts.
4. Obtain a valid full destination address and select the network and token standard/program.
5. Use a suitable multi-item collection design, not the single-token review contract.
6. Simulate exact transactions and fees; present assets, metadata URIs, quantity, recipient, network and costs for transaction-specific approval.

## Execution status

- Official Logo #001: **VERIFIED MINTED** on Ethereum Mainnet; owner and tokenURI read; metadata retrieved through two gateways; image CID digest matches prior retrieved artwork bytes.
- Repository inventory: **VERIFIED** at main commit `cac4d64ac8c367eabf50a1c3717a1b823af45a45`; 82 unique JPG/JPEG candidates, 2 unique non-JPEG blobs.
- Remaining photo NFTs: **NOT MINTED / NOT READY** pending classification, rights, metadata, valid recipient and batch design.
- Repository changes in this branch: evidence, metadata copy, and inventory only.
- No new deployment, wallet signature, mint or expenditure occurred.
- Overall completion: **PARTIALLY VERIFIED**; the first official logo NFT is verified, remaining candidate photos are not yet transaction-ready.
