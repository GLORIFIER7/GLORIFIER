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
- `GLORIFIER_TESTNET_RPC_URL`

The private key must belong to a wallet you control and must be funded with testnet gas. Never commit the key. The initial holder is supplied manually when dispatching the workflow.

The workflow runs the full test suite before broadcasting and stores deployment output as a GitHub Actions artifact. A deployment is not considered verified until the resulting transaction and contract address are independently confirmed on the selected testnet.

```bash
export PRIVATE_KEY=...
export GLORIFIER_INITIAL_HOLDER=0x...
export RPC_URL=...
forge script script/DeployGLORIFIER.s.sol:DeployGLORIFIER \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --verify
```

For production, use a dedicated deployment wallet and move treasury/control assets to a multisig. The contract itself has no admin controls.

## Evidence required

A deployment is considered **VERIFIED** only when the chain, contract address, transaction hash, and explorer verification are recorded. Repository code alone does not constitute an on-chain deployment.
