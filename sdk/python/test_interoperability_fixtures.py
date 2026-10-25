"""Shared fixture sanity tests for GLORIFIER's language-neutral JSON contract.

These tests validate the canonical fixture set in Python. They are not proof that
other SDKs interoperate; each SDK/runtime must run equivalent assertions.
"""
import json
import unittest
from pathlib import Path

FIXTURE_PATH = (
    Path(__file__).resolve().parents[2]
    / "docs"
    / "architecture"
    / "interoperability-contract-fixtures.json"
)


class InteroperabilityFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        cls.cases = {case["id"]: case for case in cls.document["cases"]}

    def test_fixture_document_has_version_rules_and_unique_cases(self):
        self.assertEqual(self.document["schemaVersion"], "1.0.0")
        self.assertTrue(self.document["rules"])
        self.assertEqual(len(self.cases), len(self.document["cases"]))

    def test_unicode_round_trip(self):
        payload = self.cases["unicode-round-trip"]["payload"]
        decoded = json.loads(json.dumps(payload, ensure_ascii=False))
        self.assertEqual(decoded, payload)
        self.assertIn("🌐", decoded["message"])
        self.assertIn("你好", decoded["message"])

    def test_arbitrary_precision_quantity_is_a_decimal_string(self):
        payload = self.cases["large-quantity-string"]["payload"]
        self.assertIsInstance(payload["quantity"], str)
        self.assertRegex(payload["quantity"], r"^(0|[1-9][0-9]*)$")
        self.assertEqual(json.loads(json.dumps(payload))["quantity"], payload["quantity"])

    def test_explicit_null_differs_from_absent_field(self):
        payload = self.cases["null-versus-absent"]["payload"]
        self.assertIn("presentNull", payload)
        self.assertIsNone(payload["presentNull"])
        self.assertNotIn("absentField", payload)
        self.assertEqual(payload["emptyString"], "")

    def test_nested_types_and_zero_are_preserved(self):
        payload = self.cases["nested-collections"]["payload"]
        decoded = json.loads(json.dumps(payload))
        self.assertIs(decoded["items"][0]["enabled"], True)
        self.assertEqual(decoded["items"][0]["count"], 0)
        self.assertIs(decoded["items"][1]["enabled"], False)
        self.assertEqual(decoded["metadata"]["tags"], ["ai", "language-neutral"])

    def test_error_contract_uses_stable_code_and_numeric_status(self):
        error = self.cases["stable-error-envelope"]["payload"]["error"]
        self.assertEqual(error["code"], "REQUEST_BODY_TOO_LARGE")
        self.assertEqual(error["status"], 413)
        self.assertIsInstance(error["message"], str)
        self.assertTrue(error["correlationId"])


if __name__ == "__main__":
    unittest.main()
