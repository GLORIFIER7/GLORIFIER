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

extract_signatures_after_creation() {
  awk '
    /CREATE_TOKEN_TX=/ { active=1; next }
    active && /Signature:/ {
      line=$0
      sub(/^.*Signature:[[:space:]]*/, "", line)
      sub(/[[:space:]\r]+$/, "", line)
      if (line ~ /^[1-9A-HJ-NP-Za-km-z]{64,88}$/) print line
    }
    active && /Post job cleanup/ { exit }
  ' "$${LOG}"
}

CREATION_TX="$(awk -F'CREATE_TOKEN_TX=' '/CREATE_TOKEN_TX=/ {print $2; exit}' "$${LOG}" | sed 's/[[:space:]]*$//')"
[[ "$${CREATION_TX}" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]] || {
  echo "::error::Could not recover CREATE_TOKEN_TX from immutable deployment job ${JOB_ID}."
  exit 1
}

mapfile -t FOLLOW_ON_TXS < <(extract_signatures_after_creation)
test "${#FOLLOW_ON_TXS[@]}" -ge 6 || {
  echo "::error::Expected at least 6 post-creation transaction signatures in deployment job ${JOB_ID}; found ${#FOLLOW_ON_TXS[@]}."
  exit 1
}

METADATA_TX="${FOLLOW_ON_TXS[0]}"
ACCOUNT_TX="${FOLLOW_ON_TXS[1]}"
MINT_TX="${FOLLOW_ON_TXS[2]}"
MINT_AUTH_TX="${FOLLOW_ON_TXS[3]}"
FREEZE_AUTH_TX="${FOLLOW_ON_TXS[4]}"
METADATA_AUTH_TX="${FOLLOW_ON_TXS[5]}"

for pair in \
  "metadata:${METADATA_TX}" \
  "token-account:${ACCOUNT_TX}" \
  "mint:${MINT_TX}" \
  "mint-authority:${MINT_AUTH_TX}" \
  "freeze-authority:${FREEZE_AUTH_TX}" \
  "metadata-update-authority:${METADATA_AUTH_TX}"; do
  value="${pair#*:}"
  [[ "${value}" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]] || {
    echo "::error::Recovered ${pair%%:*} transaction signature is invalid."
    exit 1
  }
done
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
