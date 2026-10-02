#!/usr/bin/env bash
set -euo pipefail

# GLORIFIER GLR — Solana Token-2022 Devnet deployment.
# The configured Solana CLI wallet is the signer and fee payer.
# No private key is stored in this repository.

readonly DECIMALS=9
readonly SUPPLY=1000000000
readonly METADATA_URI="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json"

MINT_OUTPUT="$(spl-token --program-2022 create-token --decimals "$DECIMALS" --enable-metadata)"
printf '%s\n' "$MINT_OUTPUT"
MINT="$(printf '%s\n' "$MINT_OUTPUT" | grep -Eo '[1-9A-HJ-NP-Za-km-z]{32,44}' | tail -n1)"
test -n "$MINT"

echo "MINT=$MINT"

spl-token --program-2022 initialize-metadata "$MINT" "GLORIFIER" "GLR" "$METADATA_URI"
spl-token --program-2022 create-account "$MINT"
spl-token --program-2022 mint "$MINT" "$SUPPLY"

test "$(spl-token --program-2022 supply "$MINT" | tr -d '[:space:]')" = "$SUPPLY"

# Permanently remove authorities after the exact supply is minted.
spl-token --program-2022 authorize "$MINT" mint --disable
spl-token --program-2022 authorize "$MINT" freeze --disable

echo "Final mint state:"
spl-token --program-2022 display "$MINT"
