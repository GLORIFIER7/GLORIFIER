#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/solana"
EVIDENCE="$TMP/solana/reconciliation-evidence.json"
SIG="$(printf '1%.0s' {1..64})"
cat > "$EVIDENCE" <<JSON
{
  "network":"solana-devnet","status":"VERIFIED_ON_CHAIN","mode":"RECONCILIATION_READ_ONLY",
  "commitment":"finalized","finalized":true,"transactionSemanticsVerified":true,"historyComplete":true,
  "transactionHistorySource":"FINALIZED_RPC_TRANSACTION_HISTORY","transactionHistorySignatureCount":7,
  "totalSupply":"1000000000","decimals":9,"totalMintedBaseUnits":"1000000000000000000",
  "mintAuthority":null,"freezeAuthority":null,"metadataPointerAuthority":null,"metadataUpdateAuthority":null,
  "creationTransaction":"$SIG","metadataTransaction":"$SIG","tokenAccountCreationTransaction":"$SIG",
  "mintTransaction":"$SIG","mintAuthorityRevocationTransaction":"$SIG",
  "freezeAuthorityRevocationTransaction":"NOT_APPLICABLE_NEVER_SET",
  "metadataUpdateAuthorityRevocationTransaction":"$SIG","metadataPointerAuthorityRevocationTransaction":"$SIG"
}
JSON
bash "$ROOT/solana/validate-finalized-transaction-evidence.sh" "$EVIDENCE"
jq '.transactionSemanticsVerified=false' "$EVIDENCE" > "$EVIDENCE.tmp" && mv "$EVIDENCE.tmp" "$EVIDENCE"
if bash "$ROOT/solana/validate-finalized-transaction-evidence.sh" "$EVIDENCE" >/dev/null 2>&1; then echo "accepted final-state-only evidence" >&2; exit 1; fi
jq '.transactionSemanticsVerified=true | .transactionHistorySource="DEPLOYMENT_ARTIFACT_ONLY"' "$EVIDENCE" > "$EVIDENCE.tmp" && mv "$EVIDENCE.tmp" "$EVIDENCE"
if bash "$ROOT/solana/validate-finalized-transaction-evidence.sh" "$EVIDENCE" >/dev/null 2>&1; then echo "accepted unproven freeze-authority exception" >&2; exit 1; fi
jq 'del(.metadataPointerAuthorityRevocationTransaction) | .transactionHistorySource="FINALIZED_RPC_TRANSACTION_HISTORY"' "$EVIDENCE" > "$EVIDENCE.tmp" && mv "$EVIDENCE.tmp" "$EVIDENCE"
if bash "$ROOT/solana/validate-finalized-transaction-evidence.sh" "$EVIDENCE" >/dev/null 2>&1; then echo "accepted missing lifecycle receipt" >&2; exit 1; fi
echo "Finalized receipt validator tests passed."
