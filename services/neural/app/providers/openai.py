"""OpenAI Responses API adapter for local and Cloudflare Worker runtimes.

The adapter is inert until an API key is supplied by the runtime secret manager
and the orchestrator separately authorizes inference and external egress.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from app.providers.base import InferenceResult, ProviderAdapter


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Reject redirects so bearer credentials cannot be forwarded to another host."""

    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def _open_openai_request(request: urllib.request.Request, *, timeout: float):
    opener = urllib.request.build_opener(_NoRedirectHandler())
    return opener.open(request, timeout=timeout)


class OpenAIResponsesAdapter(ProviderAdapter):
    """Minimal OpenAI Responses API adapter with bounded, sanitized I/O."""

    name = "openai"
    endpoint = "https://api.openai.com/v1/responses"
    models_endpoint = "https://api.openai.com/v1/models"
    default_model = "gpt-6-luna"
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
            api_key if api_key is not None else os.getenv("OPENAI_API_KEY", "")
        ).strip()
        configured_model = (
            model if model is not None else os.getenv("OPENAI_MODEL", self.default_model)
        )
        self._model = configured_model.strip()
        if not 0 < timeout_seconds <= 30:
            raise ValueError("timeout_seconds must be greater than 0 and at most 30")
        self._timeout = timeout_seconds

    def is_configured(self) -> bool:
        return bool(self._api_key and self._model)

    def _model_url(self) -> str:
        return f"{self.models_endpoint}/{urllib.parse.quote(self._model, safe='')}"

    @staticmethod
    def _decode_json(raw: str | bytes) -> dict:
        """Decode a bounded JSON object without returning provider payload details."""
        try:
            text = raw.decode("utf-8") if isinstance(raw, bytes) else raw
            payload = json.loads(text)
        except (TypeError, UnicodeDecodeError, json.JSONDecodeError):
            raise RuntimeError("OpenAI returned an invalid JSON response") from None
        if not isinstance(payload, dict):
            raise TypeError("OpenAI returned an invalid JSON response")
        return payload

    @staticmethod
    def _extract_text(payload: dict) -> str:
        """Extract only output_text items from a Responses API result."""
        output = payload.get("output")
        if not isinstance(output, list):
            raise TypeError("OpenAI returned an invalid Responses API result")
        parts: list[str] = []
        for item in output:
            if not isinstance(item, dict) or item.get("type") != "message":
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for part in content:
                if (
                    isinstance(part, dict)
                    and part.get("type") == "output_text"
                    and isinstance(part.get("text"), str)
                ):
                    parts.append(part["text"])
        text = "".join(parts).strip()
        if not text or len(text) > OpenAIResponsesAdapter.max_output_chars:
            raise RuntimeError("OpenAI returned an empty or oversized response")
        return text

    @staticmethod
    def _request_headers(api_key: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

    def _request_body(self, prompt: str) -> str:
        return json.dumps(
            {
                "model": self._model,
                "input": [{"role": "user", "content": prompt}],
                "max_output_tokens": self.max_output_tokens,
                "store": False,
            },
            separators=(",", ":"),
        )

    def _validate_inference(self, prompt: str, timeout_seconds: float) -> None:
        if not self.is_configured():
            raise RuntimeError("OpenAI is not configured")
        if (
            not isinstance(prompt, str)
            or not prompt.strip()
            or len(prompt) > self.max_prompt_chars
        ):
            raise ValueError("Prompt is empty or exceeds the supported limit")
        if not 0 < timeout_seconds <= 30:
            raise ValueError("timeout_seconds must be greater than 0 and at most 30")

    @staticmethod
    def _request_id(response) -> str | None:
        headers = getattr(response, "headers", None)
        if headers is None:
            return None
        getter = getattr(headers, "get", None)
        if not callable(getter):
            return None
        value = getter("x-request-id")
        return value.strip() if isinstance(value, str) and value.strip() else None

    def check_readiness(self) -> None:
        """Check access to the configured model without submitting any prompt."""
        if not self.is_configured():
            raise RuntimeError("OpenAI is not configured")
        request = urllib.request.Request(
            self._model_url(),
            method="GET",
            headers=self._request_headers(self._api_key),
        )
        try:
            with _open_openai_request(request, timeout=min(self._timeout, 5.0)) as response:
                if response.status != 200:
                    raise RuntimeError(
                        f"OpenAI readiness probe failed with HTTP {response.status}"
                    )
                raw = response.read(self.max_model_response_bytes + 1)
        except urllib.error.HTTPError as exc:
            raise RuntimeError(
                f"OpenAI readiness probe failed with HTTP {exc.code}"
            ) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise RuntimeError("OpenAI readiness endpoint is unavailable") from None
        if len(raw) > self.max_model_response_bytes:
            raise RuntimeError("OpenAI model response exceeded the response size limit")
        payload = self._decode_json(raw)
        if payload.get("id") != self._model:
            raise RuntimeError("Configured OpenAI model is not available to this API key")

    def infer(
        self,
        prompt: str,
        *,
        timeout_seconds: float = 30.0,
    ) -> InferenceResult:
        """Run one bounded, non-stored Responses API request."""
        self._validate_inference(prompt, timeout_seconds)
        request = urllib.request.Request(
            self.endpoint,
            data=self._request_body(prompt).encode("utf-8"),
            method="POST",
            headers={
                **self._request_headers(self._api_key),
                "Content-Type": "application/json",
            },
        )
        try:
            with _open_openai_request(
                request, timeout=min(timeout_seconds, self._timeout)
            ) as response:
                if response.status != 200:
                    raise RuntimeError(
                        f"OpenAI request failed with HTTP {response.status}"
                    )
                request_id = self._request_id(response)
                raw = response.read(self.max_response_bytes + 1)
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"OpenAI request failed with HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise RuntimeError("OpenAI request is unavailable") from None
        if len(raw) > self.max_response_bytes:
            raise RuntimeError("OpenAI response exceeded the response size limit")
        payload = self._decode_json(raw)
        return InferenceResult(
            provider=self.name,
            text=self._extract_text(payload),
            request_id=request_id or payload.get("id"),
        )

    def _resolve_fetch(self):
        """Resolve Cloudflare's request-context Fetch API without global mutation."""
        if self._fetch_fn is not None:
            return self._fetch_fn
        try:
            from workers import fetch
        except ImportError:
            raise RuntimeError("Cloudflare Fetch transport is unavailable") from None
        return fetch

    def _request_options(self, method: str, body: str | None) -> dict:
        headers = self._request_headers(self._api_key)
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
        """Fetch a bounded response and sanitize every upstream failure."""
        fetch_fn = self._resolve_fetch()
        deadline = time.monotonic() + timeout_seconds
        try:
            response = await asyncio.wait_for(
                fetch_fn(url, **options),
                timeout=timeout_seconds,
            )
        except TimeoutError:
            label = "readiness probe" if readiness else "request"
            raise RuntimeError(f"OpenAI {label} exceeded its timeout") from None
        except Exception:  # noqa: BLE001 - transport errors may contain credentials
            label = "readiness endpoint" if readiness else "request"
            raise RuntimeError(f"OpenAI {label} is unavailable") from None

        try:
            status = int(response.status)
        except Exception:  # noqa: BLE001 - do not expose malformed transport responses
            label = "readiness endpoint" if readiness else "request"
            raise RuntimeError(f"OpenAI {label} is unavailable") from None
        if status != 200:
            label = "readiness probe" if readiness else "request"
            raise RuntimeError(f"OpenAI {label} failed with HTTP {status}")

        headers = getattr(response, "headers", None)
        try:
            length = headers.get("content-length") if headers is not None else None
            if length and int(length) > max_bytes:
                raise RuntimeError("OpenAI response exceeded the response size limit")
        except ValueError:
            raise RuntimeError("OpenAI returned an invalid content length") from None
        except RuntimeError:
            raise
        except Exception:  # noqa: BLE001 - malformed headers are not trusted
            label = "readiness endpoint" if readiness else "request"
            raise RuntimeError(f"OpenAI {label} is unavailable") from None

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            label = "readiness probe" if readiness else "request"
            raise RuntimeError(f"OpenAI {label} exceeded its timeout")
        try:
            raw = await asyncio.wait_for(response.text(), timeout=remaining)
        except TimeoutError:
            label = "readiness probe" if readiness else "request"
            raise RuntimeError(f"OpenAI {label} exceeded its timeout") from None
        except Exception:  # noqa: BLE001 - response-body errors may contain credentials
            label = "readiness endpoint" if readiness else "request"
            raise RuntimeError(f"OpenAI {label} is unavailable") from None
        if not isinstance(raw, str) or len(raw.encode("utf-8")) > max_bytes:
            raise RuntimeError("OpenAI response exceeded the response size limit")
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
        """Verify model access through a read-only request-context Fetch call."""
        if not self.is_configured():
            raise RuntimeError("OpenAI is not configured")
        payload, _response = await self._fetch_json(
            self._model_url(),
            method="GET",
            body=None,
            timeout_seconds=min(self._timeout, 5.0),
            max_bytes=self.max_model_response_bytes,
            readiness=True,
        )
        if payload.get("id") != self._model:
            raise RuntimeError("Configured OpenAI model is not available to this API key")

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
