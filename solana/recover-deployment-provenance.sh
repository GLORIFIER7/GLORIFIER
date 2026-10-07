#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
readonly MINT="${1:-}"

test -n "${GH_TOKEN:-}"
test -f solana/devnet-deployment-recovery.json

RECOVERY_MINT="$(jq -r '.mint // empty' solana/devnet-deployment-recovery.json)"
JOB_ID="$(jq -r '.deploymentJobId // empty' solana/devnet-deployment-recovery.json)"
RUN_ID="$(jq -r '.deploymentWorkflowRunId // empty' solana/devnet-deployment-recovery.json)"

test "${RECOVERY_MINT}" = "${MINT}"
test "${JOB_ID}" =~ ^[0-9]+$
test "${RUN_ID}" =~ ^[0-9]+$

LOG="/tmp/glorifier-deployment-job.log"
gh run view --repo "${GITHUB_REPOSITORY}" --job "${JOB_ID}" --log > "${LOG}"

extract_signature() {
  local needle="$1"
  awk -v needle="$needle" '
    index($0, needle) { active=1; next }
    active && /Signature:/ {
      line=$0
      sub(/^.*Signature:[[:space:]]*/, "", line)
      sub(/[[:space:]\r]+$/, "", line)
      if (line ~ /^[1-9A-HJ-NP-Za-km-z]{64,88}$/) { print line; exit }
    }
    active && /##\[group\]/ && index($0, needle) == 0 { active=0 }
  ' "$LOG"
}

require_signature() {
  local label="$1"
  local needle="$2"
  local value
  value="$(extract_signature "${needle}")"
  [[ "${value}" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]] || {
    echo "::error::Could not recover ${label} transaction signature from immutable deployment job ${JOB_ID}."
    exit 1
  }
  printf '%s' "${value}"
}

CREATION_TX="$(require_signature creation 'spl-token --program-2022 create-token')"
METADATA_TX="$(require_signature metadata 'spl-token --program-2022 initialize-metadata')"
ACCOUNT_TX="$(require_signature token-account 'spl-token --program-2022 create-account')"
MINT_TX="$(require_signature mint 'spl-token --program-2022 mint "${MINT}" "${SUPPLY}"')"
MINT_AUTH_TX="$(require_signature mint-authority 'spl-token --program-2022 authorize "${MINT}" mint --disable')"
FREEZE_AUTH_TX="$(require_signature freeze-authority 'spl-token --program-2022 authorize "${MINT}" freeze --disable')"
METADATA_AUTH_TX="$(require_signature metadata-update-authority 'spl-token --program-2022 authorize "${MINT}" metadata --disable')"

RESUME_TX=""
if [[ -f solana/devnet-resume-evidence.json ]]; then
  RESUME_TX="$(jq -r '.metadataPointerAuthorityRevocationTransaction // empty' solana/devnet-resume-evidence.json)"
fi

[[ "${RESUME_TX}" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]] || {
  echo "::error::Recovered mint resume evidence is missing the Metadata Pointer authority-revocation transaction."
  echo "::error::Run the authorized Devnet deployment/resume workflow before reconciliation."
  exit 1
}

cat > solana/deployment-provenance.json <<EOF
{
  "network": "solana-devnet",
  "status": "READY_FOR_VERIFICATION",
  "programId": "${EXPECTED_PROGRAM}",
  "mint": "${MINT}",
  "deploymentRunId": "${RUN_ID}",
  "deploymentRunUrl": "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${RUN_ID}",
  "deploymentJobId": "${JOB_ID}",
  "provenanceSource": "IMMUTABLE_GITHUB_ACTIONS_JOB_LOG_PLUS_RESUME_EVIDENCE",
  "creationTransaction": "${CREATION_TX}",
  "metadataTransaction": "${METADATA_TX}",
  "tokenAccountCreationTransaction": "${ACCOUNT_TX}",
  "mintTransaction": "${MINT_TX}",
  "mintAuthorityRevocationTransaction": "${MINT_AUTH_TX}",
  "freezeAuthorityRevocationTransaction": "${FREEZE_AUTH_TX}",
  "metadataUpdateAuthorityRevocationTransaction": "${METADATA_AUTH_TX}",
  "metadataPointerAuthorityRevocationTransaction": "${RESUME_TX}"
}
EOF

jq -e --arg mint "${MINT}" '
  .network == "solana-devnet"
  and .status == "READY_FOR_VERIFICATION"
  and .programId == "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
  and .mint == $mint
  and (.deploymentJobId | type == "string" and length > 0)
  and (.creationTransaction | type == "string" and length >= 64)
  and (.metadataTransaction | type == "string" and length >= 64)
  and (.tokenAccountCreationTransaction | type == "string" and length >= 64)
  and (.mintTransaction | type == "string" and length >= 64)
  and (.mintAuthorityRevocationTransaction | type == "string" and length >= 64)
  and (.freezeAuthorityRevocationTransaction | type == "string" and length >= 64)
  and (.metadataUpdateAuthorityRevocationTransaction | type == "string" and length >= 64)
  and (.metadataPointerAuthorityRevocationTransaction | type == "string" and length >= 64)
' solana/deployment-provenance.json >/dev/null
