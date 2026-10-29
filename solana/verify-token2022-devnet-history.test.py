"""Offline regression tests for verify-token2022-devnet-history.py (no network)."""
import copy, importlib.util, io, json, pathlib, unittest
from unittest.mock import patch

HERE = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location("v", HERE / "verify-token2022-devnet-history.py")
v = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)
MINT = "8W7eSf3hPyRMFJGKbCvwb9QMq6uok6rxSnRZqofeqnyd"
FIXTURE = json.loads((HERE / "evidence/fixtures/glr-devnet-history.json").read_text())


def find(d, typ):
    for t in d["transactions"]:
        for i in t["instructions"]:
            if i["type"] == typ:
                return t, i
    raise AssertionError(typ)


class HistoryTests(unittest.TestCase):
    def test_real_history_verifies_full_lifecycle(self):
        r = v.analyze(MINT, copy.deepcopy(FIXTURE))
        self.assertTrue(r["transactionSemanticsVerified"])
        self.assertEqual(r["signatureCount"], 7)
        self.assertEqual(r["totalMintedBaseUnits"], "1000000000000000000")
        self.assertEqual(r["freezeAuthorityRevocationTransaction"], v.NEVER_SET)
        self.assertEqual(r["creationTransaction"][:8], "2DcwdGwo")

    def assertFails(self, d):
        with self.assertRaises(v.VerificationError):
            v.analyze(MINT, d)

    def test_failed_transaction_fails_closed(self):
        d = copy.deepcopy(FIXTURE); d["transactions"][0]["err"] = {"InstructionError": [0, "Custom"]}; self.assertFails(d)

    def test_extra_mint_fails(self):
        d = copy.deepcopy(FIXTURE); t, _ = find(d, "mintToChecked"); d["transactions"].append(copy.deepcopy(t) | {"signature": "x", "slot": 1 << 40}); self.assertFails(d)

    def test_freeze_authority_set_at_creation_fails(self):
        d = copy.deepcopy(FIXTURE); _, i = find(d, "initializeMint"); i["info"]["freezeAuthority"] = "EMRfUhC3SbFNU5iPKotQuRukG1LyVFwNh9RuH9HZwwnc"; self.assertFails(d)

    def test_authority_grant_fails(self):
        d = copy.deepcopy(FIXTURE); _, i = find(d, "setAuthority"); i["info"]["newAuthority"] = "EMRfUhC3SbFNU5iPKotQuRukG1LyVFwNh9RuH9HZwwnc"; self.assertFails(d)

    def test_missing_revocation_fails(self):
        d = copy.deepcopy(FIXTURE); d["transactions"] = [t for t in d["transactions"] if not any(i["type"] == "updateTokenMetadataAuthority" for i in t["instructions"])]; self.assertFails(d)

    def test_unexpected_instruction_fails(self):
        d = copy.deepcopy(FIXTURE); d["transactions"][0]["instructions"].append({"type": "burnChecked", "info": {"mint": MINT}}); self.assertFails(d)

    def test_final_state_mismatch_fails(self):
        d = copy.deepcopy(FIXTURE); d["account"]["data"]["parsed"]["info"]["mintAuthority"] = "x"; self.assertFails(d)


    def test_additional_token_account_does_not_break_complete_history(self):
        d = copy.deepcopy(FIXTURE)
        tx, instruction = find(d, "initializeAccount3")
        extra = copy.deepcopy(instruction)
        extra["info"]["account"] = "AdditionalHolderTokenAccount"
        d["transactions"].append({
            "signature": "AdditionalHolderAccountInitializationSignature",
            "slot": max(item["slot"] for item in d["transactions"]) + 1,
            "blockTime": 1791431980,
            "err": None,
            "instructions": [extra],
        })
        result = v.analyze(MINT, d)
        self.assertTrue(result["transactionSemanticsVerified"])
        self.assertEqual(result["tokenAccountCreationTransaction"], tx["signature"])

    def test_rpc_retries_body_read_oserror(self):
        successful_response = io.BytesIO(b'{"jsonrpc":"2.0","id":1,"result":{"ok":true}}')
        with patch.object(v.urllib.request, "urlopen", side_effect=[OSError("socket read reset"), successful_response]), patch.object(v.time, "sleep"):
            self.assertEqual(v.rpc("https://rpc.example", "getHealth", []), {"ok": True})

    def test_rpc_json_decode_failure_ends_as_verification_error(self):
        invalid_responses = [io.BytesIO(b'not-json') for _ in range(6)]
        with patch.object(v.urllib.request, "urlopen", side_effect=invalid_responses), patch.object(v.time, "sleep"):
            with self.assertRaisesRegex(v.VerificationError, "response unavailable or invalid after retries"):
                v.rpc("https://rpc.example", "getHealth", [])


if __name__ == "__main__":
    unittest.main()
