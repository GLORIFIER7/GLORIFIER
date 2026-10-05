#!/usr/bin/env bash
set -euo pipefail

# GLORIFIER GLR — Solana Token-2022 Devnet deployment.
# This script creates a new mint ONLY when invoked by the authorized
# deployment workflow. The workflow has a pre-deployment replay/evidence
# gate; once evidence exists, future deployments must use reconciliation.
#
# No private key is stored in this repository.

readonly DECIMALS=9
readonly SUPPLY=1000000000
readonly METADATA_URI="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json"
readonly TOKEN_2022_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PH"

write_evidence() {
  local status="${1}"
  cat > solana/deployment-evidence.json <<EOF
{
  "network": "solana-devnet",
  "status": "${status}",
  "mint": "${MINT}",
  "programId": "${TOKEN_2022_PROGRAM}",
  "name": "GLORIFIER",
  "symbol": "GLR",
  "decimals": ${DECIMALS},
  "totalSupply": "${SUPPLY}",
  "mintAuthority": null,
  "freezeAuthority": null
}
EOF
}

MINT_OUTPUT="$(spl-token --program-2022 create-token --decimals "$DECIMALS" --enable-metadata)"
printf '%s\n' "$MINT_OUTPUT"
MINT="$(printf '%s\n' "$MINT_OUTPUT" | grep -Eo '[1-9A-HJ-NP-Za-km-z]{32,44}' | tail -n1)"
[[ "$MINT" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || {
  echo "::error::spl-token returned an invalid Solana mint address."
  exit 1
}

echo "MINT=$MINT"

# Persist a non-verified receipt immediately after the mint transaction returns.
# This gives the workflow an artifact-based replay lock even if a later step fails.
write_evidence "DEPLOYED"

spl-token --program-2022 initialize-metadata "$MINT" "GLORIFIER" "GLR" "$METADATA_URI"
spl-token --program-2022 create-account "$MINT"
spl-token --program-2022 mint "$MINT" "$SUPPLY"

ACTUAL_SUPPLY="$(spl-token --program-2022 supply "$MINT" | awk 'NR==1 {print $1}' | tr -d '\r')"
test "$ACTUAL_SUPPLY" = "$SUPPLY"

# Permanently remove authorities after the exact supply is minted.
spl-token --program-2022 authorize "$MINT" mint --disable
spl-token --program-2022 authorize "$MINT" freeze --disable

BALANCE_OUTPUT="$(spl-token --program-2022 balance "$MINT")"
printf '%s\n' "$BALANCE_OUTPUT"
HOLDER_BALANCE="$(printf '%s\n' "$BALANCE_OUTPUT" | awk 'NR==1 {print $1}' | tr -d '\r')"
test "$HOLDER_BALANCE" = "$SUPPLY"

echo "Final mint state:"
FINAL_MINT_STATE="$(spl-token --program-2022 display "$MINT")"
printf '%s\n' "$FINAL_MINT_STATE"
printf '%s\n' "$FINAL_MINT_STATE" | grep -Eiq 'Mint[[:space:]]+Authority.*None'
printf '%s\n' "$FINAL_MINT_STATE" | grep -Eiq 'Freeze[[:space:]]+Authority.*None'

# Keep the receipt truthful: final workflow verification is performed separately.
write_evidence "READY_FOR_VERIFICATION"
