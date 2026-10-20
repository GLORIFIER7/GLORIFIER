# GLORIFIER SERVICES Official Logo #001 — Contract Review

**Status: review-only; not deployed; not minted.**

This isolated Foundry project prepares a single-edition ERC-721 with these controls:

- Token ID is fixed at `1`.
- Only the owner can call `mint(address recipient)`.
- Only one successful mint is possible.
- The metadata URI is supplied as a constructor argument, stored at construction, and has no public mutation method.
- Empty metadata URI and zero recipient are rejected. OpenZeppelin's `Ownable` constructor rejects a zero owner.
- No constructor mint, public mint, upgrade, withdrawal, or administrative metadata setter is included.
- Unit tests cover the core controls, including empty metadata rejection.

## Metadata deployment parameter

The current published metadata CID is recorded in the repository as an owner-supplied reference, but the corrected metadata draft still requires publication and verification. Do not treat the existing CID as final merely because it is in a test fixture.

Before any deployment proposal:

1. Publish the final corrected metadata JSON to IPFS and record its new CID.
2. Retrieve the JSON from independent gateways and verify the exact name and `image` URI.
3. Verify pinning receipts/retention for the final artwork and metadata without incurring a charge unless separately authorized.
4. Pass the final `ipfs://...` metadata URI as the constructor argument during a separately reviewed deployment; do not mint during deployment.
5. Run the contract compile and test workflow on the exact proposed commit.
6. Simulate deployment and mint transactions and present the exact parameters, network, recipient, and estimated costs for review.

## Local/CI verification

The workflow at `.github/workflows/nft-contract-review.yml` installs pinned OpenZeppelin and Foundry test dependencies and runs `forge test`. It does not configure a wallet, RPC endpoint, private key, deployment, or mint transaction.

A passing test suite is not an independent security audit, proof of IPFS persistence, legal clearance, or authorization to transact.

**No Ethereum Mainnet deployment, minting, wallet signature, or expenditure is authorized by this review package.**
