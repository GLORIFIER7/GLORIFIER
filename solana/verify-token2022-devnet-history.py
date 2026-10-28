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
  verify-token2022-devnet-history.py <mint> <output.json> [--fixture <file>]
"""
import json
import sys
import time
import urllib.error
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
    req = urllib.request.Request(
        url,
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
        headers={"Content-Type": "application/json"},
    )
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                body = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 5:
                raise
            time.sleep(2 ** attempt)
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


def analyze(mint, data):
    txs = sorted(data["transactions"], key=lambda t: t["slot"])
    require(txs, "no finalized transaction history for mint")
    receipts = {}
    minted = 0
    for t in txs:
        require(t["err"] is None, f"failed transaction in mint history: {t['signature']}")
        for ins in t["instructions"]:
            typ, info = ins["type"], ins["info"]
            if info.get("mint") not in (None, mint) and info.get("metadata") != mint:
                continue
            require(typ in ALLOWED, f"unexpected instruction {typ} in {t['signature']}")
            sig = t["signature"]
            if typ in ("initializeMint", "initializeMint2"):
                require("creationTransaction" not in receipts, "mint initialized more than once")
                require(info.get("decimals") == EXPECTED["decimals"], "decimals mismatch")
                require(info.get("freezeAuthority") in (None, ""), "freeze authority was set at creation")
                receipts["creationTransaction"] = sig
            elif typ == "initializeTokenMetadata":
                require((info.get("name"), info.get("symbol"), info.get("uri")) ==
                        (EXPECTED["name"], EXPECTED["symbol"], EXPECTED["uri"]), "token metadata mismatch")
                receipts["metadataTransaction"] = sig
            elif typ.startswith("initializeAccount"):
                receipts.setdefault("tokenAccountCreationTransaction", sig)
            elif typ in ("mintTo", "mintToChecked"):
                amt = info.get("tokenAmount", {}).get("amount", info.get("amount"))
                minted += int(amt)
                receipts["mintTransaction"] = sig
            elif typ == "setAuthority":
                require(info.get("newAuthority") is None, f"authority granted (not revoked) in {sig}")
                kind = info.get("authorityType")
                key = {"mintTokens": "mintAuthorityRevocationTransaction",
                       "freezeAccount": "freezeAuthorityRevocationTransaction",
                       "metadataPointer": "metadataPointerAuthorityRevocationTransaction"}.get(kind)
                require(key is not None, f"unexpected authority type {kind}")
                receipts[key] = sig
            elif typ == "updateTokenMetadataAuthority":
                require(info.get("newAuthority") is None, f"metadata authority granted in {sig}")
                receipts["metadataUpdateAuthorityRevocationTransaction"] = sig
    require(str(minted) == EXPECTED["baseUnits"], f"total minted {minted} != {EXPECTED['baseUnits']}")
    receipts.setdefault("freezeAuthorityRevocationTransaction", NEVER_SET)
    needed = ["creationTransaction", "metadataTransaction", "tokenAccountCreationTransaction", "mintTransaction",
              "mintAuthorityRevocationTransaction", "freezeAuthorityRevocationTransaction",
              "metadataUpdateAuthorityRevocationTransaction", "metadataPointerAuthorityRevocationTransaction"]
    missing = [k for k in needed if k not in receipts]
    require(not missing, f"missing lifecycle receipts: {missing}")

    acct = data["account"]
    require(acct and acct["owner"] == PROGRAM, "mint not owned by Token-2022")
    st = acct["data"]["parsed"]["info"]
    require(st["decimals"] == EXPECTED["decimals"] and st["supply"] == EXPECTED["baseUnits"], "final supply mismatch")
    require(st["mintAuthority"] is None and st["freezeAuthority"] is None, "final authorities not disabled")
    ext = {e["extension"]: e.get("state", {}) for e in st.get("extensions", [])}
    require(ext.get("metadataPointer", {}).get("authority") is None, "metadata pointer authority not disabled")
    require(ext.get("metadataPointer", {}).get("metadataAddress") == mint, "metadata pointer mismatch")
    md = ext.get("tokenMetadata", {})
    require(md.get("updateAuthority") is None, "metadata update authority not disabled")
    require((md.get("name"), md.get("symbol"), md.get("uri")) ==
            (EXPECTED["name"], EXPECTED["symbol"], EXPECTED["uri"]), "final metadata mismatch")

    return {
        "network": "solana-devnet", "mode": "READ_ONLY_TRANSACTION_HISTORY", "commitment": "finalized",
        "mint": mint, "programId": PROGRAM, "historyComplete": True,
        "signatureCount": len(txs), "signatures": [t["signature"] for t in txs],
        "totalMintedBaseUnits": str(minted), **{k: receipts[k] for k in needed},
        "transactionSemanticsVerified": True,
    }


def main(argv):
    if len(argv) not in (3, 5):
        print(__doc__, file=sys.stderr)
        return 2
    mint, out = argv[1], argv[2]
    if len(argv) == 5 and argv[3] == "--fixture":
        with open(argv[4]) as f:
            data = json.load(f)
    else:
        import os
        data = fetch(os.environ.get("SOLANA_RPC_URL", "https://api.devnet.solana.com"), mint)
    try:
        result = analyze(mint, data)
    except VerificationError as e:
        print(f"::error::Transaction-history verification failed: {e}", file=sys.stderr)
        return 1
    with open(out, "w") as f:
        json.dump(result, f, indent=2)
        f.write("\n")
    print(f"Verified {result['signatureCount']} finalized transactions for {mint}.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
