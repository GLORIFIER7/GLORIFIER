import asyncio
import json

import pytest

from app.providers.vllm import VllmAdapter
from app.runtime import build_orchestrator_from_environment
from app.schemas import TaskRequest


class FakeReadResult:
    def __init__(self, *, done, value=None):
        self.done = done
        self.value = value


class FakeReader:
    def __init__(self, chunks):
        self._chunks = list(chunks)
        self.cancelled = False
        self.released = False

    async def read(self):
        if not self._chunks:
            return FakeReadResult(done=True)
        return FakeReadResult(done=False, value=self._chunks.pop(0))

    async def cancel(self):
        self.cancelled = True

    def releaseLock(self):
        self.released = True


class FakeBody:
    def __init__(self, chunks):
        self.reader = FakeReader(chunks)

    def getReader(self):
        return self.reader


class FakeResponse:
    def __init__(self, payload, status=200, *, headers=None, chunks=None):
        self.status = status
        self.payload = payload
        self.raw = json.dumps(payload)
        self.headers = headers if headers is not None else {
            "content-length": str(len(self.raw.encode("utf-8")))
        }
        self.body = FakeBody(chunks if chunks is not None else [self.raw.encode("utf-8")])


def configured_environment(**overrides):
    values = {
        "GLORIFIER_PROVIDER": "vllm",
        "GLORIFIER_VLLM_BASE_URL": "https://gpu.example.test/v1",
        "GLORIFIER_VLLM_ALLOWED_ORIGIN": "https://gpu.example.test",
        "GLORIFIER_VLLM_API_KEY": "test-only-key",
        "GLORIFIER_VLLM_MODEL": "Qwen/Qwen3-8B",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "true",
        "GLORIFIER_ENABLE_INFERENCE": "true",
    }
    values.update(overrides)
    return values


def test_vllm_requires_https_exact_origin_and_api_key():
    adapter = VllmAdapter(
        base_url="https://gpu.example.test/v1",
        allowed_origin="https://gpu.example.test",
        api_key="test-only-key",
        model="Qwen/Qwen3-8B",
    )
    assert adapter.is_configured()


@pytest.mark.parametrize(
    ("base_url", "allowed_origin"),
    [
        ("http://gpu.example.test/v1", "http://gpu.example.test"),
        ("https://gpu.example.test.attacker.invalid/v1", "https://gpu.example.test"),
        ("https://user:pass@gpu.example.test/v1", "https://gpu.example.test"),
        ("https://gpu.example.test/v1?next=https://attacker.invalid", "https://gpu.example.test"),
        ("https://gpu.example.test/v1", "https://other.example.test"),
    ],
)
def test_vllm_rejects_unsafe_or_mismatched_origins(base_url, allowed_origin):
    with pytest.raises(ValueError):
        VllmAdapter(
            base_url=base_url,
            allowed_origin=allowed_origin,
            api_key="test-only-key",
            model="Qwen/Qwen3-8B",
        )


def test_vllm_requires_model_and_api_key():
    adapter = VllmAdapter(
        base_url="https://gpu.example.test/v1",
        allowed_origin="https://gpu.example.test",
        api_key="",
        model="Qwen/Qwen3-8B",
    )
    assert not adapter.is_configured()


def test_runtime_does_not_register_vllm_without_egress_consent():
    environment = configured_environment(GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS="false")
    orchestrator = build_orchestrator_from_environment(environment)
    result = orchestrator.run(TaskRequest(task="hello", require_approval=False))
    assert result.status == "NOT VERIFIED"
    assert result.evidence == ["provider:vllm:unavailable", "execution:none"]


def test_runtime_does_not_enable_vllm_inference_by_provider_selection_alone():
    environment = configured_environment(GLORIFIER_ENABLE_INFERENCE="false")
    orchestrator = build_orchestrator_from_environment(environment)
    result = orchestrator.run(TaskRequest(task="hello", require_approval=False))
    assert result.status == "NOT VERIFIED"
    assert result.evidence == ["inference:disabled", "execution:none"]


def test_runtime_registers_vllm_only_with_explicit_complete_configuration():
    orchestrator = build_orchestrator_from_environment(configured_environment())
    assert orchestrator._provider_name == "vllm"
    assert orchestrator._providers.get("vllm") is not None


def test_vllm_readiness_and_inference_use_exact_origin_and_bearer_auth():
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
            return FakeResponse({"data": [{"id": "Qwen/Qwen3-8B"}]})
        return FakeResponse({"choices": [{"message": {"content": "GPU response"}}]})

    adapter = VllmAdapter(
        base_url="https://gpu.example.test/v1",
        allowed_origin="https://gpu.example.test",
        api_key="test-only-key",
        model="Qwen/Qwen3-8B",
        fetch_fn=fake_fetch,
    )

    async def run():
        await adapter.acheck_readiness()
        return await adapter.ainfer("controlled test prompt")

    result = asyncio.run(run())
    assert result.provider == "vllm"
    assert result.text == "GPU response"
    assert [call["method"] for call in calls] == ["GET", "POST"]
    assert calls[0]["url"] == "https://gpu.example.test/v1/models"
    assert calls[1]["url"] == "https://gpu.example.test/v1/chat/completions"
    assert calls[1]["headers"]["Authorization"] == "Bearer test-only-key"
    assert calls[1]["redirect"] == "manual"


def test_vllm_rejects_oversized_prompt_before_network_request():
    calls = []

    async def fake_fetch(*args, **kwargs):
        calls.append((args, kwargs))
        return FakeResponse({"choices": [{"message": {"content": "unexpected"}}]})

    adapter = VllmAdapter(
        base_url="https://gpu.example.test/v1",
        allowed_origin="https://gpu.example.test",
        api_key="test-only-key",
        model="Qwen/Qwen3-8B",
        fetch_fn=fake_fetch,
    )
    with pytest.raises(ValueError):
        asyncio.run(adapter.ainfer("x" * 20_001))
    assert calls == []



def test_vllm_streamed_response_is_bounded_without_content_length():
    body = b"x" * (VllmAdapter.max_response_bytes + 1)
    stream_response = FakeResponse(
        {},
        headers={},
        chunks=[body],
    )
    stream_reader = stream_response.body.reader

    async def fake_fetch(*args, **kwargs):
        return stream_response

    adapter = VllmAdapter(
        base_url="https://gpu.example.test/v1",
        allowed_origin="https://gpu.example.test",
        api_key="test-only-key",
        model="Qwen/Qwen3-8B",
        fetch_fn=fake_fetch,
    )
    with pytest.raises(RuntimeError, match="response size limit"):
        asyncio.run(adapter.ainfer("bounded stream test"))
    assert stream_reader.cancelled is True
    assert stream_reader.released is True


def test_vllm_streamed_response_obeys_absolute_deadline():
    class SlowReader(FakeReader):
        async def read(self):
            await asyncio.sleep(0.05)
            return await super().read()

    class SlowBody:
        def __init__(self):
            self.reader = SlowReader([b'{"choices": [{"message": {"content": "late"}}]}'])

        def getReader(self):
            return self.reader

    stream_response = FakeResponse({})
    stream_response.body = SlowBody()

    async def fake_fetch(*args, **kwargs):
        return stream_response

    adapter = VllmAdapter(
        base_url="https://gpu.example.test/v1",
        allowed_origin="https://gpu.example.test",
        api_key="test-only-key",
        model="Qwen/Qwen3-8B",
        fetch_fn=fake_fetch,
    )
    with pytest.raises(RuntimeError, match="exceeded its timeout"):
        asyncio.run(adapter.ainfer("deadline test", timeout_seconds=0.01))
    assert stream_response.body.reader.released is True
