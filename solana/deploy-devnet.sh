#!/usr/bin/env bash
set -euo pipefail

# DEPRECATED — direct local Solana GLR mint creation is intentionally disabled.
# Do not create another Devnet mint from this script.
#
# Canonical deployment path:
#   .github/workflows/glorifier-solana-devnet.yml
#
# After one successful authorized deployment, use:
#   .github/workflows/glorifier-solana-devnet-reconcile.yml
# for read-only reconciliation.
#
# Never paste a private key or seed phrase into ChatGPT or commit it to GitHub.

echo "::error::Direct local GLR Devnet mint creation is disabled."
echo "::error::Run the authorized GitHub Actions workflow:"
echo "::error::.github/workflows/glorifier-solana-devnet.yml"
exit 1
