from collections.abc import Awaitable, Callable
from typing import Protocol, cast
import asyncio
import threading
import time

from app.policy import evaluate_task
from app.providers.base import InferenceResult, ProviderAdapter
from app.providers.registry import ProviderRegistry
from app.schemas import TaskRequest, TaskResponse


_READINESS_CACHE_TTL_SECONDS = 30.0
_STATUS_NOT_VERIFIED = "NOT VERIFIED"
_STATUS_DEGRADED = "DEGRADED"
_STATUS_VERIFIED = "VERIFIED"
_READINESS_DISABLED_MESSAGE = "Provider readiness checks are disabled by configuration."
_NO_PROVIDER_MESSAGE = "No provider was explicitly selected."
_PROVIDER_UNCONFIGURED_MESSAGE = "The selected provider is not configured."


def _sync_readiness_probe(provider: ProviderAdapter) -> Callable[[], None] | None:
    candidate = getattr(provider, "check_readiness", None)
    if not callable(candidate):
        return None
    return cast(Callable[[], None], candidate)


def _async_readiness_probe(
    provider: ProviderAdapter,
) -> Callable[[], Awaitable[None]] | None:
    candidate = getattr(provider, "acheck_readiness", None)
    if not callable(candidate):
        return None
    return cast(Callable[[], Awaitable[None]], candidate)


class _AsyncInferenceProvider(Protocol):
    async def ainfer(self, prompt: str) -> InferenceResult:
        """Run one explicitly authorized async inference request."""


def _async_inference_provider(
    provider: ProviderAdapter,
) -> _AsyncInferenceProvider | None:
    candidate = getattr(provider, "ainfer", None)
    if not callable(candidate):
        return None
    return cast(_AsyncInferenceProvider, provider)

class Orchestrator:
    """Safe orchestration shell; provider inference is disabled unless explicitly opted in."""

    def __init__(
        self,
        providers: ProviderRegistry | None = None,
        *,
        allow_inference: bool = False,
        allow_provider_readiness: bool | None = None,
        provider_name: str | None = None,
    ) -> None:
        self._providers = providers or ProviderRegistry()
        self._allow_inference = allow_inference
        self._allow_provider_readiness = (
            allow_inference
            if allow_provider_readiness is None
            else allow_provider_readiness
        )
        self._provider_name = provider_name
        self._readiness_lock = threading.Lock()
        self._readiness_cache: tuple[float, tuple[str, str]] | None = None

    def check_readiness(self) -> tuple[str, str]:
        """Return a short-lived cached provider check to protect the upstream credential."""
        with self._readiness_lock:
            now = time.monotonic()
            if (
                self._readiness_cache is not None
                and now - self._readiness_cache[0] < _READINESS_CACHE_TTL_SECONDS
            ):
                return self._readiness_cache[1]

            result = self._probe_readiness()
            # Start the TTL after the potentially slow upstream request completes.
            self._readiness_cache = (time.monotonic(), result)
            return result

    def _probe_readiness(self) -> tuple[str, str]:
        """Probe the selected provider without sending task content or running inference."""
        if not self._allow_provider_readiness:
            return _STATUS_NOT_VERIFIED, _READINESS_DISABLED_MESSAGE
        if not self._provider_name:
            return _STATUS_NOT_VERIFIED, _NO_PROVIDER_MESSAGE
        provider = self._providers.get(self._provider_name)
        if provider is None:
            return _STATUS_NOT_VERIFIED, _PROVIDER_UNCONFIGURED_MESSAGE
        readiness_probe = _sync_readiness_probe(provider)
        if readiness_probe is None:
            return _STATUS_NOT_VERIFIED, "The selected provider has no read-only readiness probe."
        try:
            readiness_probe()
        except Exception as exc:  # noqa: BLE001 - readiness must not leak credentials or endpoints
            return _STATUS_DEGRADED, f"Provider readiness probe failed ({type(exc).__name__})."
        return _STATUS_VERIFIED, "Configured provider passed its read-only model availability probe."


    async def acheck_readiness(self) -> tuple[str, str]:
        """Probe a provider through its async transport without performing inference."""
        if not self._allow_provider_readiness:
            return _STATUS_NOT_VERIFIED, _READINESS_DISABLED_MESSAGE
        if not self._provider_name:
            return _STATUS_NOT_VERIFIED, _NO_PROVIDER_MESSAGE
        provider = self._providers.get(self._provider_name)
        if provider is None:
            return _STATUS_NOT_VERIFIED, _PROVIDER_UNCONFIGURED_MESSAGE

        readiness_probe = _async_readiness_probe(provider)
        if readiness_probe is not None:
            try:
                await readiness_probe()
            except Exception as exc:  # noqa: BLE001 - never leak upstream details
                return _STATUS_DEGRADED, f"Provider readiness probe failed ({type(exc).__name__})."
            return _STATUS_VERIFIED, "Configured provider passed its read-only model availability probe."

        return await asyncio.to_thread(self.check_readiness)

    def _async_preflight(
        self, request: TaskRequest
    ) -> tuple[ProviderAdapter | None, TaskResponse | None]:
        """Apply policy and explicit provider configuration before async inference."""
        decision = evaluate_task(
            require_approval=request.require_approval,
            action_class=request.action_class,
        )
        if not decision.allowed:
            return None, TaskResponse(status=_STATUS_DEGRADED, message=decision.reason, evidence=["policy:deny"])
        if decision.requires_human_approval:
            return None, TaskResponse(
                status=_STATUS_NOT_VERIFIED,
                message=decision.reason,
                evidence=["policy:approval-required"],
            )
        if not self._allow_inference:
            return None, TaskResponse(
                status=_STATUS_NOT_VERIFIED,
                message="Provider inference is disabled by configuration; no inference was performed.",
                evidence=["inference:disabled", "execution:none"],
            )
        if not self._provider_name:
            return None, TaskResponse(
                status=_STATUS_NOT_VERIFIED,
                message="No provider was explicitly selected; no inference was performed.",
                evidence=["provider:none", "execution:none"],
            )
        provider = self._providers.get(self._provider_name)
        if provider is None:
            return None, TaskResponse(
                status=_STATUS_NOT_VERIFIED,
                message="The explicitly selected provider is unavailable or unconfigured.",
                evidence=[f"provider:{self._provider_name}:unavailable", "execution:none"],
            )
        return provider, None

    def _async_result_response(
        self, provider: ProviderAdapter, result: InferenceResult
    ) -> TaskResponse:
        """Accept only a bounded result from the selected provider."""
        provider_name = self._provider_name or provider.name
        if not isinstance(result, InferenceResult):
            return TaskResponse(
                status=_STATUS_DEGRADED,
                provider=provider_name,
                message="Provider returned an invalid result object.",
                evidence=[f"provider:{provider_name}:invalid-result", "execution:rejected"],
            )
        if (
            not isinstance(result.provider, str)
            or result.provider.strip().casefold() != provider_name.strip().casefold()
            or not isinstance(result.text, str)
            or not result.text.strip()
            or len(result.text) > 20_000
        ):
            return TaskResponse(
                status=_STATUS_DEGRADED,
                provider=provider_name,
                message="Provider returned an empty, oversized, or mismatched result.",
                evidence=[f"provider:{provider_name}:invalid-result", "execution:rejected"],
            )
        return TaskResponse(
            status=_STATUS_VERIFIED,
            provider=provider.name,
            result=result.text,
            message="Provider returned a result; this verifies response receipt, not factual correctness.",
            evidence=[f"provider:{result.provider}:response-received", "execution:inference"],
        )

    async def arun(self, request: TaskRequest) -> TaskResponse:
        """Execute a governed task using an explicitly configured async provider."""
        provider, preflight_response = self._async_preflight(request)
        if preflight_response is not None:
            return preflight_response
        if provider is None:
            return TaskResponse(
                status=_STATUS_DEGRADED,
                message="Provider configuration is unavailable.",
                evidence=["provider:unavailable", "execution:none"],
            )

        async_provider = _async_inference_provider(provider)
        if async_provider is None:
            return TaskResponse(
                status=_STATUS_DEGRADED,
                provider=self._provider_name,
                message="The selected provider has no async transport supported by this runtime.",
                evidence=[f"provider:{self._provider_name}:unavailable", "execution:none"],
            )
        try:
            result = await async_provider.ainfer(request.task)
        except Exception as exc:  # noqa: BLE001 - sanitize any provider failure
            return TaskResponse(
                status=_STATUS_DEGRADED,
                provider=self._provider_name,
                message=f"Provider inference failed ({type(exc).__name__}); no result was accepted.",
                evidence=[f"provider:{self._provider_name}:error", "execution:failed"],
            )
        return self._async_result_response(provider, result)

    def run(self, request: TaskRequest) -> TaskResponse:
        decision = evaluate_task(
            require_approval=request.require_approval,
            action_class=request.action_class,
        )
        if not decision.allowed:
            return TaskResponse(
                status=_STATUS_DEGRADED,
                message=decision.reason,
                evidence=["policy:deny"],
            )
        if decision.requires_human_approval:
            return TaskResponse(
                status=_STATUS_NOT_VERIFIED,
                message=decision.reason,
                evidence=["policy:approval-required"],
            )

        if not self._allow_inference:
            return TaskResponse(
                status=_STATUS_NOT_VERIFIED,
                message="Provider inference is disabled by configuration; no inference was performed.",
                evidence=["inference:disabled", "execution:none"],
            )
        if not self._provider_name:
            return TaskResponse(
                status=_STATUS_NOT_VERIFIED,
                message="No provider was explicitly selected; no inference was performed.",
                evidence=["provider:none", "execution:none"],
            )

        provider = self._providers.get(self._provider_name)
        if provider is None:
            return TaskResponse(
                status=_STATUS_NOT_VERIFIED,
                message="The explicitly selected provider is unavailable or unconfigured.",
                evidence=[f"provider:{self._provider_name}:unavailable", "execution:none"],
            )

        try:
            result = provider.infer(request.task)
        except Exception as exc:  # noqa: BLE001
            # Avoid returning exception details that may contain prompts, URLs, or secrets.
            return TaskResponse(
                status=_STATUS_DEGRADED,
                provider=self._provider_name,
                message=f"Provider inference failed ({type(exc).__name__}); no result was accepted.",
                evidence=[f"provider:{self._provider_name}:error", "execution:failed"],
            )

        if not isinstance(result, InferenceResult):
            return TaskResponse(
                status=_STATUS_DEGRADED,
                provider=self._provider_name,
                message="Provider returned an invalid result object.",
                evidence=[f"provider:{self._provider_name}:invalid-result", "execution:rejected"],
            )
        if (
            not isinstance(result.provider, str)
            or result.provider.strip().casefold() != self._provider_name.strip().casefold()
            or not isinstance(result.text, str)
            or not result.text.strip()
            or len(result.text) > 20_000
        ):
            return TaskResponse(
                status=_STATUS_DEGRADED,
                provider=self._provider_name,
                message="Provider returned an empty, oversized, or mismatched result.",
                evidence=[f"provider:{self._provider_name}:invalid-result", "execution:rejected"],
            )
        return TaskResponse(
            status=_STATUS_VERIFIED,
            provider=provider.name,
            result=result.text,
            message="Provider returned a result; this verifies response receipt, not factual correctness.",
            evidence=[f"provider:{result.provider}:response-received", "execution:inference"],
        )
