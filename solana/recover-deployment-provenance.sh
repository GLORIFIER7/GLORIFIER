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
[[ "${JOB_ID}" =~ ^[0-9]+$ ]]
[[ "${RUN_ID}" =~ ^[0-9]+$ ]]

LOG="/tmp/glorifier-deployment-job.log"
gh run view --repo "${GITHUB_REPOSITORY}" --job "${JOB_ID}" --log > "${LOG}"

# The original partial deployment may contain only the mint-creation transaction.
# The immutable recovery record preserves that transaction; the authorized resume
# workflow supplies the six subsequent transactions after completing the mint.
CREATION_TX="$(jq -r '.creationTransaction // empty' solana/devnet-deployment-recovery.json)"
[[ "${CREATION_TX}" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]] || {
  echo "::error::Recovery record is missing a valid creation transaction."
  exit 1
}
grep -Fq "${CREATION_TX}" "${LOG}" || {
  echo "::error::Creation transaction ${CREATION_TX} was not found in immutable deployment job ${JOB_ID}."
  exit 1
}
grep -Fq "Creating token ${MINT} under program ${EXPECTED_PROGRAM}" "${LOG}" || {
  echo "::error::Immutable deployment job ${JOB_ID} does not prove creation of the recovered mint."
  exit 1
}

# A recovered mint whose mint authority was already revoked cannot be
# completed in place. Preserve it as evidence and stop cleanly; never create
# a replacement mint implicitly. The reconciliation workflow surfaces this as
# RECOVERY_REQUIRED and requires an explicit human decision.
DISPLAY="$(spl-token --program-2022 display "${MINT}")"
MINT_AUTHORITY="$(printf '%s\n' "${DISPLAY}" | awk 'tolower($0) ~ /^[[:space:]]*mint[[:space:]]+authority:/ {sub(/^[^:]*:[[:space:]]*/, ""); gsub(/^[[:space:]]+|[[:space:]]+$/, ""); print; exit}')"
if [[ "${MINT_AUTHORITY}" == "(not set)" || "${MINT_AUTHORITY}" == "None" ]]; then
  cat > solana/deployment-provenance.json <<EOF
{
  "network":"solana-devnet",
  "status":"IRRECOVERABLE_PARTIAL",
  "programId":"${EXPECTED_PROGRAM}",
  "mint":"${MINT}",
  "deploymentRunId":"${RUN_ID}",
  "deploymentRunUrl":"${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${RUN_ID}",
  "deploymentJobId":"${JOB_ID}",
  "provenanceSource":"IMMUTABLE_GITHUB_ACTIONS_JOB_LOG",
  "creationTransaction":"${CREATION_TX}",
  "recoveryRequired":true,
  "reason":"Mint authority is already revoked; the existing mint cannot be completed in place without minting authority.",
  "nextAction":"Explicit human authorization is required before any replacement canonical mint is created."
}
EOF
  jq -e --arg mint "${MINT}" '.network=="solana-devnet" and .status=="IRRECOVERABLE_PARTIAL" and .mint==$mint and .recoveryRequired==true and (.creationTransaction|type=="string" and length>=64)' solana/deployment-provenance.json >/dev/null
  echo "RECOVERY_REQUIRED=true" >> "${GITHUB_OUTPUT:-/dev/null}"
  echo "::warning::Recovered mint ${MINT} is irrecoverable because mint authority is revoked. No replacement mint was created."
  exit 0
fi

test -f solana/devnet-resume-evidence.json || {
  echo "::error::Recovered mint is only partially deployed."
  echo "::error::Run the authorized Devnet deployment workflow to complete the existing mint before reconciliation."
  exit 1
}

RESUME_JSON="solana/devnet-resume-evidence.json"
jq -e --arg mint "${MINT}" '
  .network == "solana-devnet"
  and .status == "READY_FOR_RECONCILIATION"
  and .mint == $mint
  and .programId == "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
  and .verifiedFinalState == true
' "${RESUME_JSON}" >/dev/null || {
  echo "::error::Recovered-mint resume evidence is not READY_FOR_RECONCILIATION."
  exit 1
}

METADATA_TX="$(jq -r '.metadataTransaction // empty' "${RESUME_JSON}")"
ACCOUNT_TX="$(jq -r '.tokenAccountCreationTransaction // empty' "${RESUME_JSON}")"
MINT_TX="$(jq -r '.mintTransaction // empty' "${RESUME_JSON}")"
MINT_AUTH_TX="$(jq -r '.mintAuthorityRevocationTransaction // empty' "${RESUME_JSON}")"
FREEZE_AUTH_TX="$(jq -r '.freezeAuthorityRevocationTransaction // empty' "${RESUME_JSON}")"
METADATA_AUTH_TX="$(jq -r '.metadataUpdateAuthorityRevocationTransaction // empty' "${RESUME_JSON}")"
RESUME_TX="$(jq -r '.metadataPointerAuthorityRevocationTransaction // empty' "${RESUME_JSON}")"

for pair in \
  "metadata:${METADATA_TX}" \
  "token-account:${ACCOUNT_TX}" \
  "mint:${MINT_TX}" \
  "mint-authority:${MINT_AUTH_TX}" \
  "freeze-authority:${FREEZE_AUTH_TX}" \
  "metadata-update-authority:${METADATA_AUTH_TX}" \
  "metadata-pointer-authority:${RESUME_TX}"; do
  value="${pair#*:}"
  [[ "${value}" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]] || {
    echo "::error::Recovered ${pair%%:*} transaction signature is invalid or missing."
    exit 1
  }
done

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
