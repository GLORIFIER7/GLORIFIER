import asyncio
from types import SimpleNamespace
from typing import ClassVar

import pytest

from app.providers import NvidiaNimAdapter
from app.runtime import build_orchestrator_from_environment
from app.schemas import TaskRequest


class _RuntimeBodyReader:
    def __init__(self, body: bytes):
        self._body = body
        self._read = False

    async def read(self):
        if self._read:
            return SimpleNamespace(done=True, value=None)
        self._read = True
        return SimpleNamespace(done=False, value=self._body)

    async def cancel(self):
        return None

    def releaseLock(self):
        return None


class _RuntimeReadableStream:
    def __init__(self, body: bytes):
        self._body = body

    def getReader(self):
        return _RuntimeBodyReader(self._body)


def clear_runtime_environment(monkeypatch):
    for name in (
        "GLORIFIER_ENABLE_INFERENCE",
        "GLORIFIER_PAID_INFERENCE_AUTHORIZED",
        "GLORIFIER_PROVIDER",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS",
        "NVIDIA_NIM_API_KEY",
        "NVIDIA_NIM_MODEL",
        "OPENAI_API_KEY",
        "OPENAI_MODEL",
    ):
        monkeypatch.delenv(name, raising=False)


def test_runtime_disables_inference_by_default(monkeypatch):
    clear_runtime_environment(monkeypatch)
    orchestrator = build_orchestrator_from_environment()
    result = orchestrator.run(TaskRequest(task="hello", require_approval=False))
    assert result.status == "NOT VERIFIED"
    assert result.evidence == ["inference:disabled", "execution:none"]


def test_paid_inference_requires_separate_authorization(monkeypatch):
    clear_runtime_environment(monkeypatch)
    worker_env = {
        "GLORIFIER_ENABLE_INFERENCE": "true",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "true",
        "GLORIFIER_PROVIDER": NvidiaNimAdapter.name,
        "NVIDIA_NIM_API_KEY": "test-only-key",
    }
    orchestrator = build_orchestrator_from_environment(worker_env)

    # Readiness may be explicitly authorized, but task inference needs its own
    # separately authorized spend gate.
    assert orchestrator._allow_inference is False
    assert orchestrator._allow_provider_readiness is True
    assert orchestrator._providers.get("nvidia_nim") is not None


def test_provider_name_alone_does_not_enable_inference(monkeypatch):
    clear_runtime_environment(monkeypatch)
    monkeypatch.setenv("GLORIFIER_PROVIDER", "nvidia_nim")
    orchestrator = build_orchestrator_from_environment()
    result = orchestrator.run(TaskRequest(task="hello", require_approval=False))
    assert result.status == "NOT VERIFIED"
    assert result.evidence == ["inference:disabled", "execution:none"]


def test_unknown_provider_never_falls_back_implicitly(monkeypatch):
    clear_runtime_environment(monkeypatch)
    monkeypatch.setenv("GLORIFIER_ENABLE_INFERENCE", "true")
    monkeypatch.setenv("GLORIFIER_PAID_INFERENCE_AUTHORIZED", "true")
    monkeypatch.setenv("GLORIFIER_PROVIDER", "unknown-provider")
    orchestrator = build_orchestrator_from_environment()
    result = orchestrator.run(TaskRequest(task="hello", require_approval=False))
    assert result.status == "NOT VERIFIED"
    assert result.evidence == ["provider:unknown-provider:unavailable", "execution:none"]


def test_nim_requires_both_explicit_opt_in_and_credentials(monkeypatch):
    clear_runtime_environment(monkeypatch)
    monkeypatch.setenv("GLORIFIER_ENABLE_INFERENCE", "true")
    monkeypatch.setenv("GLORIFIER_PAID_INFERENCE_AUTHORIZED", "true")
    monkeypatch.setenv("GLORIFIER_PROVIDER", NvidiaNimAdapter.name)
    orchestrator = build_orchestrator_from_environment()
    result = orchestrator.run(TaskRequest(task="hello", require_approval=False))
    assert result.status == "NOT VERIFIED"
    assert result.evidence == ["provider:nvidia_nim:unavailable", "execution:none"]


def test_nim_is_configured_only_after_explicit_opt_in_and_key(monkeypatch):
    clear_runtime_environment(monkeypatch)
    monkeypatch.setenv("GLORIFIER_ENABLE_INFERENCE", "true")
    monkeypatch.setenv("GLORIFIER_PAID_INFERENCE_AUTHORIZED", "true")
    monkeypatch.setenv("GLORIFIER_PROVIDER", NvidiaNimAdapter.name)
    monkeypatch.setenv("NVIDIA_NIM_API_KEY", "test-only-key")
    monkeypatch.setenv("GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS", "true")
    orchestrator = build_orchestrator_from_environment()
    # Verify runtime wiring without invoking the provider or making a network call.
    assert orchestrator._allow_inference is True
    assert orchestrator._provider_name == "nvidia_nim"
    assert orchestrator._providers.get("nvidia_nim") is not None


def test_nim_is_not_registered_without_external_egress_consent(monkeypatch):
    clear_runtime_environment(monkeypatch)
    monkeypatch.setenv("GLORIFIER_ENABLE_INFERENCE", "true")
    monkeypatch.setenv("GLORIFIER_PAID_INFERENCE_AUTHORIZED", "true")
    monkeypatch.setenv("GLORIFIER_PROVIDER", NvidiaNimAdapter.name)
    monkeypatch.setenv("NVIDIA_NIM_API_KEY", "test-only-key")
    orchestrator = build_orchestrator_from_environment()
    result = orchestrator.run(TaskRequest(task="hello", require_approval=False))
    assert result.status == "NOT VERIFIED"
    assert result.evidence == ["provider:nvidia_nim:unavailable", "execution:none"]


def test_nim_requires_explicit_external_egress_consent(monkeypatch):
    clear_runtime_environment(monkeypatch)
    monkeypatch.setenv("GLORIFIER_ENABLE_INFERENCE", "true")
    monkeypatch.setenv("GLORIFIER_PAID_INFERENCE_AUTHORIZED", "true")
    monkeypatch.setenv("GLORIFIER_PROVIDER", NvidiaNimAdapter.name)
    monkeypatch.setenv("NVIDIA_NIM_API_KEY", "test-only-key")
    monkeypatch.setenv("GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS", "true")
    orchestrator = build_orchestrator_from_environment()
    assert orchestrator._providers.get("nvidia_nim") is not None


def test_cloudflare_runtime_uses_request_scoped_nvidia_bindings_and_fetch():
    import asyncio
    import json

    from app.runtime import build_orchestrator_from_environment

    calls = []

    class FakeResponse:
        def __init__(self, payload):
            self.status = 200
            self.headers = {"content-length": str(len(json.dumps(payload)))}
            self.payload = payload
            self.body = _RuntimeReadableStream(json.dumps(payload).encode())

    async def fake_fetch(url, *, method, headers, body=None, redirect="manual"):
        calls.append({
            "url": url,
            "method": method,
            "headers": headers,
            "body": json.loads(body) if body else None,
            "redirect": redirect,
        })
        if method == "GET":
            return FakeResponse({"data": [{"id": "nvidia/nemotron-3.5-super-vl-120b-a12b"}]})
        return FakeResponse({
            "choices": [{"message": {"content": "Nemotron response"}}]
        })

    worker_env = {
        "GLORIFIER_ENABLE_INFERENCE": "true",
        "GLORIFIER_PAID_INFERENCE_AUTHORIZED": "true",
        "GLORIFIER_PROVIDER": "nvidia_nim",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "true",
        "NVIDIA_NIM_API_KEY": "request-scoped-secret",
        "NVIDIA_NIM_MODEL": "nvidia/nemotron-3.5-super-vl-120b-a12b",
    }
    orchestrator = build_orchestrator_from_environment(
        worker_env,
        fetch_fn=fake_fetch,
    )

    async def run():
        readiness = await orchestrator.acheck_readiness()
        result = await orchestrator.arun(
            TaskRequest(task="controlled test prompt", require_approval=False)
        )
        return readiness, result

    readiness, result = asyncio.run(run())

    assert readiness[0] == "VERIFIED"
    assert result.status == "VERIFIED"
    assert result.provider == "nvidia_nim"
    assert result.result == "Nemotron response"
    assert len(calls) == 2
    assert calls[0]["method"] == "GET"
    assert calls[1]["method"] == "POST"
    assert calls[1]["headers"]["Authorization"] == "Bearer request-scoped-secret"
    assert calls[1]["body"]["model"] == "nvidia/nemotron-3.5-super-vl-120b-a12b"
    assert calls[1]["redirect"] == "manual"



def test_nvidia_fetch_deadline_does_not_wait_for_cancellation_resistant_fetch(monkeypatch):
    import app.providers as nvidia_module
    class FakeController:
        class Signal:
            aborted = False

        def __init__(self):
            self.signal = self.Signal()
            self.abort_calls = 0

        def abort(self):
            self.abort_calls += 1
            self.signal.aborted = True

    class FakeBody:
        def __init__(self):
            self.cancel_calls = 0
            self.cancelled = asyncio.Event()

        async def cancel(self):
            self.cancel_calls += 1
            self.cancelled.set()

    class FakeResponse:
        status = 200

        def __init__(self):
            self.body = FakeBody()

    controller = FakeController()
    monkeypatch.setattr(nvidia_module, "create_abort_controller", lambda: controller)

    async def exercise():
        finish = asyncio.Event()
        response = FakeResponse()

        async def resistant_fetch(*_args, signal=None, **_kwargs):
            assert signal is controller.signal
            try:
                await finish.wait()
            except asyncio.CancelledError:
                # Simulate a Fetch promise that completes late despite abort().
                await finish.wait()
                return response

        adapter = NvidiaNimAdapter(
            api_key="test-key",
            model="nvidia/test-model",
            timeout_seconds=0.04,
            fetch_fn=resistant_fetch,
        )
        asyncio.get_running_loop().call_later(0.15, finish.set)
        started = asyncio.get_running_loop().time()
        with pytest.raises(RuntimeError, match="readiness probe exceeded its timeout"):
            await adapter.acheck_readiness()
        assert asyncio.get_running_loop().time() - started < 0.10
        assert controller.abort_calls == 1
        assert controller.signal.aborted is True
        finish.set()
        await asyncio.wait_for(response.body.cancelled.wait(), timeout=0.2)
        assert response.body.cancel_calls == 1

    asyncio.run(exercise())

def test_openai_readiness_can_be_verified_without_enabling_task_inference(monkeypatch):
    import asyncio

    clear_runtime_environment(monkeypatch)

    calls = []

    class FakeResponse:
        status = 200
        headers: ClassVar[dict[str, str]] = {}
        body = _RuntimeReadableStream(b'{"id":"gpt-6-luna","object":"model"}')

    async def fake_fetch(url, *, method, headers, body=None, redirect="manual"):
        assert method == "GET", "inference-disabled readiness must not submit task prompts"
        assert body is None, "readiness must not send a request body"
        calls.append({
            "url": url,
            "method": method,
            "authorization": headers.get("Authorization"),
            "body": body,
            "redirect": redirect,
        })
        return FakeResponse()

    worker_env = {
        "GLORIFIER_ENABLE_INFERENCE": "false",
        "GLORIFIER_PROVIDER": "openai",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "true",
        "OPENAI_API_KEY": "request-scoped-test-key",
        "OPENAI_MODEL": "gpt-6-luna",
    }
    orchestrator = build_orchestrator_from_environment(
        worker_env,
        fetch_fn=fake_fetch,
    )

    async def run():
        readiness = await orchestrator.acheck_readiness()
        task = await orchestrator.arun(
            TaskRequest(task="must not be sent", require_approval=False)
        )
        return readiness, task

    readiness, task = asyncio.run(run())

    assert readiness[0] == "VERIFIED"
    assert task.status == "NOT VERIFIED"
    assert task.evidence == ["inference:disabled", "execution:none"]
    assert len(calls) == 1
    assert calls[0]["method"] == "GET"
    assert calls[0]["url"] == "https://api.openai.com/v1/models/gpt-6-luna"
    assert calls[0]["authorization"] == "Bearer request-scoped-test-key"
    assert calls[0]["body"] is None
    assert calls[0]["redirect"] == "manual"


def test_provider_readiness_requires_external_egress_consent_when_inference_is_disabled(
    monkeypatch,
):
    import asyncio

    from app.runtime import build_orchestrator_from_environment

    clear_runtime_environment(monkeypatch)
    worker_env = {
        "GLORIFIER_ENABLE_INFERENCE": "false",
        "GLORIFIER_PROVIDER": "openai",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "false",
        "OPENAI_API_KEY": "request-scoped-test-key",
        "OPENAI_MODEL": "gpt-6-luna",
    }
    orchestrator = build_orchestrator_from_environment(worker_env)

    status, message = asyncio.run(orchestrator.acheck_readiness())

    assert status == "NOT VERIFIED"
    assert "disabled" in message
    assert orchestrator._providers.get("openai") is None
    assert orchestrator._allow_inference is False
