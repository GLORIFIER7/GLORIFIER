# GLORIFIER EVM Sepolia + Infura Setup

## Purpose

GLORIFIER's ERC-20 testnet deployment uses a GitHub Actions secret for the Ethereum Sepolia JSON-RPC endpoint. The workflow remains provider-neutral: Infura, Alchemy, or another authorized Sepolia RPC can be used.

## Infura endpoint

Ethereum Sepolia RPC format:

`https://sepolia.infura.io/v3/<INFURA_API_KEY>`

Do not commit the API key to Git. Store the complete endpoint as the GitHub Actions secret `GLORIFIER_TESTNET_RPC_URL`.

The deployment workflow validates chain ID `11155111` before deployment.

## Required GitHub Actions secrets

Configure these in the `testnet` environment:

- `GLORIFIER_TESTNET_RPC_URL` — complete Infura Sepolia JSON-RPC endpoint.
- `GLORIFIER_DEPLOYER_PRIVATE_KEY` — dedicated Sepolia deployment wallet private key.
- `GLORIFIER_ETHERSCAN_API_KEY` — optional; enables Etherscan source verification.

Never put private keys or API secrets in repository files, issues, commits, or chat.

## Deployment safety gates

The workflow refuses to deploy unless the RPC exists, the holder is a valid non-zero address, chain ID is exactly `11155111`, the deployer key exists, the deployer has Sepolia ETH, the holder is a valid non-zero Ethereum address (EOA, multisig, or contract), and Foundry tests pass.

After deployment it verifies name `GLORIFIER`, symbol `GLR`, decimals `18`, total supply `1,000,000,000 GLR`, complete initial-holder balance, and successful transaction receipt. No mainnet deployment is performed.

## Mobile setup

1. Open GitHub and `GLORIFIER7/GLORIFIER`.
2. Go to **Settings → Secrets and variables → Actions → Environments**.
3. Select/create the `testnet` environment.
4. Add `GLORIFIER_TESTNET_RPC_URL` with the complete Infura Sepolia endpoint.
5. Add `GLORIFIER_DEPLOYER_PRIVATE_KEY`.
6. Optionally add `GLORIFIER_ETHERSCAN_API_KEY`.
7. Run **Actions → GLORIFIER Testnet Deploy → Run workflow**.
8. Enter the approved initial-holder address.
9. Treat deployment as successful only when the workflow succeeds and its evidence artifact contains a contract address and transaction hash.

## Credential hygiene

If an Infura API key has been exposed publicly, rotate or restrict it in the provider dashboard before production use. Never disclose a wallet private key or seed phrase to ChatGPT or commit it to GitHub.
