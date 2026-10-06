#!/usr/bin/env bash
set -euo pipefail

# GLORIFIER GLR — Solana Token-2022 Devnet reconciliation.
# Read-only with respect to the asset: this script never creates, mints, transfers,
# initializes metadata, or changes authorities.
# It verifies both current on-chain state and the transaction signatures supplied
# by the deployment evidence artifact.

readonly SOLANA_RPC_URL="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
readonly EXPECTED_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
readonly EXPECTED_NAME="GLORIFIER"
readonly EXPECTED_SYMBOL="GLR"
readonly EXPECTED_DECIMALS=9
readonly EXPECTED_SUPPLY=1000000000
readonly EXPECTED_METADATA_URI="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json"
readonly EXCLUDED_EXISTING_MINT="FrJhrVGjNRiB1eZpg5PTqLp9VSQS5rpwMp7jxNtEmV9G"
readonly EVIDENCE_FILE="${GLORIFIER_DEPLOYMENT_EVIDENCE:-solana/deployment-evidence.json}"

MINT="${1:-}"
test -n "$MINT" || {
  echo "::error::A Solana Devnet mint address is required."
  exit 1
}

[[ "$MINT" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || {
  echo "::error::Invalid Solana mint address format."
  exit 1
}

[[ "$MINT" != "$EXCLUDED_EXISTING_MINT" ]] || {
  echo "::error::Refusing to reconcile the excluded pre-existing GLR mint ${MINT}."
  exit 1
}

mkdir -p solana
echo "MINT=$MINT" | tee solana/reconciliation-status.txt

test -f "$EVIDENCE_FILE" || {
  echo "::error::Deployment evidence file is required for provenance verification."
  exit 1
}

jq -e '
  (.status == "DEPLOYED")
  and (.network == "solana-devnet")
  and (.mint | type == "string" and length >= 32 and length <= 44)
  and (.programId == "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
  and (.name == "GLORIFIER")
  and (.symbol == "GLR")
  and (.decimals == 9)
  and (.totalSupply == "1000000000")
  and (.creationTransaction | type == "string" and length >= 80 and length <= 100)
  and (.metadataTransaction | type == "string" and length >= 80 and length <= 100)
  and (.tokenAccountCreationTransaction | type == "string" and length >= 80 and length <= 100)
  and (.mintTransaction | type == "string" and length >= 80 and length <= 100)
  and (.mintAuthorityRevocationTransaction | type == "string" and length >= 80 and length <= 100)
  and (.freezeAuthorityRevocationTransaction | type == "string" and length >= 80 and length <= 100)
' "$EVIDENCE_FILE" >/dev/null || {
  echo "::error::Deployment evidence must be a DEPLOYED receipt containing six real transaction signatures."
  exit 1
}

EVIDENCE_MINT="$(jq -r '.mint' "$EVIDENCE_FILE")"
test "$EVIDENCE_MINT" = "$MINT" || {
  echo "::error::Supplied mint does not match the exact deployment evidence artifact."
  exit 1
}

solana account "$MINT" --url "$SOLANA_RPC_URL" | tee solana/reconciliation-account.txt
grep -Fq "Owner: $EXPECTED_PROGRAM" solana/reconciliation-account.txt

spl-token --program-2022 supply "$MINT" --url "$SOLANA_RPC_URL" | tee solana/reconciliation-supply.txt
spl-token --program-2022 display "$MINT" --url "$SOLANA_RPC_URL" | tee solana/reconciliation-mint-state.txt

ACTUAL_SUPPLY="$(awk 'NR==1 {print $1}' solana/reconciliation-supply.txt | tr -d '\\r')"
test "$ACTUAL_SUPPLY" = "$EXPECTED_SUPPLY" || {
  echo "::error::On-chain supply mismatch: expected $EXPECTED_SUPPLY, got $ACTUAL_SUPPLY."
  exit 1
}

grep -Eq "^[[:space:]]*Name:[[:space:]]*${EXPECTED_NAME}[[:space:]]*$" solana/reconciliation-mint-state.txt
grep -Eq "^[[:space:]]*Symbol:[[:space:]]*${EXPECTED_SYMBOL}[[:space:]]*$" solana/reconciliation-mint-state.txt
grep -Eiq "Decimals[[:space:]]*:[[:space:]]*9" solana/reconciliation-mint-state.txt
grep -Eiq "Mint[[:space:]]+Authority.*None" solana/reconciliation-mint-state.txt
grep -Eiq "Freeze[[:space:]]+Authority.*None" solana/reconciliation-mint-state.txt
grep -Fq "$EXPECTED_METADATA_URI" solana/reconciliation-mint-state.txt

# Independently prove that every deployment receipt signature exists on Solana Devnet
# and completed successfully. This is read-only JSON-RPC; it does not mutate chain state.
mapfile -t TRANSACTION_SIGNATURES < <(jq -r '
  [
    .creationTransaction,
    .metadataTransaction,
    .tokenAccountCreationTransaction,
    .mintTransaction,
    .mintAuthorityRevocationTransaction,
    .freezeAuthorityRevocationTransaction
  ] | .[]
' "$EVIDENCE_FILE")

test "${#TRANSACTION_SIGNATURES[@]}" -eq 6

SIGNATURES_JSON="$(printf '%s\n' "${TRANSACTION_SIGNATURES[@]}" | jq -Rsc 'split("\\n") | map(select(length > 0))')"

jq -n --argjson sigs "${SIGNATURES_JSON}" '
  {
    jsonrpc: "2.0",
    id: 1,
    method: "getSignatureStatuses",
    params: [$sigs, {searchTransactionHistory: true}]
  }
' > /tmp/glorifier-signature-status-request.json

curl --fail --silent --show-error \
  --retry 3 --retry-all-errors --max-time 30 \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/glorifier-signature-status-request.json \
  "$SOLANA_RPC_URL" > solana/reconciliation-signature-status.json

jq -e '
  (.error | not)
  and (.result.value | type == "array")
  and (.result.value | length == 6)
  and all(.[]; . != null and .err == null and (.confirmationStatus == "processed" or .confirmationStatus == "confirmed" or .confirmationStatus == "finalized"))
' solana/reconciliation-signature-status.json >/dev/null || {
  echo "::error::One or more deployment transaction signatures are absent, unconfirmed, or failed on Solana Devnet."
  exit 1
}

jq -n \
  --arg mint "$MINT" \
  --argjson status "$(cat solana/reconciliation-signature-status.json)" \
  --argjson signatures "$(jq '[.creationTransaction,.metadataTransaction,.tokenAccountCreationTransaction,.mintTransaction,.mintAuthorityRevocationTransaction,.freezeAuthorityRevocationTransaction]' "$EVIDENCE_FILE")" \
  '{
    mint: $mint,
    signatures: [
      {kind:"creation", signature:$signatures[0]},
      {kind:"metadata", signature:$signatures[1]},
      {kind:"token_account_creation", signature:$signatures[2]},
      {kind:"mint", signature:$signatures[3]},
      {kind:"mint_authority_revocation", signature:$signatures[4]},
      {kind:"freeze_authority_revocation", signature:$signatures[5]}
    ],
    rpc_statuses: $status.result.value
  }' > solana/reconciliation-signature-evidence.json

cat > solana/reconciliation-evidence.json <<EOF
{
  "network": "solana-devnet",
  "status": "VERIFIED_ON_CHAIN",
  "mode": "RECONCILIATION_READ_ONLY",
  "verification_boundary": "Current on-chain mint state and all six deployment transaction signatures were independently reconciled on Solana Devnet. Repository canonical status may only advance after this evidence passes.",
  "mint": "${MINT}",
  "programId": "${EXPECTED_PROGRAM}",
  "name": "${EXPECTED_NAME}",
  "symbol": "${EXPECTED_SYMBOL}",
  "decimals": ${EXPECTED_DECIMALS},
  "totalSupply": "${EXPECTED_SUPPLY}",
  "mintAuthority": null,
  "freezeAuthority": null,
  "metadataUri": "${EXPECTED_METADATA_URI}",
  "transactionSignaturesVerified": true,
  "transactionSignatureCount": 6
}
EOF

jq -e '
  .status == "VERIFIED_ON_CHAIN"
  and .mode == "RECONCILIATION_READ_ONLY"
  and .network == "solana-devnet"
  and (.mint | type == "string")
  and .programId == "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
  and .name == "GLORIFIER"
  and .symbol == "GLR"
  and .decimals == 9
  and .totalSupply == "1000000000"
  and .mintAuthority == null
  and .freezeAuthority == null
  and .metadataUri == "https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json"
  and .transactionSignaturesVerified == true
  and .transactionSignatureCount == 6
  and .verification_boundary
' solana/reconciliation-evidence.json >/dev/null

echo "GLR_STATUS=VERIFIED_ON_CHAIN" | tee -a solana/reconciliation-status.txt
