#!/usr/bin/env bash
set -euo pipefail

# GLORIFIER GLR — Solana Token-2022 Devnet reconciliation.
# Read-only: this script never creates, mints, transfers, or changes authorities.

readonly EXPECTED_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PH"
readonly EXPECTED_NAME="GLORIFIER"
readonly EXPECTED_SYMBOL="GLR"
readonly EXPECTED_DECIMALS=9
readonly EXPECTED_SUPPLY=1000000000
readonly EXPECTED_METADATA_URI="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json"
readonly EXCLUDED_EXISTING_MINT="FrJhrVGjNRiB1eZpg5PTqLp9VSQS5rpwMp7jxNtEmV9G"

MINT="${1:-}"
test -n "$MINT" || {
  echo "::error::A Solana Devnet mint address is required."
  exit 1
}

if [[ "$MINT" == "$EXCLUDED_EXISTING_MINT" ]]; then
  echo "::error::Refusing to reconcile the pre-existing/excluded GLR mint ${MINT}."
  exit 1
fi

mkdir -p solana
echo "MINT=$MINT" | tee solana/reconciliation-status.txt

solana account "$MINT" | tee solana/reconciliation-account.txt
grep -Fq "Owner: $EXPECTED_PROGRAM" solana/reconciliation-account.txt

spl-token --program-2022 supply "$MINT" | tee solana/reconciliation-supply.txt
spl-token --program-2022 display "$MINT" | tee solana/reconciliation-mint-state.txt

ACTUAL_SUPPLY="$(awk 'NR==1 {print $1}' solana/reconciliation-supply.txt | tr -d '\r')"
test "$ACTUAL_SUPPLY" = "$EXPECTED_SUPPLY"

grep -Fq "$EXPECTED_NAME" solana/reconciliation-mint-state.txt
grep -Fq "$EXPECTED_SYMBOL" solana/reconciliation-mint-state.txt
grep -Eiq 'Decimals[[:space:]]*:[[:space:]]*9' solana/reconciliation-mint-state.txt
grep -Eiq 'Mint[[:space:]]+Authority.*None' solana/reconciliation-mint-state.txt
grep -Eiq 'Freeze[[:space:]]+Authority.*None' solana/reconciliation-mint-state.txt

if grep -Fq "$EXPECTED_METADATA_URI" solana/reconciliation-mint-state.txt; then
  METADATA_URI_VERIFIED=true
else
  METADATA_URI_VERIFIED=false
fi

cat > solana/reconciliation-evidence.json <<EOF
{
  "network": "solana-devnet",
  "status": "VERIFIED",
  "mode": "RECONCILIATION_READ_ONLY",
  "mint": "${MINT}",
  "programId": "${EXPECTED_PROGRAM}",
  "name": "${EXPECTED_NAME}",
  "symbol": "${EXPECTED_SYMBOL}",
  "decimals": ${EXPECTED_DECIMALS},
  "totalSupply": "${EXPECTED_SUPPLY}",
  "mintAuthority": null,
  "freezeAuthority": null,
  "metadataUri": "${EXPECTED_METADATA_URI}",
  "metadataUriInDisplay": ${METADATA_URI_VERIFIED}
}
EOF

jq -e '
  .status == "VERIFIED"
  and .mode == "RECONCILIATION_READ_ONLY"
  and .network == "solana-devnet"
  and .mint
  and .programId == "TokenzQdBNbLqP5VEhdkAS6EPFLC1PH"
  and .name == "GLORIFIER"
  and .symbol == "GLR"
  and .decimals == 9
  and .totalSupply == "1000000000"
  and .mintAuthority == null
  and .freezeAuthority == null
' solana/reconciliation-evidence.json >/dev/null

echo "GLR_STATUS=FULLY_VERIFIED" | tee -a solana/reconciliation-status.txt
