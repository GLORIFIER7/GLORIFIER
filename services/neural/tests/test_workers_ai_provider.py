import asyncio

import pytest

from app.providers.workers_ai import (
    DEFAULT_WORKERS_AI_MODEL,
    WorkersAIAdapter,
)
from app.runtime import build_orchestrator_from_environment
from app.schemas import TaskRequest


class _FakeWorkersAIBinding:
    def __init__(self, response=None):
        self.response = (
            {"response": "A verified synthetic response for testing."}
            if response is None else response
        )
        self.calls = []

    async def run(self, model, inputs):
        self.calls.append((model, inputs))
        return self.response


def test_workers_ai_adapter_requires_verified_free_plan_and_explicit_free_only_mode():
    binding = _FakeWorkersAIBinding()

    unverified_plan = WorkersAIAdapter(
        binding,
        workers_plan="unknown",
        free_only_enabled=True,
    )
    paid_plan = WorkersAIAdapter(
        binding,
        workers_plan="paid",
        free_only_enabled=True,
    )
    not_free_only = WorkersAIAdapter(
        binding,
        workers_plan="free",
        free_only_enabled=False,
    )
    missing_plan = WorkersAIAdapter(
        binding,
        workers_plan=None,
        free_only_enabled=True,
    )

    assert not unverified_plan.is_configured()
    assert not paid_plan.is_configured()
    assert not not_free_only.is_configured()
    assert not missing_plan.is_configured()


def test_workers_ai_adapter_accepts_only_the_pinned_free_model():
    binding = _FakeWorkersAIBinding()
    adapter = WorkersAIAdapter(
        binding,
        model=DEFAULT_WORKERS_AI_MODEL,
        workers_plan="free",
        free_only_enabled=True,
    )
    unknown_model = WorkersAIAdapter(
        binding,
        model="@cf/provider/unknown-model",
        workers_plan="free",
        free_only_enabled=True,
    )

    assert adapter.is_configured()
    assert not unknown_model.is_configured()


def test_workers_ai_adapter_requires_a_real_ai_binding():
    adapter = WorkersAIAdapter(
        None,
        workers_plan="free",
        free_only_enabled=True,
    )

    assert not adapter.is_configured()


def test_workers_ai_adapter_runs_one_bounded_async_inference_without_paid_credentials():
    binding = _FakeWorkersAIBinding()
    adapter = WorkersAIAdapter(
        binding,
        model=DEFAULT_WORKERS_AI_MODEL,
        workers_plan="free",
        free_only_enabled=True,
    )

    result = asyncio.run(adapter.ainfer("Summarize the test status."))

    assert result.provider == "cloudflare_workers_ai"
    assert result.text == "A verified synthetic response for testing."
    assert len(binding.calls) == 1
    model, inputs = binding.calls[0]
    assert model == DEFAULT_WORKERS_AI_MODEL
    assert inputs["messages"] == [
        {"role": "user", "content": "Summarize the test status."}
    ]
    assert inputs["max_tokens"] <= WorkersAIAdapter.max_output_tokens


def test_workers_ai_adapter_extracts_gemma_chat_completion_choice_content():
    binding = _FakeWorkersAIBinding(
        {
            "id": "synthetic-completion",
            "object": "chat.completion",
            "model": DEFAULT_WORKERS_AI_MODEL,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": "A verified synthetic Gemma response.",
                    },
                    "finish_reason": "stop",
                }
            ],
        }
    )
    adapter = WorkersAIAdapter(
        binding,
        model=DEFAULT_WORKERS_AI_MODEL,
        workers_plan="free",
        free_only_enabled=True,
    )

    result = asyncio.run(adapter.ainfer("Use only synthetic test data."))

    assert result.text == "A verified synthetic Gemma response."
    assert len(binding.calls) == 1


def test_workers_ai_adapter_rejects_empty_or_oversized_prompts_without_calling_binding():
    binding = _FakeWorkersAIBinding()
    adapter = WorkersAIAdapter(
        binding,
        workers_plan="free",
        free_only_enabled=True,
    )

    with pytest.raises(ValueError):
        asyncio.run(adapter.ainfer("  "))
    with pytest.raises(ValueError):
        asyncio.run(adapter.ainfer("x" * (WorkersAIAdapter.max_prompt_chars + 1)))

    assert binding.calls == []


def test_workers_ai_adapter_rejects_invalid_or_oversized_responses():
    empty = WorkersAIAdapter(
        _FakeWorkersAIBinding({"response": "  "}),
        workers_plan="free",
        free_only_enabled=True,
    )
    oversized = WorkersAIAdapter(
        _FakeWorkersAIBinding({"response": "x" * (WorkersAIAdapter.max_output_chars + 1)}),
        workers_plan="free",
        free_only_enabled=True,
    )
    malformed = WorkersAIAdapter(
        _FakeWorkersAIBinding({"unexpected": "value"}),
        workers_plan="free",
        free_only_enabled=True,
    )
    empty_choice = WorkersAIAdapter(
        _FakeWorkersAIBinding({"choices": [{"message": {"content": None}}]}),
        workers_plan="free",
        free_only_enabled=True,
    )

    for adapter in (empty, oversized):
        with pytest.raises(RuntimeError):
            asyncio.run(adapter.ainfer("safe synthetic prompt"))

    for adapter in (malformed, empty_choice):
        with pytest.raises(TypeError):
            asyncio.run(adapter.ainfer("safe synthetic prompt"))


def test_runtime_registers_workers_ai_only_when_all_free_only_gates_are_satisfied():
    binding = _FakeWorkersAIBinding()
    env = {
        "GLORIFIER_PROVIDER": "cloudflare_workers_ai",
        "GLORIFIER_ENABLE_INFERENCE": "true",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "false",
        "GLORIFIER_PAID_INFERENCE_AUTHORIZED": "false",
        "GLORIFIER_WORKERS_AI_FREE_ONLY": "true",
        "GLORIFIER_WORKERS_PLAN": "free",
        "AI": binding,
    }

    orchestrator = build_orchestrator_from_environment(env)

    assert orchestrator._allow_inference is True
    assert orchestrator._provider_name == "cloudflare_workers_ai"
    assert orchestrator._providers.get("cloudflare_workers_ai") is not None


def test_runtime_denies_workers_ai_when_plan_is_not_verified_free():
    env = {
        "GLORIFIER_PROVIDER": "cloudflare_workers_ai",
        "GLORIFIER_ENABLE_INFERENCE": "true",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "false",
        "GLORIFIER_PAID_INFERENCE_AUTHORIZED": "false",
        "GLORIFIER_WORKERS_AI_FREE_ONLY": "true",
        "GLORIFIER_WORKERS_PLAN": "unknown",
        "AI": _FakeWorkersAIBinding(),
    }

    orchestrator = build_orchestrator_from_environment(env)

    assert orchestrator._allow_inference is False
    assert orchestrator._providers.get("cloudflare_workers_ai") is None


def test_runtime_never_turns_on_paid_providers_under_free_only_environment():
    env = {
        "GLORIFIER_PROVIDER": "openai",
        "GLORIFIER_ENABLE_INFERENCE": "true",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "false",
        "GLORIFIER_PAID_INFERENCE_AUTHORIZED": "false",
        "GLORIFIER_WORKERS_AI_FREE_ONLY": "true",
        "GLORIFIER_WORKERS_PLAN": "free",
        "OPENAI_API_KEY": "must-not-be-used",
    }

    orchestrator = build_orchestrator_from_environment(env)

    assert orchestrator._allow_inference is False
    assert orchestrator._providers.get("openai") is None


def test_runtime_executes_only_the_explicit_workers_ai_provider():
    binding = _FakeWorkersAIBinding()
    env = {
        "GLORIFIER_PROVIDER": "cloudflare_workers_ai",
        "GLORIFIER_ENABLE_INFERENCE": "true",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "false",
        "GLORIFIER_PAID_INFERENCE_AUTHORIZED": "false",
        "GLORIFIER_WORKERS_AI_FREE_ONLY": "true",
        "GLORIFIER_WORKERS_PLAN": "free",
        "AI": binding,
    }
    orchestrator = build_orchestrator_from_environment(env)

    result = asyncio.run(
        orchestrator.arun(
            TaskRequest(task="Perform a non-sensitive verification.", require_approval=False)
        )
    )

    assert result.status == "VERIFIED"
    assert result.provider == "cloudflare_workers_ai"
    assert result.result == "A verified synthetic response for testing."
    assert len(binding.calls) == 1


@pytest.mark.parametrize(
    ("flag", "value"),
    [
        ("GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS", "true"),
        ("GLORIFIER_PAID_INFERENCE_AUTHORIZED", "true"),
    ],
)
def test_runtime_denies_workers_ai_when_external_or_paid_authorization_is_set(flag, value):
    env = {
        "GLORIFIER_PROVIDER": "cloudflare_workers_ai",
        "GLORIFIER_ENABLE_INFERENCE": "true",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "false",
        "GLORIFIER_PAID_INFERENCE_AUTHORIZED": "false",
        "GLORIFIER_WORKERS_AI_FREE_ONLY": "true",
        "GLORIFIER_WORKERS_PLAN": "free",
        "AI": _FakeWorkersAIBinding(),
    }
    env[flag] = value

    orchestrator = build_orchestrator_from_environment(env)

    assert orchestrator._allow_inference is False
