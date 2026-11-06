import asyncio

from app.orchestrator import Orchestrator
from app.providers.base import InferenceResult, ProviderAdapter
from app.providers.registry import ProviderRegistry
from app.schemas import TaskRequest


class FakeProvider(ProviderAdapter):
    name = "fake"

    def __init__(self, *, configured: bool = True, fail: bool = False) -> None:
        self.configured = configured
        self.fail = fail
        self.calls = 0

    def is_configured(self) -> bool:
        return self.configured

    def infer(self, prompt: str, *, timeout_seconds: float = 30.0) -> InferenceResult:
        self.calls += 1
        if self.fail:
            raise RuntimeError("sensitive provider error details")
        return InferenceResult(provider=self.name, text=f"answer: {prompt}")


def test_default_orchestrator_never_runs_inference():
    registry = ProviderRegistry()
    provider = FakeProvider()
    registry.register(provider)
    orchestrator = Orchestrator(registry)

    response = orchestrator.run(TaskRequest(task="summarize", require_approval=False))

    assert response.status == "NOT VERIFIED"
    assert response.evidence == ["inference:disabled", "execution:none"]
    assert provider.calls == 0


def test_approval_required_prevents_provider_call_even_when_enabled():
    registry = ProviderRegistry()
    provider = FakeProvider()
    registry.register(provider)
    orchestrator = Orchestrator(
        registry, allow_inference=True, provider_name="fake"
    )

    response = orchestrator.run(TaskRequest(task="summarize"))

    assert response.status == "NOT VERIFIED"
    assert response.evidence == ["policy:approval-required"]
    assert provider.calls == 0


def test_explicitly_enabled_and_selected_provider_can_return_result():
    registry = ProviderRegistry()
    provider = FakeProvider()
    registry.register(provider)
    orchestrator = Orchestrator(
        registry, allow_inference=True, provider_name="FAKE"
    )

    response = orchestrator.run(
        TaskRequest(task="summarize", require_approval=False)
    )

    assert response.status == "VERIFIED"
    assert response.provider == "fake"
    assert response.result == "answer: summarize"
    assert "factual correctness" in response.message
    assert provider.calls == 1


def test_unconfigured_provider_is_not_called():
    registry = ProviderRegistry()
    provider = FakeProvider(configured=False)
    registry.register(provider)
    orchestrator = Orchestrator(
        registry, allow_inference=True, provider_name="fake"
    )

    response = orchestrator.run(
        TaskRequest(task="summarize", require_approval=False)
    )

    assert response.status == "NOT VERIFIED"
    assert response.evidence == ["provider:fake:unavailable", "execution:none"]
    assert provider.calls == 0


def test_provider_exception_is_sanitized():
    registry = ProviderRegistry()
    provider = FakeProvider(fail=True)
    registry.register(provider)
    orchestrator = Orchestrator(
        registry, allow_inference=True, provider_name="fake"
    )

    response = orchestrator.run(
        TaskRequest(task="summarize", require_approval=False)
    )

    assert response.status == "DEGRADED"
    assert "sensitive provider error details" not in response.message
    assert response.evidence == ["provider:fake:error", "execution:failed"]
    assert provider.calls == 1


def test_blocked_action_prevents_provider_call():
    registry = ProviderRegistry()
    provider = FakeProvider()
    registry.register(provider)
    orchestrator = Orchestrator(
        registry, allow_inference=True, provider_name="fake"
    )

    response = orchestrator.run(
        TaskRequest(
            task="transfer funds",
            action_class="financial",
            require_approval=False,
        )
    )

    assert response.status == "DEGRADED"
    assert response.evidence == ["policy:deny"]
    assert provider.calls == 0


def test_unexpected_provider_exception_is_sanitized():
    registry = ProviderRegistry()
    provider = FakeProvider()
    provider.infer = lambda prompt, *, timeout_seconds=30.0: (_ for _ in ()).throw(
        KeyError("secret prompt and credentials")
    )
    registry.register(provider)
    orchestrator = Orchestrator(registry, allow_inference=True, provider_name="fake")

    response = orchestrator.run(TaskRequest(task="summarize", require_approval=False))

    assert response.status == "DEGRADED"
    assert response.evidence == ["provider:fake:error", "execution:failed"]
    assert "secret prompt and credentials" not in response.message


def test_provider_result_must_be_an_inference_result():
    registry = ProviderRegistry()
    provider = FakeProvider()
    provider.infer = lambda prompt, *, timeout_seconds=30.0: {"text": "looks valid"}
    registry.register(provider)
    orchestrator = Orchestrator(registry, allow_inference=True, provider_name="fake")

    response = orchestrator.run(TaskRequest(task="summarize", require_approval=False))

    assert response.status == "DEGRADED"
    assert response.evidence == ["provider:fake:invalid-result", "execution:rejected"]


def test_provider_identity_must_match_selected_adapter():
    registry = ProviderRegistry()

    class MisidentifiedProvider(FakeProvider):
        def infer(self, prompt: str, *, timeout_seconds: float = 30.0) -> InferenceResult:
            self.calls += 1
            return InferenceResult(provider="different-provider", text="untrusted attribution")

    provider = MisidentifiedProvider()
    registry.register(provider)
    orchestrator = Orchestrator(registry, allow_inference=True, provider_name="fake")

    response = orchestrator.run(TaskRequest(task="summarize", require_approval=False))

    assert response.status == "DEGRADED"
    assert response.result is None
    assert response.evidence == ["provider:fake:invalid-result", "execution:rejected"]


def test_provider_output_over_limit_is_rejected():
    registry = ProviderRegistry()

    class OversizedProvider(FakeProvider):
        def infer(self, prompt: str, *, timeout_seconds: float = 30.0) -> InferenceResult:
            self.calls += 1
            return InferenceResult(provider=self.name, text="x" * 20_001)

    provider = OversizedProvider()
    registry.register(provider)
    orchestrator = Orchestrator(registry, allow_inference=True, provider_name="fake")

    response = orchestrator.run(TaskRequest(task="summarize", require_approval=False))

    assert response.status == "DEGRADED"
    assert response.result is None
    assert response.evidence == ["provider:fake:invalid-result", "execution:rejected"]


def test_nvidia_nim_adapter_requires_explicit_credentials(monkeypatch):
    from app.providers import NvidiaNimAdapter

    monkeypatch.delenv("NVIDIA_NIM_API_KEY", raising=False)
    adapter = NvidiaNimAdapter()
    assert adapter.is_configured() is False


def test_nvidia_nim_adapter_parses_openai_compatible_response(monkeypatch):
    import json
    from app.providers import NvidiaNimAdapter

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self, size=-1):
            return json.dumps({
                "choices": [{"message": {"content": "A safe test response"}}]
            }).encode()

    captured = {}

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["authorization"] = request.get_header("Authorization")
        captured["timeout"] = timeout
        captured["body"] = json.loads(request.data.decode())
        return FakeResponse()

    monkeypatch.setattr("app.providers._open_nvidia_request", fake_urlopen)
    adapter = NvidiaNimAdapter(api_key="test-key", model="meta/test-model")
    result = adapter.infer("hello", timeout_seconds=5)

    assert result.provider == "nvidia_nim"
    assert result.text == "A safe test response"
    assert captured["url"] == NvidiaNimAdapter.endpoint
    assert captured["authorization"] == "Bearer test-key"
    assert captured["timeout"] == 5
    assert captured["body"]["stream"] is False
    assert captured["body"]["model"] == "meta/test-model"


def test_nvidia_nim_adapter_sanitizes_http_errors(monkeypatch):
    import urllib.error
    from app.providers import NvidiaNimAdapter

    def fail_urlopen(request, timeout):
        raise urllib.error.HTTPError(
            request.full_url, 401, "unauthorized", {}, None
        )

    monkeypatch.setattr("app.providers._open_nvidia_request", fail_urlopen)
    adapter = NvidiaNimAdapter(api_key="secret-key")

    try:
        adapter.infer("hello")
        assert False, "expected sanitized provider error"
    except RuntimeError as exc:
        assert str(exc) == "NVIDIA NIM request failed with HTTP 401"
        assert "secret-key" not in str(exc)


def test_nvidia_nim_adapter_rejects_oversized_prompt():
    from app.providers import NvidiaNimAdapter

    adapter = NvidiaNimAdapter(api_key="test-key")
    try:
        adapter.infer("x" * (adapter.max_prompt_chars + 1))
        assert False, "expected prompt size rejection"
    except ValueError as exc:
        assert "exceeds" in str(exc)


def test_nvidia_provider_readiness_rejects_redirects(monkeypatch):
    import urllib.error
    import urllib.request

    from app.providers import NvidiaNimAdapter, _NoRedirectHandler

    captured = {}

    class FakeOpener:
        def open(self, request, *, timeout):
            captured["url"] = request.full_url
            captured["authorization"] = request.get_header("Authorization")
            captured["timeout"] = timeout
            return _raise_redirect(request)

    def _raise_redirect(request):
        handler = captured["handler"]
        assert handler.redirect_request(
            request,
            None,
            302,
            "Found",
            {"Location": "https://attacker.example/collect"},
            "https://attacker.example/collect",
        ) is None
        raise urllib.error.HTTPError(
            request.full_url,
            302,
            "redirect rejected",
            {"Location": "https://attacker.example/collect"},
            None,
        )

    def fake_build_opener(handler):
        captured["handler"] = handler
        return FakeOpener()

    monkeypatch.setattr("app.providers.urllib.request.build_opener", fake_build_opener)
    adapter = NvidiaNimAdapter(api_key="redirect-test-secret")

    try:
        adapter.check_readiness()
        assert False, "readiness must reject redirected provider requests"
    except RuntimeError as exc:
        assert str(exc) == "NVIDIA NIM readiness probe failed with HTTP 302"
        assert "redirect-test-secret" not in str(exc)

    assert isinstance(captured["handler"], _NoRedirectHandler)
    assert captured["url"] == "https://integrate.api.nvidia.com/v1/models"
    assert captured["authorization"] == "Bearer redirect-test-secret"
    assert captured["timeout"] <= 5

def test_sync_readiness_rejects_a_non_callable_provider_probe():
    provider = FakeProvider()
    provider.check_readiness = "not-callable"
    registry = ProviderRegistry()
    registry.register(provider)
    orchestrator = Orchestrator(
        registry, allow_inference=True, provider_name="fake"
    )

    status, message = orchestrator.check_readiness()

    assert status == "NOT VERIFIED"
    assert "no read-only readiness probe" in message


def test_async_readiness_falls_back_when_optional_probe_is_not_callable():
    provider = FakeProvider()
    provider.check_readiness = lambda: None
    provider.acheck_readiness = "not-callable"
    registry = ProviderRegistry()
    registry.register(provider)
    orchestrator = Orchestrator(
        registry, allow_inference=True, provider_name="fake"
    )

    status, message = asyncio.run(orchestrator.acheck_readiness())

    assert status == "VERIFIED"
    assert "read-only model availability probe" in message


def test_async_inference_rejects_a_non_callable_provider_method():
    provider = FakeProvider()
    provider.ainfer = "not-callable"
    registry = ProviderRegistry()
    registry.register(provider)
    orchestrator = Orchestrator(
        registry, allow_inference=True, provider_name="fake"
    )

    response = asyncio.run(
        orchestrator.arun(
            TaskRequest(task="summarize", require_approval=False)
        )
    )

    assert response.status == "DEGRADED"
    assert response.evidence == ["provider:fake:unavailable", "execution:none"]
    assert provider.calls == 0



def test_read_only_provider_readiness_can_run_without_enabling_inference():
    class ReadinessOnlyProvider(FakeProvider):
        def __init__(self):
            super().__init__()
            self.readiness_calls = 0

        def check_readiness(self):
            self.readiness_calls += 1

        def infer(self, prompt: str, *, timeout_seconds: float = 30.0) -> InferenceResult:
            raise AssertionError("readiness must never invoke inference")

    provider = ReadinessOnlyProvider()
    registry = ProviderRegistry()
    registry.register(provider)
    orchestrator = Orchestrator(
        registry,
        allow_inference=False,
        allow_provider_readiness=True,
        provider_name="fake",
    )

    status, message = orchestrator.check_readiness()
    task = orchestrator.run(TaskRequest(task="no paid request", require_approval=False))

    assert status == "VERIFIED"
    assert "read-only" in message
    assert task.status == "NOT VERIFIED"
    assert task.evidence == ["inference:disabled", "execution:none"]
    assert provider.readiness_calls == 1, "task execution must not invoke readiness or inference"
