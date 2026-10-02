# GLORIFIER on Solana

This directory defines the official Solana launch path for GLORIFIER (GLR).

## Canonical design

- Network for first deployment: Solana Devnet
- Production network: Solana Mainnet-Beta only after explicit human approval
- Name: GLORIFIER
- Symbol: GLR
- Decimals: 9
- Fixed supply: 1,000,000,000 GLR
- Transfer fee: 0%
- Permanent delegate: none
- Freeze authority: revoked after initialization
- Mint authority: revoked after the full supply is minted
- Upgradeable token logic: none
- Automatic trading: none
- Automatic financial transfers: none

The mint address is the authoritative identifier. The existing Solana mint
`FrJhrVGjNRiB1eZpg5PTqLp9VSQS5rpwMp7jxNtEmV9G` is not treated as an
official GLORIFIER mint unless independently proven.

## Why the mint authority is revoked

Solana's token model allows a mint authority to create additional supply.
After the complete 1,000,000,000 GLR supply is minted, this implementation
revokes mint authority. The freeze authority is also revoked so the token
does not retain an administrative freeze switch.

Solana documents mint creation, minting, and authority management in its SPL
Token documentation.

## Deployment automation

The repository includes `.github/workflows/glorifier-solana-devnet.yml` for a controlled Devnet deployment. It is manual (`workflow_dispatch`) and requires a dedicated deployment keypair supplied by the repository owner as a GitHub Actions secret. The private key must never be committed or pasted into ChatGPT. The workflow refuses non-Devnet RPC endpoints and uploads deployment output as an evidence artifact.

## Safest deployment sequence

1. Create a dedicated wallet you control.
2. Deploy to Devnet first.
3. Create the mint.
4. Create the associated token account for the initial holder.
5. Mint exactly 1,000,000,000 GLR.
6. Verify name/symbol/decimals/supply and holder balance.
7. Revoke mint and freeze authorities.
8. Record the mint address and transaction signatures as evidence.
9. Only then consider a separate Mainnet-Beta deployment.

Do not paste a seed phrase or private key into GLORIFIER, GitHub, ChatGPT,
or a web form.

## Binance Wallet

A Binance Web3 Wallet can be used as the signing wallet when the selected
Solana DApp connection supports it. The wallet signs transactions; GLORIFIER
does not need custody of the wallet's private key.

## Verification boundary

- Source/configuration: PUBLISHED when merged.
- Deployment automation: CONFIGURED; execution still requires the owner's authorized wallet secret and a successful workflow run.
- Devnet deployment: NOT VERIFIED until a real Solana transaction signature
  and mint address are recorded.
- Mainnet deployment: NOT VERIFIED until a real mainnet mint and transaction
  evidence are recorded.
