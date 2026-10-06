# GLORIFIER Canonical Asset Registry

## Purpose

GLORIFIER maintains one canonical economic identity for each asset and records each blockchain deployment as a separately reconciled deployment.

For GLR:

- Canonical asset ID: `glr`
- Namespace: `glorifier`
- Name: `GLORIFIER`
- Symbol: `GLR`
- Decimals: 18
- Supply policy: fixed maximum supply of 1,000,000,000 GLR

A chain deployment is **not** a second GLR identity. It is a network-specific representation of the same canonical asset identity.

## Verification rule

Each deployment is verified independently. A verified Ethereum deployment does not automatically make a BNB deployment verified, and vice versa.

Allowed deployment states:

- `fully_verified`
- `verified`
- `partially_verified`
- `not_verified`
- `degraded`
- `not_observable`

No registry state may claim verification without evidence from the corresponding chain/explorer reconciliation.

## Current GLR deployments

| Network | Chain ID | Contract | Deployment TX | Status |
|---|---:|---|---|---|
| Ethereum Mainnet | 1 | `0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb` | `0x8b92e5b669ea3188fe55052ed68d3eae0cc7715a0cf8c96e71ee7e95d846f81a` | FULLY VERIFIED |
| BNB Smart Chain Mainnet | 56 | `0x5e0B0A449232FDA7cA6Ea3419A50873b08F64804` | `0xf5698f6bbde7ff173be1cbd0bb83da53f03389842c68ca2f6e4e287b89d9bbc0` | FULLY VERIFIED |

The BNB record is based on an existing-deployment reconciliation; the verification mode is `verify-existing` and does not broadcast a new blockchain transaction.

## API

- `GET /api/assets/canonical?assetId=glr` returns one canonical asset and its chain deployments.
- `GET /api/assets/canonical/all` returns all canonical assets.

Secrets, private keys, and credentials are never stored in the canonical asset registry.

## Governance invariant

**ONE CANONICAL ASSET → MANY CHAIN DEPLOYMENTS → INDEPENDENT EVIDENCE**

The canonical registry is an identity and evidence index. It is not a bridge, custody system, trading engine, or automatic cross-chain settlement mechanism.
