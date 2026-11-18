#!/usr/bin/env bash
set -euo pipefail

readonly TOKEN_2022_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
readonly SUPPLY=1000000000
readonly METADATA_URI="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json"
readonly MINT="${1:-}"
readonly EVIDENCE_FILE="solana/devnet-resume-evidence.json"
readonly SIGNATURE_PATTERN='^[1-9A-HJ-NP-Za-km-z]{64,88}$'

if [[ "${GLORIFIER_AUTHORIZED_WORKFLOW:-}" != "true" || -z "${GITHUB_ACTIONS:-}" ]]; then
  echo "::error::Recovered-mint resume is disabled outside the authorized GitHub Actions deployment workflow."
  exit 1
fi
[[ "${MINT}" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || { echo "::error::Invalid recovered Solana mint address."; exit 1; }
: "${SOLANA_RPC_URL:?SOLANA_RPC_URL is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${GITHUB_SERVER_URL:?GITHUB_SERVER_URL is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

solana config set --url "${SOLANA_RPC_URL}" --keypair "${HOME}/.config/solana/glorifier-devnet-keypair.json" >/dev/null
SIGNER="$(solana address)"
DISPLAY="$(spl-token --program-2022 display "${MINT}")"
printf '%s\n' "${DISPLAY}" | grep -Fq "Program: ${TOKEN_2022_PROGRAM}"

capture_sig() {
  awk -F': ' '/^[[:space:]]*Signature:/ {print $2; exit}'
}

read_field() {
  local field_name="$1"
  awk -F: -v field_name="${field_name}" '
    {
      label = $1
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", label)
      if (tolower(label) == tolower(field_name)) {
        sub(/^[^:]*:[[:space:]]*/, "")
        gsub(/^[[:space:]]+|[[:space:]]+$/, "")
        print
        exit
      }
    }
  '
}

read_pointer_authority() {
  awk '
    /Metadata Pointer:/ {in_pointer=1; next}
    in_pointer && /^[[:space:]]*Authority:/ {
      sub(/^[^:]*:[[:space:]]*/, "")
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      print
      exit
    }
    in_pointer && /^$/ {exit}
  '
}

is_disabled() {
  [[ "$1" == "None" || "$1" == "Disabled" || "$1" == "(not set)" ]]
}

require_signature() {
  local signature="$1"
  local label="$2"
  if [[ ! "${signature}" =~ ${SIGNATURE_PATTERN} ]]; then
    echo "::error::Missing or invalid ${label} transaction signature; refusing to publish recovery evidence."
    exit 1
  fi
}
verify_finalized_transaction() {
  local signature="$1"
  local label="$2"
  local expected_types="$3"
  local expected_authority_type="${4:-}"
  local payload
  local response

  require_signature "$signature" "$label"
  solana confirm --commitment finalized "$signature" >/dev/null || {
    echo "::error::The ${label} transaction did not reach finalized confirmation."
    exit 1
  }
  payload="$(jq -cn --arg signature "$signature" '{
    jsonrpc:"2.0",
    id:1,
    method:"getTransaction",
    params:[$signature,{commitment:"finalized",encoding:"jsonParsed",maxSupportedTransactionVersion:0}]
  }')"
  response="$(curl --silent --show-error --fail --max-time 30 \
    --header "Content-Type: application/json" \
    --data "$payload" "$SOLANA_RPC_URL")" || {
    echo "::error::Unable to retrieve finalized ${label} transaction evidence from the configured Solana RPC."
    exit 1
  }

  jq -e \
    --arg signature "$signature" \
    --arg mint "$MINT" \
    --arg program "$TOKEN_2022_PROGRAM" \
    --argjson expected_types "$expected_types" \
    --arg expected_authority_type "$expected_authority_type" '
      .error == null
      and .result != null
      and .result.meta.err == null
      and .result.transaction.signatures[0] == $signature
      and any(.result.transaction.message.accountKeys[]?;
        (if type == "object" then .pubkey else . end) == $mint)
      and any(.result.transaction.message.instructions[]?;
        .programId == $program
        and (.parsed as $parsed
          | $parsed != null
          and ($expected_types | index($parsed.type)) != null
          and ($expected_authority_type == "" or $parsed.info.authorityType == $expected_authority_type)))
    ' <<< "$response" >/dev/null || {
      echo "::error::The ${label} signature is not a finalized successful transaction for this mint and expected Token-2022 operation."
      exit 1
    }
}

require_receipt() {
  local receipt="$1"
  local label="$2"
  if [[ "$label" == "freeze authority revocation" && "$receipt" == "NOT_APPLICABLE_NEVER_SET" ]]; then
    return
  fi
  require_signature "$receipt" "$label"
}

reconcile_receipt() {
  local signature_variable="$1"
  local history_field="$2"
  local label="$3"
  local supplied_receipt="${!signature_variable}"
  local verified_receipt
  verified_receipt="$(jq -er --arg field "$history_field" '.[$field] // empty' "$HISTORY_FILE")" || {
    echo "::error::Finalized transaction history is missing the required ${label} receipt."
    exit 1
  }
  if [[ -n "$supplied_receipt" && "$supplied_receipt" != "$verified_receipt" ]]; then
    echo "::error::The supplied ${label} receipt does not match finalized transaction history."
    exit 1
  fi
  require_receipt "$verified_receipt" "$label"
  printf -v "$signature_variable" '%s' "$verified_receipt"
}

CREATION_TX=""
METADATA_TX=""
ACCOUNT_TX=""
MINT_TX=""
MINT_AUTH_TX=""
FREEZE_AUTH_TX=""
METADATA_AUTH_TX=""
POINTER_AUTH_TX=""

# An existing evidence file is accepted only for this exact mint and program.
# Missing stage signatures are not reconstructed or fabricated.
if [[ -f "${EVIDENCE_FILE}" ]]; then
  jq -e --arg mint "${MINT}" --arg program "${TOKEN_2022_PROGRAM}" '
    .network == "solana-devnet" and .mint == $mint and .programId == $program
    and all([
      .creationTransaction,
      .metadataTransaction,
      .tokenAccountCreationTransaction,
      .mintTransaction,
      .mintAuthorityRevocationTransaction,
      .metadataUpdateAuthorityRevocationTransaction,
      .metadataPointerAuthorityRevocationTransaction
    ][]; . == null or . == "" or (type == "string" and test("^[1-9A-HJ-NP-Za-km-z]{64,88}$")))
    and (
      .freezeAuthorityRevocationTransaction == null
      or .freezeAuthorityRevocationTransaction == ""
      or .freezeAuthorityRevocationTransaction == "NOT_APPLICABLE_NEVER_SET"
      or (.freezeAuthorityRevocationTransaction | type == "string" and test("^[1-9A-HJ-NP-Za-km-z]{64,88}$"))
    )
  ' "${EVIDENCE_FILE}" >/dev/null || {
    echo "::error::Existing recovery evidence is malformed or belongs to a different mint/program."
    exit 1
  }
  CREATION_TX="$(jq -r '.creationTransaction // empty' "${EVIDENCE_FILE}")"
  METADATA_TX="$(jq -r '.metadataTransaction // empty' "${EVIDENCE_FILE}")"
  ACCOUNT_TX="$(jq -r '.tokenAccountCreationTransaction // empty' "${EVIDENCE_FILE}")"
  MINT_TX="$(jq -r '.mintTransaction // empty' "${EVIDENCE_FILE}")"
  MINT_AUTH_TX="$(jq -r '.mintAuthorityRevocationTransaction // empty' "${EVIDENCE_FILE}")"
  FREEZE_AUTH_TX="$(jq -r '.freezeAuthorityRevocationTransaction // empty' "${EVIDENCE_FILE}")"
  METADATA_AUTH_TX="$(jq -r '.metadataUpdateAuthorityRevocationTransaction // empty' "${EVIDENCE_FILE}")"
  POINTER_AUTH_TX="$(jq -r '.metadataPointerAuthorityRevocationTransaction // empty' "${EVIDENCE_FILE}")"
  [[ -z "${CREATION_TX}" ]] || verify_finalized_transaction "${CREATION_TX}" "mint creation" '["initializeMint","initializeMint2"]'
  [[ -z "${METADATA_TX}" ]] || verify_finalized_transaction "${METADATA_TX}" "metadata initialization" '["initializeTokenMetadata","initializeMetadata"]'
  [[ -z "${ACCOUNT_TX}" ]] || verify_finalized_transaction "${ACCOUNT_TX}" "token-account creation" '["initializeAccount","initializeAccount2","initializeAccount3"]'
  [[ -z "${MINT_TX}" ]] || verify_finalized_transaction "${MINT_TX}" "supply mint" '["mintTo","mintToChecked"]'
  [[ -z "${MINT_AUTH_TX}" ]] || verify_finalized_transaction "${MINT_AUTH_TX}" "mint authority revocation" '["setAuthority"]' "mintTokens"
  [[ -z "${FREEZE_AUTH_TX}" || "${FREEZE_AUTH_TX}" == "NOT_APPLICABLE_NEVER_SET" ]] || verify_finalized_transaction "${FREEZE_AUTH_TX}" "freeze authority revocation" '["setAuthority"]' "freezeAccount"
  [[ -z "${METADATA_AUTH_TX}" ]] || verify_finalized_transaction "${METADATA_AUTH_TX}" "metadata update-authority revocation" '["updateTokenMetadataAuthority","setAuthority"]' "metadata"
  [[ -z "${POINTER_AUTH_TX}" ]] || verify_finalized_transaction "${POINTER_AUTH_TX}" "metadata pointer-authority revocation" '["updateMetadataPointerAuthority","setAuthority"]' "metadataPointer"
fi

MINT_AUTHORITY="$(printf '%s\n' "${DISPLAY}" | read_field 'Mint Authority')"
if [[ -z "${MINT_AUTHORITY}" ]]; then
  echo "::error::Recovered mint did not expose a Mint Authority in spl-token display output."
  exit 1
fi
if ! is_disabled "${MINT_AUTHORITY}" && [[ "${MINT_AUTHORITY}" != "${SIGNER}" ]]; then
  echo "::error::Recovered mint authority does not match the deployment signer; refusing recovery."
  exit 1
fi

# Validate the complete metadata tuple before any authority is revoked.
NAME="$(printf '%s\n' "${DISPLAY}" | read_field 'Name')"
SYMBOL="$(printf '%s\n' "${DISPLAY}" | read_field 'Symbol')"
URI="$(printf '%s\n' "${DISPLAY}" | read_field 'URI')"
if [[ -z "${NAME}" && -z "${SYMBOL}" && -z "${URI}" ]]; then
  [[ "${MINT_AUTHORITY}" == "${SIGNER}" ]] || {
    echo "::error::Metadata is uninitialized but the signer is not the active mint authority."
    exit 1
  }
  OUTPUT="$(spl-token --program-2022 initialize-metadata "${MINT}" "GLORIFIER" "GLR" "${METADATA_URI}")"
  printf '%s\n' "${OUTPUT}"
  METADATA_TX="$(printf '%s\n' "${OUTPUT}" | capture_sig)"
  verify_finalized_transaction "${METADATA_TX}" "metadata initialization" '["initializeTokenMetadata","initializeMetadata"]'
  DISPLAY="$(spl-token --program-2022 display "${MINT}")"
  NAME="$(printf '%s\n' "${DISPLAY}" | read_field 'Name')"
  SYMBOL="$(printf '%s\n' "${DISPLAY}" | read_field 'Symbol')"
  URI="$(printf '%s\n' "${DISPLAY}" | read_field 'URI')"
else
  if [[ "${NAME}" != "GLORIFIER" || "${SYMBOL}" != "GLR" || "${URI}" != "${METADATA_URI}" ]]; then
    echo "::error::Existing metadata does not exactly match the canonical GLORIFIER/GLR name, symbol, and URI; refusing to continue."
    exit 1
  fi
  [[ -z "${METADATA_TX}" ]] || verify_finalized_transaction "${METADATA_TX}" "metadata initialization" '["initializeTokenMetadata","initializeMetadata"]'
fi
[[ "${NAME}" == "GLORIFIER" && "${SYMBOL}" == "GLR" && "${URI}" == "${METADATA_URI}" ]] || {
  echo "::error::Canonical metadata verification failed."
  exit 1
}

SUPPLY_NOW="$(spl-token --program-2022 supply "${MINT}" | awk 'NR==1 {print $1}' | tr -d '\r')"
if [[ "${SUPPLY_NOW}" == "0" ]]; then
  [[ "${MINT_AUTHORITY}" == "${SIGNER}" ]] || {
    echo "::error::Supply is zero but the deployment signer is not the active mint authority."
    exit 1
  }
  if ! spl-token --program-2022 accounts "${MINT}" --owner "${SIGNER}" >/dev/null 2>&1; then
    OUTPUT="$(spl-token --program-2022 create-account "${MINT}")"
    printf '%s\n' "${OUTPUT}"
    ACCOUNT_TX="$(printf '%s\n' "${OUTPUT}" | capture_sig)"
    verify_finalized_transaction "${ACCOUNT_TX}" "token-account creation" '["initializeAccount","initializeAccount2","initializeAccount3"]'
  else
    verify_finalized_transaction "${ACCOUNT_TX}" "existing token-account creation" '["initializeAccount","initializeAccount2","initializeAccount3"]'
  fi
  OUTPUT="$(spl-token --program-2022 mint "${MINT}" "${SUPPLY}")"
  printf '%s\n' "${OUTPUT}"
  MINT_TX="$(printf '%s\n' "${OUTPUT}" | capture_sig)"
  verify_finalized_transaction "${MINT_TX}" "supply mint" '["mintTo","mintToChecked"]'
elif [[ "${SUPPLY_NOW}" == "${SUPPLY}" ]]; then
  : # Finalized-history reconciliation below recovers and validates prior receipts.
else
  echo "::error::Recovered mint has unexpected supply ${SUPPLY_NOW}; refusing to alter it."
  exit 1
fi

revoke_authority() {
  local field_name="$1"
  local instruction="$2"
  local signature_variable="$3"
  local current_authority
  local prior_signature
  current_authority="$(printf '%s\n' "${DISPLAY}" | read_field "${field_name}")"
  prior_signature="${!signature_variable}"

  if is_disabled "${current_authority}"; then
    return
  fi
  [[ "${current_authority}" == "${SIGNER}" ]] || {
    echo "::error::${field_name} does not match the deployment signer; refusing authority revocation."
    exit 1
  }

  OUTPUT="$(spl-token --program-2022 authorize "${MINT}" "${instruction}" --disable)"
  printf '%s\n' "${OUTPUT}"
  printf -v "${signature_variable}" '%s' "$(printf '%s\n' "${OUTPUT}" | capture_sig)"
  local expected_authority_type="mintTokens"
  [[ "${field_name}" == "Freeze Authority" ]] && expected_authority_type="freezeAccount"
  verify_finalized_transaction "${!signature_variable}" "${field_name} revocation" '["setAuthority"]' "${expected_authority_type}"
  DISPLAY="$(spl-token --program-2022 display "${MINT}")"
}

revoke_authority 'Mint Authority' 'mint' MINT_AUTH_TX
revoke_authority 'Freeze Authority' 'freeze' FREEZE_AUTH_TX

METADATA_AUTHORITY="$(printf '%s\n' "${DISPLAY}" | read_field 'Update Authority')"
if [[ -z "${METADATA_AUTHORITY}" ]]; then
  METADATA_AUTHORITY="$(printf '%s\n' "${DISPLAY}" | read_field 'Metadata Update Authority')"
fi
if is_disabled "${METADATA_AUTHORITY}"; then
  [[ -z "${METADATA_AUTH_TX}" ]] || verify_finalized_transaction "${METADATA_AUTH_TX}" "metadata update-authority revocation" '["updateTokenMetadataAuthority","setAuthority"]' "metadata"
else
  [[ "${METADATA_AUTHORITY}" == "${SIGNER}" ]] || {
    echo "::error::Metadata update authority does not match the deployment signer."
    exit 1
  }
  OUTPUT="$(spl-token --program-2022 authorize "${MINT}" metadata --disable)"
  printf '%s\n' "${OUTPUT}"
  METADATA_AUTH_TX="$(printf '%s\n' "${OUTPUT}" | capture_sig)"
  verify_finalized_transaction "${METADATA_AUTH_TX}" "metadata update-authority revocation" '["updateTokenMetadataAuthority","setAuthority"]' "metadata"
  DISPLAY="$(spl-token --program-2022 display "${MINT}")"
fi

CURRENT_POINTER_AUTH="$(printf '%s\n' "${DISPLAY}" | read_pointer_authority)"
if is_disabled "${CURRENT_POINTER_AUTH}"; then
  [[ -z "${POINTER_AUTH_TX}" ]] || verify_finalized_transaction "${POINTER_AUTH_TX}" "metadata pointer-authority revocation" '["updateMetadataPointerAuthority","setAuthority"]' "metadataPointer"
else
  [[ "${CURRENT_POINTER_AUTH}" == "${SIGNER}" ]] || {
    echo "::error::Metadata pointer authority does not match the deployment signer."
    exit 1
  }
  OUTPUT="$(spl-token --program-2022 authorize "${MINT}" metadata-pointer --disable)"
  printf '%s\n' "${OUTPUT}"
  POINTER_AUTH_TX="$(printf '%s\n' "${OUTPUT}" | capture_sig)"
  verify_finalized_transaction "${POINTER_AUTH_TX}" "metadata pointer-authority revocation" '["updateMetadataPointerAuthority","setAuthority"]' "metadataPointer"
fi

FINAL="$(spl-token --program-2022 display "${MINT}")"
printf '%s\n' "${FINAL}"
[[ "$(printf '%s\n' "${FINAL}" | read_field 'Name')" == "GLORIFIER" ]]
[[ "$(printf '%s\n' "${FINAL}" | read_field 'Symbol')" == "GLR" ]]
[[ "$(printf '%s\n' "${FINAL}" | read_field 'URI')" == "${METADATA_URI}" ]]
is_disabled "$(printf '%s\n' "${FINAL}" | read_field 'Mint Authority')"
is_disabled "$(printf '%s\n' "${FINAL}" | read_field 'Freeze Authority')"
FINAL_METADATA_AUTHORITY="$(printf '%s\n' "${FINAL}" | read_field 'Update Authority')"
if [[ -z "${FINAL_METADATA_AUTHORITY}" ]]; then
  FINAL_METADATA_AUTHORITY="$(printf '%s\n' "${FINAL}" | read_field 'Metadata Update Authority')"
fi
is_disabled "${FINAL_METADATA_AUTHORITY}"
is_disabled "$(printf '%s\n' "${FINAL}" | read_pointer_authority)"
[[ "$(spl-token --program-2022 supply "${MINT}" | awk 'NR==1 {print $1}' | tr -d '\r')" == "${SUPPLY}" ]]

# Rebuild every lifecycle receipt from a read-only, finalized RPC history scan.
# This recovers stages omitted by earlier partial-run artifacts and rejects unrelated
# signatures before any recovery evidence is published.
HISTORY_FILE="solana/reconciliation-tx-history.json"
python3 solana/verify-token2022-devnet-history.py "${MINT}"
jq -e --arg mint "${MINT}" --arg program "${TOKEN_2022_PROGRAM}" '
  .network == "solana-devnet"
  and .mint == $mint
  and .programId == $program
  and .transactionSemanticsVerified == true
  and .historyComplete == true
' "${HISTORY_FILE}" >/dev/null || {
  echo "::error::Finalized transaction history does not prove the complete canonical GLORIFIER/GLR lifecycle."
  exit 1
}

reconcile_receipt CREATION_TX creationTransaction "mint creation"
reconcile_receipt METADATA_TX metadataTransaction "metadata initialization"
reconcile_receipt ACCOUNT_TX tokenAccountCreationTransaction "token-account creation"
reconcile_receipt MINT_TX mintTransaction "supply mint"
reconcile_receipt MINT_AUTH_TX mintAuthorityRevocationTransaction "mint authority revocation"
reconcile_receipt FREEZE_AUTH_TX freezeAuthorityRevocationTransaction "freeze authority revocation"
reconcile_receipt METADATA_AUTH_TX metadataUpdateAuthorityRevocationTransaction "metadata update-authority revocation"
reconcile_receipt POINTER_AUTH_TX metadataPointerAuthorityRevocationTransaction "metadata pointer-authority revocation"

mkdir -p "$(dirname "${EVIDENCE_FILE}")"
TEMP_EVIDENCE="$(mktemp "${EVIDENCE_FILE}.tmp.XXXXXX")"
trap 'rm -f "${TEMP_EVIDENCE:-}"' EXIT
jq -n \
  --arg mint "${MINT}" \
  --arg programId "${TOKEN_2022_PROGRAM}" \
  --arg creationTransaction "${CREATION_TX}" \
  --arg metadataTransaction "${METADATA_TX}" \
  --arg tokenAccountCreationTransaction "${ACCOUNT_TX}" \
  --arg mintTransaction "${MINT_TX}" \
  --arg mintAuthorityRevocationTransaction "${MINT_AUTH_TX}" \
  --arg freezeAuthorityRevocationTransaction "${FREEZE_AUTH_TX}" \
  --arg metadataUpdateAuthorityRevocationTransaction "${METADATA_AUTH_TX}" \
  --arg metadataPointerAuthorityRevocationTransaction "${POINTER_AUTH_TX}" \
  --arg workflowRunId "${GITHUB_RUN_ID}" \
  --arg workflowRunUrl "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}" \
  '{
    network:"solana-devnet",
    status:"VERIFIED_ON_CHAIN",
    mint:$mint,
    programId:$programId,
    creationTransaction:$creationTransaction,
    metadataTransaction:$metadataTransaction,
    tokenAccountCreationTransaction:$tokenAccountCreationTransaction,
    mintTransaction:$mintTransaction,
    mintAuthorityRevocationTransaction:$mintAuthorityRevocationTransaction,
    freezeAuthorityRevocationTransaction:$freezeAuthorityRevocationTransaction,
    metadataUpdateAuthorityRevocationTransaction:$metadataUpdateAuthorityRevocationTransaction,
    metadataPointerAuthorityRevocationTransaction:$metadataPointerAuthorityRevocationTransaction,
    workflowRunId:$workflowRunId,
    workflowRunUrl:$workflowRunUrl,
    verifiedFinalState:true,
    transactionSemanticsVerified:true
  }' > "${TEMP_EVIDENCE}"

jq -e --arg mint "${MINT}" --arg program "${TOKEN_2022_PROGRAM}" '
  .network == "solana-devnet" and .status == "VERIFIED_ON_CHAIN"
  and .mint == $mint and .programId == $program and .verifiedFinalState == true
  and .transactionSemanticsVerified == true
  and ([.creationTransaction, .metadataTransaction, .tokenAccountCreationTransaction, .mintTransaction,
        .mintAuthorityRevocationTransaction, .metadataUpdateAuthorityRevocationTransaction,
        .metadataPointerAuthorityRevocationTransaction]
       | all(.[]; type == "string" and test("^[1-9A-HJ-NP-Za-km-z]{64,88}$")))
  and (
    .freezeAuthorityRevocationTransaction == "NOT_APPLICABLE_NEVER_SET"
    or (.freezeAuthorityRevocationTransaction | type == "string" and test("^[1-9A-HJ-NP-Za-km-z]{64,88}$"))
  )
' "${TEMP_EVIDENCE}" >/dev/null
mv -f "${TEMP_EVIDENCE}" "${EVIDENCE_FILE}"
trap - EXIT
