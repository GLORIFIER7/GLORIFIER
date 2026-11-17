import asyncio

import pytest
from fastapi import HTTPException, Request

from app.api import autopilot_workers_ai_readiness
from app.runtime import build_orchestrator_from_environment


class _FakeAI:
    async def run(self, _model, _inputs):
        return {"response": "synthetic-only"}


def _request(environment, token="test-api-token"):
    headers = [] if token is None else [(b"authorization", f"Bearer {token}".encode())]
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/__internal/autopilot/readiness",
        "raw_path": b"/__internal/autopilot/readiness",
        "query_string": b"",
        "headers": headers,
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
        "GLORIFIER_WORKERS_PLAN_VERIFIED": "true",
        "GLORIFIER_WORKERS_AI_FREE_ONLY": "true",
        "GLORIFIER_WORKERS_AI_MODEL": "@cf/google/gemma-4-26b-a4b-it",
        "AI": _FakeAI(),
    }


@pytest.mark.parametrize(
    "token,authorization",
    [(None, None), ("wrong-token", "Bearer wrong-token")],
)
def test_autopilot_readiness_rejects_missing_or_invalid_worker_bearer(token, authorization):
    with pytest.raises(HTTPException) as rejected:
        asyncio.run(
            autopilot_workers_ai_readiness(
                _request(_free_environment(), token=token),
                authorization,
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
        "workersPlanVerified": True,
        "freeOnly": True,
        "inferenceEnabled": True,
        "externalDataEgress": False,
        "paidInferenceAuthorized": False,
        "factualVerification": False,
    }


def test_autopilot_readiness_does_not_trust_the_free_plan_label_without_verification():
    environment = _free_environment()
    environment.pop("GLORIFIER_WORKERS_PLAN_VERIFIED")
    response = asyncio.run(
        autopilot_workers_ai_readiness(_request(environment), "Bearer test-api-token")
    )

    import json
    body = json.loads(response.body)
    assert response.status_code == 200
    assert body["eligible"] is False
    assert body["workersPlan"] == "unverified"
    assert body["workersPlanVerified"] is False
def test_autopilot_readiness_uses_the_same_pinned_default_model_as_runtime():
    environment = _free_environment()
    environment.pop("GLORIFIER_WORKERS_AI_MODEL")
    response = asyncio.run(
        autopilot_workers_ai_readiness(_request(environment), "Bearer test-api-token")
    )
    import json
    body = json.loads(response.body)
    assert body["eligible"] is True
    assert body["model"] == "@cf/google/gemma-4-26b-a4b-it"


def test_autopilot_readiness_rejects_missing_ai_binding():
    environment = _free_environment()
    environment.pop("AI")
    response = asyncio.run(
        autopilot_workers_ai_readiness(_request(environment), "Bearer test-api-token")
    )
    import json
    assert json.loads(response.body)["eligible"] is False


def test_autopilot_readiness_rejects_disabled_free_only_mode():
    environment = _free_environment()
    environment["GLORIFIER_WORKERS_AI_FREE_ONLY"] = "false"
    response = asyncio.run(
        autopilot_workers_ai_readiness(_request(environment), "Bearer test-api-token")
    )
    import json
    assert json.loads(response.body)["eligible"] is False


def test_runtime_exposes_public_provider_readiness_without_private_attribute_access():
    runtime = build_orchestrator_from_environment(_free_environment())
    assert runtime.inference_enabled is True
    assert runtime.has_configured_provider("cloudflare_workers_ai") is True
