#!/usr/bin/env bash
set -euo pipefail

# Safe completion path for the already-created GLORIFIER Token-2022 Devnet mint.
# This script NEVER creates a mint. It resumes configuration of the exact mint
# resolved by the authorized workflow from solana/devnet-deployment-recovery.json.

if [[ "${GLORIFIER_RESUME_AUTHORIZED_WORKFLOW:-}" != "true" || -z "${GITHUB_ACTIONS:-}" ]]; then
  echo "::error::Direct Devnet resume is disabled."
  echo "::error::Use .github/workflows/glorifier-solana-devnet-resume.yml with explicit authorization."
  exit 1
fi

readonly EXPECTED_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
readonly EXPECTED_NAME="GLORIFIER"
readonly EXPECTED_SYMBOL="GLR"
readonly EXPECTED_DECIMALS=9
readonly EXPECTED_SUPPLY=1000000000
readonly EXPECTED_METADATA_URI="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json"
readonly EXCLUDED_MINT="FrJhrVGjNRiB1eZpg5PTqLp9VSQS5rpwMp7jxNtEmV9G"

MINT="${MINT:-}"
test -n "${MINT}" || { echo "::error::Resolved recovered mint is missing."; exit 1; }
[[ "${MINT}" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || { echo "::error::Invalid recovered mint."; exit 1; }
[[ "${MINT}" != "${EXCLUDED_MINT}" ]] || { echo "::error::Recovered mint is explicitly excluded."; exit 1; }

test -f solana/devnet-deployment-recovery.json || { echo "::error::Missing immutable recovery record."; exit 1; }
RECOVERY_MINT="$(jq -r '.mint // empty' solana/devnet-deployment-recovery.json)"
RECOVERY_CREATION_TX="$(jq -r '.creationTransaction // empty' solana/devnet-deployment-recovery.json)"
RECOVERY_RUN_ID="$(jq -r '.deploymentWorkflowRunId // empty' solana/devnet-deployment-recovery.json)"

jq -e --arg mint "${MINT}" --arg run_id "${RECOVERY_RUN_ID}" '
  .status == "DEPLOYED_UNVERIFIED"
  and .network == "solana-devnet"
  and .programId == "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
  and .mint == $mint
  and (.creationTransaction | type == "string" and length > 0)
  and (.deploymentWorkflowRunId | type == "string" and length > 0)
  and .deploymentWorkflowRunId == $run_id
' solana/devnet-deployment-recovery.json >/dev/null || {
  echo "::error::Resolved mint does not match immutable recovery provenance."
  exit 1
}

mkdir -p solana
EVIDENCE="solana/devnet-resume-evidence.json"

if [[ -f /tmp/prior-resume-evidence.json ]]; then
  cp /tmp/prior-resume-evidence.json "${EVIDENCE}"
fi

if [[ ! -f "${EVIDENCE}" ]]; then
  cat > "${EVIDENCE}" <<EOF
{
  "network":"solana-devnet",
  "status":"RESUME_IN_PROGRESS",
  "mint":"${MINT}",
  "programId":"${EXPECTED_PROGRAM}",
  "name":"${EXPECTED_NAME}",
  "symbol":"${EXPECTED_SYMBOL}",
  "decimals":${EXPECTED_DECIMALS},
  "totalSupply":"${EXPECTED_SUPPLY}",
  "creationTransaction":"${RECOVERY_CREATION_TX}",
  "metadataTransaction":null,
  "tokenAccountCreationTransaction":null,
  "mintTransaction":null,
  "mintAuthorityRevocationTransaction":null,
  "freezeAuthorityRevocationTransaction":null,
  "metadataUpdateAuthorityRevocationTransaction":null,
  "sourceRecoveryRunId":"${RECOVERY_RUN_ID}"
}
EOF
fi

jq --arg tx "${RECOVERY_CREATION_TX}" '.creationTransaction=$tx' "${EVIDENCE}" > "${EVIDENCE}.tmp"
mv "${EVIDENCE}.tmp" "${EVIDENCE}"

record() {
  local status="$1"
  jq --arg status "$status"      --arg run_id "${GITHUB_RUN_ID}"      --arg run_url "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"      '.status=$status | .resumeWorkflowRunId=$run_id | .resumeWorkflowRunUrl=$run_url'      "${EVIDENCE}" > "${EVIDENCE}.tmp"
  mv "${EVIDENCE}.tmp" "${EVIDENCE}"
}

set_tx() {
  local field="$1" tx="$2"
  jq --arg field "$field" --arg tx "$tx" '.[$field]=$tx' "${EVIDENCE}" > "${EVIDENCE}.tmp"
  mv "${EVIDENCE}.tmp" "${EVIDENCE}"
}

solana account "${MINT}" | tee solana/resume-mint-account.txt
grep -Fq "Owner: ${EXPECTED_PROGRAM}" solana/resume-mint-account.txt

DISPLAY="$(spl-token --program-2022 display "${MINT}")"
printf '%s\n' "${DISPLAY}" | tee solana/resume-mint-display.txt
printf '%s\n' "${DISPLAY}" | grep -Eiq 'Decimals[[:space:]]*:[[:space:]]*9' || {
  echo "::error::Recovered mint does not have 9 decimals."
  exit 1
}

CURRENT_SUPPLY="$(spl-token --program-2022 supply "${MINT}" | awk 'NR==1 {print $1}' | tr -d '\r')"
[[ "${CURRENT_SUPPLY}" =~ ^[0-9]+$ ]] || { echo "::error::Unable to read recovered mint supply."; exit 1; }
(( CURRENT_SUPPLY <= EXPECTED_SUPPLY )) || { echo "::error::Recovered supply exceeds canonical supply."; exit 1; }

if printf '%s\n' "${DISPLAY}" | grep -Eiq '^[[:space:]]*(Update|Metadata.*Update)[[:space:]]+Authority:[[:space:]]*(None|Disabled|\(not set\))[[:space:]]*$'; then
  echo "Metadata update authority is already disabled."
else
  if printf '%s\n' "${DISPLAY}" | grep -Eq '^[[:space:]]*Name:'; then
    echo "::error::Metadata already exists but is not proven canonical; refusing overwrite."
    exit 1
  fi
  OUT="$(spl-token --program-2022 initialize-metadata "${MINT}" "${EXPECTED_NAME}" "${EXPECTED_SYMBOL}" "${EXPECTED_METADATA_URI}")"
  printf '%s\n' "${OUT}"
  TX="$(printf '%s\n' "${OUT}" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "${TX}" || { echo "::error::Missing metadata transaction signature."; exit 1; }
  set_tx metadataTransaction "${TX}"
fi

OWNER="$(solana address)"
ACCOUNT_ADDRESS="$(python3 - "${SOLANA_RPC_URL}" "${OWNER}" "${MINT}" <<'PY'
import json,sys,urllib.request
rpc,owner,mint=sys.argv[1:]
params=[owner,{"mint":mint},{"encoding":"jsonParsed","commitment":"finalized"}]
payload=json.dumps({"jsonrpc":"2.0","id":1,"method":"getTokenAccountsByOwner","params":params}).encode()
req=urllib.request.Request(rpc,data=payload,headers={"Content-Type":"application/json"})
with urllib.request.urlopen(req,timeout=30) as r: data=json.load(r)
items=data.get("result",{}).get("value",[])
print(items[0]["pubkey"] if items else "")
PY
)"

if [[ -z "${ACCOUNT_ADDRESS}" ]]; then
  OUT="$(spl-token --program-2022 create-account "${MINT}")"
  printf '%s\n' "${OUT}"
  ACCOUNT_ADDRESS="$(printf '%s\n' "${OUT}" | awk -F': ' '/^[[:space:]]*Address:/ {print $2; exit}')"
  TX="$(printf '%s\n' "${OUT}" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "${ACCOUNT_ADDRESS}" && test -n "${TX}" || { echo "::error::Token account creation evidence missing."; exit 1; }
  set_tx tokenAccountCreationTransaction "${TX}"
else
  echo "Existing Token-2022 holder account: ${ACCOUNT_ADDRESS}"
fi

if (( CURRENT_SUPPLY < EXPECTED_SUPPLY )); then
  REMAINING=$((EXPECTED_SUPPLY-CURRENT_SUPPLY))
  OUT="$(spl-token --program-2022 mint "${MINT}" "${REMAINING}")"
  printf '%s\n' "${OUT}"
  TX="$(printf '%s\n' "${OUT}" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "${TX}" || { echo "::error::Missing mint transaction signature."; exit 1; }
  set_tx mintTransaction "${TX}"
else
  echo "Canonical supply is already present; no additional GLR will be minted."
fi

FINAL_SUPPLY="$(spl-token --program-2022 supply "${MINT}" | awk 'NR==1 {print $1}' | tr -d '\r')"
test "${FINAL_SUPPLY}" = "${EXPECTED_SUPPLY}" || { echo "::error::Final supply is ${FINAL_SUPPLY}; expected ${EXPECTED_SUPPLY}."; exit 1; }

DISPLAY="$(spl-token --program-2022 display "${MINT}")"
if printf '%s\n' "${DISPLAY}" | grep -Eiq '^[[:space:]]*Mint[[:space:]]+Authority:[[:space:]]*(None|\(not set\))[[:space:]]*$'; then
  echo "Mint authority already disabled."
else
  OUT="$(spl-token --program-2022 authorize "${MINT}" mint --disable)"
  printf '%s\n' "${OUT}"
  TX="$(printf '%s\n' "${OUT}" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "${TX}" || { echo "::error::Missing mint-authority revocation signature."; exit 1; }
  set_tx mintAuthorityRevocationTransaction "${TX}"
fi

DISPLAY="$(spl-token --program-2022 display "${MINT}")"
if printf '%s\n' "${DISPLAY}" | grep -Eiq '^[[:space:]]*Freeze[[:space:]]+Authority:[[:space:]]*(None|\(not set\))[[:space:]]*$'; then
  echo "Freeze authority already disabled."
else
  OUT="$(spl-token --program-2022 authorize "${MINT}" freeze --disable)"
  printf '%s\n' "${OUT}"
  TX="$(printf '%s\n' "${OUT}" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "${TX}" || { echo "::error::Missing freeze-authority revocation signature."; exit 1; }
  set_tx freezeAuthorityRevocationTransaction "${TX}"
fi

DISPLAY="$(spl-token --program-2022 display "${MINT}")"
if printf '%s\n' "${DISPLAY}" | grep -Eiq '^[[:space:]]*(Update|Metadata.*Update)[[:space:]]+Authority:[[:space:]]*(None|Disabled|\(not set\))[[:space:]]*$'; then
  echo "Metadata update authority already disabled."
else
  OUT="$(spl-token --program-2022 authorize "${MINT}" metadata --disable)"
  printf '%s\n' "${OUT}"
  TX="$(printf '%s\n' "${OUT}" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "${TX}" || { echo "::error::Missing metadata-authority revocation signature."; exit 1; }
  set_tx metadataUpdateAuthorityRevocationTransaction "${TX}"
fi

DISPLAY="$(spl-token --program-2022 display "${MINT}")"
printf '%s\n' "${DISPLAY}" | tee solana/resume-final-mint-state.txt
printf '%s\n' "${DISPLAY}" | grep -Eiq "Name[[:space:]]*:[[:space:]]*${EXPECTED_NAME}"
printf '%s\n' "${DISPLAY}" | grep -Eiq "Symbol[[:space:]]*:[[:space:]]*${EXPECTED_SYMBOL}"
printf '%s\n' "${DISPLAY}" | grep -Eiq 'Decimals[[:space:]]*:[[:space:]]*9'
printf '%s\n' "${DISPLAY}" | grep -Eiq '^[[:space:]]*Mint[[:space:]]+Authority:[[:space:]]*(None|\(not set\))[[:space:]]*$'
printf '%s\n' "${DISPLAY}" | grep -Eiq '^[[:space:]]*Freeze[[:space:]]+Authority:[[:space:]]*(None|\(not set\))[[:space:]]*$'
printf '%s\n' "${DISPLAY}" | grep -Fq "${EXPECTED_METADATA_URI}"

for field in metadataTransaction tokenAccountCreationTransaction mintTransaction mintAuthorityRevocationTransaction freezeAuthorityRevocationTransaction metadataUpdateAuthorityRevocationTransaction; do
  test "$(jq -r --arg f "${field}" '.[$f] // empty' "${EVIDENCE}")" != "" || {
    echo "::error::Missing resume transaction evidence field: ${field}"
    exit 1
  }
done

jq --arg status "READY_FOR_VERIFICATION"    --arg creation "$(jq -r '.creationTransaction // empty' "${EVIDENCE}")"    --arg completed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"    '.status=$status | .creationTransaction=$creation | .completedAt=$completed_at'    "${EVIDENCE}" > "${EVIDENCE}.tmp"
mv "${EVIDENCE}.tmp" "${EVIDENCE}"

echo "GLR_STATUS=READY_FOR_VERIFICATION" | tee solana/resume-status.txt
record "READY_FOR_VERIFICATION"
jq -e --arg mint "${MINT}" '.status=="READY_FOR_VERIFICATION" and .mint==$mint and .network=="solana-devnet"' "${EVIDENCE}" >/dev/null
