#!/usr/bin/env bash
set -euo pipefail

readonly TOKEN_2022_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
readonly MINT="${1:-}"

if [[ "${GLORIFIER_AUTHORIZED_WORKFLOW:-}" != "true" || -z "${GITHUB_ACTIONS:-}" ]]; then
  echo "::error::Recovered-mint resume is disabled outside the authorized GitHub Actions deployment workflow."
  exit 1
fi

[[ "${MINT}" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || {
  echo "::error::Invalid recovered Solana mint address."
  exit 1
}

solana config set --url "${SOLANA_RPC_URL}" --keypair "${HOME}/.config/solana/glorifier-devnet-keypair.json" >/dev/null

DISPLAY="$(spl-token --program-2022 display "${MINT}")"
printf '%s\n' "${DISPLAY}"

printf '%s\n' "${DISPLAY}" | grep -Fq "Program: ${TOKEN_2022_PROGRAM}"
CURRENT_AUTH="$(printf '%s\n' "${DISPLAY}" | awk '
  /Metadata Pointer:/ { in_pointer=1; next }
  in_pointer && /^[[:space:]]*Authority:/ { print $2; exit }
  in_pointer && /^$/ { exit }
')"
SIGNER="$(solana address)"

if [[ "${CURRENT_AUTH}" == "Disabled" || "${CURRENT_AUTH}" == "None" ]]; then
  echo "Metadata Pointer authority is already disabled; resume is idempotently complete."
  TX=""
  STATUS="ALREADY_COMPLETE"
else
  test -n "${CURRENT_AUTH}" || {
    echo "::error::Could not determine the current Metadata Pointer authority."
    exit 1
  }
  test "${CURRENT_AUTH}" = "${SIGNER}" || {
    echo "::error::Recovered mint Metadata Pointer authority does not match the authorized deployment signer."
    echo "::error::No authority change was attempted."
    exit 1
  }

  OUTPUT="$(spl-token --program-2022 authorize "${MINT}" metadata-pointer --disable)"
  printf '%s\n' "${OUTPUT}"
  TX="$(printf '%s\n' "${OUTPUT}" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test "${TX}" != "" || {
    echo "::error::Could not recover the Metadata Pointer authority-revocation transaction signature."
    exit 1
  }
  STATUS="RESUMED"
fi

FINAL="$(spl-token --program-2022 display "${MINT}")"
printf '%s\n' "${FINAL}"
printf '%s\n' "${FINAL}" | awk '
  /Metadata Pointer:/ { in_pointer=1; next }
  in_pointer && /^[[:space:]]*Authority:[[:space:]]*(Disabled|None)[[:space:]]*$/ { found=1; exit }
  in_pointer && /^$/ { exit }
'
printf '%s\n' "${FINAL}" | grep -Eiq 'Mint[[:space:]]+Authority.*None'
printf '%s\n' "${FINAL}" | grep -Eiq 'Freeze[[:space:]]+Authority.*None'

cat > solana/devnet-resume-evidence.json <<EOF
{
  "network": "solana-devnet",
  "status": "${STATUS}",
  "mint": "${MINT}",
  "programId": "${TOKEN_2022_PROGRAM}",
  "operation": "DISABLE_METADATA_POINTER_AUTHORITY",
  "metadataPointerAuthorityRevocationTransaction": $(jq -Rn --arg v "${TX}" 'if $v == "" then null else $v end'),
  "workflowRunId": "${GITHUB_RUN_ID}",
  "workflowRunUrl": "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}",
  "verifiedFinalState": true
}
EOF

jq -e --arg mint "${MINT}" '
  .network == "solana-devnet"
  and .mint == $mint
  and .programId == "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
  and .operation == "DISABLE_METADATA_POINTER_AUTHORITY"
  and .verifiedFinalState == true
' solana/devnet-resume-evidence.json >/dev/null
