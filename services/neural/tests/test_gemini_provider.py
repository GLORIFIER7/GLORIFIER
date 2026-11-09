import asyncio
import json

import pytest

from app.providers.gemini import GeminiInteractionsAdapter


class FakeReader:
    def __init__(self, body: bytes):
        self.body = body
        self.read_once = False

    async def read(self):
        if self.read_once:
            return type("ReadResult", (), {"done": True, "value": None})()
        self.read_once = True
        return type("ReadResult", (), {"done": False, "value": self.body})()

    async def cancel(self):
        return None

    def releaseLock(self):
        return None


class FakeStream:
    def __init__(self, body: bytes):
        self.reader = FakeReader(body)

    def getReader(self):
        return self.reader


class FakeResponse:
    def __init__(self, payload, status=200, *, headers=None):
        self.status = status
        self.headers: dict[str, str] = headers or {}
        self.body = FakeStream(json.dumps(payload).encode("utf-8"))


def test_gemini_adapter_requires_api_key_and_model():
    assert GeminiInteractionsAdapter(api_key="", model="gemini-3.8-flash").is_configured() is False
    assert GeminiInteractionsAdapter(api_key="test-key", model="").is_configured() is False


def test_gemini_async_readiness_and_inference_use_stateless_interactions_api():
    calls = []

    async def fake_fetch(url, *, method, headers, body=None, redirect="manual"):
        calls.append({
            "url": url,
            "method": method,
            "headers": dict(headers),
            "body": json.loads(body) if body else None,
            "redirect": redirect,
        })
        if method == "GET":
            return FakeResponse({"name": "models/gemini-3.8-flash"})
        return FakeResponse({
            "id": "interaction_test_123",
            "status": "completed",
            "steps": [{
                "type": "model_output",
                "content": [{"type": "text", "text": "Gemini response"}],
            }],
        }, headers={"x-goog-request-id": "gemini-request-123"})

    adapter = GeminiInteractionsAdapter(
        api_key="request-scoped-secret",
        model="gemini-3.8-flash",
        fetch_fn=fake_fetch,
    )

    async def run():
        await adapter.acheck_readiness()
        return await adapter.ainfer("controlled prompt")

    result = asyncio.run(run())

    assert result.provider == "gemini"
    assert result.text == "Gemini response"
    assert result.request_id == "gemini-request-123"
    assert calls[0]["method"] == "GET"
    assert calls[0]["url"] == "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash"
    assert calls[0]["body"] is None
    assert calls[1]["method"] == "POST"
    assert calls[1]["url"] == GeminiInteractionsAdapter.endpoint
    assert calls[1]["headers"]["x-goog-api-key"] == "request-scoped-secret"
    assert calls[1]["body"]["model"] == "gemini-3.8-flash"
    assert calls[1]["body"]["input"] == "controlled prompt"
    assert calls[1]["body"]["store"] is False
    assert calls[1]["redirect"] == "manual"


def test_gemini_async_provider_sanitizes_upstream_errors():
    async def failed_fetch(*_args, **_kwargs):
        raise RuntimeError("private upstream detail and request-scoped-secret")

    adapter = GeminiInteractionsAdapter(
        api_key="request-scoped-secret",
        model="gemini-3.8-flash",
        fetch_fn=failed_fetch,
    )

    with pytest.raises(RuntimeError, match="endpoint is unavailable") as readiness_error:
        asyncio.run(adapter.acheck_readiness())

    assert "request-scoped-secret" not in str(readiness_error.value)
    assert "private upstream detail" not in str(readiness_error.value)
    assert readiness_error.value.__cause__ is None
    assert readiness_error.value.__context__ is None

    with pytest.raises(RuntimeError, match="request is unavailable") as inference_error:
        asyncio.run(adapter.ainfer("controlled prompt"))

    assert "request-scoped-secret" not in str(inference_error.value)
    assert "private upstream detail" not in str(inference_error.value)
    assert inference_error.value.__cause__ is None
    assert inference_error.value.__context__ is None


def test_gemini_async_readiness_rejects_http_errors_without_echoing_upstream_body():
    async def failed_fetch(*_args, **_kwargs):
        return FakeResponse(
            {"error": {"message": "private upstream body contains request-scoped-secret"}},
            status=429,
        )

    adapter = GeminiInteractionsAdapter(
        api_key="request-scoped-secret",
        model="gemini-3.8-flash",
        fetch_fn=failed_fetch,
    )

    with pytest.raises(RuntimeError, match="readiness probe failed with HTTP 429") as exc_info:
        asyncio.run(adapter.acheck_readiness())

    assert "request-scoped-secret" not in str(exc_info.value)
    assert "private upstream body" not in str(exc_info.value)
    assert exc_info.value.__cause__ is None
    assert exc_info.value.__context__ is None


def test_gemini_async_provider_rejects_malformed_or_empty_interaction_output():
    async def fake_fetch(*_args, **_kwargs):
        return FakeResponse({"id": "interaction_empty", "steps": []})

    adapter = GeminiInteractionsAdapter(
        api_key="test-key",
        model="gemini-3.8-flash",
        fetch_fn=fake_fetch,
    )

    with pytest.raises(RuntimeError, match="empty or oversized response"):
        asyncio.run(adapter.ainfer("hello"))
