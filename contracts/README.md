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

The repository includes an authorized GitHub Actions workflow at `.github/workflows/glorifier-testnet-deploy.yml`. It requires GitHub `testnet` environment secrets:

- `GLORIFIER_DEPLOYER_PRIVATE_KEY`
- `GLORIFIER_ALCHEMY_SEPOLIA_RPC_URL` (recommended primary)
- `GLORIFIER_TESTNET_RPC_URL` (Infura fallback)
- `GLORIFIER_ETHERSCAN_API_KEY` (optional explorer source verification)

The private key must belong to a wallet you control and must be funded with Sepolia ETH for gas. Never commit or paste the key into source control. The initial holder is supplied manually when dispatching the workflow.

The workflow runs the full test suite before broadcasting, validates that the selected RPC resolves to Ethereum Sepolia (chain ID `11155111`), and stores deployment output as a GitHub Actions artifact. It health-checks Alchemy first and falls back to Infura when Alchemy is unavailable. The selected provider is recorded in the workflow summary.

### Correct RPC endpoints

Alchemy Sepolia JSON-RPC:

```text
https://eth-sepolia.g.alchemy.com/v2/<API_KEY>
```

Infura Sepolia JSON-RPC:

```text
https://sepolia.infura.io/v3/<PROJECT_ID>
```

Do **not** use an Infura Gas API endpoint such as `https://gas.api.infura.io/...`. Gas API and Ethereum JSON-RPC are separate services.

### Alchemy Agent Wallet

The Alchemy Agent Wallet dashboard is useful for authorized, session-based EVM actions. However, the current Foundry deployment workflow intentionally does **not** attempt to extract or use an Agent Wallet private key. Alchemy documents that Agent Wallet sessions do not expose the wallet private key to the agent and do not support direct raw EVM transaction signing. Therefore an Agent Wallet dashboard session cannot simply be substituted for `GLORIFIER_DEPLOYER_PRIVATE_KEY` in this Foundry workflow.

For GLORIFIER, keep the separation:

```text
Alchemy Agent Wallet = authorized/session-based agent actions
Alchemy Sepolia RPC = blockchain JSON-RPC transport
Foundry deployer key = explicit deployment signer
```

If an Agent Wallet deployment path is added later, it must use Alchemy's supported smart-wallet call model and produce the same independent on-chain evidence. It must not weaken the Human Authority, authorization, or evidence requirements.

## Manual deployment

For an explicitly authorized local deployment:

```bash
export PRIVATE_KEY=...
export GLORIFIER_INITIAL_HOLDER=0x...
export RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<API_KEY>

forge script script/DeployGLORIFIER.s.sol:DeployGLORIFIER \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --slow
```

For production, use a dedicated deployment wallet and move treasury/control assets to a multisig. The contract itself has no admin controls.

## Evidence required

A deployment is considered **VERIFIED** only when all of the following are confirmed on Ethereum Sepolia:

- chain ID = `11155111`
- successful deployment transaction receipt
- contract address
- transaction hash
- deployed bytecode is non-empty
- name = `GLORIFIER`
- symbol = `GLR`
- decimals = `18`
- total supply = `1,000,000,000 GLR`
- initial-holder balance equals total supply

Explorer source verification is a separate optional evidence layer. Repository code or a workflow configuration alone does not constitute an on-chain deployment.

## Verification

Optional Etherscan source verification is performed only when `GLORIFIER_ETHERSCAN_API_KEY` is configured in the `testnet` environment. Source verification is separate from on-chain deployment verification: the contract can be on-chain verified without explorer source verification.

Never commit API keys or private keys.
