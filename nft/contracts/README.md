# GLORIFIER SERVICES Official Logo #001 — Contract Review

**Status: review-only; not deployed; not minted.**

This isolated Foundry project prepares an ERC-721 with the following intended controls:

- Token ID is fixed at `1`.
- Only the owner can call `mintOnce`.
- Only one successful mint is possible.
- The metadata URI is immutable after construction.
- Zero owner, zero recipient, and empty metadata URI are rejected.
- Unit tests cover the core controls.

## Local/CI verification

The workflow at `.github/workflows/nft-contract-review.yml` installs pinned OpenZeppelin and Foundry test dependencies and runs `forge test`. It does not configure a wallet, RPC endpoint, private key, deployment, or mint transaction.

## Important review items

- The constructor metadata URI is currently a test fixture, not an approval to publish or mint. Before any future deployment proposal, confirm the final metadata CID and retrieve the JSON and image independently.
- A fixed URI does not guarantee IPFS persistence.
- This source has not been independently audited.
- Passing unit tests does not establish production readiness or guarantee deployment gas.
- No mainnet deployment, minting, wallet signature, or expenditure is authorized by this change.
