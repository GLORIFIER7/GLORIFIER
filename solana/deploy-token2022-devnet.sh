#!/usr/bin/env bash
set -euo pipefail

if [[ "${GLORIFIER_AUTHORIZED_WORKFLOW:-}" != "true" || -z "${GITHUB_ACTIONS:-}" ]]; then
  echo "::error::Direct Token-2022 mint creation is disabled."
  echo "::error::Use .github/workflows/glorifier-solana-devnet.yml with explicit authorization."
  exit 1
fi
if [[ -f solana/devnet-deployment-recovery.json && -z "${EXISTING_MINT:-}" ]]; then
  if [[ "${REPLACEMENT_AUTHORIZED:-}" != "true" || ! -f solana/replacement-authorization.json ]]; then
    echo "::error::Replacement mint creation is blocked: an existing recovered Devnet mint is already recorded."
    echo "::error::A replacement requires the workflow's explicit controlled replacement authorization gate."
    exit 1
  fi
  jq -e '.status == "AUTHORIZED" and (.replacedMint | type == "string" and length >= 32 and length <= 44)' solana/replacement-authorization.json >/dev/null || {
    echo "::error::Replacement authorization artifact is invalid."
    exit 1
  }
fi
# GLORIFIER GLR — Solana Token-2022 Devnet deployment.
# This script creates a new mint ONLY when invoked by the authorized
# deployment workflow. The workflow has a pre-deployment replay/evidence
# gate; once evidence exists, future deployments must use reconciliation.
#
# No private key is stored in this repository.

readonly DECIMALS=9
readonly SUPPLY=1000000000
readonly METADATA_URI="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json"
readonly TOKEN_2022_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"

write_evidence() {
  local status="$1"
  local creation_tx="${CREATE_TOKEN_TX:-}"
  local metadata_tx="${METADATA_TX:-}"
  local account_tx="${CREATE_ACCOUNT_TX:-}"
  local mint_tx="${MINT_TX:-}"
  local mint_auth_tx="${MINT_AUTH_TX:-}"
  local freeze_auth_tx="${FREEZE_AUTH_TX:-}"
  local metadata_auth_tx="${METADATA_AUTH_TX:-}"

  json_or_null() {
    if [[ -n "$1" ]]; then
      jq -Rn --arg value "$1" '$value'
    else
      printf 'null'
    fi
  }

  cat > solana/deployment-evidence.json <<EOF
{
  "network": "solana-devnet",
  "status": "$status",
  "mint": "$MINT",
  "programId": "$TOKEN_2022_PROGRAM",
  "name": "GLORIFIER",
  "symbol": "GLR",
  "decimals": $DECIMALS,
  "totalSupply": "$SUPPLY",
  "mintAuthority": null,
  "freezeAuthority": null,
  "creationTransaction": $(json_or_null "$creation_tx"),
  "metadataTransaction": $(json_or_null "$metadata_tx"),
  "tokenAccountCreationTransaction": $(json_or_null "$account_tx"),
  "mintTransaction": $(json_or_null "$mint_tx"),
  "mintAuthorityRevocationTransaction": $(json_or_null "$mint_auth_tx"),
  "freezeAuthorityRevocationTransaction": $(json_or_null "$freeze_auth_tx"),
  "metadataUpdateAuthorityRevocationTransaction": $(json_or_null "$metadata_auth_tx"),
  "deploymentWorkflowRunId": $(json_or_null "${GITHUB_RUN_ID:-}"),
  "deploymentWorkflowRunUrl": $(json_or_null "${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-GLORIFIER7/GLORIFIER}/actions/runs/${GITHUB_RUN_ID:-}")
}
EOF
}
if [[ -n "${EXISTING_MINT:-}" ]]; then
  MINT="${EXISTING_MINT}"
  echo "::notice::Resuming existing partially deployed Token-2022 mint: ${MINT}"
  test "${MINT}" != "$(jq -r '.mint // empty' solana/devnet-deployment-recovery.json 2>/dev/null || true)" || { echo "::error::Refusing to operate on the irrecoverable recovered mint."; exit 1; }
  CREATE_TOKEN_TX=""
else
  MINT_OUTPUT="$(spl-token --program-2022 create-token --decimals "$DECIMALS" --mint-authority "$HOME/.config/solana/glorifier-devnet-keypair.json" --enable-metadata)"
  printf '%s\n' "$MINT_OUTPUT"
fi

# spl-token 5.x prints the mint in both the "Creating token <MINT>" line and
# the "Address: <MINT>" line. Never derive the mint from Signature: — a
# transaction signature is a different base58 value and may be mistaken for
# the mint when parsed by field position.
if [[ -z "${EXISTING_MINT:-}" ]]; then
  CREATED_MINT="$(printf '%s\n' "$MINT_OUTPUT" | awk '/^[[:space:]]*Creating token[[:space:]]+/ {print $3; exit}')"
  MINT="$(printf '%s\n' "$MINT_OUTPUT" | awk '/^[[:space:]]*Address:[[:space:]]+/ {print $2; exit}')"
  CREATE_TOKEN_TX="$(printf '%s\n' "$MINT_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:[[:space:]]+/ {print $2; exit}')"
  test -n "$CREATED_MINT" && test -n "$MINT" && test -n "$CREATE_TOKEN_TX" || { echo "::error::Could not recover new Token-2022 mint evidence."; exit 1; }
  [[ "$CREATED_MINT" == "$MINT" ]] || { echo "::error::Token-2022 CLI returned conflicting mint addresses."; exit 1; }
  [[ "$MINT" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || { echo "::error::spl-token returned an invalid Solana mint address."; exit 1; }
fi

echo "MINT=$MINT"
echo "CREATE_TOKEN_TX=$CREATE_TOKEN_TX"

# Persist a non-verified receipt immediately after the mint transaction returns.
# This gives the workflow an artifact-based replay lock even if a later step fails.
write_evidence "DEPLOYED"

DISPLAY_BEFORE="$(spl-token --program-2022 display "$MINT")"
if printf '%s\n' "$DISPLAY_BEFORE" | grep -Fq 'Name: GLORIFIER' && printf '%s\n' "$DISPLAY_BEFORE" | grep -Fq 'Symbol: GLR'; then
  echo "GLORIFIER/GLR metadata already initialized; continuing."
  METADATA_TX=""
else
  METADATA_OUTPUT="$(spl-token --program-2022 initialize-metadata "$MINT" "GLORIFIER" "GLR" "$METADATA_URI")"
  printf '%s\n' "$METADATA_OUTPUT"
  METADATA_TX="$(printf '%s\n' "$METADATA_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "$METADATA_TX" || { echo "::error::Could not recover metadata transaction signature."; exit 1; }
fi

if ACCOUNT_OUTPUT="$(spl-token --program-2022 create-account "$MINT" 2>&1)"; then
  printf '%s\n' "$ACCOUNT_OUTPUT"
  CREATE_ACCOUNT_TX="$(printf '%s\n' "$ACCOUNT_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "$CREATE_ACCOUNT_TX" || { echo "::error::Could not recover token-account creation transaction signature."; exit 1; }
else
  echo "Token account creation was not needed or the account already exists; continuing."
  CREATE_ACCOUNT_TX=""
fi

ACTUAL_SUPPLY="$(spl-token --program-2022 supply "$MINT" | awk 'NR==1 {print $1}' | tr -d '\r')"
if [[ "$ACTUAL_SUPPLY" == "$SUPPLY" ]]; then
  echo "Supply already equals ${SUPPLY}; continuing."
  MINT_TX=""
else
  MINT_OUTPUT_2="$(spl-token --program-2022 mint "$MINT" "$SUPPLY")"
  printf '%s\n' "$MINT_OUTPUT_2"
  MINT_TX="$(printf '%s\n' "$MINT_OUTPUT_2" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "$MINT_TX" || { echo "::error::Could not recover supply mint transaction signature."; exit 1; }
fi

# Permanently remove authorities after the exact supply is minted.
MINT_AUTH_OUTPUT="$(spl-token --program-2022 authorize "$MINT" mint --disable)"
printf '%s\n' "$MINT_AUTH_OUTPUT"
MINT_AUTH_TX="$(printf '%s\n' "$MINT_AUTH_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
test -n "$MINT_AUTH_TX" || { echo "::error::Could not recover mint-authority revocation transaction signature."; exit 1; }

FINAL_MINT_STATE_PRE_FREEZE="$(spl-token --program-2022 display "$MINT")"
if printf '%s\n' "$FINAL_MINT_STATE_PRE_FREEZE" | grep -Eiq 'Freeze[[:space:]]+Authority.*(None|\(not set\))'; then
  echo "Freeze authority is already disabled; continuing."
  FREEZE_AUTH_TX=""
else
  FREEZE_AUTH_OUTPUT="$(spl-token --program-2022 authorize "$MINT" freeze --disable)"
  printf '%s\n' "$FREEZE_AUTH_OUTPUT"
  FREEZE_AUTH_TX="$(printf '%s\n' "$FREEZE_AUTH_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
  test -n "$FREEZE_AUTH_TX" || { echo "::error::Could not recover freeze-authority revocation transaction signature."; exit 1; }
fi

METADATA_AUTH_OUTPUT="$(spl-token --program-2022 authorize "$MINT" metadata --disable)"
printf '%s\n' "$METADATA_AUTH_OUTPUT"
METADATA_AUTH_TX="$(printf '%s\n' "$METADATA_AUTH_OUTPUT" | awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}')"
test -n "$METADATA_AUTH_TX" || { echo "::error::Could not recover metadata-update-authority revocation transaction signature."; exit 1; }

BALANCE_OUTPUT="$(spl-token --program-2022 balance "$MINT")"
printf '%s\n' "$BALANCE_OUTPUT"
HOLDER_BALANCE="$(printf '%s\n' "$BALANCE_OUTPUT" | awk 'NR==1 {print $1}' | tr -d '\r')"
test "$HOLDER_BALANCE" = "$SUPPLY"

echo "Final mint state:"
FINAL_MINT_STATE="$(spl-token --program-2022 display "$MINT")"
printf '%s\n' "$FINAL_MINT_STATE"
printf '%s\n' "$FINAL_MINT_STATE" | grep -Eiq 'Mint[[:space:]]+Authority.*None'
printf '%s\n' "$FINAL_MINT_STATE" | grep -Eiq 'Freeze[[:space:]]+Authority.*None'

# Keep the receipt truthful: final workflow verification is performed separately.
write_evidence "READY_FOR_VERIFICATION"
