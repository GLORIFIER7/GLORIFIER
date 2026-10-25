"""Shared fixture sanity tests for GLORIFIER's language-neutral JSON contract.

These tests validate the canonical fixture set in Python. They are not proof that
other SDKs interoperate; each SDK/runtime must run equivalent assertions.
"""
import json
import unittest
from pathlib import Path
from typing import Any

FIXTURE_RELATIVE_PATH = Path(
    "docs", "architecture", "interoperability-contract-fixtures.json"
)


def find_repository_root(start: Path) -> Path:
    """Find the repository root from a stable marker, not this test's directory depth."""
    for candidate in (start, *start.parents):
        if (
            (candidate / "package.json").is_file()
            and (
                candidate / "docs" / "architecture"
                / "language-neutral-interoperability.md"
            ).is_file()
        ):
            return candidate
    raise FileNotFoundError(
        "Could not locate repository root (expected package.json and "
        "docs/architecture/language-neutral-interoperability.md) starting from "
        f"{start}"
    )


REPOSITORY_ROOT = find_repository_root(Path(__file__).resolve().parent)
FIXTURE_PATH = REPOSITORY_ROOT / FIXTURE_RELATIVE_PATH


class InteroperabilityFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not FIXTURE_PATH.is_file():
            raise FileNotFoundError(
                "Canonical interoperability fixture file is missing: "
                f"{FIXTURE_PATH}"
            )

        try:
            fixture_text = FIXTURE_PATH.read_text(encoding="utf-8")
        except OSError as exc:
            raise OSError(
                f"Unable to read interoperability fixtures at {FIXTURE_PATH}: {exc}"
            ) from exc

        try:
            cls.document: dict[str, Any] = json.loads(fixture_text)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Interoperability fixtures contain invalid JSON at {FIXTURE_PATH}: {exc}"
            ) from exc

        cases = cls.document.get("cases")
        if not isinstance(cases, list):
            raise ValueError(
                f"Interoperability fixture document must contain a cases array: {FIXTURE_PATH}"
            )

        case_ids = [case.get("id") if isinstance(case, dict) else None for case in cases]
        if any(not isinstance(case_id, str) or not case_id for case_id in case_ids):
            raise ValueError(
                f"Every interoperability fixture case must have a non-empty string id: {FIXTURE_PATH}"
            )

        duplicate_ids = sorted(
            {case_id for case_id in case_ids if case_ids.count(case_id) > 1}
        )
        if duplicate_ids:
            raise ValueError(
                "Duplicate interoperability fixture case ids: "
                + ", ".join(duplicate_ids)
                + f" (source: {FIXTURE_PATH})"
            )

        cls.cases = {case["id"]: case for case in cases}

    def test_fixture_document_has_version_rules_and_unique_cases(self):
        self.assertEqual(self.document["schemaVersion"], "1.0.0")
        self.assertEqual(self.document["encoding"], "UTF-8")
        self.assertIsInstance(self.document["rules"], list)
        self.assertTrue(self.document["rules"])
        case_ids = [case["id"] for case in self.document["cases"]]
        self.assertEqual(len(case_ids), len(set(case_ids)))
        self.assertEqual(len(self.cases), len(self.document["cases"]))

    def test_unicode_round_trip(self):
        payload = self.cases["unicode-round-trip"]["payload"]
        wire = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        decoded = json.loads(wire.decode("utf-8"))
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
        for field in self.cases["null-versus-absent"].get("absentFields", []):
            self.assertNotIn(field, payload)
        self.assertEqual(payload["emptyString"], "")

    def test_nested_types_and_zero_are_preserved(self):
        payload = self.cases["nested-collections"]["payload"]
        decoded = json.loads(json.dumps(payload))
        self.assertIs(decoded["items"][0]["enabled"], True)
        self.assertEqual(decoded["items"][0]["count"], 0)
        self.assertIs(decoded["items"][1]["enabled"], False)
        self.assertEqual(decoded["metadata"]["tags"], ["ai", "language-neutral"])

    def test_error_contract_uses_top_level_code_and_string_status(self):
        error = self.cases["stable-error-envelope"]["payload"]
        self.assertIs(error["ok"], False)
        self.assertEqual(error["code"], "REQUEST_BODY_TOO_LARGE")
        self.assertIsInstance(error["status"], str)
        self.assertEqual(error["status"], "error")
        self.assertIsInstance(error["error"], str)


if __name__ == "__main__":
    unittest.main()
