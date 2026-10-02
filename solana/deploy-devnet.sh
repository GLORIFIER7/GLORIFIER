#!/usr/bin/env bash
set -euo pipefail

# Requires the Solana CLI and spl-token CLI.
# This script is intentionally signer-local: no private key is stored in
# GLORIFIER and no GitHub secret is required.
#
# Run from a wallet environment you control.
#
# 1) solana config set --url devnet
# 2) solana address
# 3) solana airdrop 2
# 4) Run this script.
#
# The resulting mint address is printed and must be recorded as deployment
# evidence. The script revokes mint/freeze authority after the full supply
# is minted.

readonly DECIMALS=9
readonly SUPPLY=1000000000

solana config set --url devnet

MINT="$(spl-token create-token --decimals "$DECIMALS" | awk '/Creating token/ {print $3}')"
test -n "$MINT"

echo "MINT=$MINT"

spl-token create-account "$MINT"

spl-token mint "$MINT" "$SUPPLY"

echo "Supply:"
spl-token supply "$MINT"

echo "Holder balance:"
spl-token balance "$MINT"

# Remove both authorities after verification of the exact supply.
spl-token authorize "$MINT" mint --disable
spl-token authorize "$MINT" freeze --disable

echo "Final mint state:"
spl-token display "$MINT"
