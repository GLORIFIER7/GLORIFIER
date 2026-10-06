#!/usr/bin/env bash
set -euo pipefail
if [[ "\${GLORIFIER_AUTHORIZED_MAINNET_WORKFLOW:-}" != "true" || -z "\${GITHUB_ACTIONS:-}" ]]; then
  echo "::error::Direct Token-2022 Mainnet mint creation is disabled."; exit 1
fi
readonly DECIMALS=9
readonly SUPPLY=1000000000
readonly METADATA_URI="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json"
readonly TOKEN_2022_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
write_evidence() {
  local status="$1"
  jq -n --arg network "solana-mainnet" --arg status "$status" --arg mint "$MINT" --arg program "$TOKEN_2022_PROGRAM" \
    --arg name "GLORIFIER" --arg symbol "GLR" --arg uri "$METADATA_URI" \
    --arg creation "\${CREATE_TOKEN_TX:-}" --arg metadata "\${METADATA_TX:-}" --arg account "\${CREATE_ACCOUNT_TX:-}" \
    --arg mintTx "\${MINT_TX:-}" --arg mintAuth "\${MINT_AUTH_TX:-}" --arg freezeAuth "\${FREEZE_AUTH_TX:-}" \
    --arg runId "\${GITHUB_RUN_ID:-}" --arg runUrl "\${GITHUB_SERVER_URL:-https://github.com}/\${GITHUB_REPOSITORY:-GLORIFIER7/GLORIFIER}/actions/runs/\${GITHUB_RUN_ID:-}" \
    '{network:$network,status:$status,mint:$mint,programId:$program,name:$name,symbol:$symbol,decimals:9,totalSupply:"1000000000",mintAuthority:null,freezeAuthority:null,metadataUri:$uri,creationTransaction:$creation,metadataTransaction:$metadata,tokenAccountCreationTransaction:$account,mintTransaction:$mintTx,mintAuthorityRevocationTransaction:$mintAuth,freezeAuthorityRevocationTransaction:$freezeAuth,deploymentWorkflowRunId:$runId,deploymentWorkflowRunUrl:$runUrl}' > solana/deployment-mainnet-evidence.json
}
MINT_OUTPUT="$(spl-token --program-2022 create-token --decimals "$DECIMALS" --enable-metadata)"
printf '%s\n' "$MINT_OUTPUT"
CREATE_TOKEN_TX="$(printf '%s\n' "$MINT_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
MINT="$(printf '%s\n' "$MINT_OUTPUT" | grep -Eo '[1-9A-HJ-NP-Za-km-z]{32,44}' | tail -n1)"
[[ "$MINT" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || { echo "::error::Invalid mainnet mint address."; exit 1; }
write_evidence "DEPLOYED"
METADATA_OUTPUT="$(spl-token --program-2022 initialize-metadata "$MINT" "GLORIFIER" "GLR" "$METADATA_URI")"
printf '%s\n' "$METADATA_OUTPUT"
METADATA_TX="$(printf '%s\n' "$METADATA_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
ACCOUNT_OUTPUT="$(spl-token --program-2022 create-account "$MINT")"
printf '%s\n' "$ACCOUNT_OUTPUT"
CREATE_ACCOUNT_TX="$(printf '%s\n' "$ACCOUNT_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
MINT_OUTPUT_2="$(spl-token --program-2022 mint "$MINT" "$SUPPLY")"
printf '%s\n' "$MINT_OUTPUT_2"
MINT_TX="$(printf '%s\n' "$MINT_OUTPUT_2" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
test "$(spl-token --program-2022 supply "$MINT" | awk 'NR==1 {print $1}' | tr -d '\r')" = "$SUPPLY"
MINT_AUTH_OUTPUT="$(spl-token --program-2022 authorize "$MINT" mint --disable)"
printf '%s\n' "$MINT_AUTH_OUTPUT"
MINT_AUTH_TX="$(printf '%s\n' "$MINT_AUTH_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
FREEZE_AUTH_OUTPUT="$(spl-token --program-2022 authorize "$MINT" freeze --disable)"
printf '%s\n' "$FREEZE_AUTH_OUTPUT"
FREEZE_AUTH_TX="$(printf '%s\n' "$FREEZE_AUTH_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
spl-token --program-2022 balance "$MINT" | tee solana/deployment-mainnet-holder-balance.txt
test "$(awk 'NR==1 {print $1}' solana/deployment-mainnet-holder-balance.txt | tr -d '\r')" = "$SUPPLY"
FINAL_MINT_STATE="$(spl-token --program-2022 display "$MINT")"
printf '%s\n' "$FINAL_MINT_STATE" | tee solana/deployment-mainnet-mint-state.txt
printf '%s\n' "$FINAL_MINT_STATE" | grep -Eiq 'Mint[[:space:]]+Authority.*None'
printf '%s\n' "$FINAL_MINT_STATE" | grep -Eiq 'Freeze[[:space:]]+Authority.*None'
printf '%s\n' "$FINAL_MINT_STATE" | grep -Fq "$METADATA_URI"
for v in CREATE_TOKEN_TX METADATA_TX CREATE_ACCOUNT_TX MINT_TX MINT_AUTH_TX FREEZE_AUTH_TX; do test -n "\${!v}" || { echo "::error::Missing transaction signature: $v"; exit 1; }; done
write_evidence "READY_FOR_VERIFICATION"
