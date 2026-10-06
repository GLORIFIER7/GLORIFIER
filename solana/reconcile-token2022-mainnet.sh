#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
readonly EXPECTED_NAME="GLORIFIER"
readonly EXPECTED_SYMBOL="GLR"
readonly EXPECTED_DECIMALS=9
readonly EXPECTED_SUPPLY=1000000000
readonly EXPECTED_METADATA_URI="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json"
readonly MINT="${1:-}"

test -n "$MINT" || { echo "::error::A Solana Mainnet mint address is required."; exit 1; }
[[ "$MINT" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || { echo "::error::Invalid Solana mint address format."; exit 1; }

mkdir -p solana
echo "MINT=$MINT" | tee solana/reconciliation-mainnet-status.txt

solana account "$MINT" | tee solana/reconciliation-mainnet-account.txt
grep -Fq "Owner: $EXPECTED_PROGRAM" solana/reconciliation-mainnet-account.txt

spl-token --program-2022 supply "$MINT" | tee solana/reconciliation-mainnet-supply.txt
spl-token --program-2022 display "$MINT" | tee solana/reconciliation-mainnet-mint-state.txt

ACTUAL_SUPPLY="$(awk 'NR==1 {print $1}' solana/reconciliation-mainnet-supply.txt | tr -d '\r')"
test "$ACTUAL_SUPPLY" = "$EXPECTED_SUPPLY"

grep -Eq "^[[:space:]]*Name:[[:space:]]*${EXPECTED_NAME}[[:space:]]*$" solana/reconciliation-mainnet-mint-state.txt
grep -Eq "^[[:space:]]*Symbol:[[:space:]]*${EXPECTED_SYMBOL}[[:space:]]*$" solana/reconciliation-mainnet-mint-state.txt
grep -Eiq 'Decimals[[:space:]]*:[[:space:]]*9' solana/reconciliation-mainnet-mint-state.txt
grep -Eiq 'Mint[[:space:]]+Authority.*None' solana/reconciliation-mainnet-mint-state.txt
grep -Eiq 'Freeze[[:space:]]+Authority.*None' solana/reconciliation-mainnet-mint-state.txt
grep -Fq "$EXPECTED_METADATA_URI" solana/reconciliation-mainnet-mint-state.txt

cat > solana/reconciliation-mainnet-evidence.json <<EOF
{
  "network": "solana-mainnet",
  "status": "VERIFIED_ON_CHAIN",
  "mode": "RECONCILIATION_READ_ONLY",
  "mint": "$MINT",
  "programId": "$EXPECTED_PROGRAM",
  "name": "$EXPECTED_NAME",
  "symbol": "$EXPECTED_SYMBOL",
  "decimals": $EXPECTED_DECIMALS,
  "totalSupply": "$EXPECTED_SUPPLY",
  "mintAuthority": null,
  "freezeAuthority": null,
  "metadataUri": "$EXPECTED_METADATA_URI",
  "metadataUriInDisplay": true
}
EOF

jq -e '.status == "VERIFIED_ON_CHAIN" and .network == "solana-mainnet" and .programId == $p and .mint and .name == "GLORIFIER" and .symbol == "GLR" and .decimals == 9 and .totalSupply == "1000000000" and .mintAuthority == null and .freezeAuthority == null and .metadataUriInDisplay == true' --arg p "$EXPECTED_PROGRAM" solana/reconciliation-mainnet-evidence.json >/dev/null
echo "GLR_MAINNET_STATUS=VERIFIED_ON_CHAIN" | tee -a solana/reconciliation-mainnet-status.txt
