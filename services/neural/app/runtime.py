"""Explicit runtime configuration with request-scoped Cloudflare binding support.

Paid provider inference requires inference, egress, and paid-inference consent.
The separate Workers AI path requires an explicitly verified Workers Free plan,
a pinned free-only model, and the Workers AI binding; it never uses paid-provider
credentials or external egress.
"""
from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Any

from app.orchestrator import Orchestrator
from app.providers import NvidiaNimAdapter
from app.providers.anthropic import AnthropicMessagesAdapter
from app.providers.dynamo import NvidiaDynamoAdapter
from app.providers.gemini import GeminiInteractionsAdapter
from app.providers.openai import OpenAIResponsesAdapter
from app.providers.registry import ProviderRegistry
from app.providers.vllm import VllmAdapter
from app.providers.workers_ai import DEFAULT_WORKERS_AI_MODEL, WorkersAIAdapter


def _environment_value(environment: Any, name: str, default: str = "") -> str:
    """Read one string from a Worker binding object or the local process environment."""
    if environment is None:
        return os.getenv(name, default)
    if isinstance(environment, Mapping):
        value = environment.get(name, default)
    else:
        value = getattr(environment, name, default)
    if value is None:
        return default
    return str(value)


def _environment_binding(environment: Any, name: str) -> Any:
    """Read a non-string runtime binding without coercing a JsProxy to text."""
    if environment is None:
        return None
    if isinstance(environment, Mapping):
        return environment.get(name)
    return getattr(environment, name, None)


def build_orchestrator_from_environment(
    environment: Any = None,
    *,
    fetch_fn=None,
) -> Orchestrator:
    """Build an orchestrator from explicit config without mutating global state.

    Pass the Cloudflare request environment from ASGI scope in Workers. The Fetch
    function can be injected in tests; production uses workers.fetch inside
    the request handler when a paid external provider adapter executes.
    """
    inference_enabled = _environment_value(
        environment, "GLORIFIER_ENABLE_INFERENCE"
    ).strip().casefold() == "true"
    provider_name = (
        _environment_value(environment, "GLORIFIER_PROVIDER").strip().casefold()
        or OpenAIResponsesAdapter.name
    )
    registry = ProviderRegistry()

    external_egress_allowed = (
        _environment_value(
            environment, "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS"
        ).strip().casefold() == "true"
    )
    paid_inference_authorized = (
        _environment_value(
            environment, "GLORIFIER_PAID_INFERENCE_AUTHORIZED"
        ).strip().casefold() == "true"
    )

    if provider_name == WorkersAIAdapter.name:
        workers_plan = _environment_value(
            environment, "GLORIFIER_WORKERS_PLAN", "unverified"
        ).strip().casefold()
        free_only_enabled = (
            _environment_value(
                environment, "GLORIFIER_WORKERS_AI_FREE_ONLY"
            ).strip().casefold() == "true"
        )
        workers_ai = WorkersAIAdapter(
            _environment_binding(environment, "AI"),
            model=_environment_value(
                environment,
                "GLORIFIER_WORKERS_AI_MODEL",
                DEFAULT_WORKERS_AI_MODEL,
            ),
            workers_plan=workers_plan,
            free_only_enabled=free_only_enabled,
        )
        workers_ai_configured = workers_ai.is_configured()
        if workers_ai_configured:
            registry.register(workers_ai)

        # Workers AI is a distinct binding-only path. It is never allowed to
        # borrow paid consent or external-egress authorization as a substitute
        # for the exact Workers Free + free-only opt-in.
        enabled = (
            inference_enabled
            and workers_ai_configured
            and not external_egress_allowed
            and not paid_inference_authorized
        )
        allow_provider_readiness = False
    else:
        # Existing external providers remain disabled unless the owner has
        # explicitly authorized a paid request and separately enabled egress.
        enabled = inference_enabled and paid_inference_authorized
        allow_provider_readiness = external_egress_allowed

        if external_egress_allowed and provider_name == NvidiaNimAdapter.name:
            api_key = _environment_value(environment, "NVIDIA_NIM_API_KEY")
            model = _environment_value(
                environment,
                "NVIDIA_NIM_MODEL",
                "nvidia/nemotron-3.5-super-vl-120b-a12b",
            )
            registry.register(
                NvidiaNimAdapter(
                    api_key=api_key,
                    model=model,
                    fetch_fn=fetch_fn,
                )
            )
        elif external_egress_allowed and provider_name == NvidiaDynamoAdapter.name:
            registry.register(
                NvidiaDynamoAdapter(
                    api_key=_environment_value(environment, "NVIDIA_DYNAMO_API_KEY"),
                    model=_environment_value(environment, "NVIDIA_DYNAMO_MODEL"),
                    base_url=_environment_value(environment, "NVIDIA_DYNAMO_BASE_URL"),
                    allowed_origin=_environment_value(
                        environment, "NVIDIA_DYNAMO_ALLOWED_ORIGIN"
                    ),
                    fetch_fn=fetch_fn,
                )
            )
        elif external_egress_allowed and provider_name == GeminiInteractionsAdapter.name:
            adapter = GeminiInteractionsAdapter(
                api_key=_environment_value(environment, "GEMINI_API_KEY"),
                model=_environment_value(environment, "GEMINI_MODEL"),
                fetch_fn=fetch_fn,
            )
            if adapter.is_configured():
                registry.register(adapter)
        elif external_egress_allowed and provider_name == AnthropicMessagesAdapter.name:
            adapter = AnthropicMessagesAdapter(
                api_key=_environment_value(environment, "ANTHROPIC_API_KEY"),
                model=_environment_value(environment, "ANTHROPIC_MODEL"),
                fetch_fn=fetch_fn,
            )
            if adapter.is_configured():
                registry.register(adapter)
        elif external_egress_allowed and provider_name == VllmAdapter.name:
            adapter = VllmAdapter(
                base_url=_environment_value(environment, "GLORIFIER_VLLM_BASE_URL"),
                allowed_origin=_environment_value(
                    environment, "GLORIFIER_VLLM_ALLOWED_ORIGIN"
                ),
                api_key=_environment_value(environment, "GLORIFIER_VLLM_API_KEY"),
                model=_environment_value(environment, "GLORIFIER_VLLM_MODEL"),
                fetch_fn=fetch_fn,
            )
            if adapter.is_configured():
                registry.register(adapter)
        elif external_egress_allowed and provider_name == OpenAIResponsesAdapter.name:
            registry.register(
                OpenAIResponsesAdapter(
                    api_key=_environment_value(environment, "OPENAI_API_KEY"),
                    model=_environment_value(
                        environment,
                        "OPENAI_MODEL",
                        OpenAIResponsesAdapter.default_model,
                    ),
                    fetch_fn=fetch_fn,
                )
            )

    return Orchestrator(
        providers=registry,
        allow_inference=enabled,
        allow_provider_readiness=allow_provider_readiness,
        provider_name=provider_name,
    )
