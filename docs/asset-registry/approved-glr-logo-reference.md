# GLORIFIER (GLR) Approved Logo Artwork Reference

**Status: PARTIALLY VERIFIED — the owner selected these links for reference; content identity, file integrity, and third-party publication remain unverified.**

## Owner confirmation

On 2026-10-26, the project owner confirmed that the primary IPFS link and the alternative IPFS InBrowser link are the two links they consider correct for viewing the intended GLORIFIER logo. Preserve the owner's selected artwork; do not replace it with generated or unrelated artwork.

- **Primary content identifier:** `ipfs://QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv`
- **Primary gateway:** https://ipfs.io/ipfs/QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv
- **Owner-approved alternative URL (content identity unverified):** https://bafybeidhd7qobc7ralefgnkvuom4vs5etkvo3wq4grtaxigfw2ztqfsvb4.ipfs.inbrowser.link/

**Important CID distinction:** The alternative URL contains a different CID from the primary CID. Different CIDs can identify different IPFS content; the alternative URL must not be described as a verified gateway for the primary CID unless their content is independently compared. The owner approved both URLs as references, but that approval alone does not prove byte-for-byte equivalence.

## Asset separation

- GLORIFIER ERC-20 (GLR), Ethereum Mainnet: `0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb`
- Candidate ERC-721 artwork contract: `0xd62eb4963423f6e224af0bcccabf75f566fb9ad7`

The NFT contract and ERC-20 contract are distinct assets. Selecting NFT artwork as the intended logo does not automatically set the ERC-20 logo in Etherscan, wallets, token lists, or market-data services.

## Verification ledger

| Check | Status |
|---|---|
| Owner selected both URLs as intended viewing references | VERIFIED — owner confirmation, 2026-10-26 |
| Primary CID recorded consistently | RECORDED |
| Alternative URL serves the same bytes as primary CID | NOT VERIFIED — different CID in URL |
| Canonical SHA-256 reconciled against historical records | BLOCKED — prior records contain conflicting hashes |
| MIME type, dimensions, transparency, and file size independently measured | NOT VERIFIED |
| Provider-specific derivatives validated | NOT VERIFIED |
| Etherscan logo submission and publication | NOT VERIFIED |
| Other wallet/listing providers publish the logo | NOT VERIFIED |

## Next steps

1. Retrieve the primary CID bytes without changing the source artwork.
2. Separately retrieve the alternative URL's bytes and compare the SHA-256 hashes. If retrieval is unavailable, retain the alternative as an unverified reference and do not infer equivalence from the URL.
3. Record each retrieved file's MIME type, dimensions, byte size, and SHA-256; compare with the historical hashes in `erc20-logo-publication.md` and `erc20-logo-verification-evidence.md`.
4. If the primary content is confirmed, create only provider-specific derivatives from those bytes and record their own hashes.
5. Submit Etherscan token information only through its official flow after the account owner completes required ownership verification. Etherscan's published guidance specifies SVG 32×32 or PNG 64×64, and the ordinary token-info update is free.
6. Check each provider's result independently. Do not claim universal publication from a single submission.

## Safety boundary

This document records owner intent and a verification plan. It does not perform a signature, transaction, mint, transfer, paid submission, secret access, deployment, or registry submission. No third-party publication or full verification is claimed.
