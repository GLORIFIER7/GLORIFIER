#!/usr/bin/env python3
"""Independent, read-only Token-2022 transaction-history verifier for the GLR Devnet mint.

It enumerates the complete finalized signature history of the mint from RPC,
decodes every Token-2022 instruction that touches the mint, and proves the full
lifecycle semantics without relying on preserved deployment artifacts:

  create (decimals=9, freeze authority never set) -> metadata pointer -> token
  metadata (GLORIFIER/GLR/uri) -> token account -> mint exact supply -> revoke
  mint authority -> revoke metadata update authority -> revoke metadata pointer
  authority, with no other supply-changing or authority-granting instruction.

It never signs, sends, or mutates anything. Usage:
  verify-token2022-devnet-history.py <mint> [--fixture]

Output is always written to solana/reconciliation-tx-history.json; --fixture reads
the committed offline fixture solana/evidence/fixtures/glr-devnet-history.json.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
EXPECTED = {
    "name": "GLORIFIER",
    "symbol": "GLR",
    "decimals": 9,
    "baseUnits": "1000000000000000000",
    "uri": "https://raw.githubusercontent.com/GLORIFIER7/GLORIFIER/main/solana/token.json",
}
NEVER_SET = "NOT_APPLICABLE_NEVER_SET"
# Instructions allowed to touch the mint; anything else fails closed.
ALLOWED = {
    "initializeMetadataPointer", "initializeMint", "initializeMint2", "initializeTokenMetadata",
    "getAccountDataSize", "initializeImmutableOwner", "initializeAccount", "initializeAccount2",
    "initializeAccount3", "transfer", "transferChecked", "mintTo", "mintToChecked", "setAuthority", "updateTokenMetadataAuthority",
}


class VerificationError(Exception):
    pass


def require(cond, msg):
    if not cond:
        raise VerificationError(msg)


def rpc(url, method, params):
    # Only HTTPS RPC endpoints are permitted (no file:, http:, or custom schemes).
    require(urllib.parse.urlsplit(url).scheme == "https", "SOLANA_RPC_URL must use https")
    req = urllib.request.Request(
        url,
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
        headers={"Content-Type": "application/json"},
    )
    body = None
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:  # nosec B310 - scheme enforced as https above
                body = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 5:
                raise VerificationError(f"RPC {method} HTTP error: {e.code}") from e
            time.sleep(2 ** attempt)
        except urllib.error.URLError as e:
            if attempt == 5:
                raise VerificationError(f"RPC {method} unavailable after retries: {e.reason}") from e
            time.sleep(2 ** attempt)
    require(body is not None, f"RPC {method} did not return a response after retries")
    require("error" not in body, f"RPC {method} error: {body.get('error')}")
    return body["result"]


def fetch(url, mint):
    sigs, before = [], None
    while True:
        opts = {"limit": 1000, "commitment": "finalized"}
        if before:
            opts["before"] = before
        page = rpc(url, "getSignaturesForAddress", [mint, opts])
        sigs += page
        if len(page) < 1000:
            break
        before = page[-1]["signature"]
    txs = []
    for s in sigs:
        t = rpc(url, "getTransaction", [s["signature"], {
            "encoding": "jsonParsed", "commitment": "finalized", "maxSupportedTransactionVersion": 0}])
        require(t is not None, f"finalized transaction not retrievable: {s['signature']}")
        txs.append({"signature": s["signature"], "slot": t["slot"], "blockTime": t["blockTime"],
                    "err": t["meta"]["err"], "instructions": token_instructions(t)})
    account = rpc(url, "getAccountInfo", [mint, {"encoding": "jsonParsed", "commitment": "finalized"}])["value"]
    return {"transactions": txs, "account": account}


def token_instructions(t):
    out = []
    groups = [t["transaction"]["message"]["instructions"]]
    groups += [g["instructions"] for g in (t["meta"].get("innerInstructions") or [])]
    for g in groups:
        for i in g:
            if i.get("programId") != PROGRAM:
                continue
            p = i.get("parsed")
            require(isinstance(p, dict), "unparsed Token-2022 instruction; refusing to infer semantics")
            out.append({"type": p.get("type"), "info": p.get("info", {})})
    return out


AUTHORITY_RECEIPT = {
    "mintTokens": "mintAuthorityRevocationTransaction",
    "freezeAccount": "freezeAuthorityRevocationTransaction",
    "metadataPointer": "metadataPointerAuthorityRevocationTransaction",
}
LIFECYCLE = ["creationTransaction", "metadataTransaction", "tokenAccountCreationTransaction", "mintTransaction",
             "mintAuthorityRevocationTransaction", "freezeAuthorityRevocationTransaction",
             "metadataUpdateAuthorityRevocationTransaction", "metadataPointerAuthorityRevocationTransaction"]


def touches_mint(info, mint):
    return info.get("mint") in (None, mint) or info.get("metadata") == mint


def apply_instruction(typ, info, sig, receipts):
    """Record one instruction's lifecycle effect; return base units minted."""
    require(typ in ALLOWED, f"unexpected instruction {typ} in {sig}")
    if typ == "initializeMetadataPointer":
        require("metadataPointerInitializationTransaction" not in receipts,
                f"metadata pointer initialized more than once in {sig}")
        receipts["metadataPointerInitializationTransaction"] = sig
    elif typ in ("initializeMint", "initializeMint2"):
        require("creationTransaction" not in receipts, "mint initialized more than once")
        require(info.get("decimals") == EXPECTED["decimals"], "decimals mismatch")
        require(info.get("freezeAuthority") in (None, ""), "freeze authority was set at creation")
        receipts["creationTransaction"] = sig
    elif typ == "initializeTokenMetadata":
        require("metadataTransaction" not in receipts, "token metadata initialized more than once")
        require((info.get("name"), info.get("symbol"), info.get("uri")) ==
                (EXPECTED["name"], EXPECTED["symbol"], EXPECTED["uri"]), "token metadata mismatch")
        receipts["metadataTransaction"] = sig
    elif typ.startswith("initializeAccount"):
        require("tokenAccountCreationTransaction" not in receipts,
                "more than one token-account initialization found in mint history")
        receipts["tokenAccountCreationTransaction"] = sig
    elif typ in ("mintTo", "mintToChecked"):
        require("mintTransaction" not in receipts,
                "multiple mintTo/mintToChecked instructions found; expected one mint transaction")
        amount = info.get("tokenAmount", {}).get("amount", info.get("amount"))
        require(amount is not None and str(amount).isdigit(),
                f"mintTo/mintToChecked missing or invalid amount field in {sig}")
        receipts["mintTransaction"] = sig
        return int(amount)
    elif typ == "setAuthority":
        require(info.get("newAuthority") is None, f"authority granted (not revoked) in {sig}")
        key = AUTHORITY_RECEIPT.get(info.get("authorityType"))
        require(key is not None, f"unexpected authority type {info.get('authorityType')}")
        require(key not in receipts, f"duplicate {info.get('authorityType')} revocation in {sig}")
        receipts[key] = sig
    elif typ == "updateTokenMetadataAuthority":
        require(info.get("newAuthority") is None, f"metadata authority granted in {sig}")
        key = "metadataUpdateAuthorityRevocationTransaction"
        require(key not in receipts, f"duplicate metadata update authority revocation in {sig}")
        receipts[key] = sig
    return 0


def verify_final_state(mint, acct):
    require(acct and acct["owner"] == PROGRAM, "mint not owned by Token-2022")
    st = acct["data"]["parsed"]["info"]
    require(st["decimals"] == EXPECTED["decimals"] and st["supply"] == EXPECTED["baseUnits"], "final supply mismatch")
    require(st["mintAuthority"] is None and st["freezeAuthority"] is None, "final authorities not disabled")
    ext = {e["extension"]: e.get("state", {}) for e in st.get("extensions", [])}
    pointer = ext.get("metadataPointer", {})
    require(pointer.get("authority") is None, "metadata pointer authority not disabled")
    require(pointer.get("metadataAddress") == mint, "metadata pointer mismatch")
    md = ext.get("tokenMetadata", {})
    require(md.get("updateAuthority") is None, "metadata update authority not disabled")
    require((md.get("name"), md.get("symbol"), md.get("uri")) ==
            (EXPECTED["name"], EXPECTED["symbol"], EXPECTED["uri"]), "final metadata mismatch")


def analyze(mint, data):
    txs = sorted(data["transactions"], key=lambda t: t["slot"])
    require(txs, "no finalized transaction history for mint")
    receipts, minted = {}, 0
    for t in txs:
        require(t["err"] is None, f"failed transaction in mint history: {t['signature']}")
        for ins in t["instructions"]:
            if touches_mint(ins["info"], mint):
                minted += apply_instruction(ins["type"], ins["info"], t["signature"], receipts)
    require(str(minted) == EXPECTED["baseUnits"], f"total minted {minted} != {EXPECTED['baseUnits']}")
    receipts.setdefault("freezeAuthorityRevocationTransaction", NEVER_SET)
    missing = [k for k in LIFECYCLE if k not in receipts]
    require(not missing, f"missing lifecycle receipts: {missing}")
    verify_final_state(mint, data["account"])
    return {
        "network": "solana-devnet", "mode": "READ_ONLY_TRANSACTION_HISTORY", "commitment": "finalized",
        "mint": mint, "programId": PROGRAM, "historyComplete": True,
        "signatureCount": len(txs), "signatures": [t["signature"] for t in txs],
        "totalMintedBaseUnits": str(minted), **{k: receipts[k] for k in LIFECYCLE},
        "transactionSemanticsVerified": True,
    }


REPO_ROOT = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUTPUT_PATH = os.path.join(REPO_ROOT, "solana", "reconciliation-tx-history.json")
FIXTURE_PATH = os.path.join(REPO_ROOT, "solana", "evidence", "fixtures", "glr-devnet-history.json")
MINT_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")


def main(argv):
    if len(argv) not in (2, 3) or (len(argv) == 3 and argv[2] != "--fixture"):
        print(__doc__, file=sys.stderr)
        return 2
    mint = argv[1]
    try:
        require(MINT_RE.fullmatch(mint) is not None, "mint is not a base58 address")
        if len(argv) == 3:
            with open(FIXTURE_PATH, encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = fetch(os.environ.get("SOLANA_RPC_URL", "https://api.devnet.solana.com"), mint)
        result = analyze(mint, data)
    except VerificationError as e:
        print(f"::error::Transaction-history verification failed: {e}", file=sys.stderr)
        return 1
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
        f.write("\n")
    print(f"Verified {result['signatureCount']} finalized transactions for {mint}.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
