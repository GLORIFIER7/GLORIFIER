#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
test "${GITHUB_ACTIONS:-}" = "true"
test -n "${GH_TOKEN:-}"

jq -e '.status=="VERIFIED_ON_CHAIN" and .network=="solana-mainnet" and .programId=="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" and .name=="GLORIFIER" and .symbol=="GLR" and .decimals==9 and .totalSupply=="1000000000" and .mintAuthority==null and .freezeAuthority==null and .metadataUriInDisplay==true and .commitment=="finalized" and .finalized==true and .transactionSemanticsVerified==true and .metadataPointerAuthority==null and .metadataUpdateAuthority==null' solana/reconciliation-mainnet-evidence.json >/dev/null
MINT="$(jq -r '.mint' solana/reconciliation-mainnet-evidence.json)"

ARTIFACTS_JSON="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/artifacts?per_page=100")"
ARTIFACT_ROW="$(jq -r '[.artifacts[]? | select(.expired==false) | select(.name=="glorifier-solana-mainnet-evidence") | select(.digest!=null and (.digest|startswith("sha256:")))] | sort_by(.created_at) | last | [(.id|tostring),.digest] | @tsv' <<<"$ARTIFACTS_JSON")"
IFS=$'	' read -r ARTIFACT_ID ARTIFACT_DIGEST <<<"$ARTIFACT_ROW"
test -n "$ARTIFACT_ID" && test -n "$ARTIFACT_DIGEST"

rm -rf /tmp/glorifier-mainnet-publish
mkdir -p /tmp/glorifier-mainnet-publish
gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/$ARTIFACT_ID/zip" > /tmp/glorifier-mainnet-publish.zip
test "sha256:$(sha256sum /tmp/glorifier-mainnet-publish.zip | awk '{print $1}')" = "$ARTIFACT_DIGEST"
unzip -oq /tmp/glorifier-mainnet-publish.zip -d /tmp/glorifier-mainnet-publish
EVIDENCE_FILE="$(find /tmp/glorifier-mainnet-publish -type f -name deployment-mainnet-evidence.json -print -quit)"
test -n "$EVIDENCE_FILE"

jq -e --arg mint "$MINT" --arg run_id "$GITHUB_RUN_ID" --arg repo "$GITHUB_REPOSITORY" '
  .network=="solana-mainnet"
  and .status=="READY_FOR_VERIFICATION"
  and .programId=="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
  and .mint==$mint
  and .deploymentWorkflowRunId==$run_id
  and .deploymentWorkflowRunUrl==("https://github.com/"+$repo+"/actions/runs/"+$run_id)
' "$EVIDENCE_FILE" >/dev/null

jq --arg run_id "$GITHUB_RUN_ID" --arg run_url "https://github.com/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}" --arg artifact_id "$ARTIFACT_ID" --arg artifact_digest "$ARTIFACT_DIGEST" '. + {deploymentRunId:$run_id,deploymentRunUrl:$run_url,deploymentArtifactId:$artifact_id,deploymentArtifactDigest:$artifact_digest}' "$EVIDENCE_FILE" > solana/deployment-mainnet-provenance.json

for FIELD in creationTransaction metadataTransaction tokenAccountCreationTransaction mintTransaction mintAuthorityRevocationTransaction freezeAuthorityRevocationTransaction metadataUpdateAuthorityRevocationTransaction; do
  TX="$(jq -r --arg field "$FIELD" '.[$field]' solana/deployment-mainnet-provenance.json)"
  [[ "$TX" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]]
  solana confirm "$TX" --commitment finalized >/dev/null
done

jq --arg mint "$MINT"   --arg creation "$(jq -r '.creationTransaction' solana/deployment-mainnet-provenance.json)"   --arg metadata "$(jq -r '.metadataTransaction' solana/deployment-mainnet-provenance.json)"   --arg account "$(jq -r '.tokenAccountCreationTransaction' solana/deployment-mainnet-provenance.json)"   --arg mint_tx "$(jq -r '.mintTransaction' solana/deployment-mainnet-provenance.json)"   --arg mint_auth "$(jq -r '.mintAuthorityRevocationTransaction' solana/deployment-mainnet-provenance.json)"   --arg freeze_auth "$(jq -r '.freezeAuthorityRevocationTransaction' solana/deployment-mainnet-provenance.json)" --arg metadata_auth "$(jq -r '.metadataUpdateAuthorityRevocationTransaction' solana/deployment-mainnet-provenance.json)"   --arg run_id "$GITHUB_RUN_ID"   --arg run_url "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"   --arg verified_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"   '.canonical_mint=$mint | .creation_transaction=$creation | .metadata_transaction=$metadata | .token_account_creation_transaction=$account | .mint_transaction=$mint_tx | .authority_revocation_transaction=$mint_auth | .freeze_authority_revocation_transaction=$freeze_auth | .metadata_update_authority_revocation_transaction=$metadata_auth | .status="VERIFIED_ON_CHAIN" | .mainnet_status="FULLY_VERIFIED" | .verification_run_id=$run_id | .verification_run_url=$run_url | .verified_at=$verified_at | .next_action="Mainnet GLR deployment independently reconciled and transaction provenance confirmed."'   solana/canonical-mainnet-identity.json > solana/canonical-mainnet-identity.json.tmp
mv solana/canonical-mainnet-identity.json.tmp solana/canonical-mainnet-identity.json

cat > solana/verified-mainnet-publication.json <<EOF
{
  "status": "VERIFIED_ON_CHAIN",
  "mainnetStatus": "FULLY_VERIFIED",
  "mint": "${MINT}",
  "verificationRunId": "${GITHUB_RUN_ID}",
  "verificationRunUrl": "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}",
  "publishedBy": "GLORIFIER Solana Mainnet release workflow"
}
EOF

BRANCH="automation/glorifier-solana-mainnet-verified-${GITHUB_RUN_ID}"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git fetch origin main
git checkout -b "${BRANCH}"
git add solana/canonical-mainnet-identity.json solana/deployment-mainnet-provenance.json solana/verified-mainnet-publication.json
git diff --cached --check
git commit -m "chore(solana): publish verified GLR mainnet identity"
git push --set-upstream origin "${BRANCH}"

EXISTING_PR="$(gh pr list --base main --head "${BRANCH}" --state open --json url --jq '.[0].url' | head -n1 || true)"
if [[ -n "${EXISTING_PR}" ]]; then
  echo "Verified mainnet identity publication PR already exists: ${EXISTING_PR}"
  exit 0
fi

PR_URL="$(gh pr create \
  --base main \
  --head "${BRANCH}" \
  --title "chore(solana): publish verified GLR Mainnet identity" \
  --body "Automated governed publication after independent Solana Mainnet reconciliation and deployment-provenance verification.

- GLR mint: ${MINT}
- Verification run: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}
- Deployment provenance was independently checked before this PR.
- No token creation, minting, transfer, or authority mutation occurs in this publication step.
- Human/protected-branch approval remains required for canonical Mainnet identity publication.")"
echo "Verified mainnet identity publication PR: ${PR_URL}"
