"""Cloudflare Worker boot contract regression tests."""

import json
from pathlib import Path

from app.runtime import build_orchestrator_from_environment


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


def test_worker_config_provides_explicit_openai_model_without_network_calls():
    service_root = Path(__file__).resolve().parents[1]
    config = json.loads(
        (service_root / "cloudflare" / "wrangler.jsonc").read_text(encoding="utf-8")
    )
    model = config["vars"].get("OPENAI_MODEL")
    assert model == "gpt-6-luna"

    orchestrator = build_orchestrator_from_environment(
        {
            **config["vars"],
            "GLORIFIER_ENABLE_INFERENCE": "true",
            "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "true",
            "OPENAI_API_KEY": "test-only-placeholder",
        }
    )
    adapter = orchestrator._providers.get("openai")

    assert adapter is not None
    assert adapter._model == model
    assert adapter.is_configured()
