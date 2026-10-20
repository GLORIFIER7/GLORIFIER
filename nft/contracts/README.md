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
# GLORIFIER SERVICES Official Logo #001 — ERC-721 review package

**Status: REVIEW ONLY.** This package is a proposed custom ERC-721 contract and test suite. It is not deployed, and it does not mint during construction.

## Contract behavior

- ERC-721 name: `GLORIFIER SERVICES — Official Logo #001`
- Symbol: `GLORIFIER-LOGO-001`
- Single token ID: `1`
- Minting: one token, owner-only, at most once; no constructor mint.
- Metadata URI: supplied at deployment and stored without a public mutation method.
- No upgrade, withdrawal, public mint, or administrative metadata setter is included.

The owner-only mint function is present in source but has not been called on a live network. Unit tests that exercise minting are local simulations and do not broadcast transactions.

## Current metadata review status

- Owner-designated artwork CID: `QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv`
- Owner-supplied metadata CID: `QmZ1Na7Bdn23fKJdWK5JSvLTThTZ8j1r8W5SujHbVhX3wX`
- Both repository metadata drafts now point their `image` field at the designated artwork CID.
- The owner reports that the links load. Independent raw-byte retrieval, SHA-256 recalculation, provider pin-receipt verification, and exact byte-for-byte correspondence between the supplied metadata CID and repository JSON remain unverified.
- Do not deploy or mint until the metadata CID is retrieved and its `image` field is confirmed to reference the designated artwork URI.

The offline metadata script checks JSON shape and reports image URIs; it does not fetch IPFS, verify pinning, or calculate the image hash.

## Reproducible local checks

Install Foundry, then from this directory:

```sh
mkdir -p lib
git clone https://github.com/OpenZeppelin/openzeppelin-contracts.git lib/openzeppelin-contracts
git -C lib/openzeppelin-contracts checkout --detach c64a1edb67b6e3f4a15cca8909c9482ad33a02b0
git clone https://github.com/foundry-rs/forge-std.git lib/forge-std
git -C lib/forge-std checkout --detach bf647bd6046f2f7da30d0c2bf435e5c76a780c1b
forge build
forge test -vv
```

From the repository root, validate the metadata JSON shape:

```sh
node nft/scripts/validate-metadata.mjs
```

The GitHub Actions workflow runs these checks on pull requests. It has no deployment step and requires no wallet or private key.

## Required evidence before any separate deployment proposal

1. Independent image byte retrieval and SHA-256 calculation.
2. Metadata JSON URI and image-CID reconciliation.
3. Successful CI compile and tests on the exact proposed commit.
4. Security review of source and ownership assumptions.
5. A separate deployment-cost simulation and explicit presentation of exact parameters and costs.
6. Separate explicit Human Owner authorization before any wallet signature, payment, deployment, or mint.

Passing the build and tests is not authorization to deploy or mint, and does not prove IPFS persistence or legal clearance.
