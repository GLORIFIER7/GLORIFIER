#!/usr/bin/env bash
set -euo pipefail
readonly EXPECTED_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
test "\${GITHUB_ACTIONS:-}" = "true"; test -n "\${GH_TOKEN:-}"
jq -e '.status=="VERIFIED_ON_CHAIN" and .network=="solana-mainnet" and .programId=="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" and .name=="GLORIFIER" and .symbol=="GLR" and .decimals==9 and .totalSupply=="1000000000" and .mintAuthority==null and .freezeAuthority==null and .metadataUriInDisplay==true' solana/reconciliation-mainnet-evidence.json >/dev/null
MINT="$(jq -r '.mint' solana/reconciliation-mainnet-evidence.json)"
RUNS_JSON="$(gh api "/repos/\${GITHUB_REPOSITORY}/actions/workflows/glorifier-solana-mainnet-release.yml/runs?event=workflow_dispatch&branch=main&per_page=100")"
FOUND=0
while IFS= read -r RUN_ID; do
  [[ -n "$RUN_ID" ]] || continue
  RUN_JSON="$(gh api "/repos/\${GITHUB_REPOSITORY}/actions/runs/\${RUN_ID}")"
  jq -e '.path==".github/workflows/glorifier-solana-mainnet-release.yml" and .event=="workflow_dispatch" and .head_branch=="main" and .conclusion=="success"' <<<"$RUN_JSON" >/dev/null || continue
  ARTIFACTS_JSON="$(gh api "/repos/\${GITHUB_REPOSITORY}/actions/runs/\${RUN_ID}/artifacts?per_page=100")"
  while IFS=$'\t' read -r ARTIFACT_ID ARTIFACT_DIGEST; do
    [[ -n "$ARTIFACT_ID" && -n "$ARTIFACT_DIGEST" ]] || continue
    rm -rf /tmp/glorifier-mainnet-evidence; mkdir -p /tmp/glorifier-mainnet-evidence
    gh api "/repos/\${GITHUB_REPOSITORY}/actions/artifacts/\${ARTIFACT_ID}/zip" > /tmp/glorifier-mainnet-evidence.zip
    test "sha256:$(sha256sum /tmp/glorifier-mainnet-evidence.zip | awk '{print $1}')" = "$ARTIFACT_DIGEST"
    unzip -oq /tmp/glorifier-mainnet-evidence.zip -d /tmp/glorifier-mainnet-evidence
    EVIDENCE_FILE="$(find /tmp/glorifier-mainnet-evidence -type f -name deployment-mainnet-evidence.json -print -quit || true)"
    [[ -n "$EVIDENCE_FILE" ]] || continue
    jq -e --arg mint "$MINT" --arg run_id "$RUN_ID" --arg repo "$GITHUB_REPOSITORY" '.network=="solana-mainnet" and .status=="READY_FOR_VERIFICATION" and .programId=="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" and .mint==$mint and .deploymentWorkflowRunId==$run_id and .deploymentWorkflowRunUrl==("https://github.com/"+$repo+"/actions/runs/"+$run_id)' "$EVIDENCE_FILE" >/dev/null || continue
    jq --arg run_id "$RUN_ID" --arg run_url "https://github.com/\${GITHUB_REPOSITORY}/actions/runs/\${RUN_ID}" --arg artifact_id "$ARTIFACT_ID" --arg artifact_digest "$ARTIFACT_DIGEST" '. + {deploymentRunId:$run_id,deploymentRunUrl:$run_url,deploymentArtifactId:$artifact_id,deploymentArtifactDigest:$artifact_digest}' "$EVIDENCE_FILE" > solana/deployment-mainnet-provenance.json
    FOUND=1; break 2
  done < <(jq -r '[.artifacts[]? | select(.expired==false) | select(.name=="glorifier-solana-mainnet-evidence") | select(.digest!=null and (.digest|startswith("sha256:")))] | sort_by(.created_at) | reverse | .[] | [(.id|tostring),.digest] | @tsv' <<<"$ARTIFACTS_JSON")
done < <(jq -r '[.workflow_runs[]? | select(.event=="workflow_dispatch") | select(.head_branch=="main") | select(.path==".github/workflows/glorifier-solana-mainnet-release.yml")] | sort_by(.created_at) | reverse | .[].id' <<<"$RUNS_JSON")
test "$FOUND" -eq 1 || { echo "::error::No trusted successful mainnet deployment artifact matches the reconciled mint."; exit 1; }
for FIELD in creationTransaction metadataTransaction tokenAccountCreationTransaction mintTransaction mintAuthorityRevocationTransaction freezeAuthorityRevocationTransaction; do TX="$(jq -r --arg field "$FIELD" '.[$field]' solana/deployment-mainnet-provenance.json)"; [[ "$TX" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]]; solana confirm "$TX" --commitment confirmed >/dev/null; done
jq --arg mint "$MINT" --arg creation "$(jq -r '.creationTransaction' solana/deployment-mainnet-provenance.json)" --arg metadata "$(jq -r '.metadataTransaction' solana/deployment-mainnet-provenance.json)" --arg account "$(jq -r '.tokenAccountCreationTransaction' solana/deployment-mainnet-provenance.json)" --arg mint_tx "$(jq -r '.mintTransaction' solana/deployment-mainnet-provenance.json)" --arg mint_auth "$(jq -r '.mintAuthorityRevocationTransaction' solana/deployment-mainnet-provenance.json)" --arg freeze_auth "$(jq -r '.freezeAuthorityRevocationTransaction' solana/deployment-mainnet-provenance.json)" --arg run_id "$GITHUB_RUN_ID" --arg run_url "\${GITHUB_SERVER_URL}/\${GITHUB_REPOSITORY}/actions/runs/\${GITHUB_RUN_ID}" --arg verified_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '.canonical_mint=$mint | .creation_transaction=$creation | .metadata_transaction=$metadata | .token_account_creation_transaction=$account | .mint_transaction=$mint_tx | .authority_revocation_transaction=$mint_auth | .freeze_authority_revocation_transaction=$freeze_auth | .status="VERIFIED_ON_CHAIN" | .mainnet_status="FULLY_VERIFIED" | .verification_run_id=$run_id | .verification_run_url=$run_url | .verified_at=$verified_at | .next_action="Mainnet GLR deployment independently reconciled and transaction provenance confirmed."' solana/canonical-mainnet-identity.json > solana/canonical-mainnet-identity.json.tmp
mv solana/canonical-mainnet-identity.json.tmp solana/canonical-mainnet-identity.json
git config user.name "github-actions[bot]"; git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git fetch origin main; git rebase origin/main
git add solana/canonical-mainnet-identity.json solana/deployment-mainnet-provenance.json
git commit -m "chore(solana): publish verified GLR mainnet identity"
git push origin HEAD:main
