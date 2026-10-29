#!/usr/bin/env bash
set -euo pipefail
EVIDENCE="${1:-solana/reconciliation-evidence.json}"
jq -e '
  .network == "solana-devnet"
  and .status == "VERIFIED_ON_CHAIN"
  and .mode == "RECONCILIATION_READ_ONLY"
  and .commitment == "finalized"
  and .finalized == true
  and .transactionSemanticsVerified == true
  and .historyComplete == true
  and .transactionHistorySource == "FINALIZED_RPC_TRANSACTION_HISTORY"
  and .transactionHistorySignatureCount == 7
  and .totalSupply == "1000000000"
  and .decimals == 9
  and .totalMintedBaseUnits == "1000000000000000000"
  and .mintAuthority == null
  and .freezeAuthority == null
  and .metadataPointerAuthority == null
  and .metadataUpdateAuthority == null
' "$EVIDENCE" >/dev/null
for field in creationTransaction metadataTransaction tokenAccountCreationTransaction mintTransaction mintAuthorityRevocationTransaction metadataUpdateAuthorityRevocationTransaction metadataPointerAuthorityRevocationTransaction; do
  value="$(jq -r --arg field "$field" '.[$field] // empty' "$EVIDENCE")"
  [[ "$value" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]] || { echo "::error::Missing or malformed finalized receipt: $field" >&2; exit 1; }
done
freeze_tx="$(jq -r '.freezeAuthorityRevocationTransaction // empty' "$EVIDENCE")"
if [[ "$freeze_tx" == "NOT_APPLICABLE_NEVER_SET" ]]; then
  jq -e '.transactionHistorySource == "FINALIZED_RPC_TRANSACTION_HISTORY" and .historyComplete == true' "$EVIDENCE" >/dev/null
else
  [[ "$freeze_tx" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]] || { echo "::error::Freeze-authority receipt is missing or malformed." >&2; exit 1; }
fi
echo "Finalized transaction evidence is complete and internally consistent."
