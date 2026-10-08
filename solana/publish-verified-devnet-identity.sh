#!/usr/bin/env bash
set -euo pipefail

# Canonical GLR Solana Devnet publisher.
# This script is executed only by the authorized reconciliation workflow.
# It never creates or mutates a token; it only publishes identity after
# deployment provenance and independent on-chain reconciliation pass.

readonly EXPECTED_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
readonly EXPECTED_METADATA_URI="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json"
readonly EXCLUDED_MINT="FrJhrVGjNRiB1eZpg5PTqLp9VSQS5rpwMp7jxNtEmV9G"

test "${GITHUB_ACTIONS:-}" = "true"
test -n "${GH_TOKEN:-}"

jq -e '
  .status == "VERIFIED_ON_CHAIN"
  and .mode == "RECONCILIATION_READ_ONLY"
  and .network == "solana-devnet"
  and .programId == "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
  and .name == "GLORIFIER"
  and .symbol == "GLR"
  and .decimals == 9
  and .totalSupply == "1000000000"
  and .mintAuthority == null
  and .freezeAuthority == null
  and .metadataUri == "https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json"
  and .metadataUriInDisplay == true
  and .commitment == "finalized"
  and .finalized == true
  and .deploymentProvenanceVerified == true
  and (.transactionSemanticsVerified == true or .transactionSemanticsVerified == false)
  and .metadataPointerAuthority == null
  and .metadataUpdateAuthority == null
  and .metadataPointerAddress == .mint
  and .metadataMint == .mint
  and (.offChainMetadataSha256 | type == "string" and length == 64)
' solana/reconciliation-evidence.json >/dev/null

MINT="$(jq -r '.mint' solana/reconciliation-evidence.json)"
[[ "${MINT}" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]]
[[ "${MINT}" != "${EXCLUDED_MINT}" ]]

FOUND=0

# The reconciliation workflow may have consumed the dedicated existing-mint
# resume artifact instead of the original mint-creation workflow artifact.
# In that case deployment-provenance.json has already been digest-verified
# against the immutable resume artifact; validate that local proof and reuse it.
if [[ -f solana/deployment-provenance.json ]]; then
  jq -e --arg mint "${MINT}" '
    .network == "solana-devnet"
    and .status == "READY_FOR_VERIFICATION"
    and .programId == "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
    and .mint == $mint
    and (.deploymentRunId | type == "string" and length > 0)
    and (.provenanceSource == "IMMUTABLE_GITHUB_ACTIONS_JOB_LOG_PLUS_RESUME_EVIDENCE" or .provenanceSource == "IMMUTABLE_GITHUB_ACTIONS_ARTIFACT")
    and (.deploymentJobId | type == "string" and length > 0)
    and (.provenanceSource == "IMMUTABLE_GITHUB_ACTIONS_JOB_LOG_PLUS_RESUME_EVIDENCE" or .provenanceSource == "IMMUTABLE_GITHUB_ACTIONS_ARTIFACT")
  ' solana/deployment-provenance.json >/dev/null || {
    echo "::error::Local deployment provenance failed validation."
    exit 1
  }
  if jq -e '.replacementAuthorized == true' solana/deployment-provenance.json >/dev/null 2>&1; then
    jq -e --arg mint "${MINT}" '.replacementAuthorized == true and (.replacedMint | type == "string" and length >= 32 and length <= 44) and .replacedMint != $mint' solana/deployment-provenance.json >/dev/null || {
      echo "::error::Replacement provenance is invalid: the canonical mint must be distinct from the preserved irrecoverable mint."
      exit 1
    }
  fi
  FOUND=1
else
  RUNS_JSON="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/workflows/glorifier-solana-devnet.yml/runs?event=workflow_dispatch&branch=main&per_page=100")"

while IFS= read -r RUN_ID; do
  [[ -n "${RUN_ID}" ]] || continue
  RUN_JSON="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${RUN_ID}")"
  jq -e '
    .path == ".github/workflows/glorifier-solana-devnet.yml"
    and .event == "workflow_dispatch"
    and .head_branch == "main"
    and .conclusion == "success"
  ' <<<"${RUN_JSON}" >/dev/null || continue

  ARTIFACTS_JSON="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${RUN_ID}/artifacts?per_page=100")"

  while IFS=$'\t' read -r ARTIFACT_ID ARTIFACT_DIGEST; do
    [[ -n "${ARTIFACT_ID}" && -n "${ARTIFACT_DIGEST}" ]] || continue

    rm -rf /tmp/glorifier-publish-evidence
    mkdir -p /tmp/glorifier-publish-evidence
    gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${ARTIFACT_ID}/zip" > /tmp/glorifier-publish-evidence.zip

    ACTUAL="sha256:$(sha256sum /tmp/glorifier-publish-evidence.zip | awk '{print $1}')"
    test "${ACTUAL}" = "${ARTIFACT_DIGEST}"

    unzip -oq /tmp/glorifier-publish-evidence.zip -d /tmp/glorifier-publish-evidence
    EVIDENCE_FILE="$(find /tmp/glorifier-publish-evidence -type f -name deployment-evidence.json -print -quit || true)"
    [[ -n "${EVIDENCE_FILE}" ]] || continue

    jq -e --arg mint "${MINT}" --arg run_id "${RUN_ID}" --arg repo "${GITHUB_REPOSITORY}" '
      .network == "solana-devnet"
      and .status == "READY_FOR_VERIFICATION"
      and .programId == "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
      and .mint == $mint
      and .deploymentWorkflowRunId == $run_id
      and .deploymentWorkflowRunUrl == ("https://github.com/" + $repo + "/actions/runs/" + $run_id)
      and (.creationTransaction | type == "string" and length > 0)
      and (.metadataTransaction | type == "string" and length > 0)
      and (.tokenAccountCreationTransaction | type == "string" and length > 0)
      and (.mintTransaction | type == "string" and length > 0)
      and (.mintAuthorityRevocationTransaction | type == "string" and length > 0)
      and (.freezeAuthorityRevocationTransaction | type == "string" and length > 0)
      and (.metadataUpdateAuthorityRevocationTransaction | type == "string" and length > 0)
    ' "${EVIDENCE_FILE}" >/dev/null || continue

    jq --arg run_id "${RUN_ID}"        --arg run_url "https://github.com/${GITHUB_REPOSITORY}/actions/runs/${RUN_ID}"        --arg artifact_id "${ARTIFACT_ID}"        --arg artifact_digest "${ARTIFACT_DIGEST}"        '. + {deploymentRunId:$run_id,deploymentRunUrl:$run_url,deploymentArtifactId:$artifact_id,deploymentArtifactDigest:$artifact_digest}'        "${EVIDENCE_FILE}" > solana/deployment-provenance.json

    FOUND=1
    break 2
  done < <(
    jq -r '
      [.artifacts[]?
       | select(.expired == false)
       | select(.name == "glorifier-solana-devnet-evidence")
       | select(.digest != null and (.digest | startswith("sha256:")))]
      | sort_by(.created_at)
      | reverse
      | .[]
      | [(.id|tostring),.digest]
      | @tsv
    ' <<<"${ARTIFACTS_JSON}"
  )
done < <(
  jq -r '
    [.workflow_runs[]?
     | select(.event == "workflow_dispatch")
     | select(.head_branch == "main")
     | select(.path == ".github/workflows/glorifier-solana-devnet.yml")]
    | sort_by(.created_at)
    | reverse
    | .[].id
  ' <<<"${RUNS_JSON}"
)

fi

test "${FOUND}" -eq 1 || {
  echo "::error::No trusted successful deployment artifact matches the independently reconciled mint."
  exit 1
}

TRANSACTION_SEMANTICS_VERIFIED="$(jq -r '.transactionSemanticsVerified // false' solana/reconciliation-evidence.json)"
if [[ "$TRANSACTION_SEMANTICS_VERIFIED" == "true" ]]; then
  for FIELD in creationTransaction metadataTransaction tokenAccountCreationTransaction mintTransaction mintAuthorityRevocationTransaction freezeAuthorityRevocationTransaction metadataUpdateAuthorityRevocationTransaction metadataPointerAuthorityRevocationTransaction; do
    TX="$(jq -r --arg field "$FIELD" '.[$field] // empty' solana/deployment-provenance.json)"
    [[ "$TX" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]]
  done
else
  jq -e '.deploymentProvenanceVerified == true and .provenanceSource == "IMMUTABLE_GITHUB_ACTIONS_ARTIFACT"' solana/reconciliation-evidence.json >/dev/null
fi

METADATA_SHA256="$(jq -r '.offChainMetadataSha256' solana/reconciliation-evidence.json)"
[[ "$METADATA_SHA256" =~ ^[0-9a-f]{64}$ ]]

jq --arg mint "$MINT" \
   --arg creation "$(jq -r '.creationTransaction' solana/deployment-provenance.json)" \
   --arg metadata "$(jq -r '.metadataTransaction' solana/deployment-provenance.json)" \
   --arg account "$(jq -r '.tokenAccountCreationTransaction' solana/deployment-provenance.json)" \
   --arg mint_tx "$(jq -r '.mintTransaction' solana/deployment-provenance.json)" \
   --arg mint_auth "$(jq -r '.mintAuthorityRevocationTransaction' solana/deployment-provenance.json)" \
   --arg freeze_auth "$(jq -r '.freezeAuthorityRevocationTransaction' solana/deployment-provenance.json)" \
   --arg metadata_auth "$(jq -r '.metadataUpdateAuthorityRevocationTransaction' solana/deployment-provenance.json)" \
   --arg metadata_pointer_auth "$(jq -r '.metadataPointerAuthorityRevocationTransaction' solana/deployment-provenance.json)" \
   --arg metadata_sha256 "$METADATA_SHA256" \
   --arg transaction_semantics_verified "$TRANSACTION_SEMANTICS_VERIFIED" \
   --arg run_id "$GITHUB_RUN_ID" \
   --arg run_url "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" \
   --arg verified_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
  .canonical_mint=$mint
  | .creation_transaction=$creation
  | .metadata_transaction=$metadata
  | .token_account_creation_transaction=$account
  | .mint_transaction=$mint_tx
  | .authority_revocation_transaction=$mint_auth
  | .freeze_authority_revocation_transaction=$freeze_auth
  | .metadata_update_authority_revocation_transaction=$metadata_auth
  | .metadata_pointer_authority_revocation_transaction=$metadata_pointer_auth
  | .metadata_sha256=$metadata_sha256
  | .status="VERIFIED_ON_CHAIN"
  | .transaction_semantics_verified=($transaction_semantics_verified == "true")
  | .verification_run_id=$run_id
  | .verification_run_url=$run_url
  | .verified_at=$verified_at
  | .next_action="Independent finalized read-only reconciliation and deployment provenance verification passed; canonical publication still requires protected PR approval."
' solana/canonical-devnet-identity.json > solana/canonical-devnet-identity.json.tmp

mv solana/canonical-devnet-identity.json.tmp solana/canonical-devnet-identity.json

jq -e --arg mint "$MINT" --arg metadata_sha256 "$METADATA_SHA256" '
  .status == "VERIFIED_ON_CHAIN"
  and .canonical_mint == $mint
  and .metadata_sha256 == $metadata_sha256
  and .verification_run_id
  and .verification_run_url
  and .verified_at
  and (.transaction_semantics_verified == true or .transaction_semantics_verified == false)
' solana/canonical-devnet-identity.json >/dev/null

cat > solana/verified-publication.json <<EOF
{
  "status": "VERIFIED_ON_CHAIN",
  "mint": "${MINT}",
  "verificationRunId": "${GITHUB_RUN_ID}",
  "verificationRunUrl": "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}",
  "publishedBy": "GLORIFIER Solana Devnet reconciliation workflow"
}
EOF

BRANCH="automation/glorifier-solana-devnet-verified-${GITHUB_RUN_ID}"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git fetch origin main

EXISTING_PR="$(gh pr list --base main --head "${BRANCH}" --state open --json url --jq '.[0].url' | head -n1 || true)"
if [[ -n "${EXISTING_PR}" ]]; then
  echo "Verified identity publication PR already exists: ${EXISTING_PR}"
  exit 0
fi

git checkout -b "${BRANCH}"
# Reconciliation may legitimately finish without transaction JSON files when immutable
# artifact provenance is sufficient; never let an unmatched glob break publication.
shopt -s nullglob
STAGED_FILES=(
  solana/canonical-devnet-identity.json
  solana/deployment-provenance.json
  solana/verified-publication.json
  solana/reconciliation-evidence.json
  solana/reconciliation-metadata.json
  solana/reconciliation-tx-*.json
)
test "${#STAGED_FILES[@]}" -gt 0
git add "${STAGED_FILES[@]}"
git diff --cached --check
git commit -m "chore(solana): publish verified GLR devnet identity"

if git ls-remote --exit-code --heads origin "${BRANCH}" >/dev/null 2>&1; then
  git fetch origin "${BRANCH}"
  REMOTE_BRANCH_SHA="$(git rev-parse "refs/remotes/origin/${BRANCH}")"
  git push --force-with-lease="refs/heads/${BRANCH}:${REMOTE_BRANCH_SHA}" origin "${BRANCH}"
else
  git push --set-upstream origin "${BRANCH}"
fi

PR_URL="$(gh pr create   --base main   --head "${BRANCH}"   --title "chore(solana): publish verified GLR Devnet identity"   --body "Automated governed publication after independent Solana Devnet reconciliation and deployment-provenance verification.

- GLR mint: ${MINT}
- Verification run: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}
- Deployment provenance was independently checked before this PR.
- No token creation, minting, transfer, or authority mutation occurs in this publication step.
- Human/protected-branch approval remains required for canonical identity publication.")"
echo "Verified identity publication PR: ${PR_URL}"
