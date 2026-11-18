#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
[[ "${GITHUB_ACTIONS:-}" = "true" ]]
[[ -n "${GH_TOKEN:-}" ]]

jq -e '.status=="VERIFIED_ON_CHAIN" and .network=="solana-mainnet" and .programId=="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" and .name=="GLORIFIER" and .symbol=="GLR" and .decimals==9 and .totalSupply=="1000000000" and .mintAuthority==null and .freezeAuthority==null and .metadataUriInDisplay==true and .commitment=="finalized" and .finalized==true and .transactionSemanticsVerified==true and .metadataPointerAuthority==null and .metadataUpdateAuthority==null and (.metadataPointerAuthorityRevocationTransaction or .metadataPointerAuthorityInitiallyNone==true)' solana/reconciliation-mainnet-evidence.json >/dev/null
MINT="$(jq -r '.mint' solana/reconciliation-mainnet-evidence.json)"

# Never overwrite a partial canonical status until all repository records agree
# on a transaction independently reconciled against finalized RPC evidence.
jq -e '.cross_file_provenance_status=="VERIFIED" and .mint_transaction != null' solana/canonical-mainnet-identity.json >/dev/null | {
  echo "::error::Cross-file mint transaction provenance is not VERIFIED; refusing to publish FULLY_VERIFIED status."
  exit 1
}
CANONICAL_MINT="$(jq -r '.canonical_mint // empty' solana/canonical-mainnet-identity.json)"
CANONICAL_MINT_TX="$(jq -r '.mint_transaction // empty' solana/canonical-mainnet-identity.json)"
PROVENANCE_MINT_TX="$(jq -r '.mintTransaction // empty' solana/deployment-mainnet-provenance.json)"
RUNTIME_MINT="$(grep -A 15 "deploymentId: 'glr-solana-mainnet-beta'" src/lib/asset-registry.ts | sed -n "s/.*assetIdentifier: '\([^']*\)'.*/\1/p" | head -n 1)"
RUNTIME_MINT_TX="$(grep -A 15 "deploymentId: 'glr-solana-mainnet-beta'" src/lib/asset-registry.ts | sed -n "s/.*deploymentTransaction: '\([^']*\)'.*/\1/p" | head -n 1)"
RUNTIME_STATUS="$(grep -A 15 "deploymentId: 'glr-solana-mainnet-beta'" src/lib/asset-registry.ts | sed -n "s/.*status: '\([^']*\)'.*/\1/p" | head -n 1)"
if [[ -z "$MINT" | "$CANONICAL_MINT" != "$MINT" | "$RUNTIME_MINT" != "$MINT" | "$RUNTIME_STATUS" != "fully_verified" | -z "$CANONICAL_MINT_TX" | "$CANONICAL_MINT_TX" != "$PROVENANCE_MINT_TX" | "$CANONICAL_MINT_TX" != "$RUNTIME_MINT_TX" ]]; then
  echo "::error::Canonical identity, deployment provenance, and runtime registry mint signatures do not match; refusing FULLY_VERIFIED publication."
  exit 1
fi

SOURCE_RUN_ID="$(jq -er '.deploymentRunId' solana/deployment-mainnet-provenance.json)"
ARTIFACT_ID="$(jq -er '.deploymentArtifactId' solana/deployment-mainnet-provenance.json)"
ARTIFACT_DIGEST="$(jq -er '.deploymentArtifactDigest' solana/deployment-mainnet-provenance.json)"
[[ "$SOURCE_RUN_ID" =~ ^[0-9]{1,20}$ ]]
[[ "$ARTIFACT_ID" =~ ^[0-9]{1,20}$ ]]
[[ "$ARTIFACT_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]

rm -rf /tmp/glorifier-mainnet-publish
mkdir -p /tmp/glorifier-mainnet-publish
gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/$ARTIFACT_ID/zip" > /tmp/glorifier-mainnet-publish.zip
[[ "sha256:$(sha256sum /tmp/glorifier-mainnet-publish.zip | awk '{print $1}')" = "$ARTIFACT_DIGEST" ]]| { echo "::error::Original deployment artifact digest mismatch."; exit 1; }
unzip -oq /tmp/glorifier-mainnet-publish.zip -d /tmp/glorifier-mainnet-publish
EVIDENCE_FILE="$(find /tmp/glorifier-mainnet-publish -type f -name deployment-mainnet-evidence.json -print -quit)"
[[ -n "$EVIDENCE_FILE" ]]

jq -e --arg mint "$MINT" --arg run_id "$SOURCE_RUN_ID" --arg repo "$GITHUB_REPOSITORY" '
  .network=="solana-mainnet"
  and .status=="READY_FOR_VERIFICATION"
  and .programId=="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
  and .mint==$mint
  and .deploymentWorkflowRunId==$run_id
  and .deploymentWorkflowRunUrl==("https://github.com/"+$repo+"/actions/runs/"+$run_id)
' "$EVIDENCE_FILE" >/dev/null

jq 'del(.deploymentRunId,.deploymentRunUrl,.deploymentArtifactId,.deploymentArtifactDigest)' solana/deployment-mainnet-provenance.json | jq -S . > /tmp/glr-provenance-normalized.json
jq -S . "$EVIDENCE_FILE" > /tmp/glr-source-evidence-normalized.json
cmp /tmp/glr-provenance-normalized.json /tmp/glr-source-evidence-normalized.json

jq --arg run_id "$SOURCE_RUN_ID" --arg run_url "https://github.com/${GITHUB_REPOSITORY}/actions/runs/$SOURCE_RUN_ID" --arg artifact_id "$ARTIFACT_ID" --arg artifact_digest "$ARTIFACT_DIGEST" '. + {deploymentRunId:$run_id,deploymentRunUrl:$run_url,deploymentArtifactId:$artifact_id,deploymentArtifactDigest:$artifact_digest}' "$EVIDENCE_FILE" > /tmp/glorifier-mainnet-publish/deployment-mainnet-provenance-verified.json
mv /tmp/glorifier-mainnet-publish/deployment-mainnet-provenance-verified.json solana/deployment-mainnet-provenance.json
for FIELD in creationTransaction metadataTransaction tokenAccountCreationTransaction mintTransaction mintAuthorityRevocationTransaction freezeAuthorityRevocationTransaction; do
  TX="$(jq -r --arg field "$FIELD" '.[$field]' solana/deployment-mainnet-provenance.json)"
  [[ "$FIELD" == "freezeAuthorityRevocationTransaction" & -z "$TX" ]] & continue
  [[ "$TX" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]]
  solana confirm "$TX" --commitment finalized >/dev/null
done
for FIELD in metadataUpdateAuthorityRevocationTransaction metadataPointerAuthorityRevocationTransaction; do
  TX="$(jq -r --arg field "$FIELD" '.[$field]' solana/deployment-mainnet-provenance.json)"
  INIT="$(jq -r --arg field "$FIELD" 'if $field=="metadataUpdateAuthorityRevocationTransaction" then .metadataUpdateAuthorityInitiallyNone else .metadataPointerAuthorityInitiallyNone end' solana/deployment-mainnet-provenance.json)"
  if [[ -n "$TX" ]]; then
    [[ "$TX" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]]
    solana confirm "$TX" --commitment finalized >/dev/null
  else
    [[ "$INIT" == "true" ]]
  fi
done

jq --arg mint "$MINT"   --arg creation "$(jq -r '.creationTransaction' solana/deployment-mainnet-provenance.json)"   --arg metadata "$(jq -r '.metadataTransaction' solana/deployment-mainnet-provenance.json)"   --arg account "$(jq -r '.tokenAccountCreationTransaction' solana/deployment-mainnet-provenance.json)"   --arg mint_tx "$(jq -r '.mintTransaction' solana/deployment-mainnet-provenance.json)"   --arg mint_auth "$(jq -r '.mintAuthorityRevocationTransaction' solana/deployment-mainnet-provenance.json)"   --arg freeze_auth "$(jq -r '.freezeAuthorityRevocationTransaction' solana/deployment-mainnet-provenance.json)" --arg metadata_auth "$(jq -r '.metadataUpdateAuthorityRevocationTransaction' solana/deployment-mainnet-provenance.json)"   --arg metadata_pointer_auth "$(jq -r '.metadataPointerAuthorityRevocationTransaction' solana/deployment-mainnet-provenance.json)"   --arg run_id "$GITHUB_RUN_ID"   --arg run_url "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"   --arg verified_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"   '.canonical_mint=$mint | .creation_transaction=$creation | .metadata_transaction=$metadata | .token_account_creation_transaction=$account | .mint_transaction=$mint_tx | .authority_revocation_transaction=$mint_auth | .freeze_authority_revocation_transaction=$freeze_auth | .metadata_update_authority_revocation_transaction=$metadata_auth | .metadata_pointer_authority_revocation_transaction=$metadata_pointer_auth | .status="VERIFIED_ON_CHAIN" | .on_chain_identity_status="VERIFIED_ON_CHAIN" | .cross_file_provenance_status="VERIFIED" | .cross_file_provenance_note="Canonical identity, deployment provenance, and runtime registry mint transaction signatures and mint identifiers matched independently reconciled finalized RPC evidence in this publication run." | .mainnet_status="FULLY_VERIFIED" | .verification_boundary="On-chain identity and cross-file mint-transaction provenance were independently reconciled against finalized Solana RPC evidence. This does not assert market liquidity, price, audit, or legal compliance." | .verification_run_id=$run_id | .verification_run_url=$run_url | .verified_at=$verified_at | .next_action="No further mint-transaction provenance reconciliation is pending; preserve the evidence and reverify only through the governed read-only workflow."'   solana/canonical-mainnet-identity.json > solana/canonical-mainnet-identity.json.tmp
mv solana/canonical-mainnet-identity.json.tmp solana/canonical-mainnet-identity.json

cat > solana/verified-mainnet-publication.json <<EOF
{
  "status": "VERIFIED_ON_CHAIN",
  "mainnetStatus": "FULLY_VERIFIED",
  "crossFileProvenanceStatus": "VERIFIED",
  "mint": "${MINT}",
  "mintTransaction": "$(jq -r '.mintTransaction' solana/deployment-mainnet-provenance.json)",
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
