import asyncio
import json

import pytest

from app.providers.dynamo import NvidiaDynamoAdapter


class _FakeReader:
    def __init__(self, body: bytes) -> None:
        self._body = body
        self._read = False

    async def read(self):
        if self._read:
            return type("ReadResult", (), {"done": True, "value": None})()
        self._read = True
        return type("ReadResult", (), {"done": False, "value": self._body})()

    async def cancel(self):
        return None

    def releaseLock(self):
        return None


class _FakeStream:
    def __init__(self, body: bytes) -> None:
        self._body = body

    def getReader(self):
        return _FakeReader(self._body)


class _FakeResponse:
    def __init__(self, status: int, payload: dict | bytes, request_id: str = "req-dynamo-1"):
        self.status = status
        self.headers: dict[str, str] = {"x-request-id": request_id}
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")
        self.body = _FakeStream(body)


def _adapter(**overrides) -> NvidiaDynamoAdapter:
    values = {
        "api_key": "dynamo-test-secret",
        "model": "Qwen/Qwen3-0.6B",
        "base_url": "https://dynamo.example/v1",
        "allowed_origin": "https://dynamo.example",
    }
    values.update(overrides)
    return NvidiaDynamoAdapter(**values)


def test_dynamo_adapter_requires_https_and_an_exact_origin_allowlist():
    assert _adapter().is_configured()
    assert not _adapter(base_url="http://dynamo.example/v1").is_configured()
    assert not _adapter(
        base_url="https://other.example/v1",
        allowed_origin="https://dynamo.example",
    ).is_configured()
    assert not _adapter(allowed_origin="https://*.example").is_configured()
    assert not _adapter(base_url="https://user:pass@dynamo.example/v1").is_configured()
    assert not _adapter(base_url="https://dynamo.example/v1?forward=1").is_configured()


def test_dynamo_adapter_is_unconfigured_without_all_explicit_settings():
    assert not _adapter(api_key="").is_configured()
    assert not _adapter(model="").is_configured()
    assert not _adapter(base_url="").is_configured()
    assert not _adapter(allowed_origin="").is_configured()


def test_dynamo_async_readiness_uses_only_the_model_catalogue():
    calls = []

    async def fake_fetch(url, *, method, headers, body=None, redirect="manual", **_kwargs):
        calls.append({
            "url": url,
            "method": method,
            "headers": headers,
            "body": body,
            "redirect": redirect,
        })
        return _FakeResponse(200, {
            "object": "list",
            "data": [{"id": "Qwen/Qwen3-0.6B", "object": "model"}],
        })

    adapter = _adapter(fetch_fn=fake_fetch)
    asyncio.run(adapter.acheck_readiness())

    assert len(calls) == 1
    assert calls[0]["url"] == "https://dynamo.example/v1/models"
    assert calls[0]["method"] == "GET"
    assert calls[0]["body"] is None
    assert calls[0]["headers"]["Authorization"] == "Bearer dynamo-test-secret"
    assert calls[0]["redirect"] == "manual"


def test_dynamo_async_inference_uses_openai_chat_completions_without_streaming():
    calls = []

    async def fake_fetch(url, *, method, headers, body=None, redirect="manual", **_kwargs):
        calls.append({
            "url": url,
            "method": method,
            "headers": headers,
            "body": json.loads(body) if body else None,
            "redirect": redirect,
        })
        return _FakeResponse(200, {
            "id": "chatcmpl-dynamo-1",
            "choices": [{"message": {"role": "assistant", "content": "Dynamo result"}}],
        })

    adapter = _adapter(fetch_fn=fake_fetch)
    result = asyncio.run(adapter.ainfer("controlled prompt", timeout_seconds=4))

    assert result.provider == "nvidia_dynamo"
    assert result.text == "Dynamo result"
    assert result.request_id == "req-dynamo-1"
    assert calls[0]["url"] == "https://dynamo.example/v1/chat/completions"
    assert calls[0]["method"] == "POST"
    assert calls[0]["headers"]["Authorization"] == "Bearer dynamo-test-secret"
    assert calls[0]["headers"]["Content-Type"] == "application/json"
    assert calls[0]["body"] == {
        "model": "Qwen/Qwen3-0.6B",
        "messages": [{"role": "user", "content": "controlled prompt"}],
        "max_tokens": adapter.max_output_tokens,
        "stream": False,
    }
    assert calls[0]["redirect"] == "manual"


def test_dynamo_readiness_rejects_missing_model_without_running_inference():
    async def fake_fetch(_url, *, method, **_kwargs):
        if method != "GET":
            raise RuntimeError(f"Expected GET, got {method}")
        return _FakeResponse(200, {"object": "list", "data": [{"id": "different-model"}]})

    with pytest.raises(RuntimeError, match="not present"):
        asyncio.run(_adapter(fetch_fn=fake_fetch).acheck_readiness())


@pytest.mark.parametrize("status", [301, 302, 307, 308, 401, 403, 500, 503])
def test_dynamo_adapter_rejects_redirects_and_http_failures_without_leaking_details(status):
    async def fake_fetch(*_args, **_kwargs):
        return _FakeResponse(status, {"error": "sensitive upstream response"})

    adapter = _adapter(fetch_fn=fake_fetch)
    with pytest.raises(RuntimeError, match=f"HTTP {status}") as exc_info:
        asyncio.run(adapter.acheck_readiness())
    assert "dynamo-test-secret" not in str(exc_info.value)
    assert "sensitive upstream response" not in str(exc_info.value)


def test_dynamo_adapter_rejects_malformed_and_oversized_responses():
    async def malformed_fetch(*_args, **_kwargs):
        return _FakeResponse(200, b"not-json")

    with pytest.raises(RuntimeError, match="invalid JSON"):
        asyncio.run(_adapter(fetch_fn=malformed_fetch).acheck_readiness())

    async def oversized_fetch(*_args, **_kwargs):
        return _FakeResponse(200, b"x" * 262_145)

    with pytest.raises(RuntimeError, match="response size limit"):
        asyncio.run(_adapter(fetch_fn=oversized_fetch).acheck_readiness())


def test_dynamo_adapter_rejects_empty_or_oversized_prompts_before_network():
    calls = []

    async def fake_fetch(*args, **kwargs):
        calls.append(args)
        return _FakeResponse(200, {
            "id": "chatcmpl-dynamo-1",
            "choices": [{"message": {"content": "ok"}}],
        })

    adapter = _adapter(fetch_fn=fake_fetch)
    with pytest.raises(ValueError, match="empty"):
        asyncio.run(adapter.ainfer("   "))
    with pytest.raises(ValueError, match="exceeds"):
        asyncio.run(adapter.ainfer("x" * (adapter.max_prompt_chars + 1)))
    assert calls == []


def test_dynamo_adapter_sanitizes_transport_errors():
    async def failed_fetch(*_args, **_kwargs):
        raise RuntimeError("private endpoint and dynamo-test-secret")

    with pytest.raises(RuntimeError, match="unavailable") as exc_info:
        asyncio.run(_adapter(fetch_fn=failed_fetch).acheck_readiness())

    assert "dynamo-test-secret" not in str(exc_info.value)
    assert "private endpoint" not in str(exc_info.value)


def test_runtime_registers_dynamo_only_when_provider_and_egress_are_explicit():
    from app.runtime import build_orchestrator_from_environment

    environment = {
        "GLORIFIER_PROVIDER": "nvidia_dynamo",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "true",
        "GLORIFIER_ENABLE_INFERENCE": "false",
        "NVIDIA_DYNAMO_API_KEY": "dynamo-test-secret",
        "NVIDIA_DYNAMO_MODEL": "Qwen/Qwen3-0.6B",
        "NVIDIA_DYNAMO_BASE_URL": "https://dynamo.example/v1",
        "NVIDIA_DYNAMO_ALLOWED_ORIGIN": "https://dynamo.example",
    }
    orchestrator = build_orchestrator_from_environment(environment)

    provider = orchestrator._providers.get("nvidia_dynamo")
    assert provider is not None
    assert provider.is_configured()
    assert orchestrator._allow_inference is False
    assert orchestrator._allow_provider_readiness is True


def test_runtime_does_not_register_dynamo_when_external_egress_is_not_authorized():
    from app.runtime import build_orchestrator_from_environment

    environment = {
        "GLORIFIER_PROVIDER": "nvidia_dynamo",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "false",
        "GLORIFIER_ENABLE_INFERENCE": "true",
        "NVIDIA_DYNAMO_API_KEY": "dynamo-test-secret",
        "NVIDIA_DYNAMO_MODEL": "Qwen/Qwen3-0.6B",
        "NVIDIA_DYNAMO_BASE_URL": "https://dynamo.example/v1",
        "NVIDIA_DYNAMO_ALLOWED_ORIGIN": "https://dynamo.example",
    }
    orchestrator = build_orchestrator_from_environment(environment)

    assert orchestrator._providers.get("nvidia_dynamo") is None


class _FakeSocket:
    def __init__(self) -> None:
        self.timeouts: list[float] = []
        self.current_timeout: float | None = None

    def settimeout(self, timeout: float) -> None:
        self.current_timeout = timeout
        self.timeouts.append(timeout)


class _FakeSyncResponse:
    status = 200

    def __init__(self, body: bytes, *, clock=None, read_delay: float = 0.0) -> None:
        self.headers = {"x-request-id": "req-dynamo-sync"}
        self._body = body
        self._clock = clock
        self._read_delay = read_delay
        self.connection = None

    def getheader(self, name: str):
        return self.headers.get(name)

    def read1(self, limit: int) -> bytes:
        if self._clock is not None and self._read_delay:
            available = self.connection.sock.current_timeout or 0.0
            if self._read_delay > available:
                self._clock[0] += available
                raise TimeoutError("simulated slow Dynamo response")
            self._clock[0] += self._read_delay
        chunk = self._body[:limit]
        self._body = self._body[len(chunk):]
        return chunk


class _FakeSyncConnection:
    def __init__(self, response, captured: dict) -> None:
        self.sock = _FakeSocket()
        self.response = response
        self.captured = captured
        self.response.connection = self
        self.closed = False

    def request(self, method, path, *, body=None, headers=None):
        self.captured.update({
            "method": method,
            "path": path,
            "body": body,
            "headers": headers or {},
        })

    def getresponse(self):
        return self.response

    def close(self):
        self.closed = True


def test_dynamo_sync_readiness_uses_authenticated_model_catalogue_request(monkeypatch):
    import app.providers.dynamo as dynamo_module

    captured = {}
    body = json.dumps({
        "object": "list",
        "data": [{"id": "Qwen/Qwen3-0.6B", "object": "model"}],
    }).encode()
    response = _FakeSyncResponse(body)

    def fake_open(url, *, timeout):
        captured["url"] = url
        captured["timeout"] = timeout
        return _FakeSyncConnection(response, captured)

    monkeypatch.setattr(dynamo_module, "_open_sync_connection", fake_open)
    _adapter().check_readiness()

    assert captured["url"] == "https://dynamo.example/v1/models"
    assert captured["path"] == "/v1/models"
    assert captured["method"] == "GET"
    assert captured["headers"]["Authorization"] == "Bearer dynamo-test-secret"
    assert 0 < captured["timeout"] <= 5


def test_dynamo_sync_readiness_uses_one_deadline_for_connect_and_body(monkeypatch):
    import app.providers.dynamo as dynamo_module

    clock = [100.0]
    monkeypatch.setattr(dynamo_module.time, "monotonic", lambda: clock[0])
    body = json.dumps({
        "object": "list",
        "data": [{"id": "Qwen/Qwen3-0.6B", "object": "model"}],
    }).encode()
    response = _FakeSyncResponse(body, clock=clock, read_delay=0.6)
    captured = {}

    def open_after_slow_connection(url, *, timeout):
        assert url == "https://dynamo.example/v1/models"
        assert timeout == pytest.approx(5.0)
        clock[0] += 4.5
        return _FakeSyncConnection(response, captured)

    monkeypatch.setattr(
        dynamo_module,
        "_open_sync_connection",
        open_after_slow_connection,
    )

    with pytest.raises(RuntimeError, match="unavailable or exceeded its timeout"):
        _adapter().check_readiness()

    assert response.connection.sock.timeouts[-1] == pytest.approx(0.5)
    assert clock[0] == pytest.approx(105.0)
    assert response.connection.closed is True


def test_dynamo_sync_readiness_accepts_a_real_http_client_response(monkeypatch):
    import http.client
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    import threading

    import app.providers.dynamo as dynamo_module

    payload = json.dumps({
        "object": "list",
        "data": [{"id": "Qwen/Qwen3-0.6B", "object": "model"}],
    }).encode()

    class Handler(BaseHTTPRequestHandler):
        # Exercise HTTP/1.0's normal connection-close response semantics.
        protocol_version = "HTTP/1.0"

        def do_GET(self):
            if (
                self.path != "/v1/models"
                or self.headers.get("Authorization") != "Bearer dynamo-test-secret"
            ):
                self.send_error(400)
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("X-Request-ID", "req-local-http")
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *_args):
            return None

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    def open_local_http(_url, *, timeout):
        return http.client.HTTPConnection(
            "127.0.0.1",
            server.server_port,
            timeout=timeout,
        )

    monkeypatch.setattr(dynamo_module, "_open_sync_connection", open_local_http)
    try:
        _adapter().check_readiness()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)

@pytest.mark.parametrize(
    ("base_url", "allowed_origin"),
    [
        ("https://*.example/v1", "https://*.example"),
        ("https://*.example/v1", "https://dynamo.example"),
        ("https://dynamo.example/v1", "https://*.example"),
        ("https://api.*.example/v1", "https://api.*.example"),
    ],
)
def test_dynamo_adapter_rejects_wildcard_hostnames_in_either_origin(base_url, allowed_origin):
    """A wildcard in the API URL or allowlist must never authorize egress."""
    assert not _adapter(base_url=base_url, allowed_origin=allowed_origin).is_configured()
