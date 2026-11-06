"""Explicit runtime configuration with request-scoped Cloudflare binding support.

Task inference requires explicit inference enablement and external-egress consent. Read-only provider readiness can be separately authorized by external-egress consent alone.
OpenAI is the default provider selection. Cloudflare secrets are read from the request environment,
never copied into process-global environment state.
"""
from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Any

from app.orchestrator import Orchestrator
from app.providers import NvidiaNimAdapter
from app.providers.openai import OpenAIResponsesAdapter
from app.providers.registry import ProviderRegistry


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


def build_orchestrator_from_environment(
    environment: Any = None,
    *,
    fetch_fn=None,
) -> Orchestrator:
    """Build an orchestrator from explicit config without mutating global state.

    Pass the Cloudflare request environment from ASGI scope in Workers. The Fetch
    function can be injected in tests; production uses workers.fetch inside
    the request handler when the selected provider adapter executes.
    """
    enabled = _environment_value(
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
        allow_provider_readiness=external_egress_allowed,
        provider_name=provider_name,
    )
