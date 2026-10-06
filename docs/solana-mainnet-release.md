# GLORIFIER GLR — Solana Mainnet Release Gate

## Production rule

GLR Mainnet is a real production asset. Solana documents Mainnet as the live production environment and recommends dedicated/private RPC infrastructure for production rather than the shared public endpoint.

The release path is intentionally:

1. Authorized Solana Devnet deployment.
2. Independent Devnet reconciliation.
3. solana/canonical-devnet-identity.json becomes VERIFIED_ON_CHAIN.
4. Human-approved glorifier-solana-mainnet GitHub Environment.
5. Mainnet Token-2022 deployment.
6. Mainnet deployment artifact and provenance validation.
7. Independent read-only Mainnet reconciliation.
8. Independent transaction confirmation.
9. Only then publish solana/canonical-mainnet-identity.json as FULLY_VERIFIED.

No step treats code presence as on-chain proof.

## Required GitHub Environment

Create a protected environment named glorifier-solana-mainnet with required reviewers.

Environment secrets:

- SOLANA_MAINNET_RPC_URL — dedicated/private production Solana RPC.
- GLORIFIER_SOLANA_MAINNET_KEYPAIR_JSON — production deployment signer.

Never put the production keypair in repository files, frontend code, or ordinary repository variables.

## Token contract

- Name: GLORIFIER
- Symbol: GLR
- Standard: Token-2022
- Decimals: 9
- Fixed supply: 1,000,000,000 GLR
- Transfer fee: 0
- Permanent delegate: none
- Final mint authority: none
- Final freeze authority: none
- Metadata URI: https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json

Solana Token-2022 supports metadata through the Metadata Pointer and Token Metadata extensions. Setting an authority to None permanently removes that authority.

## Safety boundaries

- Mainnet workflow is manual-only.
- Exact authorization string is required.
- Mainnet requires human approval through the protected environment.
- Devnet verification is a hard prerequisite.
- Public Mainnet RPC is rejected.
- A replay lock blocks creation of a second mint when prior mainnet deployment evidence exists.
- The final publisher requires deployment provenance, artifact digest, mint identity, six transaction signatures, and independent on-chain confirmation.
- No automatic trading, transfers, treasury movement, bridge operation, or exchange listing is performed.

## Current status

solana/canonical-mainnet-identity.json intentionally starts as NOT VERIFIED.

It must remain NOT VERIFIED until an actual authorized Mainnet workflow produces and independently reconciles a real mint.
