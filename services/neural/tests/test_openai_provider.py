import asyncio
import json

import pytest
from typing import ClassVar

from app.providers.openai import OpenAIResponsesAdapter


def test_openai_adapter_requires_api_key():
    adapter = OpenAIResponsesAdapter(api_key="", model="gpt-6-luna")

    assert adapter.is_configured() is False


def test_openai_adapter_rejects_oversized_prompt_before_network():
    adapter = OpenAIResponsesAdapter(api_key="test-key", model="gpt-6-luna")

    with pytest.raises(ValueError, match="exceeds"):
        adapter.infer("x" * (adapter.max_prompt_chars + 1))


def test_openai_sync_inference_uses_responses_api_and_preserves_request_id(monkeypatch):
    captured = {}

    class FakeResponse:
        status = 200
        headers: ClassVar[dict[str, str]] = {"x-request-id": "req_test_123"}

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self, limit):
            captured["read_limit"] = limit
            return json.dumps({
                "id": "resp_test_123",
                "output": [{
                    "type": "message",
                    "content": [{"type": "output_text", "text": "GPT result"}],
                }],
            }).encode()

    class FakeOpener:
        def open(self, request, *, timeout):
            captured["url"] = request.full_url
            captured["method"] = request.get_method()
            captured["authorization"] = request.get_header("Authorization")
            captured["timeout"] = timeout
            captured["body"] = json.loads(request.data.decode())
            return FakeResponse()

    def fake_build_opener(handler):
        captured["handler"] = handler
        return FakeOpener()

    monkeypatch.setattr(
        "app.providers.openai.urllib.request.build_opener",
        fake_build_opener,
    )
    adapter = OpenAIResponsesAdapter(api_key="test-key", model="gpt-6-luna")
    result = adapter.infer("hello", timeout_seconds=5)

    assert result.provider == "openai"
    assert result.text == "GPT result"
    assert result.request_id == "req_test_123"
    assert captured["url"] == OpenAIResponsesAdapter.endpoint
    assert captured["method"] == "POST"
    assert captured["authorization"] == "Bearer test-key"
    assert captured["timeout"] == 5
    assert captured["body"]["model"] == "gpt-6-luna"
    assert captured["body"]["input"] == [{"role": "user", "content": "hello"}]
    assert captured["body"]["store"] is False
    assert captured["body"]["max_output_tokens"] == adapter.max_output_tokens
    assert captured["handler"].redirect_request(
        None, None, 302, "Found", {}, "https://attacker.example/"
    ) is None


def test_openai_readiness_uses_read_only_model_endpoint(monkeypatch):
    captured = {}

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self, limit):
            return b'{"id":"gpt-6-luna","object":"model"}'

    class FakeOpener:
        def open(self, request, *, timeout):
            captured["url"] = request.full_url
            captured["method"] = request.get_method()
            captured["body"] = request.data
            captured["timeout"] = timeout
            return FakeResponse()

    monkeypatch.setattr(
        "app.providers.openai.urllib.request.build_opener",
        lambda _handler: FakeOpener(),
    )
    adapter = OpenAIResponsesAdapter(api_key="test-key", model="gpt-6-luna")

    adapter.check_readiness()

    assert captured["url"] == "https://api.openai.com/v1/models/gpt-6-luna"
    assert captured["method"] == "GET"
    assert captured["body"] is None
    assert captured["timeout"] <= 5


def test_openai_async_readiness_and_inference_use_request_scoped_fetch():
    calls = []

    class FakeResponse:
        status = 200
        headers: ClassVar[dict[str, str]] = {"x-request-id": "req_worker_456"}

        def __init__(self, payload):
            self.payload = payload

        async def text(self):
            return json.dumps(self.payload)

    async def fake_fetch(url, *, method, headers, body=None, redirect="manual"):
        calls.append({
            "url": url,
            "method": method,
            "headers": headers,
            "body": json.loads(body) if body else None,
            "redirect": redirect,
        })
        if method == "GET":
            return FakeResponse({"id": "gpt-6-luna", "object": "model"})
        return FakeResponse({
            "id": "resp_worker_456",
            "output": [{
                "type": "message",
                "content": [{"type": "output_text", "text": "Worker GPT result"}],
            }],
        })

    adapter = OpenAIResponsesAdapter(
        api_key="request-scoped-secret",
        model="gpt-6-luna",
        fetch_fn=fake_fetch,
    )

    async def run():
        await adapter.acheck_readiness()
        return await adapter.ainfer("controlled prompt")

    result = asyncio.run(run())

    assert result.provider == "openai"
    assert result.text == "Worker GPT result"
    assert result.request_id == "req_worker_456"
    assert len(calls) == 2
    assert calls[0]["method"] == "GET"
    assert calls[0]["url"] == "https://api.openai.com/v1/models/gpt-6-luna"
    assert calls[1]["method"] == "POST"
    assert calls[1]["url"] == OpenAIResponsesAdapter.endpoint
    assert calls[1]["headers"]["Authorization"] == "Bearer request-scoped-secret"
    assert calls[1]["body"]["store"] is False
    assert calls[1]["redirect"] == "manual"


def test_openai_async_provider_sanitizes_upstream_errors():
    async def failed_fetch(*_args, **_kwargs):
        raise RuntimeError("secret credential and private upstream detail")

    adapter = OpenAIResponsesAdapter(
        api_key="request-scoped-secret",
        model="gpt-6-luna",
        fetch_fn=failed_fetch,
    )

    with pytest.raises(RuntimeError, match="endpoint is unavailable") as exc_info:
        asyncio.run(adapter.acheck_readiness())

    assert "request-scoped-secret" not in str(exc_info.value)
    assert "private upstream detail" not in str(exc_info.value)


def test_openai_async_provider_sanitizes_response_body_failures():
    class BrokenResponse:
        status = 200
        headers: ClassVar[dict[str, str]] = {}

        async def text(self):
            raise RuntimeError("sensitive body parser and credential detail")

    async def fake_fetch(*_args, **_kwargs):
        return BrokenResponse()

    adapter = OpenAIResponsesAdapter(
        api_key="request-scoped-secret",
        model="gpt-6-luna",
        fetch_fn=fake_fetch,
    )

    with pytest.raises(RuntimeError, match="request is unavailable") as exc_info:
        asyncio.run(adapter.ainfer("hello"))

    assert "request-scoped-secret" not in str(exc_info.value)
    assert "sensitive body parser" not in str(exc_info.value)


def test_openai_async_provider_rejects_empty_or_malformed_model_response():
    class FakeResponse:
        status = 200
        headers: ClassVar[dict[str, str]] = {}

        async def text(self):
            return "not-json"

    async def fake_fetch(*_args, **_kwargs):
        return FakeResponse()

    adapter = OpenAIResponsesAdapter(
        api_key="test-key",
        model="gpt-6-luna",
        fetch_fn=fake_fetch,
    )

    async def run():
        return await adapter.ainfer("hello")

    with pytest.raises(RuntimeError, match="invalid JSON response"):
        asyncio.run(run())


def test_openai_runtime_is_the_default_provider_but_inference_stays_disabled(monkeypatch):
    from app.runtime import build_orchestrator_from_environment
    from app.schemas import TaskRequest

    for name in (
        "GLORIFIER_ENABLE_INFERENCE",
        "GLORIFIER_PROVIDER",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS",
        "OPENAI_API_KEY",
        "OPENAI_MODEL",
    ):
        monkeypatch.delenv(name, raising=False)

    orchestrator = build_orchestrator_from_environment()
    result = orchestrator.run(
        TaskRequest(task="hello", require_approval=False)
    )

    assert orchestrator._provider_name == "openai"
    assert orchestrator._allow_inference is False
    assert result.status == "NOT VERIFIED"
    assert result.evidence == ["inference:disabled", "execution:none"]


def test_openai_runtime_requires_explicit_inference_egress_and_key(monkeypatch):
    from app.runtime import build_orchestrator_from_environment

    for name in (
        "GLORIFIER_ENABLE_INFERENCE",
        "GLORIFIER_PROVIDER",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS",
        "OPENAI_API_KEY",
        "OPENAI_MODEL",
    ):
        monkeypatch.delenv(name, raising=False)

    monkeypatch.setenv("GLORIFIER_ENABLE_INFERENCE", "true")
    monkeypatch.setenv("GLORIFIER_PROVIDER", "openai")
    monkeypatch.setenv("GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-only-key")

    orchestrator = build_orchestrator_from_environment()

    assert orchestrator._provider_name == "openai"
    assert orchestrator._allow_inference is True
    assert orchestrator._providers.get("openai") is not None
