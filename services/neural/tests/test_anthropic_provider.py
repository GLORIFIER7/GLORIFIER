import asyncio
import json

import pytest

from app.providers.anthropic import AnthropicMessagesAdapter


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
        self.headers = headers or {}
        self.body = FakeStream(json.dumps(payload).encode("utf-8"))


def test_anthropic_adapter_requires_api_key_and_model():
    assert AnthropicMessagesAdapter(api_key="", model="claude-sonnet-5").is_configured() is False
    assert AnthropicMessagesAdapter(api_key="test-key", model="").is_configured() is False


def test_anthropic_async_readiness_and_inference_use_messages_api():
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
            return FakeResponse({"id": "claude-sonnet-5", "type": "model"})
        return FakeResponse({
            "id": "msg_test_123",
            "type": "message",
            "content": [
                {"type": "text", "text": "Claude response"},
                {"type": "tool_use", "id": "tool_1", "name": "example", "input": {}},
            ],
        }, headers={"request-id": "anthropic-request-123"})

    adapter = AnthropicMessagesAdapter(
        api_key="request-scoped-secret",
        model="claude-sonnet-5",
        fetch_fn=fake_fetch,
    )

    async def run():
        await adapter.acheck_readiness()
        return await adapter.ainfer("controlled prompt")

    result = asyncio.run(run())

    assert result.provider == "anthropic"
    assert result.text == "Claude response"
    assert result.request_id == "anthropic-request-123"
    assert calls[0]["method"] == "GET"
    assert calls[0]["url"] == "https://api.anthropic.com/v1/models/claude-sonnet-5"
    assert calls[0]["body"] is None
    assert calls[1]["method"] == "POST"
    assert calls[1]["url"] == AnthropicMessagesAdapter.endpoint
    assert calls[1]["headers"]["Authorization"] == "Bearer request-scoped-secret"
    assert "x-api-key" not in calls[1]["headers"]
    assert calls[1]["headers"]["anthropic-version"] == AnthropicMessagesAdapter.api_version
    assert calls[1]["body"]["model"] == "claude-sonnet-5"
    assert calls[1]["body"]["messages"] == [{"role": "user", "content": "controlled prompt"}]
    assert calls[1]["body"]["max_tokens"] == adapter.max_output_tokens
    assert calls[1]["redirect"] == "manual"


def test_anthropic_async_provider_sanitizes_upstream_errors():
    async def failed_fetch(*_args, **_kwargs):
        raise RuntimeError("private upstream detail and request-scoped-secret")

    adapter = AnthropicMessagesAdapter(
        api_key="request-scoped-secret",
        model="claude-sonnet-5",
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


def test_anthropic_async_readiness_rejects_http_errors_without_echoing_upstream_body():
    async def failed_fetch(*_args, **_kwargs):
        return FakeResponse(
            {"error": {"message": "private upstream body contains request-scoped-secret"}},
            status=502,
        )

    adapter = AnthropicMessagesAdapter(
        api_key="request-scoped-secret",
        model="claude-sonnet-5",
        fetch_fn=failed_fetch,
    )

    with pytest.raises(RuntimeError, match="readiness probe failed with HTTP 502") as exc_info:
        asyncio.run(adapter.acheck_readiness())

    assert "request-scoped-secret" not in str(exc_info.value)
    assert "private upstream body" not in str(exc_info.value)
    assert exc_info.value.__cause__ is None
    assert exc_info.value.__context__ is None


def test_anthropic_async_provider_rejects_malformed_or_empty_message_output():
    async def fake_fetch(*_args, **_kwargs):
        return FakeResponse({"id": "msg_empty", "content": []})

    adapter = AnthropicMessagesAdapter(
        api_key="test-key",
        model="claude-sonnet-5",
        fetch_fn=fake_fetch,
    )

    with pytest.raises(RuntimeError, match="empty or oversized response"):
        asyncio.run(adapter.ainfer("hello"))
