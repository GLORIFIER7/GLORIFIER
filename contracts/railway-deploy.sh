#!/bin/sh
set -eu

if [ "${GLORIFIER_TESTNET_DEPLOY_APPROVED:-false}" != "true" ]; then
  echo '{"status":"LOCKED","reason":"GLORIFIER_TESTNET_DEPLOY_APPROVED is not true"}'
  exit 0
fi

: "${GLORIFIER_DEPLOYER_PRIVATE_KEY:?missing GLORIFIER_DEPLOYER_PRIVATE_KEY}"
: "${GLORIFIER_ETHERSCAN_API_KEY:?missing GLORIFIER_ETHERSCAN_API_KEY}"
RPC_URL="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
PRIVATE_KEY="$(printf '%s' "$GLORIFIER_DEPLOYER_PRIVATE_KEY" | tr -d '[:space:]')"
PRIVATE_KEY="${PRIVATE_KEY#0x}"
printf '%s' "$PRIVATE_KEY" | grep -Eq '^[0-9a-fA-F]{64}$'

DEPLOYER="$(cast wallet address --private-key "$PRIVATE_KEY")"
CHAIN="$(cast chain-id --rpc-url "$RPC_URL")"
test "$CHAIN" = "11155111"
BALANCE="$(cast balance "$DEPLOYER" --rpc-url "$RPC_URL")"
echo "Sepolia chain_id=$CHAIN deployer=$DEPLOYER balance_wei=$BALANCE"
test "$BALANCE" != "0"

HOLDER="${GLORIFIER_INITIAL_HOLDER:-$DEPLOYER}"
export PRIVATE_KEY="$PRIVATE_KEY"
export GLORIFIER_INITIAL_HOLDER="$HOLDER"
forge test -vv
rm -rf broadcast
forge script script/DeployGLORIFIER.s.sol:DeployGLORIFIER --rpc-url "$RPC_URL" --broadcast --slow

RUN_FILE="broadcast/DeployGLORIFIER.s.sol/11155111/run-latest.json"
test -s "$RUN_FILE"
CONTRACT="$(jq -r '.transactions[] | select(.contractAddress != null and .contractAddress != "") | .contractAddress' "$RUN_FILE" | head -n1)"
TX="$(jq -r '.transactions[] | select(.hash != null and .hash != "") | .hash' "$RUN_FILE" | head -n1)"
test -n "$CONTRACT" && test "$CONTRACT" != "null"
test -n "$TX" && test "$TX" != "null"

CODE="$(cast code "$CONTRACT" --rpc-url "$RPC_URL")"
test "$CODE" != "0x"
NAME="$(cast call "$CONTRACT" 'name()(string)' --rpc-url "$RPC_URL")"
SYMBOL="$(cast call "$CONTRACT" 'symbol()(string)' --rpc-url "$RPC_URL")"
DECIMALS="$(cast call "$CONTRACT" 'decimals()(uint8)' --rpc-url "$RPC_URL")"
SUPPLY="$(cast call "$CONTRACT" 'totalSupply()(uint256)' --rpc-url "$RPC_URL")"
HOLDER_BAL="$(cast call "$CONTRACT" 'balanceOf(address)(uint256)' "$HOLDER" --rpc-url "$RPC_URL")"
test "$NAME" = "GLORIFIER"
test "$SYMBOL" = "GLR"
test "$DECIMALS" = "18"
test "$SUPPLY" = "1000000000000000000000000000"
test "$HOLDER_BAL" = "$SUPPLY"

RECEIPT="$(cast receipt "$TX" --rpc-url "$RPC_URL" --json)"
STATUS="$(echo "$RECEIPT" | jq -r '.status')"
BLOCK="$(echo "$RECEIPT" | jq -r '.blockNumber')"
test "$STATUS" = "1"

CONSTRUCTOR_ARGS="$(cast abi-encode 'constructor(address)' "$HOLDER")"
forge verify-contract "$CONTRACT" src/GLORIFIER.sol:GLORIFIER --chain sepolia --constructor-args "$CONSTRUCTOR_ARGS" --etherscan-api-key "$GLORIFIER_ETHERSCAN_API_KEY" --watch

jq -n --arg network "Ethereum Sepolia" --arg contract "$CONTRACT" --arg tx "$TX" --arg holder "$HOLDER" --arg deployer "$DEPLOYER" --arg block "$BLOCK" '{evidence_type:"GLORIFIER ERC-20 deployment",network:$network,chain_id:11155111,contract_address:$contract,transaction_hash:$tx,block_number:($block|tonumber),transaction_status:1,deployer_address:$deployer,initial_holder:$holder,on_chain_assertions:{name:"GLORIFIER",symbol:"GLR",decimals:18,total_supply_wei:"1000000000000000000000000000"},etherscan_source_verified:true}'

echo "GLORIFIER_SEPOLIA_DEPLOYMENT_COMPLETE contract=$CONTRACT tx=$TX block=$BLOCK"
