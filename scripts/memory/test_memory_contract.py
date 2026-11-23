"""Cross-language fixture parity tests for GLORIFIER memory v1."""

import json
from unittest.mock import patch
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

    def test_integer_equivalent_json_number_acceptance_matches_typescript(self):
        record = json.loads(FIXTURES.read_text(encoding="utf-8"))["cases"][0]["record"]
        self.assertEqual(parse_memory_record({**record, "version": 1.0})["version"], 1)
        for value in (1.5, 0.0, True, float('inf'), float('nan')):
            with self.subTest(version=str(value)):
                with self.assertRaises(ValueError):
                    parse_memory_record({**record, "version": value})

    def test_jsonl_reader_caps_byte_reads_before_decoding(self):
        class GuardedBinaryStream:
            reads = 0
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def readline(self, size=-1):
                self.assert_size(size)
                self.reads += 1
                return b'x' * (16_384 + 1)
            def assert_size(self, size):
                if size != 16_385:
                    raise AssertionError(f"unbounded read: {size}")

        stream = GuardedBinaryStream()
        with patch.object(Path, 'open', return_value=stream):
            with self.assertRaisesRegex(ValueError, '16 KiB'):
                validate_jsonl(Path('untrusted-records.jsonl'))
        self.assertEqual(stream.reads, 1)

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
