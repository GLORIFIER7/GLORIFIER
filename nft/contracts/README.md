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

## Current metadata blocker

The committed metadata files still reference the previous image CID:

`bafkreiakbvnq4sc5xvff5vzyhj572kemre5sfwedi2almqkhlqz53hefcm`

The newly designated image CID is:

`QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv`

Do not change the published metadata URI or deploy this contract until the new image CID's raw bytes are retrieved and SHA-256 is independently checked against the recorded source digest, and the metadata JSON is reviewed. The recorded digest matching the newer CID is currently an owner-confirmed assertion, not a fresh independent byte-level calculation.

The offline metadata script checks JSON shape and reports image URIs; it does not fetch IPFS, verify pinning, or calculate the image hash.

## Reproducible local checks

Install Foundry, then from this directory:

```sh
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit
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
