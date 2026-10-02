# GLORIFIER Token

GLORIFIER (GLR) is a fixed-supply ERC-20 implementation.

## Parameters

- Name: GLORIFIER
- Symbol: GLR
- Decimals: 18
- Initial/max supply: 1,000,000,000 GLR
- Minting after deployment: disabled
- Upgradeability: none
- Transfer tax: 0%
- Blacklist: none
- Owner/admin: none

## Build

Install Foundry, then:

```bash
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit
forge test
```

## Testnet deployment

The repository includes an authorized GitHub Actions workflow at `.github/workflows/glorifier-testnet-deploy.yml`. It requires repository/environment secrets:

- `GLORIFIER_DEPLOYER_PRIVATE_KEY`
- `GLORIFIER_ALCHEMY_SEPOLIA_RPC_URL` (recommended primary)
- `GLORIFIER_TESTNET_RPC_URL` (Infura fallback)

The private key must belong to a wallet you control and must be funded with testnet gas. Never commit the key. The initial holder is supplied manually when dispatching the workflow.

The workflow runs the full test suite before broadcasting and stores deployment output as a GitHub Actions artifact. It health-checks Alchemy first and falls back to Infura when Alchemy is unavailable. Both providers must resolve to Ethereum Sepolia (chain ID `11155111`). The selected provider is recorded in the workflow summary. The initial holder may be an EOA, multisig, or other contract address; only the zero address is rejected. A deployment is not considered verified until the resulting transaction receipt, contract address, deployed bytecode, token metadata, total supply, and holder balance are independently confirmed on Sepolia.

```bash
export PRIVATE_KEY=...
export GLORIFIER_INITIAL_HOLDER=0x...
export RPC_URL=...
forge script script/DeployGLORIFIER.s.sol:DeployGLORIFIER \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --slow
```

For production, use a dedicated deployment wallet and move treasury/control assets to a multisig. The contract itself has no admin controls.

## Evidence required

A deployment is considered **VERIFIED** only when the chain, contract address, transaction hash, successful receipt, deployed bytecode, token metadata, total supply, and initial-holder balance are confirmed on Sepolia. Explorer source verification is a separate optional evidence layer. Repository code alone does not constitute an on-chain deployment.

## Verification

Optional Etherscan source verification is performed by the GitHub Actions workflow only when `GLORIFIER_ETHERSCAN_API_KEY` is configured in the `testnet` environment. Source verification is separate from on-chain deployment verification: the contract can be deployed and on-chain verified even when explorer source verification is not configured.

Do not use an Infura Gas API URL as either RPC secret. Alchemy Sepolia uses `https://eth-sepolia.g.alchemy.com/v2/<API_KEY>`; Infura Sepolia uses `https://sepolia.infura.io/v3/<PROJECT_ID>`. Never commit API keys or private keys.
