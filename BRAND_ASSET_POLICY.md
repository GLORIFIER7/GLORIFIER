# GLORIFIER Official Brand Asset Policy

## Canonical artwork — existing Ethereum ERC-721 Official Logo #001

The canonical app artwork is the exact image referenced by the live Ethereum Mainnet ERC-721 Official Logo #001, token ID 1. The owner-uploaded PNG in this conversation has the same SHA-256 digest as the on-chain token image CID.

- Display name: **GLORIFIER SERVICES — Official Logo #001**
- Network: Ethereum Mainnet (chain ID 1)
- ERC-721 contract: `0xd62EB4963423f6e224Af0BccCabF75f566Fb9ad7`
- Token ID: `1`
- On-chain token metadata URI: `ipfs://Qme1tGfPb4g8xJQKnvtHbSdVUZXAHCAVgahKciUQ9JUqst/1`
- Canonical on-chain image URI: `ipfs://bafkreidnoy2bugujfuc5prawef3onhrxihyo3inoi5s73dhlrm2f5bnxsa`
- Canonical image SHA-256: `6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790`
- Source format and dimensions: PNG, 500 × 500, 55,886 bytes
- Existing repository source: `GLORIFIER SERVICES.png`
- App-served copy: `public/glorifier-services-official-logo-001.png` — must remain byte-for-byte identical to the source and on-chain image digest.
- Owner-uploaded file SHA-256: `6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790`.

The earlier historical source PNG hash `0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513` is different. Do not use that historical file in place of the current minted token image. The current app artwork is identified by its match to the live token image CID digest.

## Rendering rules

- Use the complete original PNG with `object-fit: contain` or an equivalent aspect-ratio-preserving setting.
- Do not crop, stretch, recolor, redraw, regenerate, add a competing tile/background, or overlay badges.
- Use the same byte-identical image for the app header, browser icon, installed PWA icon, and social preview.
- If the local image fails to load, show a neutral fallback glyph and report the failure; do not substitute a generated or unrelated image while calling it the official logo.
- Any future resized or transformed derivative must be explicitly documented with its own hash and must not replace the canonical source.

## Verification and authority

The repository's NFT evidence records the token URI, metadata image CID, contract, and successful mint observation. The local asset-integrity test verifies the bytes shipped by the app against the recorded token image digest. Production deployment and browser rendering still require deployment/runtime verification.

Legal/trademark clearance remains **PENDING**; owner designation and NFT token ownership do not by themselves establish trademark clearance or broader intellectual-property conclusions. The Human Owner retains final authority over material artwork changes.
