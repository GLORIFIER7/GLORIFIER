"""Portable GLORIFIER memory v1 validator (stdlib-only, no network/database access).

This does not authorize memory retrieval, import records, or verify source claims.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path
from typing import Any

FIELDS = frozenset({
    "tenantId", "subjectId", "memoryKey", "category", "content", "sourceRef",
    "status", "version", "createdAt", "updatedAt",
})
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}\Z")
TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\Z")
CATEGORIES = frozenset({"identity", "fact", "decision", "episode"})
MAX_JSONL_LINE_BYTES = 16_384


def parse_memory_record(value: Any) -> dict[str, Any]:
    """Validate a JSON record using the same constraints as the TypeScript adapter."""
    if not isinstance(value, dict) or set(value) != FIELDS:
        raise ValueError("invalid memory record fields")
    for name in ("tenantId", "subjectId", "memoryKey"):
        if not isinstance(value[name], str) or not IDENTIFIER.fullmatch(value[name]):
            raise ValueError(f"invalid {name}")
    if not isinstance(value["category"], str) or value["category"] not in CATEGORIES:
        raise ValueError("invalid category")
    for name, limit in (("content", 8192), ("sourceRef", 1024)):
        text = value[name]
        if not isinstance(text, str) or not text.strip() or "\0" in text or len(text.encode("utf-8")) > limit:
            raise ValueError(f"invalid {name}")
    if value["status"] != "NOT VERIFIED":
        raise ValueError("invalid status")
    version = value["version"]
    # JSON Schema's integer includes numbers such as 1.0; JavaScript's JSON.parse
    # normalizes these to Number(1). Reject bool, fractions and unsafe integers.
    if type(version) not in (int, float) or not (1 <= version <= 9_007_199_254_740_991) or (type(version) is float and not version.is_integer()):
        raise ValueError("invalid version")
    for name in ("createdAt", "updatedAt"):
        timestamp = value[name]
        if not isinstance(timestamp, str) or not TIMESTAMP.fullmatch(timestamp):
            raise ValueError(f"invalid {name}")
        try:
            parsed = dt.datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%S.%fZ")
            if parsed.strftime("%Y-%m-%dT%H:%M:%S.%f")[:23] + "Z" != timestamp:
                raise ValueError(f"invalid {name}")
        except ValueError as exc:
            raise ValueError(f"invalid {name}") from exc
    return {**value, "version": int(version)}


def validate_jsonl(path: Path) -> int:
    """Read and validate a bounded line-oriented export, without executing it."""
    count = 0
    # Read a bounded number of raw *bytes*, not unbounded text lines. Reject an
    # oversized line before decoding or JSON parsing to cap peak memory use.
    with path.open("rb") as stream:
        while True:
            raw = stream.readline(MAX_JSONL_LINE_BYTES + 1)
            if not raw:
                break
            if len(raw) > MAX_JSONL_LINE_BYTES:
                raise ValueError("memory record line exceeds 16 KiB")
            if not raw.strip():
                continue
            parse_memory_record(json.loads(raw.decode("utf-8")))
            count += 1
    return count


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/memory/memory_contract.py <records.jsonl>")
    try:
        count = validate_jsonl(Path(sys.argv[1]))
    except (OSError, ValueError, UnicodeError) as exc:
        raise SystemExit(f"INVALID memory export: {exc}") from exc
    print(f"VALIDATED {count} memory records (no import performed)")
