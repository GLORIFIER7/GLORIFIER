"""Cloudflare Worker boot contract regression tests."""

from pathlib import Path


def test_worker_validates_asyncpg_connect_api_during_startup():
    worker_path = (
        Path(__file__).resolve().parents[1]
        / "cloudflare"
        / "worker.py"
    )
    source = worker_path.read_text(encoding="utf-8")

    assert "import asyncpg" in source
    assert "callable(asyncpg.connect)" in source
    assert "Cloudflare asyncpg driver is unavailable" in source
