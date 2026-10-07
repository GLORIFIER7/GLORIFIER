#!/usr/bin/env bash
set -euo pipefail

# Safe completion path for the already-created GLORIFIER Token-2022 Devnet mint.
# IMPORTANT: this script NEVER creates a mint. It only resumes configuration of
# the exact recovery mint supplied by solana/devnet-deployment-recovery.json.

if [[ "${GLORIFIER_RESUME_AUTHORIZED_WORKFLOW:-}" != "true" || -z "${GITHUB_ACTIONS:-}" ]]; then
  echo "::error::Direct Devnet resume is disabled."
  echo "::error::Use .github/workflows/glorifier-solana-devnet-resume.yml with explicit authorization."
  exit 1
fi

readonly EXPECTED_MINT="8rXQAygKxRZ9R7fojLrXLoHdKxnEKTjmb8sfnnGvfU3S"
readonly EXPECTED_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
readonly EXPECTED_NAME="GLORIFIER"
readonly EXPECTED_SYMBOL="GLR"
readonly EXPECTED_DECIMALS=9
readonly EXPECTED_SUPPLY=1000000000
readonly EXPECTED_METADATA_URI="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json"
readonly COMMITMENT="finalized"

test "${MINT}" = "${EXPECTED_MINT}" || {
  echo "::error::Resume is hard-bound to the recovered mint ${EXPECTED_MINT}; no other mint is permitted."
  exit 1
}

[[ "${MINT}" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]]
[[ "${MINT}" != "FrJhrVGjNRiB1eZpg5PTqLp9VSQS5rpwMp7jxNtEmV9G" ]]

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
  "creationTransaction":null,
  "metadataTransaction":null,
  "tokenAccountCreationTransaction":null,
  "mintTransaction":null,
  "mintAuthorityRevocationTransaction":null,
  "freezeAuthorityRevocationTransaction":null,
  "metadataUpdateAuthorityRevocationTransaction":null,
  "sourceRecoveryRunId":"37524079976"
}
EOF
fi

jq -e --arg mint "${MINT}" '
  .mint == $mint
  and .network == "solana-devnet"
  and .programId == "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
' "${EVIDENCE}" >/dev/null

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

# The recovery mint must already exist and must be owned by Token-2022.
solana account "${MINT}" | tee solana/resume-mint-account.txt
grep -Fq "Owner: ${EXPECTED_PROGRAM}" solana/resume-mint-account.txt

DISPLAY="$(spl-token --program-2022 display "${MINT}")"
printf '%s\n' "${DISPLAY}" | tee solana/resume-mint-display.txt
printf '%s\n' "${DISPLAY}" | grep -Eiq 'Decimals[[:space:]]*:[[:space:]]*9' || {
  echo "::error::Recovered mint does not have the required 9 decimals."
  exit 1
}

CURRENT_SUPPLY="$(spl-token --program-2022 supply "${MINT}" | awk 'NR==1 {print $1}' | tr -d '\r')"
[[ "${CURRENT_SUPPLY}" =~ ^[0-9]+$ ]] || {
  echo "::error::Could not read the recovered mint supply."
  exit 1
}
(( CURRENT_SUPPLY <= EXPECTED_SUPPLY )) || {
  echo "::error::Recovered mint supply exceeds the canonical 1,000,000,000 GLR supply; refusing mutation."
  exit 1
}

# Initialize metadata only if the existing mint has not already been initialized.
if printf '%s\n' "${DISPLAY}" | grep -Eq '^[[:space:]]*Name:[[:space:]]*${EXPECTED_NAME}[[:space:]]*$'   && printf '%s\n' "${DISPLAY}" | grep -Eq '^[[:space:]]*Symbol:[[:space:]]*${EXPECTED_SYMBOL}[[:space:]]*$'   && printf '%s\n' "${DISPLAY}" | grep -Fq "${EXPECTED_METADATA_URI}"; then
  echo "Metadata is already initialized with the canonical GLORIFIER values."
else
  if printf '%s\n' "${DISPLAY}" | grep -Eq '^[[:space:]]*Name:'; then
    echo "::error::Metadata is already initialized but does not match the canonical GLORIFIER contract; refusing overwrite."
    exit 1
  fi
  METADATA_OUTPUT="$(spl-token --program-2022 initialize-metadata "${MINT}" "${EXPECTED_NAME}" "${EXPECTED_SYMBOL}" "${EXPECTED_METADATA_URI}")"
  printf '%s\n' "${METADATA_OUTPUT}"
  METADATA_TX="$(printf '%s\n' "${METADATA_OUTPUT}" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "${METADATA_TX}" || { echo "::error::Could not recover metadata transaction signature."; exit 1; }
  set_tx metadataTransaction "${METADATA_TX}"
fi

# Find an existing Token-2022 account for the deployment wallet before creating one.
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
  ACCOUNT_OUTPUT="$(spl-token --program-2022 create-account "${MINT}")"
  printf '%s\n' "${ACCOUNT_OUTPUT}"
  ACCOUNT_ADDRESS="$(printf '%s\n' "${ACCOUNT_OUTPUT}" | awk -F': ' '/^[[:space:]]*Address:/ {print $2; exit}')"
  ACCOUNT_TX="$(printf '%s\n' "${ACCOUNT_OUTPUT}" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "${ACCOUNT_ADDRESS}" || { echo "::error::Could not recover created Token-2022 account."; exit 1; }
  test -n "${ACCOUNT_TX}" || { echo "::error::Could not recover token-account creation transaction signature."; exit 1; }
  set_tx tokenAccountCreationTransaction "${ACCOUNT_TX}"
else
  echo "Existing Token-2022 holder account: ${ACCOUNT_ADDRESS}"
fi

# Mint only the remaining amount. This makes a retried resume safe after a partial mint.
if (( CURRENT_SUPPLY < EXPECTED_SUPPLY )); then
  REMAINING=$((EXPECTED_SUPPLY-CURRENT_SUPPLY))
  MINT_OUTPUT="$(spl-token --program-2022 mint "${MINT}" "${REMAINING}")"
  printf '%s\n' "${MINT_OUTPUT}"
  MINT_TX="$(printf '%s\n' "${MINT_OUTPUT}" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "${MINT_TX}" || { echo "::error::Could not recover mint transaction signature."; exit 1; }
  set_tx mintTransaction "${MINT_TX}"
else
  echo "Canonical supply is already present; no additional GLR will be minted."
fi

FINAL_SUPPLY="$(spl-token --program-2022 supply "${MINT}" | awk 'NR==1 {print $1}' | tr -d '\r')"
test "${FINAL_SUPPLY}" = "${EXPECTED_SUPPLY}" || {
  echo "::error::Final supply is ${FINAL_SUPPLY}; expected exactly ${EXPECTED_SUPPLY}."
  exit 1
}

# Permanently revoke mint authority if it is still present.
DISPLAY="$(spl-token --program-2022 display "${MINT}")"
if printf '%s\n' "${DISPLAY}" | grep -Eiq 'Mint[[:space:]]+Authority.*None'; then
  echo "Mint authority is already disabled."
else
  OUT="$(spl-token --program-2022 authorize "${MINT}" mint --disable)"
  printf '%s\n' "${OUT}"
  TX="$(printf '%s\n' "${OUT}" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "${TX}" || { echo "::error::Could not recover mint-authority revocation signature."; exit 1; }
  set_tx mintAuthorityRevocationTransaction "${TX}"
fi

# Permanently revoke freeze authority if it is still present.
DISPLAY="$(spl-token --program-2022 display "${MINT}")"
if printf '%s\n' "${DISPLAY}" | grep -Eiq 'Freeze[[:space:]]+Authority.*None'; then
  echo "Freeze authority is already disabled."
else
  OUT="$(spl-token --program-2022 authorize "${MINT}" freeze --disable)"
  printf '%s\n' "${OUT}"
  TX="$(printf '%s\n' "${OUT}" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "${TX}" || { echo "::error::Could not recover freeze-authority revocation signature."; exit 1; }
  set_tx freezeAuthorityRevocationTransaction "${TX}"
fi

# Permanently revoke TokenMetadata update authority if it is still present.
DISPLAY="$(spl-token --program-2022 display "${MINT}")"
if printf '%s\n' "${DISPLAY}" | grep -Eiq 'Update Authority.*None|Metadata.*Update Authority.*None'; then
  echo "Metadata update authority is already disabled."
else
  OUT="$(spl-token --program-2022 authorize "${MINT}" metadata --disable)"
  printf '%s\n' "${OUT}"
  TX="$(printf '%s\n' "${OUT}" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "${TX}" || { echo "::error::Could not recover metadata-authority revocation signature."; exit 1; }
  set_tx metadataUpdateAuthorityRevocationTransaction "${TX}"
fi

DISPLAY="$(spl-token --program-2022 display "${MINT}")"
printf '%s\n' "${DISPLAY}" | tee solana/resume-final-mint-state.txt
printf '%s\n' "${DISPLAY}" | grep -Eiq 'Name[[:space:]]*:[[:space:]]*${EXPECTED_NAME}'
printf '%s\n' "${DISPLAY}" | grep -Eiq 'Symbol[[:space:]]*:[[:space:]]*${EXPECTED_SYMBOL}'
printf '%s\n' "${DISPLAY}" | grep -Eiq 'Decimals[[:space:]]*:[[:space:]]*9'
printf '%s\n' "${DISPLAY}" | grep -Eiq 'Mint[[:space:]]+Authority.*None'
printf '%s\n' "${DISPLAY}" | grep -Eiq 'Freeze[[:space:]]+Authority.*None'
printf '%s\n' "${DISPLAY}" | grep -Fq "${EXPECTED_METADATA_URI}"

for field in metadataTransaction tokenAccountCreationTransaction mintTransaction mintAuthorityRevocationTransaction freezeAuthorityRevocationTransaction metadataUpdateAuthorityRevocationTransaction; do
  test "$(jq -r --arg f "${field}" '.[$f] // empty' "${EVIDENCE}")" != "" || {
    echo "::error::Missing resume transaction evidence field: ${field}"
    exit 1
  }
done

jq --arg status "READY_FOR_VERIFICATION" --arg creation "$(jq -r '.creationTransaction // empty' "${EVIDENCE}")"   '.status=$status | .creationTransaction=($creation // null) | .completedAt="'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"'   "${EVIDENCE}" > "${EVIDENCE}.tmp"
mv "${EVIDENCE}.tmp" "${EVIDENCE}"

echo "GLR_STATUS=READY_FOR_VERIFICATION" | tee solana/resume-status.txt
record "READY_FOR_VERIFICATION"
jq -e '.status=="READY_FOR_VERIFICATION" and .mint=="'"${MINT}"'" and .network=="solana-devnet"' "${EVIDENCE}" >/dev/null
