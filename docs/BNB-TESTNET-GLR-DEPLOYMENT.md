# GLORIFIER GLR — BNB Smart Chain Testnet

## Target

- Network: BNB Smart Chain Testnet
- Chain ID: 97
- Token: GLORIFIER (GLR)
- Standard: ERC-20 / EVM-compatible
- Initial supply: 1,000,000,000 GLR
- Decimals: 18
- Post-deployment minting: disabled
- Upgradeability: none

BNB Smart Chain is EVM-compatible, so the existing Solidity/OpenZeppelin GLR contract can be reused without changing the token contract. BNB Chain documents BSC Testnet chain ID 97 and provides testnet RPC endpoints and a tBNB faucet.

## Required GitHub environment

Create an environment named `bnb-testnet` and add:

- `GLORIFIER_BNB_TESTNET_DEPLOYER_PRIVATE_KEY` — dedicated throwaway testnet-only key
- `GLORIFIER_BNB_TESTNET_RPC_URL` — optional private BSC Testnet JSON-RPC endpoint; if absent, the workflow uses BNB Chain's public testnet RPC
- `GLORIFIER_BSCSCAN_API_KEY` — optional; required only for explorer source verification

Never commit or paste private keys into source, issues, PRs, logs, or chat.

## Funding

The deployer needs test tBNB on BSC Testnet. The workflow refuses to broadcast when the balance is zero or below the estimated deployment cost plus a safety buffer.

## Evidence gate

A deployment is not considered verified until the workflow obtains all of:

1. real transaction hash;
2. successful transaction receipt;
3. contract address with deployed bytecode;
4. on-chain `GLORIFIER / GLR / 18` assertions;
5. total supply of exactly 1,000,000,000 GLR;
6. initial holder balance equal to total supply.

Explorer source verification is tracked separately and never fabricated.

## Migration note

This is a testnet deployment target. It does not imply a mainnet launch, exchange listing, price, liquidity, or financial value.

Ethereum Sepolia deployment remains available as a separate workflow; this BNB Testnet workflow is an additional EVM deployment path.
