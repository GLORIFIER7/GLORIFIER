"""Offline regression tests for verify-token2022-devnet-history.py (no network)."""
import copy, importlib.util, json, pathlib, unittest

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


if __name__ == "__main__":
    unittest.main()
