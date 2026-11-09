"""Governed Anthropic Claude Messages API adapter.

The adapter is inert until an API key is supplied by the runtime secret manager
and the orchestrator separately authorizes provider egress and inference.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from app.providers.base import InferenceResult, ProviderAdapter
from app.providers.http import (
    ResponseBodyTooLargeError,
    await_with_deadline,
    create_abort_controller,
    open_urllib_request_with_deadline,
    read_bounded_response_bytes,
    read_bounded_response_text,
)


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Reject redirects so the Anthropic credential cannot be forwarded elsewhere."""

    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def _open_anthropic_request(
    request: urllib.request.Request, *, timeout: float, deadline: float
):
    return open_urllib_request_with_deadline(
        request,
        timeout_seconds=timeout,
        deadline=deadline,
        handlers=(_NoRedirectHandler(),),
    )


class AnthropicMessagesAdapter(ProviderAdapter):
    """Minimal Anthropic Messages API adapter with bounded, sanitized I/O."""

    name = "anthropic"
    endpoint = "https://api.anthropic.com/v1/messages"
    models_endpoint = "https://api.anthropic.com/v1/models"
    api_version = "2026-10-21"
    default_model = "claude-sonnet-5"
    max_prompt_chars = 20_000
    max_output_chars = 20_000
    max_output_tokens = 1_024
    max_response_bytes = 1_000_000
    max_model_response_bytes = 262_144

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        *,
        timeout_seconds: float = 20.0,
        fetch_fn=None,
    ) -> None:
        self._fetch_fn = fetch_fn
        self._api_key = (
            api_key if api_key is not None else os.getenv("ANTHROPIC_API_KEY", "")
        ).strip()
        configured_model = (
            model if model is not None else os.getenv("ANTHROPIC_MODEL", self.default_model)
        )
        self._model = configured_model.strip()
        if not 0 < timeout_seconds <= 30:
            raise ValueError("timeout_seconds must be greater than 0 and at most 30")
        self._timeout = timeout_seconds

    def is_configured(self) -> bool:
        return bool(self._api_key and self._model)

    def _model_url(self) -> str:
        model = urllib.parse.quote(self._model, safe="")
        return f"{self.models_endpoint}/{model}"

    @staticmethod
    def _decode_json(raw: str | bytes) -> dict:
        try:
            text = raw.decode("utf-8") if isinstance(raw, bytes) else raw
            payload = json.loads(text)
        except (TypeError, UnicodeDecodeError, json.JSONDecodeError):
            raise RuntimeError("Anthropic returned an invalid JSON response") from None
        if not isinstance(payload, dict):
            raise TypeError("Anthropic returned an invalid JSON response")
        return payload

    @staticmethod
    def _extract_text(payload: dict) -> str:
        content = payload.get("content")
        if not isinstance(content, list):
            raise TypeError("Anthropic returned an invalid Messages API result")
        parts: list[str] = []
        for part in content:
            if (
                isinstance(part, dict)
                and part.get("type") == "text"
                and isinstance(part.get("text"), str)
            ):
                parts.append(part["text"])
        text = "".join(parts).strip()
        if not text or len(text) > AnthropicMessagesAdapter.max_output_chars:
            raise RuntimeError("Anthropic returned an empty or oversized response")
        return text

    @staticmethod
    def _request_id(response) -> str | None:
        headers = getattr(response, "headers", None)
        getter = getattr(headers, "get", None)
        if not callable(getter):
            return None
        value = getter("request-id") or getter("x-request-id")
        return value.strip() if isinstance(value, str) and value.strip() else None

    def _request_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "anthropic-version": self.api_version,
            "Accept": "application/json",
        }

    def _request_body(self, prompt: str) -> str:
        return json.dumps(
            {
                "model": self._model,
                "max_tokens": self.max_output_tokens,
                "messages": [{"role": "user", "content": prompt}],
            },
            separators=(",", ":"),
        )

    def _validate_inference(self, prompt: str, timeout_seconds: float) -> None:
        if not self.is_configured():
            raise RuntimeError("Anthropic is not configured")
        if (
            not isinstance(prompt, str)
            or not prompt.strip()
            or len(prompt) > self.max_prompt_chars
        ):
            raise ValueError("Prompt is empty or exceeds the supported limit")
        if not 0 < timeout_seconds <= 30:
            raise ValueError("timeout_seconds must be greater than 0 and at most 30")

    def _sync_json_request(
        self,
        url: str,
        *,
        method: str,
        body: str | None,
        timeout_seconds: float,
        max_bytes: int,
        readiness: bool,
    ) -> tuple[dict, str | None]:
        headers = self._request_headers()
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            url,
            data=body.encode("utf-8") if body is not None else None,
            method=method,
            headers=headers,
        )
        operation_timeout = min(timeout_seconds, self._timeout)
        deadline = time.monotonic() + operation_timeout
        try:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Anthropic request exceeded its deadline")
            with _open_anthropic_request(
                request, timeout=remaining, deadline=deadline
            ) as response:
                if response.status != 200:
                    label = "readiness probe" if readiness else "request"
                    raise RuntimeError(f"Anthropic {label} failed with HTTP {response.status}")
                request_id = self._request_id(response)
                raw = read_bounded_response_bytes(
                    response,
                    max_bytes=max_bytes,
                    timeout_seconds=operation_timeout,
                    deadline=deadline,
                )
        except urllib.error.HTTPError as exc:
            label = "readiness probe" if readiness else "request"
            raise RuntimeError(f"Anthropic {label} failed with HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            label = "readiness endpoint" if readiness else "request"
            raise RuntimeError(f"Anthropic {label} is unavailable") from None
        if len(raw) > max_bytes:
            raise RuntimeError("Anthropic response exceeded the response size limit")
        return self._decode_json(raw), request_id

    def check_readiness(self) -> None:
        """Check access to the selected model without generating a completion."""
        if not self.is_configured():
            raise RuntimeError("Anthropic is not configured")
        payload, _request_id = self._sync_json_request(
            self._model_url(),
            method="GET",
            body=None,
            timeout_seconds=min(self._timeout, 5.0),
            max_bytes=self.max_model_response_bytes,
            readiness=True,
        )
        if payload.get("id") != self._model:
            raise RuntimeError("Configured Anthropic model is not available to this API key")

    def infer(
        self,
        prompt: str,
        *,
        timeout_seconds: float = 30.0,
    ) -> InferenceResult:
        """Run one bounded Messages API request."""
        self._validate_inference(prompt, timeout_seconds)
        payload, request_id = self._sync_json_request(
            self.endpoint,
            method="POST",
            body=self._request_body(prompt),
            timeout_seconds=min(timeout_seconds, self._timeout),
            max_bytes=self.max_response_bytes,
            readiness=False,
        )
        return InferenceResult(
            provider=self.name,
            text=self._extract_text(payload),
            request_id=request_id or payload.get("id"),
        )

    def _resolve_fetch(self):
        if self._fetch_fn is not None:
            return self._fetch_fn
        try:
            from workers import fetch
        except ImportError:
            raise RuntimeError("Cloudflare Fetch transport is unavailable") from None
        return fetch

    def _request_options(self, method: str, body: str | None) -> dict:
        headers = self._request_headers()
        options = {"method": method, "headers": headers, "redirect": "manual"}
        if body is not None:
            headers["Content-Type"] = "application/json"
            options["body"] = body
        return options

    async def _fetch_text(
        self,
        url: str,
        options: dict,
        *,
        timeout_seconds: float,
        max_bytes: int,
        readiness: bool,
    ):
        fetch_fn = self._resolve_fetch()
        deadline = time.monotonic() + min(timeout_seconds, self._timeout)
        abort_controller = create_abort_controller()
        fetch_options = dict(options)
        if abort_controller is not None:
            fetch_options["signal"] = abort_controller.signal

        transport_error = None
        response = None
        try:
            response = await await_with_deadline(
                fetch_fn(url, **fetch_options),
                deadline=deadline,
                abort_controller=abort_controller,
            )
        except TimeoutError:
            label = "readiness probe" if readiness else "request"
            transport_error = f"Anthropic {label} exceeded its timeout"
        except Exception:  # noqa: BLE001 - transport errors may contain credentials
            label = "readiness endpoint" if readiness else "request"
            transport_error = f"Anthropic {label} is unavailable"
        if transport_error is not None:
            # Raise after leaving the except block so the original exception is not
            # retained in __context__ or exposed by a caller's traceback.
            raise RuntimeError(transport_error)

        try:
            status = int(response.status)
        except Exception:  # noqa: BLE001 - do not expose malformed transport responses
            status = None
        if status is None:
            label = "readiness endpoint" if readiness else "request"
            raise RuntimeError(f"Anthropic {label} is unavailable")
        if status != 200:
            label = "readiness probe" if readiness else "request"
            raise RuntimeError(f"Anthropic {label} failed with HTTP {status}")

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            label = "readiness probe" if readiness else "request"
            raise RuntimeError(f"Anthropic {label} exceeded its timeout")

        body_error = None
        raw = None
        try:
            raw = await read_bounded_response_text(
                response,
                max_bytes=max_bytes,
                timeout_seconds=remaining,
            )
        except ResponseBodyTooLargeError:
            body_error = "Anthropic response exceeded the response size limit"
        except TimeoutError:
            label = "readiness probe" if readiness else "request"
            body_error = f"Anthropic {label} exceeded its timeout"
        except Exception:  # noqa: BLE001 - body errors may contain credentials
            label = "readiness endpoint" if readiness else "request"
            body_error = f"Anthropic {label} is unavailable"
        if body_error is not None:
            # As above, do not retain an upstream exception as implicit context.
            raise RuntimeError(body_error)
        return raw, response

    async def _fetch_json(
        self,
        url: str,
        *,
        method: str,
        body: str | None,
        timeout_seconds: float,
        max_bytes: int,
        readiness: bool = False,
    ) -> tuple[dict, object]:
        raw, response = await self._fetch_text(
            url,
            self._request_options(method, body),
            timeout_seconds=timeout_seconds,
            max_bytes=max_bytes,
            readiness=readiness,
        )
        return self._decode_json(raw), response

    async def acheck_readiness(self) -> None:
        """Verify model access via read-only GET, without submitting any messages."""
        if not self.is_configured():
            raise RuntimeError("Anthropic is not configured")
        payload, _response = await self._fetch_json(
            self._model_url(),
            method="GET",
            body=None,
            timeout_seconds=min(self._timeout, 5.0),
            max_bytes=self.max_model_response_bytes,
            readiness=True,
        )
        if payload.get("id") != self._model:
            raise RuntimeError("Configured Anthropic model is not available to this API key")

    async def ainfer(
        self,
        prompt: str,
        *,
        timeout_seconds: float = 30.0,
    ) -> InferenceResult:
        """Run inference through Cloudflare Fetch with redirects disabled."""
        self._validate_inference(prompt, timeout_seconds)
        payload, response = await self._fetch_json(
            self.endpoint,
            method="POST",
            body=self._request_body(prompt),
            timeout_seconds=min(timeout_seconds, self._timeout),
            max_bytes=self.max_response_bytes,
        )
        return InferenceResult(
            provider=self.name,
            text=self._extract_text(payload),
            request_id=self._request_id(response) or payload.get("id"),
        )
