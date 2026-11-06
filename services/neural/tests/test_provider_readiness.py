"""Regression coverage for fail-closed provider and database readiness."""

import urllib.error
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.orchestrator import Orchestrator
from app.providers import NvidiaNimAdapter
from app.providers.base import InferenceResult, ProviderAdapter
from app.providers.registry import ProviderRegistry


class ReadinessProvider(ProviderAdapter):
    name = "fake"

    def __init__(self, *, configured: bool = True, fail: bool = False) -> None:
        self.configured = configured
        self.fail = fail
        self.readiness_calls = 0

    def is_configured(self) -> bool:
        return self.configured

    def check_readiness(self) -> None:
        self.readiness_calls += 1
        if self.fail:
            raise RuntimeError("sensitive endpoint and credential details")

    def infer(self, prompt: str, *, timeout_seconds: float = 30.0) -> InferenceResult:
        raise AssertionError("readiness must never invoke inference")


def test_readiness_stays_unverified_when_provider_inference_is_disabled():
    registry = ProviderRegistry()
    provider = ReadinessProvider()
    registry.register(provider)
    orchestrator = Orchestrator(
        registry, allow_inference=False, provider_name="fake"
    )

    status, message = orchestrator.check_readiness()

    assert status == "NOT VERIFIED"
    assert "disabled" in message
    assert provider.readiness_calls == 0


def test_readiness_stays_unverified_without_an_explicit_provider_selection():
    orchestrator = Orchestrator(
        ProviderRegistry(), allow_inference=True, provider_name=None
    )

    status, message = orchestrator.check_readiness()

    assert status == "NOT VERIFIED"
    assert "selected" in message


def test_readiness_stays_unverified_for_an_unconfigured_provider():
    registry = ProviderRegistry()
    provider = ReadinessProvider(configured=False)
    registry.register(provider)
    orchestrator = Orchestrator(
        registry, allow_inference=True, provider_name="fake"
    )

    status, message = orchestrator.check_readiness()

    assert status == "NOT VERIFIED"
    assert "not configured" in message
    assert provider.readiness_calls == 0


def test_provider_readiness_failure_is_sanitized():
    registry = ProviderRegistry()
    provider = ReadinessProvider(fail=True)
    registry.register(provider)
    orchestrator = Orchestrator(
        registry, allow_inference=True, provider_name="fake"
    )

    status, message = orchestrator.check_readiness()

    assert status == "DEGRADED"
    assert "RuntimeError" in message
    assert "sensitive endpoint" not in message
    assert "credential" not in message
    assert provider.readiness_calls == 1


@pytest.mark.parametrize(
    "failure",
    [
        urllib.error.URLError("sensitive upstream detail"),
        TimeoutError("sensitive timeout detail"),
        OSError("sensitive socket detail"),
    ],
)
def test_nvidia_readiness_sanitizes_network_and_timeout_failures(monkeypatch, failure):
    def fail_request(_request, *, timeout):
        assert timeout <= 5
        raise failure

    monkeypatch.setattr("app.providers._open_nvidia_request", fail_request)
    adapter = NvidiaNimAdapter(api_key="readiness-secret")

    with pytest.raises(RuntimeError, match="unavailable") as exc_info:
        adapter.check_readiness()

    assert "readiness-secret" not in str(exc_info.value)
    assert "sensitive" not in str(exc_info.value)


def test_nvidia_readiness_sanitizes_http_failures(monkeypatch):
    def fail_request(request, *, timeout):
        raise urllib.error.HTTPError(
            request.full_url, 503, "sensitive upstream detail", {}, None
        )

    monkeypatch.setattr("app.providers._open_nvidia_request", fail_request)
    adapter = NvidiaNimAdapter(api_key="readiness-secret")

    with pytest.raises(RuntimeError, match="HTTP 503") as exc_info:
        adapter.check_readiness()

    assert "readiness-secret" not in str(exc_info.value)
    assert "sensitive upstream detail" not in str(exc_info.value)


class _FakeSocket:
    def __init__(self) -> None:
        self.timeouts: list[float] = []

    def settimeout(self, timeout: float) -> None:
        self.timeouts.append(timeout)


class _FakeCatalogueResponse:
    status = 200

    def __init__(self, body: bytes) -> None:
        self.body = body
        self.requested_limits: list[int] = []
        self.bytes_read = 0
        self.socket = _FakeSocket()
        self.fp = SimpleNamespace(raw=SimpleNamespace(_sock=self.socket))

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read1(self, limit: int) -> bytes:
        self.requested_limits.append(limit)
        chunk = self.body[:limit]
        self.body = self.body[len(chunk):]
        self.bytes_read += len(chunk)
        return chunk

    def read(self, limit: int) -> bytes:
        return self.read1(limit)


@pytest.mark.parametrize(
    ("body", "expected_message"),
    [
        (b"{not-json", "invalid model catalogue"),
        (b"x" * 262_145, "exceeded the response size limit"),
        (b'{"data": "not-a-list"}', "not present in the available model catalogue"),
    ],
)
def test_nvidia_readiness_rejects_malformed_or_oversized_catalogues(
    monkeypatch, body, expected_message
):
    response = _FakeCatalogueResponse(body)
    monkeypatch.setattr(
        "app.providers._open_nvidia_request",
        lambda _request, *, timeout: response,
    )
    adapter = NvidiaNimAdapter(api_key="readiness-secret")

    with pytest.raises(RuntimeError, match=expected_message):
        adapter.check_readiness()

    assert response.bytes_read == min(len(body), 262_145)
    assert all(0 < limit <= 8_192 for limit in response.requested_limits)


def test_nvidia_readiness_enforces_one_absolute_deadline(monkeypatch):
    import time

    clock = [100.0]
    monkeypatch.setattr(time, "monotonic", lambda: clock[0])

    class SlowSocket:
        def __init__(self):
            self.timeouts = []
            self.current_timeout = None

        def settimeout(self, timeout):
            self.current_timeout = timeout
            self.timeouts.append(timeout)

    class SlowResponse:
        status = 200

        def __init__(self):
            self.socket = SlowSocket()
            self.fp = SimpleNamespace(raw=SimpleNamespace(_sock=self.socket))

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self, _limit):
            # The old one-shot read allowed the five-second budget to be exceeded.
            clock[0] += 6.0
            return b'{"data":[{"id":"nvidia/nemotron-3.5-super-vl-120b-a12b"}]}'

        def read1(self, _limit):
            # The upstream trickles data every two seconds. The second read must
            # time out because only one second remains in the absolute budget.
            timeout = self.socket.current_timeout
            delay = 2.0
            if delay > timeout:
                clock[0] += timeout
                raise TimeoutError("simulated slow upstream")
            clock[0] += delay
            return b"{"

    response = SlowResponse()

    def open_after_connection_delay(_request, *, timeout):
        assert timeout <= 5.0
        clock[0] += 2.0  # connection and response headers consume the same deadline
        return response

    monkeypatch.setattr(
        "app.providers._open_nvidia_request",
        open_after_connection_delay,
    )
    adapter = NvidiaNimAdapter(api_key="readiness-secret")

    with pytest.raises(RuntimeError, match="unavailable"):
        adapter.check_readiness()

    assert response.socket.timeouts == pytest.approx([3.0, 1.0])
    assert clock[0] == pytest.approx(105.0)


def test_failed_explicit_neon_probe_blocks_provider_readiness(monkeypatch):
    class ReadyOrchestrator:
        def check_readiness(self):
            return "VERIFIED", "provider probe passed"

    class FailingNeonProbe:
        def check(self):
            raise RuntimeError("sensitive Neon hostname and password")

    monkeypatch.setattr("app.api.orchestrator", ReadyOrchestrator())
    monkeypatch.setattr(
        "app.api.NeonConnectivityProbe.from_environment",
        lambda: FailingNeonProbe(),
    )

    response = TestClient(app).get("/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "NOT READY"
    assert body["checks"]["providers"] == "VERIFIED"
    assert body["checks"]["database"] == "DEGRADED"
    assert body["execution"]["inference_performed"] is False
    assert "database connectivity probe failed" in body["message"]
    assert "sensitive Neon hostname" not in response.text
    assert "password" not in response.text


def test_successful_explicit_neon_probe_allows_provider_readiness(monkeypatch):
    class ReadyOrchestrator:
        def check_readiness(self):
            return "VERIFIED", "provider probe passed"

    class SuccessfulNeonProbe:
        def check(self):
            return None

    monkeypatch.setattr("app.api.orchestrator", ReadyOrchestrator())
    monkeypatch.setattr(
        "app.api.NeonConnectivityProbe.from_environment",
        lambda: SuccessfulNeonProbe(),
    )

    response = TestClient(app).get("/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "READY"
    assert body["checks"]["providers"] == "VERIFIED"
    assert body["checks"]["database"] == "VERIFIED"
    assert body["execution"]["inference_performed"] is False


def test_provider_readiness_is_cached_for_thirty_seconds(monkeypatch):
    import time

    clock = [100.0]
    monkeypatch.setattr(time, "monotonic", lambda: clock[0])

    registry = ProviderRegistry()
    provider = ReadinessProvider()
    registry.register(provider)
    orchestrator = Orchestrator(
        registry, allow_inference=True, provider_name="fake"
    )

    first = orchestrator.check_readiness()
    clock[0] += 10.0
    second = orchestrator.check_readiness()

    assert first == second
    assert provider.readiness_calls == 1

    clock[0] += 21.0
    third = orchestrator.check_readiness()

    assert third == first
    assert provider.readiness_calls == 2


def test_nvidia_readiness_sanitizes_runtime_error_from_stream_reader():
    class FailingReader:
        async def read(self):
            raise RuntimeError("sensitive upstream body and credential detail")

        async def cancel(self):
            return None

        def releaseLock(self):
            return None

    class FailingBody:
        def getReader(self):
            return FailingReader()

    async def fake_fetch(_url, **_options):
        return SimpleNamespace(status=200, headers={}, body=FailingBody())

    adapter = NvidiaNimAdapter(api_key="readiness-secret")

    async def exercise():
        return await adapter._fetch_text(
            fake_fetch,
            "https://nvidia.example.test/v1/models",
            {},
            timeout_seconds=1.0,
            max_bytes=1024,
            readiness=True,
        )

    with pytest.raises(RuntimeError, match="readiness endpoint is unavailable") as exc_info:
        asyncio.run(exercise())

    assert "sensitive" not in str(exc_info.value)
    assert "readiness-secret" not in str(exc_info.value)
