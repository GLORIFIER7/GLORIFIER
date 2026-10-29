#!/usr/bin/env bash
set -euo pipefail

# Regression: final-state-only reconciliation must never publish canonical identity.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/reconciliation-evidence.json" <<'JSON'
{
  "status":"VERIFIED_ON_CHAIN","mode":"RECONCILIATION_READ_ONLY","network":"solana-devnet",
  "programId":"TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb","name":"GLORIFIER","symbol":"GLR",
  "decimals":9,"totalSupply":"1000000000","mint":"8W7eSf3hPyRMFJGKbCvwb9QMq6uok6rxSnRZqofeqnyd",
  "mintAuthority":null,"freezeAuthority":null,"metadataUri":"https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json",
  "metadataUriInDisplay":true,"commitment":"finalized","finalized":true,"deploymentProvenanceVerified":true,
  "transactionSemanticsVerified":false,"metadataPointerAuthority":null,"metadataUpdateAuthority":null,
  "metadataPointerAddress":"8W7eSf3hPyRMFJGKbCvwb9QMq6uok6rxSnRZqofeqnyd","metadataMint":"8W7eSf3hPyRMFJGKbCvwb9QMq6uok6rxSnRZqofeqnyd",
  "offChainMetadataSha256":"c023ca9f3a5c1b224205551c5158132210d3c47201f17976fb88674c52dd5f25"
}
JSON
if (cd "$TMP" && GITHUB_ACTIONS=true GH_TOKEN=not-a-real-token bash "$ROOT/solana/publish-verified-devnet-identity.sh") >/dev/null 2>&1; then
  echo "publisher incorrectly accepted incomplete transaction semantics" >&2
  exit 1
fi
echo "Publisher correctly rejects unverified transaction semantics."
