"""Cloudflare Workers AI adapter constrained to a verified Workers Free plan.

This adapter has no API key, no external HTTP transport, and no paid-provider
fallback. It can be registered only when the runtime explicitly confirms the
Workers Free plan and opts into this exact free-only route.
"""
from __future__ import annotations

import asyncio
from collections.abc import Mapping
from typing import Any

from app.providers.base import InferenceResult, ProviderAdapter


DEFAULT_WORKERS_AI_MODEL = "@cf/google/gemma-4-26b-a4b-it"
_ALLOWED_MODELS = frozenset({DEFAULT_WORKERS_AI_MODEL})


class WorkersAIAdapter(ProviderAdapter):
    """Single-model, binding-only Cloudflare Workers AI adapter."""

    name = "cloudflare_workers_ai"
    max_prompt_chars = 8_000
    max_output_chars = 20_000
    max_output_tokens = 512
    default_timeout_seconds = 25.0

    def __init__(
        self,
        ai_binding: Any,
        *,
        model: str = DEFAULT_WORKERS_AI_MODEL,
        workers_plan: str = "unverified",
        free_only_enabled: bool = False,
        timeout_seconds: float = default_timeout_seconds,
    ) -> None:
        self._ai = ai_binding
        self._model = model.strip() if isinstance(model, str) else ""
        self._workers_plan = workers_plan.strip().casefold() if isinstance(workers_plan, str) else ""
        self._free_only_enabled = free_only_enabled is True
        if not 0 < timeout_seconds <= 30:
            raise ValueError("timeout_seconds must be greater than 0 and at most 30")
        self._timeout = timeout_seconds

    def is_configured(self) -> bool:
        """Require a real binding, exact allowlisted model, and verified Free plan."""
        return (
            callable(getattr(self._ai, "run", None))
            and self._model in _ALLOWED_MODELS
            and self._workers_plan == "free"
            and self._free_only_enabled
        )

    def infer(
        self,
        prompt: str,
        *,
        timeout_seconds: float = default_timeout_seconds,
    ) -> InferenceResult:
        """Reject synchronous execution; Workers bindings are async-only."""
        raise RuntimeError("Cloudflare Workers AI requires the asynchronous Worker runtime")

    @staticmethod
    def _field(value: Any, name: str) -> Any:
        """Read one result field from mappings or Worker binding proxy objects."""
        if isinstance(value, Mapping):
            return value.get(name)
        try:
            return value[name]
        except (KeyError, TypeError, AttributeError, IndexError):
            return getattr(value, name, None)

    @staticmethod
    def _response_text(payload: Any) -> str:
        """Extract the native response or first chat-completion choice content."""
        text = WorkersAIAdapter._field(payload, "response")
        if text is None:
            choices = WorkersAIAdapter._field(payload, "choices")
            try:
                first_choice = choices[0]
            except (KeyError, TypeError, AttributeError, IndexError):
                first_choice = None
            message = WorkersAIAdapter._field(first_choice, "message")
            text = WorkersAIAdapter._field(message, "content")

        if not isinstance(text, str):
            raise TypeError("Cloudflare Workers AI returned an invalid response")
        text = text.strip()
        if not text or len(text) > WorkersAIAdapter.max_output_chars:
            raise RuntimeError("Cloudflare Workers AI returned an empty or oversized response")
        return text

    async def ainfer(self, prompt: str) -> InferenceResult:
        """Run one bounded request through the Cloudflare Workers AI binding."""
        if not self.is_configured():
            raise RuntimeError("Cloudflare Workers AI free-only route is not configured")
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > self.max_prompt_chars:
            raise ValueError("Prompt is empty or exceeds the supported limit")

        try:
            request = self._ai.run(
                self._model,
                {
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": self.max_output_tokens,
                },
            )
            payload = await asyncio.wait_for(request, timeout=self._timeout)
        except TimeoutError:
            raise RuntimeError("Cloudflare Workers AI request exceeded its timeout") from None
        except Exception as exc:  # noqa: BLE001 - do not leak runtime binding details
            raise RuntimeError(
                f"Cloudflare Workers AI request failed ({type(exc).__name__})"
            ) from None

        return InferenceResult(
            provider=self.name,
            text=self._response_text(payload),
        )
