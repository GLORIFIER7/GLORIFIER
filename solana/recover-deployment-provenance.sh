#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
readonly MINT="${1:-}"

test -n "${GH_TOKEN:-}"
test -n "${MINT}"

# First trust an immutable successful deployment artifact for the exact mint.
# This check runs before legacy recovery/replacement handling so a newer
# authorized mint is not incorrectly classified as a replacement merely because
# an older irrecoverable recovery record is still present in the repository.
RUNS_JSON="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/workflows/glorifier-solana-devnet.yml/runs?event=workflow_dispatch&branch=main&per_page=100")"
FOUND=0
while IFS= read -r RUN_ID; do
  [[ -n "${RUN_ID}" ]] || continue
  [[ "${RUN_ID}" != "${GITHUB_RUN_ID}" ]] || continue
  RUN_JSON="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${RUN_ID}")"
  jq -e '.path==".github/workflows/glorifier-solana-devnet.yml" and .event=="workflow_dispatch" and .head_branch=="main" and .conclusion=="success"' <<<"${RUN_JSON}" >/dev/null || continue
  ARTIFACTS_JSON="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${RUN_ID}/artifacts?per_page=100")"
  while IFS="$(printf "\t")" read -r ARTIFACT_ID ARTIFACT_DIGEST; do
    [[ -n "${ARTIFACT_ID}" && -n "${ARTIFACT_DIGEST}" ]] || continue
    rm -rf /tmp/glorifier-exact-provenance
    mkdir -p /tmp/glorifier-exact-provenance
    gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${ARTIFACT_ID}/zip" > /tmp/glorifier-exact-provenance.zip
    test "sha256:$(sha256sum /tmp/glorifier-exact-provenance.zip | awk '{print $1}')" = "${ARTIFACT_DIGEST}"
    unzip -oq /tmp/glorifier-exact-provenance.zip -d /tmp/glorifier-exact-provenance
    EVIDENCE_FILE="$(find /tmp/glorifier-exact-provenance -type f -name deployment-evidence.json -print -quit || true)"
    [[ -n "${EVIDENCE_FILE}" ]] || continue
    if jq -e --arg mint "${MINT}" --arg run "${RUN_ID}" --arg program "${EXPECTED_PROGRAM}" '.network=="solana-devnet" and .status=="READY_FOR_VERIFICATION" and .programId==$program and .mint==$mint and .deploymentWorkflowRunId==$run' "${EVIDENCE_FILE}" >/dev/null; then
      # Older immutable artifacts predate deploymentJobId. Recover the exact
      # successful deploy job from the same immutable workflow run.
      JOB_ID="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${RUN_ID}/jobs?per_page=100" |
        jq -r '[.jobs[]? | select(.name=="Deploy GLORIFIER GLR to Solana Devnet") | select(.conclusion=="success")] | sort_by(.completed_at) | reverse | .[0].id // empty')"
      [[ "${JOB_ID}" =~ ^[0-9]+$ ]] || { echo "::error::No successful deployment job found for immutable run ${RUN_ID}."; exit 1; }
      jq --arg run "${RUN_ID}" --arg job "${JOB_ID}" --arg artifact_id "${ARTIFACT_ID}" --arg digest "${ARTIFACT_DIGEST}"         '. + {deploymentRunId:$run,deploymentJobId:$job,deploymentRunUrl:("https://github.com/" + env.GITHUB_REPOSITORY + "/actions/runs/" + $run),deploymentArtifactId:$artifact_id,deploymentArtifactDigest:$digest,provenanceSource:"IMMUTABLE_GITHUB_ACTIONS_ARTIFACT"}'         "${EVIDENCE_FILE}" > solana/deployment-provenance.json
      jq -e --arg mint "${MINT}" '.network=="solana-devnet" and .status=="READY_FOR_VERIFICATION" and .mint==$mint and .provenanceSource=="IMMUTABLE_GITHUB_ACTIONS_ARTIFACT" and (.deploymentRunId|type=="string" and length>0) and (.deploymentJobId|type=="string" and length>0)' solana/deployment-provenance.json >/dev/null
      echo "RECOVERY_REQUIRED=false" >> "${GITHUB_OUTPUT:-/dev/null}"
      echo "::notice::Exact immutable deployment artifact matched mint ${MINT}; legacy recovery state does not override this proof."
      exit 0
    fi
  done < <(jq -r '[.artifacts[]? | select(.expired==false) | select(.name=="glorifier-solana-devnet-evidence") | select(.digest!=null and (.digest|startswith("sha256:")))] | sort_by(.created_at) | reverse | .[] | [(.id|tostring),.digest] | @tsv' <<<"${ARTIFACTS_JSON}")
done < <(jq -r '[.workflow_runs[]? | select(.event=="workflow_dispatch") | select(.head_branch=="main") | select(.path==".github/workflows/glorifier-solana-devnet.yml") | select(.conclusion=="success")] | sort_by(.created_at) | reverse | .[].id' <<<"${RUNS_JSON}")
# Controlled replacement provenance path. It is reached only when the dedicated
# deployment workflow has already accepted the exact human replacement gate.
if [[ -f solana/devnet-deployment-recovery.json ]]; then
  RECOVERY_MINT="$(jq -r '.mint // empty' solana/devnet-deployment-recovery.json)"
  if [[ "${MINT}" != "${RECOVERY_MINT}" ]]; then
    RUNS_JSON="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/workflows/glorifier-solana-devnet.yml/runs?event=workflow_dispatch&branch=main&per_page=100")"
    FOUND=0
    while IFS= read -r RUN_ID; do
      [[ -n "${RUN_ID}" ]] || continue
      [[ "${RUN_ID}" != "${GITHUB_RUN_ID}" ]] || continue
      RUN_JSON="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${RUN_ID}")"
      jq -e '.path==".github/workflows/glorifier-solana-devnet.yml" and .event=="workflow_dispatch" and .head_branch=="main" and .conclusion=="success"' <<<"${RUN_JSON}" >/dev/null || continue
      ARTIFACTS_JSON="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${RUN_ID}/artifacts?per_page=100")"
      while IFS="$(printf "\t")" read -r ARTIFACT_ID ARTIFACT_DIGEST; do
        [[ -n "${ARTIFACT_ID}" && -n "${ARTIFACT_DIGEST}" ]] || continue
        rm -rf /tmp/glorifier-replacement-provenance
        mkdir -p /tmp/glorifier-replacement-provenance
        gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${ARTIFACT_ID}/zip" > /tmp/glorifier-replacement-provenance.zip
        test "sha256:$(sha256sum /tmp/glorifier-replacement-provenance.zip | awk '{print $1}')" = "${ARTIFACT_DIGEST}"
        unzip -oq /tmp/glorifier-replacement-provenance.zip -d /tmp/glorifier-replacement-provenance
        EVIDENCE_FILE="$(find /tmp/glorifier-replacement-provenance -type f -name deployment-evidence.json -print -quit || true)"
        [[ -n "${EVIDENCE_FILE}" ]] || continue
        jq -e --arg mint "${MINT}" --arg run "${RUN_ID}" --arg program "${EXPECTED_PROGRAM}" '.network=="solana-devnet" and .status=="READY_FOR_VERIFICATION" and .programId==$program and .mint==$mint and .deploymentWorkflowRunId==$run' "${EVIDENCE_FILE}" >/dev/null || continue
        jq --arg run "${RUN_ID}" --arg artifact_id "${ARTIFACT_ID}" --arg digest "${ARTIFACT_DIGEST}" '. + {deploymentRunId:$run,deploymentArtifactId:$artifact_id,deploymentArtifactDigest:$digest,provenanceSource:"IMMUTABLE_GITHUB_ACTIONS_ARTIFACT"}' "${EVIDENCE_FILE}" > solana/deployment-provenance.json
        FOUND=1
        break 2
      done < <(jq -r '[.artifacts[]? | select(.expired==false) | select(.name=="glorifier-solana-devnet-evidence") | select(.digest!=null and (.digest|startswith("sha256:")))] | sort_by(.created_at) | reverse | .[] | [(.id|tostring),.digest] | @tsv' <<<"${ARTIFACTS_JSON}")
    done < <(jq -r '[.workflow_runs[]? | select(.event=="workflow_dispatch") | select(.head_branch=="main") | select(.path==".github/workflows/glorifier-solana-devnet.yml") | select(.conclusion=="success")] | sort_by(.created_at) | reverse | .[].id' <<<"${RUNS_JSON}")
    test "${FOUND}" -eq 1 || { echo "::error::No immutable successful deployment artifact matches replacement mint ${MINT}."; exit 1; }
    jq -e --arg mint "${MINT}" --arg recovery_mint "${RECOVERY_MINT}" '.mint==$mint and .status=="READY_FOR_VERIFICATION" and .provenanceSource=="IMMUTABLE_GITHUB_ACTIONS_ARTIFACT" and .replacementAuthorized==true and .replacedMint==$recovery_mint' solana/deployment-provenance.json >/dev/null
    echo "RECOVERY_REQUIRED=false" >> "${GITHUB_OUTPUT:-/dev/null}"
    exit 0
  fi
fi

# Legacy/recovered mint provenance path.
test -f solana/devnet-deployment-recovery.json
RECOVERY_MINT="$(jq -r '.mint // empty' solana/devnet-deployment-recovery.json)"
JOB_ID="$(jq -r '.deploymentJobId // empty' solana/devnet-deployment-recovery.json)"
RUN_ID="$(jq -r '.deploymentWorkflowRunId // empty' solana/devnet-deployment-recovery.json)"
test "${RECOVERY_MINT}" = "${MINT}"
[[ "${JOB_ID}" =~ ^[0-9]+$ ]]
[[ "${RUN_ID}" =~ ^[0-9]+$ ]]

LOG="/tmp/glorifier-deployment-job.log"
gh run view --repo "${GITHUB_REPOSITORY}" --job "${JOB_ID}" --log > "${LOG}"
CREATION_TX="$(jq -r '.creationTransaction // empty' solana/devnet-deployment-recovery.json)"
[[ "${CREATION_TX}" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]] || { echo "::error::Recovery record is missing a valid creation transaction."; exit 1; }
grep -Fq "${CREATION_TX}" "${LOG}" || { echo "::error::Creation transaction ${CREATION_TX} was not found in immutable deployment job ${JOB_ID}."; exit 1; }
grep -Fq "Creating token ${MINT} under program ${EXPECTED_PROGRAM}" "${LOG}" || { echo "::error::Immutable deployment job ${JOB_ID} does not prove creation of the recovered mint."; exit 1; }

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

test -f solana/devnet-resume-evidence.json || { echo "::error::Recovered mint is only partially deployed. Run the authorized Devnet deployment workflow to complete the existing mint before reconciliation."; exit 1; }
RESUME_JSON="solana/devnet-resume-evidence.json"
jq -e --arg mint "${MINT}" '.network=="solana-devnet" and .status=="READY_FOR_RECONCILIATION" and .mint==$mint and .programId=="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" and .verifiedFinalState==true' "${RESUME_JSON}" >/dev/null
METADATA_TX="$(jq -r '.metadataTransaction // empty' "${RESUME_JSON}")"
ACCOUNT_TX="$(jq -r '.tokenAccountCreationTransaction // empty' "${RESUME_JSON}")"
MINT_TX="$(jq -r '.mintTransaction // empty' "${RESUME_JSON}")"
MINT_AUTH_TX="$(jq -r '.mintAuthorityRevocationTransaction // empty' "${RESUME_JSON}")"
FREEZE_AUTH_TX="$(jq -r '.freezeAuthorityRevocationTransaction // empty' "${RESUME_JSON}")"
METADATA_AUTH_TX="$(jq -r '.metadataUpdateAuthorityRevocationTransaction // empty' "${RESUME_JSON}")"
RESUME_TX="$(jq -r '.metadataPointerAuthorityRevocationTransaction // empty' "${RESUME_JSON}")"
for pair in "metadata:${METADATA_TX}" "token-account:${ACCOUNT_TX}" "mint:${MINT_TX}" "mint-authority:${MINT_AUTH_TX}" "freeze-authority:${FREEZE_AUTH_TX}" "metadata-update-authority:${METADATA_AUTH_TX}" "metadata-pointer-authority:${RESUME_TX}"; do
  value="${pair#*:}"
  [[ "${value}" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]] || { echo "::error::Recovered ${pair%%:*} transaction signature is invalid or missing."; exit 1; }
done
cat > solana/deployment-provenance.json <<EOF
{
  "network":"solana-devnet","status":"READY_FOR_VERIFICATION","programId":"${EXPECTED_PROGRAM}","mint":"${MINT}",
  "deploymentRunId":"${RUN_ID}","deploymentRunUrl":"${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${RUN_ID}","deploymentJobId":"${JOB_ID}",
  "provenanceSource":"IMMUTABLE_GITHUB_ACTIONS_JOB_LOG_PLUS_RESUME_EVIDENCE","creationTransaction":"${CREATION_TX}","metadataTransaction":"${METADATA_TX}",
  "tokenAccountCreationTransaction":"${ACCOUNT_TX}","mintTransaction":"${MINT_TX}","mintAuthorityRevocationTransaction":"${MINT_AUTH_TX}",
  "freezeAuthorityRevocationTransaction":"${FREEZE_AUTH_TX}","metadataUpdateAuthorityRevocationTransaction":"${METADATA_AUTH_TX}","metadataPointerAuthorityRevocationTransaction":"${RESUME_TX}"
}
EOF
jq -e --arg mint "${MINT}" '.network=="solana-devnet" and .status=="READY_FOR_VERIFICATION" and .programId=="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" and .mint==$mint and (.deploymentJobId|type=="string" and length>0) and (.creationTransaction|type=="string" and length>=64) and (.metadataTransaction|type=="string" and length>=64) and (.tokenAccountCreationTransaction|type=="string" and length>=64) and (.mintTransaction|type=="string" and length>=64) and (.mintAuthorityRevocationTransaction|type=="string" and length>=64) and (.freezeAuthorityRevocationTransaction|type=="string" and length>=64) and (.metadataUpdateAuthorityRevocationTransaction|type=="string" and length>=64) and (.metadataPointerAuthorityRevocationTransaction|type=="string" and length>=64)' solana/deployment-provenance.json >/dev/null
