#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_PROGRAM="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
readonly EXPECTED_NAME="GLORIFIER"
readonly EXPECTED_SYMBOL="GLR"
readonly EXPECTED_DECIMALS=9
readonly EXPECTED_SUPPLY=1000000000
readonly EXPECTED_METADATA_URI="https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/d0d5c16fc4a74099c125c8aac594352d53675177/solana/token.json"
readonly COMMITMENT="finalized"
readonly MINT="${1:-}"
readonly PROVENANCE="${2:-}"

test -n "$MINT" || { echo "::error::A Solana Mainnet mint address is required."; exit 1; }
[[ "$MINT" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || { echo "::error::Invalid Solana mint address format."; exit 1; }
test -n "${SOLANA_RPC_URL:-}" || { echo "::error::SOLANA_RPC_URL is required."; exit 1; }
test -f "$PROVENANCE" || { echo "::error::Deployment provenance file is required."; exit 1; }

mkdir -p solana
echo "MINT=$MINT" | tee solana/reconciliation-mainnet-status.txt
solana config set --commitment "$COMMITMENT" >/dev/null
solana account "$MINT" | tee solana/reconciliation-mainnet-account.txt
grep -Fq "Owner: $EXPECTED_PROGRAM" solana/reconciliation-mainnet-account.txt
spl-token --program-2022 supply "$MINT" | tee solana/reconciliation-mainnet-supply.txt
spl-token --program-2022 display "$MINT" | tee solana/reconciliation-mainnet-mint-state.txt
ACTUAL_SUPPLY="$(awk 'NR==1 {print $1}' solana/reconciliation-mainnet-supply.txt | tr -d '\r')"
test "$ACTUAL_SUPPLY" = "$EXPECTED_SUPPLY"
grep -Eq "^[[:space:]]*Name:[[:space:]]*$EXPECTED_NAME[[:space:]]*$" solana/reconciliation-mainnet-mint-state.txt
grep -Eq "^[[:space:]]*Symbol:[[:space:]]*$EXPECTED_SYMBOL[[:space:]]*$" solana/reconciliation-mainnet-mint-state.txt
grep -Eiq 'Decimals[[:space:]]*:[[:space:]]*9' solana/reconciliation-mainnet-mint-state.txt
grep -Eiq 'Mint[[:space:]]+Authority.*(None|not set)' solana/reconciliation-mainnet-mint-state.txt
grep -Eiq 'Freeze[[:space:]]+Authority.*(None|not set)' solana/reconciliation-mainnet-mint-state.txt
grep -Fq "$EXPECTED_METADATA_URI" solana/reconciliation-mainnet-mint-state.txt

python3 - "$SOLANA_RPC_URL" "$MINT" "$EXPECTED_PROGRAM" "$EXPECTED_NAME" "$EXPECTED_SYMBOL" "$EXPECTED_METADATA_URI" > solana/reconciliation-mainnet-metadata.json <<'PY'
import base64,hashlib,json,sys,urllib.request
rpc,mint,program,expected_name,expected_symbol,expected_uri=sys.argv[1:]
payload=json.dumps({"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":[mint,{"encoding":"base64","commitment":"finalized"}]}).encode()
req=urllib.request.Request(rpc,data=payload,headers={"Content-Type":"application/json"})
with urllib.request.urlopen(req,timeout=30) as response: result=json.load(response)
value=result.get("result",{}).get("value")
if not value: raise SystemExit("mint account not found at finalized commitment")
if value.get("owner")!=program: raise SystemExit("mint owner is not canonical Token-2022")
raw=base64.b64decode(value["data"][0])
if len(raw)<166: raise SystemExit("Token-2022 mint account is shorter than the base state, padding, and account-type byte")
# Token-2022 preserves the legacy 165-byte account layout for compatibility.
# Extended mints store AccountType::Mint (1) at byte 165 and TLV extensions at 166.
if raw[165] != 1: raise SystemExit("Token-2022 account type byte is not Mint")
extensions={}; off=166
while off<len(raw):
    if off+4>len(raw): raise SystemExit("Token-2022 extension header is truncated")
    etype=int.from_bytes(raw[off:off+2],"little"); elen=int.from_bytes(raw[off+2:off+4],"little"); off+=4
    if off+elen>len(raw): raise SystemExit("Token-2022 extension payload is truncated")
    if etype in extensions: raise SystemExit("duplicate Token-2022 extension type")
    extensions[etype]=raw[off:off+elen]; off+=elen
mp,tm=extensions.get(18),extensions.get(19)
if mp is None or len(mp)<64: raise SystemExit("MetadataPointer extension missing or malformed")
if tm is None or len(tm)<64: raise SystemExit("TokenMetadata extension missing or malformed")
alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
def b58(data):
    n=int.from_bytes(data,"big"); out=""
    while n: n,r=divmod(n,58); out=alphabet[r]+out
    pad=0
    for b in data:
        if b==0: pad+=1
        else: break
    return "1"*pad+(out or "")
none="11111111111111111111111111111111"
pa,ma=b58(mp[:32]),b58(mp[32:64]); ua,mm=b58(tm[:32]),b58(tm[32:64])
cursor=64
def rs():
    global cursor
    n=int.from_bytes(tm[cursor:cursor+4],"little"); cursor+=4
    s=tm[cursor:cursor+n].decode("utf-8"); cursor+=n; return s
name,symbol,uri=rs(),rs(),rs()
if pa!=none or ma!=mint: raise SystemExit("metadata pointer is not disabled and self-referencing")
if ua!=none or mm!=mint: raise SystemExit("metadata update authority or mint field is invalid")
if (name,symbol,uri)!=(expected_name,expected_symbol,expected_uri): raise SystemExit("on-chain TokenMetadata fields do not match GLORIFIER")
with urllib.request.urlopen(expected_uri,timeout=30) as response: data=response.read()
print(json.dumps({"commitment":"finalized","owner":program,"metadataPointerAuthority":None,"metadataPointerAddress":ma,"metadataUpdateAuthority":None,"metadataMint":mm,"name":name,"symbol":symbol,"uri":uri,"offChainMetadataSha256":hashlib.sha256(data).hexdigest()},separators=(",",":")))
PY
jq -e --arg mint "$MINT" --arg uri "$EXPECTED_METADATA_URI" '.commitment=="finalized" and .owner=="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" and .metadataPointerAuthority==null and .metadataPointerAddress==$mint and .metadataUpdateAuthority==null and .metadataMint==$mint and .name=="GLORIFIER" and .symbol=="GLR" and .uri==$uri and (.offChainMetadataSha256|length)==64' solana/reconciliation-mainnet-metadata.json >/dev/null
for field in creationTransaction metadataTransaction tokenAccountCreationTransaction mintTransaction mintAuthorityRevocationTransaction; do test "$(jq -r --arg f "$field" '.[$f] // empty' "$PROVENANCE")" != ""; done
METADATA_AUTH="$(jq -r '.metadataUpdateAuthorityRevocationTransaction // empty' "$PROVENANCE")"
METADATA_AUTH_INITIALLY_NONE="$(jq -r '.metadataUpdateAuthorityInitiallyNone // false' "$PROVENANCE")"
POINTER_AUTH="$(jq -r '.metadataPointerAuthorityRevocationTransaction // empty' "$PROVENANCE")"
POINTER_AUTH_INITIALLY_NONE="$(jq -r '.metadataPointerAuthorityInitiallyNone // false' "$PROVENANCE")"
if [[ -z "$METADATA_AUTH" && "$METADATA_AUTH_INITIALLY_NONE" != "true" ]]; then echo "::error::Metadata update authority evidence is incomplete."; exit 1; fi
if [[ -z "$POINTER_AUTH" && "$POINTER_AUTH_INITIALLY_NONE" != "true" ]]; then echo "::error::Metadata pointer authority evidence is incomplete."; exit 1; fi
FREEZE_TX="$(jq -r '.freezeAuthorityRevocationTransaction // empty' "$PROVENANCE")"
FREEZE_INITIALLY_NONE="$(jq -r '.freezeAuthorityInitiallyNone // false' "$PROVENANCE")"
if [[ -z "$FREEZE_TX" && "$FREEZE_INITIALLY_NONE" != "true" ]]; then
  echo "::error::Freeze authority evidence is incomplete."; exit 1
fi
jq -e --arg mint "$MINT" '.status=="READY_FOR_VERIFICATION" and .network=="solana-mainnet" and .programId=="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" and .mint==$mint' "$PROVENANCE" >/dev/null
verify_tx() {
  local label="$1" tx="$2" patterns="$3"
  [[ "$tx" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]] || { echo "::error::Invalid $label transaction signature."; exit 1; }
  local json; json="$(python3 - "$SOLANA_RPC_URL" "$tx" <<'PY'
import json,sys,urllib.request
rpc,sig=sys.argv[1:]
p=json.dumps({"jsonrpc":"2.0","id":1,"method":"getTransaction","params":[sig,{"encoding":"jsonParsed","commitment":"finalized","maxSupportedTransactionVersion":0}]}).encode()
q=urllib.request.Request(rpc,data=p,headers={"Content-Type":"application/json"})
with urllib.request.urlopen(q,timeout=30) as r: print(r.read().decode())
PY
 )"
  jq -e --arg mint "$MINT" --arg program "$EXPECTED_PROGRAM" '.result != null and .result.meta.err == null and ((.result.transaction.message.accountKeys // []) | map(if type=="object" then .pubkey else . end) | index($mint)) and ((.result.transaction.message.accountKeys // []) | map(if type=="object" then .pubkey else . end) | index($program))' <<<"$json" >/dev/null
  local matched=0; IFS='|' read -ra pats <<<"$patterns"; for pat in "${pats[@]}"; do if jq -r '.result.meta.logMessages[]? // empty' <<<"$json" | grep -Eiq "$pat"; then matched=1; break; fi; done; test "$matched" -eq 1
  printf '%s\n' "$json" > "solana/reconciliation-mainnet-tx-$label.json"
}
verify_tx creation "$(jq -r '.creationTransaction' "$PROVENANCE")" 'InitializeMint|InitializeMint2|CreateAccount'
verify_tx metadata "$(jq -r '.metadataTransaction' "$PROVENANCE")" 'InitializeTokenMetadata|InitializeMetadata'
verify_tx token-account "$(jq -r '.tokenAccountCreationTransaction' "$PROVENANCE")" 'InitializeAccount|InitializeAccount3|Create'
verify_tx mint "$(jq -r '.mintTransaction' "$PROVENANCE")" 'MintTo|MintToChecked'
verify_tx mint-authority "$(jq -r '.mintAuthorityRevocationTransaction' "$PROVENANCE")" 'SetAuthority'
if [[ -n "$FREEZE_TX" ]]; then
  verify_tx freeze-authority "$FREEZE_TX" 'SetAuthority'
else
  echo "Freeze authority was absent from the mint at creation; no revocation transaction is expected."
fi
if [[ -n "$METADATA_AUTH" ]]; then verify_tx metadata-authority "$METADATA_AUTH" 'SetAuthority|UpdateAuthority'; else echo "Metadata update authority was already absent; no revocation transaction is expected."; fi
if [[ -n "$POINTER_AUTH" ]]; then verify_tx metadata-pointer-authority "$POINTER_AUTH" 'SetAuthority'; else echo "Metadata pointer authority was already absent; no revocation transaction is expected."; fi

cat > solana/reconciliation-mainnet-evidence.json <<EOF
{
  "network":"solana-mainnet","status":"VERIFIED_ON_CHAIN","mode":"RECONCILIATION_READ_ONLY","commitment":"finalized","finalized":true,"transactionSemanticsVerified":true,
  "mint":"$MINT","programId":"$EXPECTED_PROGRAM","name":"$EXPECTED_NAME","symbol":"$EXPECTED_SYMBOL","decimals":9,"totalSupply":"1000000000",
  "mintAuthority":null,"freezeAuthority":null,"metadataUri":"$EXPECTED_METADATA_URI","metadataPointerAuthority":null,"metadataPointerAddress":"$MINT","metadataUpdateAuthority":null,"metadataMint":"$MINT",
  "metadataUriInDisplay":true,"metadataPointerAuthorityRevocationTransaction":"$POINTER_AUTH","metadataPointerAuthorityInitiallyNone":$POINTER_AUTH_INITIALLY_NONE,"metadataUpdateAuthorityInitiallyNone":$METADATA_AUTH_INITIALLY_NONE,"freezeAuthorityRevocationTransaction":"$FREEZE_TX","freezeAuthorityInitiallyNone":$FREEZE_INITIALLY_NONE,"offChainMetadataSha256":"$(jq -r '.offChainMetadataSha256' solana/reconciliation-mainnet-metadata.json)"
}
EOF
jq -e --arg mint "$MINT" '.status=="VERIFIED_ON_CHAIN" and .commitment=="finalized" and .finalized==true and .transactionSemanticsVerified==true and .mint==$mint and .metadataPointerAuthority==null and .metadataUpdateAuthority==null and .metadataPointerAddress==$mint and .metadataMint==$mint and (.offChainMetadataSha256|length)==64' solana/reconciliation-mainnet-evidence.json >/dev/null
echo "GLR_MAINNET_STATUS=VERIFIED_ON_CHAIN" | tee -a solana/reconciliation-mainnet-status.txt