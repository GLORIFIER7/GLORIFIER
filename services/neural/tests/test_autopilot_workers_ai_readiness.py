import asyncio

import pytest
from fastapi import HTTPException, Request

from app.api import autopilot_workers_ai_readiness


class _FakeAI:
    async def run(self, _model, _inputs):
        return {"response": "synthetic-only"}


def _request(environment, token="test-api-token"):
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/__internal/autopilot/readiness",
        "raw_path": b"/__internal/autopilot/readiness",
        "query_string": b"",
        "headers": [(b"authorization", f"Bearer {token}".encode())],
        "server": ("glorifier-neural.internal", 443),
        "client": ("127.0.0.1", 12345),
        "scheme": "https",
        "env": environment,
    })


def _free_environment():
    return {
        "GLORIFIER_API_TOKEN": "test-api-token",
        "GLORIFIER_PROVIDER": "cloudflare_workers_ai",
        "GLORIFIER_ENABLE_INFERENCE": "true",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "false",
        "GLORIFIER_PAID_INFERENCE_AUTHORIZED": "false",
        "GLORIFIER_WORKERS_PLAN": "free",
        "GLORIFIER_WORKERS_AI_FREE_ONLY": "true",
        "GLORIFIER_WORKERS_AI_MODEL": "@cf/google/gemma-4-26b-a4b-it",
        "AI": _FakeAI(),
    }


def test_autopilot_readiness_rejects_missing_or_invalid_worker_bearer():
    with pytest.raises(HTTPException) as rejected:
        asyncio.run(
            autopilot_workers_ai_readiness(
                _request(_free_environment(), token="wrong-token"),
                "Bearer wrong-token",
            )
        )

    assert rejected.value.status_code == 401


def test_autopilot_readiness_requires_exact_free_only_runtime_and_ai_binding():
    environment = _free_environment()
    environment["GLORIFIER_WORKERS_PLAN"] = "unverified"
    response = asyncio.run(
        autopilot_workers_ai_readiness(_request(environment), "Bearer test-api-token")
    )

    assert response.status_code == 200
    assert response.body
    import json
    body = json.loads(response.body)
    assert body["eligible"] is False
    assert body["workersPlan"] == "unverified"
    assert body["paidInferenceAuthorized"] is False
    assert body["externalDataEgress"] is False


def test_autopilot_readiness_accepts_only_the_pinned_free_workers_ai_path():
    response = asyncio.run(
        autopilot_workers_ai_readiness(_request(_free_environment()), "Bearer test-api-token")
    )

    assert response.status_code == 200
    import json
    body = json.loads(response.body)
    assert body == {
        "eligible": True,
        "reason": "ready",
        "provider": "cloudflare_workers_ai",
        "model": "@cf/google/gemma-4-26b-a4b-it",
        "workersPlan": "free",
        "freeOnly": True,
        "inferenceEnabled": True,
        "externalDataEgress": False,
        "paidInferenceAuthorized": False,
        "factualVerification": False,
    }
