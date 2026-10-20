# GLORIFIER SERVICES Official Logo #001 — Contract Review

**Status: review/preparation only; not deployed; not minted.**

## Canonical contract

Use `src/GLORIFIERServicesLogo721.sol` as the sole proposed deployment target. It uses ERC-721 name `GLORIFIER SERVICES — Official Logo #001`, symbol `GLORIFIER-LOGO-001`, and token ID `1`.

The contract has these controls:

- No token is minted during construction.
- Only the owner can call `mint(address recipient)`; only one mint can succeed.
- The metadata URI is supplied at construction and has no public mutation method.
- Empty metadata URI and zero recipient are rejected. OpenZeppelin's `Ownable` constructor rejects a zero owner.
- No public mint, upgrade, withdrawal, or administrative metadata setter is included.

`src/GlorifierServicesLogo001.sol` and its matching test are a **legacy duplicate**, not the proposed deployment target. Do not deploy both implementations. Remove or archive the legacy pair in a separately reviewed cleanup after confirming no external workflow depends on them.

## Proposed metadata parameters

- Metadata URI: `ipfs://QmY5TyncxWWHjKUqm3B8y59WHQ2QDfFpvogR71j95a1tAs`
- Image URI: `ipfs://QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv`
- Proposed recipient (user-supplied): `0x393c19Ff12e1624181fBF1938b80982b9dfC427`

The user reports that the metadata CID is visible in Filebase and loads through a gateway; that report has not been independently verified in this review. Keep the prior metadata pinned until the new metadata is independently retrieved and checked through at least two gateways and pin/retention status is confirmed.

The retrieved image bytes previously measured SHA-256 `6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790`, differing from the historical source PNG hash `0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513`. Byte-for-byte identity with that historical file is therefore **not established**.

## Required gates before mainnet transactions

1. Independently retrieve the exact metadata JSON from multiple gateways; verify the name, description, attributes, and image URI.
2. Confirm the intended wallet controls the proposed recipient address.
3. Separately choose and verify `initialOwner`—the wallet that will be authorized to call `mint`. Do not assume it is the recipient.
4. Verify pinning/retention without incurring a charge unless separately approved.
5. Run the pinned Foundry compile/test workflow on the exact proposed commit and inspect its results.
6. Simulate deployment and mint with the exact constructor arguments and transaction parameters; record estimated gas and current fee conditions.
7. Present the contract address (after deployment), owner, recipient, metadata URI, network, and costs for review before minting.

The workflow `.github/workflows/nft-contract-review.yml` is intended to run `forge test`; it must not be treated as a wallet, deployment, or mint workflow. Passing tests are not an independent security audit, proof of IPFS persistence, legal clearance, or transaction authorization.

**No deployment, mint, wallet signature, or expenditure is performed by this documentation change.**
