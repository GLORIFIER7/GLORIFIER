#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-GLORIFIER7/GLORIFIER}"

echo "GLORIFIER testnet GitHub secret setup"
echo "Repository: $REPO"
echo
echo "This script NEVER prints or commits private keys."
echo "Use dedicated testnet-only EVM keys. Do not use a mainnet wallet."
echo

command -v gh >/dev/null 2>&1 || { echo "ERROR: GitHub CLI (gh) is required."; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "ERROR: run 'gh auth login' first."; exit 1; }

read -r -p "Create/update Ethereum Sepolia key secret? [y/N] " ETH_OK
if [[ "${ETH_OK,,}" == "y" ]]; then
  read -r -s -p "Ethereum Sepolia 64-hex private key: " ETH_KEY
  echo
  ETH_KEY="$(printf '%s' "$ETH_KEY" | tr -d '[:space:]')"
  ETH_KEY="${ETH_KEY#0x}"
  ETH_KEY="${ETH_KEY#0X}"
  [[ "$ETH_KEY" =~ ^[0-9a-fA-F]{64}$ ]] || { echo "ERROR: Ethereum key must be exactly 64 hexadecimal characters."; exit 1; }
  printf '%s' "$ETH_KEY" | gh secret set GLORIFIER_DEPLOYER_PRIVATE_KEY --env testnet --repo "$REPO"
  unset ETH_KEY
  echo "Ethereum secret configured."
fi

read -r -p "Create/update BNB Testnet key secret? [y/N] " BNB_OK
if [[ "${BNB_OK,,}" == "y" ]]; then
  read -r -s -p "BNB Testnet 64-hex private key: " BNB_KEY
  echo
  BNB_KEY="$(printf '%s' "$BNB_KEY" | tr -d '[:space:]')"
  BNB_KEY="${BNB_KEY#0x}"
  BNB_KEY="${BNB_KEY#0X}"
  [[ "$BNB_KEY" =~ ^[0-9a-fA-F]{64}$ ]] || { echo "ERROR: BNB key must be exactly 64 hexadecimal characters."; exit 1; }
  printf '%s' "$BNB_KEY" | gh secret set GLORIFIER_BNB_TESTNET_DEPLOYER_PRIVATE_KEY --env bnb-testnet --repo "$REPO"
  unset BNB_KEY
  echo "BNB Testnet secret configured."
fi

echo
echo "Configured secret names:"
gh secret list --env testnet --repo "$REPO" | grep -E '^GLORIFIER_DEPLOYER_PRIVATE_KEY[[:space:]]' || true
gh secret list --env bnb-testnet --repo "$REPO" | grep -E '^GLORIFIER_BNB_TESTNET_DEPLOYER_PRIVATE_KEY[[:space:]]' || true
echo
echo "Values are not displayed."
