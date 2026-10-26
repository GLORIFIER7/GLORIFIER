# GLORIFIER ERC-20 Logo Publication — Evidence Follow-up

**Status: PARTIALLY VERIFIED.** Read-only explorer evidence confirms verified source code for the recorded ERC-20 contract. It does not prove token ownership verification for Etherscan's token-info form, artwork byte integrity, registry submission, or publication of the logo.

## Read-only chain evidence observed on 2026-10-26

### ERC-20

- Address: `0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb`
- Explorer: https://etherscan.io/address/0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb
- Etherscan source endpoint returned status `1 / OK`.
- Verified contract name: `GLORIFIER`
- Compiler: `v0.8.24+commit.e11b9ed9`
- Proxy flag: `0` (not reported as a proxy)
- The returned verified source identifies ERC-20 name `GLORIFIER`, symbol `GLR`, 18 decimals, and constructor-minted initial supply of 1,000,000,000 GLR to the specified initial holder. This describes the source; live state and holder allocation were not queried in this check.

### ERC-721 artwork contract candidate

- Address: `0xd62eb4963423f6e224af0bcccabf75f566fb9ad7`
- Explorer: https://etherscan.io/address/0xd62eb4963423f6e224af0bcccabf75f566fb9ad7
- Etherscan source endpoint returned status `1 / OK`.
- Contract name: `ERC721SeaDropCloneable`
- Compiler: `v0.8.17+commit.8df45f5f`
- Proxy flag returned as `2`; implementation address: `0x09a26fc8fcef18192e267d7a6da9dfb4be81dd6a`.

**Boundary:** These source responses alone do not prove a particular NFT token ID exists, its owner, the final metadata URI, total minted supply, or that this is the correct NFT for the ERC-20 logo. Check token-specific read-only evidence separately before asserting those claims.

## Remaining publication blockers

1. **Artwork integrity mismatch:** the repository records historical source SHA-256 `0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513` but a later retrieval SHA-256 `6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790`. Do not select or transform one as canonical until independently retrieved and reconciled.
2. **Registry derivative:** no derivative has been independently validated. Etherscan's current guide specifies SVG 32×32 or PNG 64×64. Trust Wallet's guide specifies lowercase `logo.png`, 256×256, maximum 512×512, maximum 100 KB, and a matching `info.json`. Use separate derivatives from the verified source if each provider requires different dimensions.
3. **Etherscan ownership verification:** verified source code is not the same as verifying the account's ownership of the token contract for a token-info request. The contract owner must complete Etherscan's ownership process through the logged-in account. Do not sign or submit on the user's behalf.
4. **Token identity and public profile:** verify the live token name, symbol, decimals, address checksum, official website and contact email before submission. Use neutral project description and only project-controlled social links.
5. **Registry review:** no Etherscan, Trust Wallet, MetaMask-provider, or DEXScreener logo submission or acceptance is evidenced by this repository check. Trust Wallet's published process requires a non-refundable processing fee and does not guarantee acceptance; payment is not approved.
6. **No universal update:** each explorer, wallet, token list, and DEX provider must be checked independently.

## Official requirements

- Etherscan: https://kb.etherscan.com/token-update-guide
- Etherscan how-to: https://info.etherscan.com/how-to-update-token-information-on-token-page/
- Trust Wallet requirements: https://developer.trustwallet.com/developer/new-asset/requirements
- Trust Wallet repository details: https://developer.trustwallet.com/developer/new-asset/repository_details
- Trust Wallet submission workflow: https://developer.trustwallet.com/developer/new-asset

## Verification ledger

| Check | Result |
|---|---|
| ERC-20 verified source returned by Etherscan | VERIFIED (read-only source response) |
| NFT candidate verified source returned by Etherscan | VERIFIED (read-only source response; proxy reported) |
| Specific NFT token ID owner/mint state | NOT VERIFIED in this check |
| Final NFT metadata CID | NOT VERIFIED |
| Canonical artwork hash reconciled | BLOCKED |
| Registry image derivatives | NOT VERIFIED |
| Etherscan token ownership for token-info form | NOT VERIFIED |
| Etherscan logo submitted/published | NOT VERIFIED |
| Trust Wallet PR/fee | NOT SUBMITTED; fee not authorized |
| DEXScreener and wallet logo publication | NOT VERIFIED |

## Safety boundary

This is evidence-only documentation. No wallet connection, signature, transaction, mint, transfer, deployment, secret access, paid action, registry submission, or merge is performed by this change. Do not label the project "fully verified" until every relevant check above has independent evidence.
