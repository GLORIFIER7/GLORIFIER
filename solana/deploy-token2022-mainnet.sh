#!/usr/bin/env bash
set -euo pipefail
if [[ "${GLORIFIER_AUTHORIZED_MAINNET_WORKFLOW:-}" != "true" || -z "${GITHUB_ACTIONS:-}" ]]; then
  echo "::error::Direct Token-2022 Mainnet mint creation is disabled."; exit 1
fi
readonly DECIMALS=9
readonly SUPPLY=1000000000
readonly METADATA_URI="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/d0d5c16fc4a74099c125c8aac594352d53675177/solana/token.json"
readonly TOKEN_2022_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
write_evidence() {
  local status="$1"
  jq -n --arg network "solana-mainnet" --arg status "$status" --arg mint "$MINT" --arg program "$TOKEN_2022_PROGRAM" \
    --arg name "GLORIFIER" --arg symbol "GLR" --arg uri "$METADATA_URI" \
    --arg creation "${CREATE_TOKEN_TX:-}" --arg metadata "${METADATA_TX:-}" --arg account "${CREATE_ACCOUNT_TX:-}" \
    --arg mintTx "${MINT_TX:-}" --arg mintAuth "${MINT_AUTH_TX:-}" --arg freezeAuth "${FREEZE_AUTH_TX:-}" --arg metadataAuth "${METADATA_AUTH_TX:-}" --arg metadataPointerAuth "${METADATA_POINTER_AUTH_TX:-}" \
    --argjson metadataUpdateAuthorityInitiallyNone "${METADATA_UPDATE_AUTHORITY_INITIALLY_NONE:-false}" \
    --argjson metadataPointerAuthorityInitiallyNone "${METADATA_POINTER_AUTHORITY_INITIALLY_NONE:-false}" \
    --arg runId "${GITHUB_RUN_ID:-}" --arg runUrl "${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-GLORIFIER7/GLORIFIER}/actions/runs/${GITHUB_RUN_ID:-}" \
    --argjson freezeInitiallyNone "${FREEZE_AUTHORITY_INITIALLY_NONE:-false}" \
    '{network:$network,status:$status,mint:$mint,programId:$program,name:$name,symbol:$symbol,decimals:9,totalSupply:"1000000000",mintAuthority:null,freezeAuthority:null,freezeAuthorityInitiallyNone:$freezeInitiallyNone,metadataUri:$uri,creationTransaction:$creation,metadataTransaction:$metadata,tokenAccountCreationTransaction:$account,mintTransaction:$mintTx,mintAuthorityRevocationTransaction:$mintAuth,freezeAuthorityRevocationTransaction:$freezeAuth,metadataUpdateAuthorityRevocationTransaction:$metadataAuth,metadataPointerAuthorityRevocationTransaction:$metadataPointerAuth,metadataUpdateAuthorityInitiallyNone:$metadataUpdateAuthorityInitiallyNone,metadataPointerAuthorityInitiallyNone:$metadataPointerAuthorityInitiallyNone,deploymentWorkflowRunId:$runId,deploymentWorkflowRunUrl:$runUrl}' > solana/deployment-mainnet-evidence.json
}
RECOVERY_FILE="solana/mainnet-recovery.json"
MINT=""
CREATE_TOKEN_TX=""
METADATA_TX=""
CREATE_ACCOUNT_TX=""
MINT_TX=""
MINT_AUTH_TX=""
FREEZE_AUTH_TX=""
FREEZE_AUTHORITY_INITIALLY_NONE=false
METADATA_AUTH_TX=""
METADATA_POINTER_AUTH_TX=""
METADATA_UPDATE_AUTHORITY_INITIALLY_NONE=false
METADATA_POINTER_AUTHORITY_INITIALLY_NONE=false

if [[ -f "$RECOVERY_FILE" ]] && jq -e '.status=="RECOVERY_REQUIRED" and .network=="solana-mainnet"' "$RECOVERY_FILE" >/dev/null; then
  MINT="$(jq -r '.mint' "$RECOVERY_FILE")"
  [[ "$MINT" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || { echo "::error::Invalid recovery mint address."; exit 1; }
  CREATE_TOKEN_TX="$(jq -r '.creationTransaction // empty' "$RECOVERY_FILE")"
  METADATA_TX="$(jq -r '.metadataTransaction // empty' "$RECOVERY_FILE")"
  CREATE_ACCOUNT_TX="$(jq -r '.tokenAccountCreationTransaction // empty' "$RECOVERY_FILE")"
  MINT_TX="$(jq -r '.mintTransaction // empty' "$RECOVERY_FILE")"
  MINT_AUTH_TX="$(jq -r '.mintAuthorityRevocationTransaction // empty' "$RECOVERY_FILE")"
  FREEZE_AUTH_TX="$(jq -r '.freezeAuthorityRevocationTransaction // empty' "$RECOVERY_FILE")"
  FREEZE_AUTHORITY_INITIALLY_NONE="$(jq -r '.freezeAuthorityInitiallyNone // false' "$RECOVERY_FILE")"
  echo "Recovering existing authorized Mainnet mint: $MINT"
  STATE="$(spl-token --program-2022 display "$MINT")"
  printf '%s\n' "$STATE"
else
  MINT_OUTPUT="$(spl-token --program-2022 create-token --decimals "$DECIMALS" --enable-metadata)"
  printf '%s\n' "$MINT_OUTPUT"
  CREATE_TOKEN_TX="$(printf '%s\n' "$MINT_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  MINT="$(printf '%s\n' "$MINT_OUTPUT" | awk '/^[[:space:]]*Address:[[:space:]]+/ {print $2; exit}')"
  [[ "$MINT" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || { echo "::error::Invalid mainnet mint address."; exit 1; }
fi

STATE="$(spl-token --program-2022 display "$MINT")"
printf '%s\n' "$STATE"

if printf '%s\n' "$STATE" | grep -Fq "$METADATA_URI"; then
  echo "Metadata already initialized with the canonical immutable URI."
else
  METADATA_OUTPUT="$(spl-token --program-2022 initialize-metadata "$MINT" "GLORIFIER" "GLR" "$METADATA_URI")"
  printf '%s\n' "$METADATA_OUTPUT"
  METADATA_TX="$(printf '%s\n' "$METADATA_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
fi

CURRENT_SUPPLY="$(spl-token --program-2022 supply "$MINT" | awk 'NR==1 {print $1}' | tr -d '\r')"
if [[ "$CURRENT_SUPPLY" == "$SUPPLY" ]]; then
  echo "Supply already equals canonical 1,000,000,000 GLR; skipping mint."
elif [[ "$CURRENT_SUPPLY" == "0" ]]; then
  ACCOUNT_OUTPUT="$(spl-token --program-2022 create-account "$MINT")"
  printf '%s\n' "$ACCOUNT_OUTPUT"
  CREATE_ACCOUNT_TX="$(printf '%s\n' "$ACCOUNT_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  MINT_OUTPUT_2="$(spl-token --program-2022 mint "$MINT" "$SUPPLY")"
  printf '%s\n' "$MINT_OUTPUT_2"
  MINT_TX="$(printf '%s\n' "$MINT_OUTPUT_2" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
else
  echo "::error::Unexpected existing Mainnet supply: $CURRENT_SUPPLY"; exit 1
fi

STATE="$(spl-token --program-2022 display "$MINT")"
if printf '%s\n' "$STATE" | grep -Eiq 'Mint[[:space:]]+Authority.*(None|Disabled|\(not set\))'; then
  echo "Mint authority is already disabled."
else
  MINT_AUTH_OUTPUT="$(spl-token --program-2022 authorize "$MINT" mint --disable)"
  printf '%s\n' "$MINT_AUTH_OUTPUT"
  MINT_AUTH_TX="$(printf '%s\n' "$MINT_AUTH_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
fi

STATE="$(spl-token --program-2022 display "$MINT")"
if printf '%s\n' "$STATE" | grep -Eiq 'Freeze[[:space:]]+Authority.*(None|Disabled|\(not set\))'; then
  echo "Freeze authority is already absent; no revocation transaction exists."
  FREEZE_AUTH_TX=""
else
  FREEZE_AUTH_OUTPUT="$(spl-token --program-2022 authorize "$MINT" freeze --disable)"
  printf '%s\n' "$FREEZE_AUTH_OUTPUT"
  FREEZE_AUTH_TX="$(printf '%s\n' "$FREEZE_AUTH_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
fi

STATE="$(spl-token --program-2022 display "$MINT")"
if printf '%s\n' "$STATE" | grep -Eiq 'Update Authority:[[:space:]]*(None|Disabled|\(not set\))'; then
  echo "Metadata update authority is already absent."
  METADATA_UPDATE_AUTHORITY_INITIALLY_NONE=true
else
  echo "Revoking Token Metadata update authority with the Token Metadata interface instruction (the spl-token CLI metadata alias can incorrectly dispatch Token-2022 SetAuthority after mint supply is fixed)."
  npm install --prefix /tmp/glorifier-token2022-js --no-audit --no-fund --ignore-scripts @solana/web3.js@1.99.0 @solana/spl-token@0.4.15 @solana/spl-token-metadata@0.1.6
  METADATA_AUTH_TX="$(node solana/revoke-token2022-metadata-authority.mjs "$MINT")"
  test -n "$METADATA_AUTH_TX"
fi

STATE="$(spl-token --program-2022 display "$MINT")"
POINTER_AUTH="$(printf '%s\n' "$STATE" | awk '/Metadata Pointer:/ { in_pointer=1; next } in_pointer && /^[[:space:]]*Authority:/ { print $2; exit } in_pointer && /^$/ { exit }')"
if [[ -z "$POINTER_AUTH" || "$POINTER_AUTH" == "None" || "$POINTER_AUTH" == "Disabled" ]]; then
  echo "Metadata pointer authority is already absent."
  METADATA_POINTER_AUTHORITY_INITIALLY_NONE=true
else
  echo "Revoking Metadata Pointer authority with a direct Token-2022 instruction (the spl-token CLI can incorrectly resolve extension authority after mint authority is fixed)."
  npm install --prefix /tmp/glorifier-token2022-js --no-audit --no-fund --ignore-scripts @solana/web3.js@1.99.0 @solana/spl-token@0.4.15
  METADATA_POINTER_AUTH_TX="$(node solana/revoke-token2022-metadata-pointer.mjs "$MINT")"
  test -n "$METADATA_POINTER_AUTH_TX"
fi
spl-token --program-2022 balance "$MINT" | tee solana/deployment-mainnet-holder-balance.txt
test "$(awk 'NR==1 {print $1}' solana/deployment-mainnet-holder-balance.txt | tr -d '\r')" = "$SUPPLY"
FINAL_MINT_STATE="$(spl-token --program-2022 display "$MINT")"
printf '%s\n' "$FINAL_MINT_STATE" | tee solana/deployment-mainnet-mint-state.txt
printf '%s\n' "$FINAL_MINT_STATE" | grep -Eiq 'Mint[[:space:]]+Authority.*(None|Disabled|\(not set\))'
printf '%s\n' "$FINAL_MINT_STATE" | grep -Eiq 'Freeze[[:space:]]+Authority.*(None|Disabled|\(not set\))'
FINAL_POINTER_AUTH="$(printf '%s\n' "$FINAL_MINT_STATE" | awk '/Metadata Pointer:/ { in_pointer=1; next } in_pointer && /^[[:space:]]*Authority:/ { print $2; exit } in_pointer && /^$/ { exit }')"
test "$FINAL_POINTER_AUTH" = "Disabled" || test "$FINAL_POINTER_AUTH" = "None" || test "$FINAL_POINTER_AUTH" = "(not set)"
printf '%s\n' "$FINAL_MINT_STATE" | grep -Fq "$METADATA_URI"
for v in CREATE_TOKEN_TX METADATA_TX CREATE_ACCOUNT_TX MINT_TX MINT_AUTH_TX; do test -n "${!v}" || { echo "::error::Missing transaction signature: $v"; exit 1; }; done
if [[ "$METADATA_UPDATE_AUTHORITY_INITIALLY_NONE" != "true" ]]; then test -n "$METADATA_AUTH_TX" || { echo "::error::Missing transaction signature: METADATA_AUTH_TX"; exit 1; }; fi
if [[ "$METADATA_POINTER_AUTHORITY_INITIALLY_NONE" != "true" ]]; then test -n "$METADATA_POINTER_AUTH_TX" || { echo "::error::Missing transaction signature: METADATA_POINTER_AUTH_TX"; exit 1; }; fi
if [[ "$FREEZE_AUTHORITY_INITIALLY_NONE" != "true" ]]; then test -n "$FREEZE_AUTH_TX" || { echo "::error::Missing transaction signature: FREEZE_AUTH_TX"; exit 1; }; fi
write_evidence "READY_FOR_VERIFICATION"
