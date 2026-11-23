"""Cross-language fixture parity tests for GLORIFIER memory v1."""

import json
import tempfile
import unittest
from pathlib import Path

from memory_contract import parse_memory_record, validate_jsonl

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "docs/architecture/glorifier-memory-v1-fixtures.json"


class MemoryContractTests(unittest.TestCase):
    def test_shared_fixture_parity(self):
        for entry in json.loads(FIXTURES.read_text(encoding="utf-8"))["cases"]:
            with self.subTest(name=entry["name"]):
                if entry["valid"]:
                    self.assertEqual(parse_memory_record(entry["record"]), entry["record"])
                else:
                    with self.assertRaises(ValueError):
                        parse_memory_record(entry["record"])

    def test_rejects_multibyte_overflow(self):
        record = json.loads(FIXTURES.read_text(encoding="utf-8"))["cases"][0]["record"]
        with self.assertRaises(ValueError):
            parse_memory_record({**record, "content": "界" * 3000})

    def test_validates_bounded_jsonl_without_import(self):
        record = json.loads(FIXTURES.read_text(encoding="utf-8"))["cases"][0]["record"]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "records.jsonl"
            path.write_text(json.dumps(record, ensure_ascii=False) + "\n", encoding="utf-8")
            self.assertEqual(validate_jsonl(path), 1)
            path.write_text('not valid json\n', encoding="utf-8")
            with self.assertRaises(json.JSONDecodeError):
                validate_jsonl(path)


if __name__ == "__main__":
    unittest.main()
