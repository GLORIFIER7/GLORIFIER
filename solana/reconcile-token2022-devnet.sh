#!/usr/bin/env bash
set -euo pipefail
readonly EXPECTED_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
readonly EXPECTED_NAME="GLORIFIER"
readonly EXPECTED_SYMBOL="GLR"
readonly EXPECTED_DECIMALS=9
readonly EXPECTED_SUPPLY=1000000000
readonly EXPECTED_METADATA_URI="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json"
readonly EXCLUDED_EXISTING_MINT="FrJhrVGjNRiB1eZpg5PTqLp9VSQS5rpwMp7jxNtEmV9G"
readonly COMMITMENT="finalized"
MINT="$1"
test -n "$MINT"
[[ "$MINT" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]]
[[ "$MINT" != "$EXCLUDED_EXISTING_MINT" ]]
mkdir -p solana
echo "MINT=$MINT" | tee solana/reconciliation-status.txt
solana config set --commitment "$COMMITMENT" >/dev/null
solana account "$MINT" | tee solana/reconciliation-account.txt
grep -Fq "Owner: $EXPECTED_PROGRAM" solana/reconciliation-account.txt
spl-token --program-2022 supply "$MINT" | tee solana/reconciliation-supply.txt
spl-token --program-2022 display "$MINT" | tee solana/reconciliation-mint-state.txt
ACTUAL_SUPPLY="$(awk 'NR==1 {print $1}' solana/reconciliation-supply.txt | tr -d '\r')"

if ! grep -Eq "^[[:space:]]*Name:[[:space:]]*$EXPECTED_NAME[[:space:]]*$" solana/reconciliation-mint-state.txt \
  || ! grep -Eq "^[[:space:]]*Symbol:[[:space:]]*$EXPECTED_SYMBOL[[:space:]]*$" solana/reconciliation-mint-state.txt \
  || ! grep -Eiq 'Decimals[[:space:]]*:[[:space:]]*9' solana/reconciliation-mint-state.txt \
  || ! grep -Eiq 'Mint[[:space:]]+Authority.*None' solana/reconciliation-mint-state.txt \
  || ! grep -Eiq 'Freeze[[:space:]]+Authority.*None' solana/reconciliation-mint-state.txt \
  || ! grep -Fq "$EXPECTED_METADATA_URI" solana/reconciliation-mint-state.txt \
  || [[ "$ACTUAL_SUPPLY" != "$EXPECTED_SUPPLY" ]]; then
  cat > solana/reconciliation-evidence.json <<EOF
{
  "network":"solana-devnet",
  "status":"RECOVERY_REQUIRED",
  "mode":"RECONCILIATION_READ_ONLY",
  "commitment":"finalized",
  "verification_boundary":"A real Devnet mint exists, but the recovered deployment is incomplete. This workflow performed read-only inspection and did not create, mint, transfer, or mutate the asset.",
  "mint":"$MINT",
  "programId":"$EXPECTED_PROGRAM",
  "name":"$EXPECTED_NAME",
  "symbol":"$EXPECTED_SYMBOL",
  "decimals":$EXPECTED_DECIMALS,
  "observedSupply":"$ACTUAL_SUPPLY",
  "expectedSupply":"$EXPECTED_SUPPLY",
  "next_action":"Resume the existing authorized Devnet deployment on this exact mint; do not create a second mint."
}
EOF
  printf 'GLR_STATUS=RECOVERY_REQUIRED\nREASON=PARTIAL_DEPLOYMENT_REQUIRES_RESUME\nMINT=%s\n' "$MINT" | tee -a solana/reconciliation-status.txt
  echo "RECOVERY_REQUIRED=true" >> "${GITHUB_OUTPUT:-/dev/null}"
  exit 0
fi

echo "RECOVERY_REQUIRED=false" >> "${GITHUB_OUTPUT:-/dev/null}"

python3 - "$SOLANA_RPC_URL" "$MINT" "$EXPECTED_PROGRAM" "$EXPECTED_NAME" "$EXPECTED_SYMBOL" "$EXPECTED_METADATA_URI" > solana/reconciliation-metadata.json <<'PY'
import base64, hashlib, json, sys, urllib.request
rpc, mint, program, expected_name, expected_symbol, expected_uri = sys.argv[1:]
payload = json.dumps({"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":[mint,{"encoding":"base64","commitment":"finalized"}]}).encode()
req = urllib.request.Request(rpc, data=payload, headers={"Content-Type":"application/json"})
with urllib.request.urlopen(req, timeout=30) as response: result = json.load(response)
value = result.get("result", {}).get("value")
if not value: raise SystemExit("mint account not found at finalized commitment")
if value.get("owner") != program: raise SystemExit("mint owner is not canonical Token-2022")
raw = base64.b64decode(value["data"][0])
if len(raw) < 82: raise SystemExit("mint account is shorter than the base mint state")
extensions = {}
offset = 82
while offset + 4 <= len(raw):
    etype = int.from_bytes(raw[offset:offset+2], "little")
    elen = int.from_bytes(raw[offset+2:offset+4], "little")
    offset += 4
    extensions[etype] = raw[offset:offset+elen]
    offset += elen
mp, tm = extensions.get(18), extensions.get(19)
if mp is None or len(mp) < 64: raise SystemExit("MetadataPointer extension missing or malformed")
if tm is None or len(tm) < 64: raise SystemExit("TokenMetadata extension missing or malformed")
alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
def b58(data):
    n = int.from_bytes(data, "big"); out = ""
    while n:
        n, r = divmod(n, 58); out = alphabet[r] + out
    pad = 0
    for b in data:
        if b == 0: pad += 1
        else: break
    return "1"*pad + (out or "")
pointer_authority, metadata_address = b58(mp[:32]), b58(mp[32:64])
update_authority, metadata_mint = b58(tm[:32]), b58(tm[32:64])
cursor = 64
def read_string():
    global cursor
    if cursor + 4 > len(tm): raise SystemExit("malformed TokenMetadata string length")
    n = int.from_bytes(tm[cursor:cursor+4], "little"); cursor += 4
    if cursor + n > len(tm): raise SystemExit("malformed TokenMetadata string payload")
    s = tm[cursor:cursor+n].decode("utf-8"); cursor += n; return s
name, symbol, uri = read_string(), read_string(), read_string()
none_key = "11111111111111111111111111111111"
if pointer_authority != none_key: raise SystemExit("metadata pointer authority is not disabled")
if metadata_address != mint: raise SystemExit("metadata pointer does not point to the mint")
if update_authority != none_key: raise SystemExit("TokenMetadata update authority is not disabled")
if metadata_mint != mint: raise SystemExit("TokenMetadata mint field does not match target mint")
if name != expected_name or symbol != expected_symbol or uri != expected_uri: raise SystemExit("on-chain TokenMetadata fields do not match GLORIFIER contract")
with urllib.request.urlopen(expected_uri, timeout=30) as response: metadata_bytes = response.read()
print(json.dumps({"commitment":"finalized","owner":program,"metadataPointerAuthority":None,"metadataPointerAddress":metadata_address,"metadataUpdateAuthority":None,"metadataMint":metadata_mint,"name":name,"symbol":symbol,"uri":uri,"offChainMetadataSha256":hashlib.sha256(metadata_bytes).hexdigest()}, separators=(",",":")))
PY
jq -e --arg mint "$MINT" '.commitment=="finalized" and .owner=="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" and .metadataPointerAuthority==null and .metadataPointerAddress==$mint and .metadataUpdateAuthority==null and .metadataMint==$mint and .name=="GLORIFIER" and .symbol=="GLR" and .uri=="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json" and (.offChainMetadataSha256|type=="string" and length==64)' solana/reconciliation-metadata.json >/dev/null

verify_tx() {
  local label="$1" tx="$2" patterns="$3"
  local json
  json="$(python3 - "$SOLANA_RPC_URL" "$tx" <<'PY'
import json,sys,urllib.request
rpc,sig=sys.argv[1:]
payload=json.dumps({"jsonrpc":"2.0","id":1,"method":"getTransaction","params":[sig,{"encoding":"jsonParsed","commitment":"finalized","maxSupportedTransactionVersion":0}]}).encode()
req=urllib.request.Request(rpc,data=payload,headers={"Content-Type":"application/json"})
with urllib.request.urlopen(req,timeout=30) as response: print(response.read().decode())
PY
)"
  jq -e --arg mint "$MINT" --arg program "$EXPECTED_PROGRAM" '.result != null and .result.meta.err == null and ((.result.transaction.message.accountKeys // []) | map(if type=="object" then .pubkey else . end) | index($mint)) and ((.result.transaction.message.accountKeys // []) | map(if type=="object" then .pubkey else . end) | index($program))' <<<"$json" >/dev/null
  local matched=0
  IFS='|' read -r -a pats <<<"$patterns"
  for pat in "${pats[@]}"; do
    if jq -r '.result.meta.logMessages[]? // empty' <<<"$json" | grep -Eiq "$pat"; then matched=1; break; fi
  done
  test "$matched" -eq 1
  printf '%s\n' "$json" > "solana/reconciliation-tx-$label.json"
}

test -f solana/deployment-provenance.json
for field in creationTransaction metadataTransaction tokenAccountCreationTransaction mintTransaction mintAuthorityRevocationTransaction freezeAuthorityRevocationTransaction metadataUpdateAuthorityRevocationTransaction; do
  test "$(jq -r --arg f "$field" '.[$f] // empty' solana/deployment-provenance.json)" != ""
done
CREATION_TX="$(jq -r '.creationTransaction' solana/deployment-provenance.json)"
METADATA_TX="$(jq -r '.metadataTransaction' solana/deployment-provenance.json)"
ACCOUNT_TX="$(jq -r '.tokenAccountCreationTransaction' solana/deployment-provenance.json)"
MINT_TX="$(jq -r '.mintTransaction' solana/deployment-provenance.json)"
MINT_AUTH_TX="$(jq -r '.mintAuthorityRevocationTransaction' solana/deployment-provenance.json)"
FREEZE_AUTH_TX="$(jq -r '.freezeAuthorityRevocationTransaction' solana/deployment-provenance.json)"
METADATA_AUTH_TX="$(jq -r '.metadataUpdateAuthorityRevocationTransaction' solana/deployment-provenance.json)"
verify_tx "creation" "$CREATION_TX" 'InitializeMint|InitializeMint2|CreateAccount'
verify_tx "metadata" "$METADATA_TX" 'InitializeTokenMetadata|InitializeMetadata'
verify_tx "token-account" "$ACCOUNT_TX" 'InitializeAccount|InitializeAccount3|Create'
verify_tx "mint" "$MINT_TX" 'MintTo|MintToChecked'
verify_tx "mint-authority" "$MINT_AUTH_TX" 'SetAuthority'
verify_tx "freeze-authority" "$FREEZE_AUTH_TX" 'SetAuthority'
verify_tx "metadata-authority" "$METADATA_AUTH_TX" 'SetAuthority|UpdateAuthority'

cat > solana/reconciliation-evidence.json <<EOF
{
  "network":"solana-devnet","status":"VERIFIED_ON_CHAIN","mode":"RECONCILIATION_READ_ONLY","commitment":"finalized",
  "verification_boundary":"Finalized canonical Devnet RPC state plus semantic transaction verification; repository claims alone are never sufficient.",
  "mint":"$MINT","programId":"$EXPECTED_PROGRAM","name":"$EXPECTED_NAME","symbol":"$EXPECTED_SYMBOL",
  "decimals":$EXPECTED_DECIMALS,"totalSupply":"$EXPECTED_SUPPLY","mintAuthority":null,"freezeAuthority":null,
  "metadataUri":"$EXPECTED_METADATA_URI","metadataPointerAuthority":null,"metadataUpdateAuthority":null,
  "metadataPointerAddress":"$MINT","metadataMint":"$MINT","metadataUriInDisplay":true,
  "offChainMetadataSha256":"$(jq -r '.offChainMetadataSha256' solana/reconciliation-metadata.json)",
  "transactionSemanticsVerified":true,"finalized":true
}
EOF
jq -e '.status=="VERIFIED_ON_CHAIN" and .commitment=="finalized" and .transactionSemanticsVerified==true and .finalized==true and .metadataPointerAuthority==null and .metadataUpdateAuthority==null and .metadataPointerAddress==.mint and .metadataUriInDisplay==true and .metadataMint==.mint and (.offChainMetadataSha256|length)==64' solana/reconciliation-evidence.json >/dev/null
echo "GLR_STATUS=VERIFIED_ON_CHAIN" | tee -a solana/reconciliation-status.txt
