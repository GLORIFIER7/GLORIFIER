# GLORIFIER ERC-20 logo registry readiness

**Status: PARTIALLY VERIFIED — preparation only.** This document records the submission plan and known blockers. It does not claim that any third-party registry has accepted or published the logo.

## Canonical token and artwork

- Network: Ethereum Mainnet (chain ID 1)
- ERC-20 contract: `0x9DB6f9AfE2f4Ada50060D32D7C7c0bEBbccF89Eb`
- Token symbol: `GLR`
- Decimals recorded for this project: `18`
- Owner-designated NFT artwork: `ipfs://QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv`
- Public gateway candidate: `https://ipfs.io/ipfs/QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv`
- NFT contract candidate (separate from the ERC-20): `0xd62EB4963423f6e224Af0BccCabF75f566Fb9ad7`

The NFT artwork and ERC-20 token are separate assets. Changing a token-list logo does not alter either contract or automatically update all wallets and explorers.

## Integrity blocker — do not claim fully verified

The repository currently records two different SHA-256 values for the designated image:
- Historical source PNG: `0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513`
- Bytes retrieved from the designated CID on 2026-10-20: `6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790`

These values do not match. The exact dimensions, image format, current gateway availability, and a registry-ready derivative have not been independently verified in this update. Do not silently overwrite either hash or publish a derivative as verified until the source bytes are retrieved and reconciled. Do not use `public/glorifier-logo.jpg` as the canonical image without reconciling its recorded hash mismatch.

## Registry-specific requirements

### Etherscan

Official guidance:
- https://info.etherscan.com/how-to-update-token-information-on-token-page/
- https://info.etherscan.com/token-update-guide

Requirements include verified contract ownership, published/verified contract source, and a reviewed submission through the official Token Update form. Etherscan's guide specifies an SVG at 32×32 or PNG at 64×64 for the token logo. A 512×512 master may be retained, but create a compliant derivative only after the canonical bytes and appearance are verified. Token info updates are free; expedited turnaround is paid and is not authorized here.

### Trust Wallet Assets

Official guidance:
- https://assets.trustwallet.com/
- https://developer.trustwallet.com/developer/new-asset/requirements
- https://github.com/trustwallet/assets

The current guide specifies a lowercase `logo.png`, 256×256 pixels, preferably transparent background, and a corresponding `info.json`; repository guidance allows up to 512×512 and 100 KB. Ethereum asset folders use the contract address in checksum format. New submissions are reviewed and the published requirements state a non-refundable fee of 500 TWT or 2.5 BNB per pull request. **No fee payment or paid submission is authorized by this plan.** Verify current requirements before any submission.

### DEXScreener and other wallet providers

- DEXScreener: https://dexscreener.com/
- Submit or update project information only through the provider's currently supported process.
- A profile/logo request may depend on a trading pair, eligibility, or review. Do not claim listing coverage without checking the actual GLR listing and published result.
- MetaMask and other wallets may use different token lists or providers; one repository merge does not guarantee universal display.

## Required work before external submission

1. Retrieve the canonical IPFS bytes and independently calculate SHA-256; reconcile the hash discrepancy with the owner-designated source.
2. Verify the source image's MIME type, dimensions, transparency, visual integrity, and byte size.
3. Generate registry-specific derivatives only from the verified canonical source; record each derivative's SHA-256, dimensions, format, and path.
4. Validate ERC-20 address, token name, symbol, decimals, source verification, and owner authorization against Ethereum Mainnet. Keep the NFT address clearly separate.
5. Submit to Etherscan using the official form after ownership verification; save the submission reference and decision.
6. Consider Trust Wallet only after eligibility is checked and the owner separately approves any required fee.
7. Inspect each wallet/explorer after approval and record observed results individually. A submission is not a publication.

## Evidence status

| Check | Status |
|---|---|
| ERC-20 address recorded in project context | Recorded; recheck on-chain before submission |
| NFT artwork CID recorded in repository | Recorded |
| Artwork bytes/hash reconciled | **BLOCKED — hash mismatch** |
| Registry-ready PNG/SVG derivative verified | **NOT VERIFIED** |
| Etherscan token-info submission | **NOT SUBMITTED / NOT VERIFIED** |
| Trust Wallet asset PR | **NOT SUBMITTED / fee approval required** |
| DEXScreener profile/logo publication | **NOT VERIFIED** |
| Universal wallet/explorer display | **NOT GUARANTEED; verify provider by provider** |

## Safety boundaries

This workflow is read-only until a registry submission is explicitly approved. No contract changes, signing, minting, transfers, deployment, secret access, paid actions, automatic merge, or deployment are included.
