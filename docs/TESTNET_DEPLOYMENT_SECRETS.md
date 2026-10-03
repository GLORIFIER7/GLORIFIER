# GLORIFIER testnet deployment secrets

GLORIFIER deployments are intentionally manual and testnet-only.

## Ethereum Sepolia environment: `testnet`

Required:
- `GLORIFIER_DEPLOYER_PRIVATE_KEY` — dedicated Sepolia deployer key, exactly 64 hexadecimal characters (with or without a leading `0x`; the workflow normalizes it).
- `GLORIFIER_TESTNET_RPC_URL` — optional Sepolia JSON-RPC URL. If absent/unhealthy, the workflow uses its public Sepolia fallback.
- `GLORIFIER_ETHERSCAN_API_KEY` — optional; needed only for Etherscan source verification.

Optional provider credentials:
- `GLORIFIER_CHAINSTACK_SEPOLIA_RPC_URL`
- `GLORIFIER_ALCHEMY_SEPOLIA_RPC_URL`
- `GLORIFIER_ALCHEMY_API_KEY`
- `GLORIFIER_INFURA_PROJECT_ID`

## BNB Smart Chain Testnet environment: `bnb-testnet`

Required:
- `GLORIFIER_BNB_TESTNET_DEPLOYER_PRIVATE_KEY` — dedicated BNB Testnet deployer key, exactly 64 hexadecimal characters (with or without a leading `0x`; the workflow normalizes it).
- `GLORIFIER_BNB_TESTNET_RPC_URL` — optional; the workflow falls back to the BNB Chain public Testnet RPC.
- `GLORIFIER_BSCSCAN_API_KEY` — optional; needed only for BscScan source verification.

## Security

Never commit or paste a private key into source code, issues, pull requests, workflow YAML, logs, or chat. GitHub Actions secrets are encrypted and exposed to workflows only when referenced. Use separate testnet-only deployment keys for Ethereum Sepolia and BNB Testnet.

## Deployment proof

A deployment is considered real only after the workflow obtains all of:
1. a broadcast transaction hash,
2. a successful receipt,
3. a deployed contract address,
4. non-empty contract bytecode,
5. on-chain GLORIFIER/GLR assertions.

Explorer source verification is tracked separately and is not treated as proof that a transaction was broadcast.
