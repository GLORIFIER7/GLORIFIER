#!/usr/bin/env bash
set -euo pipefail

readonly TOKEN_2022_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
readonly DECIMALS=9
readonly SUPPLY=1000000000
readonly METADATA_URI="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json"
readonly MINT="${1:-}"

if [[ "${GLORIFIER_AUTHORIZED_WORKFLOW:-}" != "true" || -z "${GITHUB_ACTIONS:-}" ]]; then
  echo "::error::Recovered-mint resume is disabled outside the authorized GitHub Actions deployment workflow."
  exit 1
fi
[[ "${MINT}" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || { echo "::error::Invalid recovered Solana mint address."; exit 1; }

solana config set --url "${SOLANA_RPC_URL}" --keypair "${HOME}/.config/solana/glorifier-devnet-keypair.json" >/dev/null
SIGNER="$(solana address)"
DISPLAY="$(spl-token --program-2022 display "${MINT}")"
printf '%s\n' "${DISPLAY}" | grep -Fq "Program: ${TOKEN_2022_PROGRAM}"

capture_sig() { awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}'; }

METADATA_TX=""; ACCOUNT_TX=""; MINT_TX=""; MINT_AUTH_TX=""; FREEZE_AUTH_TX=""; METADATA_AUTH_TX=""; POINTER_AUTH_TX=""

# The original deployment stopped immediately after create-token. Complete the
# existing mint in place; never create another mint.
# spl-token display uses title-cased field labels (for example, "Mint Authority:").
# Parse case-insensitively and trim surrounding whitespace so the authority
# comparison is based on the actual on-chain display value rather than a brittle
# capitalization assumption.
MINT_AUTHORITY="$(printf '%s\n' "${DISPLAY}" | awk 'BEGIN{IGNORECASE=1} /^[[:space:]]*Mint[[:space:]]+Authority:/ {sub(/^[^:]*:[[:space:]]*/, ""); gsub(/^[[:space:]]+|[[:space:]]+$/, ""); print; exit}')"
test -n "${MINT_AUTHORITY}" || {
  echo "::error::Recovered mint did not expose a Mint authority in spl-token display output."
  printf '%s\n' "${DISPLAY}"
  exit 1
}
test "${MINT_AUTHORITY}" != "None" || {
  echo "::error::Recovered mint has no mint authority; refusing metadata initialization or supply changes."
  exit 1
}
test "${MINT_AUTHORITY}" = "${SIGNER}" || {
  echo "::error::Recovered mint authority does not match the deployment signer; refusing metadata initialization."
  printf 'Mint authority: %s\n' "${MINT_AUTHORITY}"
  printf 'Deployment signer: %s\n' "${SIGNER}"
  exit 1
}

# create-token --enable-metadata leaves the metadata extension allocated but
# uninitialized. Use the canonical CLI form documented by Solana; the wallet
# configured above is the mint authority and signs the initialization.
if ! printf '%s\n' "${DISPLAY}" | grep -Eiq '^[[:space:]]*Metadata:[[:space:]]+GLORIFIER([[:space:]]|$)'; then
  OUTPUT="$(spl-token --program-2022 initialize-metadata "${MINT}" "GLORIFIER" "GLR" "${METADATA_URI}")"
  printf '%s\n' "${OUTPUT}"
  METADATA_TX="$(printf '%s\n' "${OUTPUT}" | capture_sig)"
  test -n "${METADATA_TX}"
fi

SUPPLY_NOW="$(spl-token --program-2022 supply "${MINT}" | awk 'NR==1 {print $1}' | tr -d '\r')"
if [[ "${SUPPLY_NOW}" == "0" ]]; then
  if ! spl-token --program-2022 accounts "${MINT}" --owner "${SIGNER}" >/dev/null 2>&1; then
    OUTPUT="$(spl-token --program-2022 create-account "${MINT}")"
    printf '%s\n' "${OUTPUT}"
    ACCOUNT_TX="$(printf '%s\n' "${OUTPUT}" | capture_sig)"
    test -n "${ACCOUNT_TX}"
  fi
  OUTPUT="$(spl-token --program-2022 mint "${MINT}" "${SUPPLY}")"
  printf '%s\n' "${OUTPUT}"
  MINT_TX="$(printf '%s\n' "${OUTPUT}" | capture_sig)"
  test -n "${MINT_TX}"
elif [[ "${SUPPLY_NOW}" != "${SUPPLY}" ]]; then
  echo "::error::Recovered mint has unexpected supply ${SUPPLY_NOW}; refusing to alter it."
  exit 1
fi

DISPLAY="$(spl-token --program-2022 display "${MINT}")"
if ! printf '%s\n' "${DISPLAY}" | grep -Eiq 'Mint[[:space:]]+Authority.*None'; then
  OUTPUT="$(spl-token --program-2022 authorize "${MINT}" mint --disable)"; printf '%s\n' "${OUTPUT}"
  MINT_AUTH_TX="$(printf '%s\n' "${OUTPUT}" | capture_sig)"; test -n "${MINT_AUTH_TX}"
fi

DISPLAY="$(spl-token --program-2022 display "${MINT}")"
if ! printf '%s\n' "${DISPLAY}" | grep -Eiq 'Freeze[[:space:]]+Authority.*None'; then
  OUTPUT="$(spl-token --program-2022 authorize "${MINT}" freeze --disable)"; printf '%s\n' "${OUTPUT}"
  FREEZE_AUTH_TX="$(printf '%s\n' "${OUTPUT}" | capture_sig)"; test -n "${FREEZE_AUTH_TX}"
fi

DISPLAY="$(spl-token --program-2022 display "${MINT}")"
if ! printf '%s\n' "${DISPLAY}" | grep -Eiq 'Metadata Update Authority.*None|Update Authority.*None'; then
  OUTPUT="$(spl-token --program-2022 authorize "${MINT}" metadata --disable)"; printf '%s\n' "${OUTPUT}"
  METADATA_AUTH_TX="$(printf '%s\n' "${OUTPUT}" | capture_sig)"; test -n "${METADATA_AUTH_TX}"
fi

DISPLAY="$(spl-token --program-2022 display "${MINT}")"
CURRENT_POINTER_AUTH="$(printf '%s\n' "${DISPLAY}" | awk '/Metadata Pointer:/ {in_pointer=1; next} in_pointer && /^[[:space:]]*Authority:/ {print $2; exit} in_pointer && /^$/ {exit}')"
if [[ "${CURRENT_POINTER_AUTH}" != "Disabled" && "${CURRENT_POINTER_AUTH}" != "None" ]]; then
  test "${CURRENT_POINTER_AUTH}" = "${SIGNER}"
  OUTPUT="$(spl-token --program-2022 authorize "${MINT}" metadata-pointer --disable)"; printf '%s\n' "${OUTPUT}"
  POINTER_AUTH_TX="$(printf '%s\n' "${OUTPUT}" | capture_sig)"; test -n "${POINTER_AUTH_TX}"
fi

FINAL="$(spl-token --program-2022 display "${MINT}")"
printf '%s\n' "${FINAL}"
printf '%s\n' "${FINAL}" | grep -Eiq 'Mint[[:space:]]+Authority.*None'
printf '%s\n' "${FINAL}" | grep -Eiq 'Freeze[[:space:]]+Authority.*None'
FINAL_POINTER_AUTH="$(printf '%s\n' "${FINAL}" | awk '/Metadata Pointer:/ {in_pointer=1; next} in_pointer && /^[[:space:]]*Authority:/ {print $2; exit} in_pointer && /^$/ {exit}')"
test "${FINAL_POINTER_AUTH}" = "Disabled" || test "${FINAL_POINTER_AUTH}" = "None"
test "$(spl-token --program-2022 supply "${MINT}" | awk 'NR==1 {print $1}' | tr -d '\r')" = "${SUPPLY}"

cat > solana/devnet-resume-evidence.json <<EOF
{
  "network":"solana-devnet",
  "status":"READY_FOR_RECONCILIATION",
  "mint":"${MINT}",
  "programId":"${TOKEN_2022_PROGRAM}",
  "metadataTransaction":$(jq -Rn --arg v "${METADATA_TX}" 'if $v=="" then null else $v end'),
  "tokenAccountCreationTransaction":$(jq -Rn --arg v "${ACCOUNT_TX}" 'if $v=="" then null else $v end'),
  "mintTransaction":$(jq -Rn --arg v "${MINT_TX}" 'if $v=="" then null else $v end'),
  "mintAuthorityRevocationTransaction":$(jq -Rn --arg v "${MINT_AUTH_TX}" 'if $v=="" then null else $v end'),
  "freezeAuthorityRevocationTransaction":$(jq -Rn --arg v "${FREEZE_AUTH_TX}" 'if $v=="" then null else $v end'),
  "metadataUpdateAuthorityRevocationTransaction":$(jq -Rn --arg v "${METADATA_AUTH_TX}" 'if $v=="" then null else $v end'),
  "metadataPointerAuthorityRevocationTransaction":$(jq -Rn --arg v "${POINTER_AUTH_TX}" 'if $v=="" then null else $v end'),
  "workflowRunId":"${GITHUB_RUN_ID}",
  "workflowRunUrl":"${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}",
  "verifiedFinalState":true
}
EOF

jq -e --arg mint "${MINT}" '
 .network=="solana-devnet" and .status=="READY_FOR_RECONCILIATION" and .mint==$mint
 and .programId=="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
 and (.metadataTransaction|type=="string" and length>=64)
 and (.tokenAccountCreationTransaction|type=="string" and length>=64)
 and (.mintTransaction|type=="string" and length>=64)
 and (.mintAuthorityRevocationTransaction|type=="string" and length>=64)
 and (.freezeAuthorityRevocationTransaction|type=="string" and length>=64)
 and (.metadataUpdateAuthorityRevocationTransaction|type=="string" and length>=64)
 and (.metadataPointerAuthorityRevocationTransaction|type=="string" and length>=64)
 and .verifiedFinalState==true
' solana/devnet-resume-evidence.json >/dev/null
