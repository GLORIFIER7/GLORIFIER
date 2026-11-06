"""Governed adapter for an explicitly provisioned, OpenAI-compatible vLLM endpoint.

The adapter never discovers endpoints. It requires HTTPS, an exact origin allowlist,
an API key, an explicit model, and runtime-level inference plus egress authorization.
"""
from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from app.providers.base import InferenceResult, ProviderAdapter


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Prevent provider credentials from being forwarded to a redirect target."""

    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def _origin(value: str) -> str:
    """Normalize a strict HTTPS origin and reject credentials or URL decorations."""
    try:
        parsed = urllib.parse.urlsplit(value.strip())
        port = parsed.port
    except (AttributeError, ValueError):
        raise ValueError("vLLM origin is invalid") from None

    if (
        parsed.scheme.casefold() != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
        or parsed.hostname.endswith(".")
    ):
        raise ValueError("vLLM origin must be a plain HTTPS origin without credentials or path")

    host = parsed.hostname.casefold()
    authority = f"[{host}]" if ":" in host else host
    if port not in (None, 443):
        authority = f"{authority}:{port}"
    return f"https://{authority}"


def _base_url(value: str, allowed_origin: str) -> str:
    """Accept only /v1 on the exact configured HTTPS origin."""
    try:
        parsed = urllib.parse.urlsplit(value.strip())
    except (AttributeError, ValueError):
        raise ValueError("vLLM base URL is invalid") from None

    if (
        parsed.scheme.casefold() != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path.rstrip("/") != "/v1"
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("vLLM base URL must use HTTPS and the /v1 API path")

    expected_origin = _origin(allowed_origin)
    actual_origin = _origin(f"{parsed.scheme}://{parsed.netloc}")
    if actual_origin != expected_origin:
        raise ValueError("vLLM base URL does not match the exact allowed origin")
    return f"{actual_origin}/v1"


class VllmAdapter(ProviderAdapter):
    """Bounded, non-streaming OpenAI-compatible vLLM chat-completions adapter."""

    name = "vllm"
    max_prompt_chars = 20_000
    max_output_chars = 20_000
    max_output_tokens = 1_024
    max_response_bytes = 1_000_000
    max_model_response_bytes = 262_144

    def __init__(
        self,
        *,
        base_url: str | None = None,
        allowed_origin: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: float = 20.0,
        fetch_fn=None,
    ) -> None:
        raw_base_url = (
            base_url if base_url is not None else os.getenv("GLORIFIER_VLLM_BASE_URL", "")
        ).strip()
        raw_allowed_origin = (
            allowed_origin
            if allowed_origin is not None
            else os.getenv("GLORIFIER_VLLM_ALLOWED_ORIGIN", "")
        ).strip()
        self._base_url = ""
        if raw_base_url or raw_allowed_origin:
            if not raw_base_url or not raw_allowed_origin:
                raise ValueError("Both vLLM base URL and exact allowed origin are required")
            self._base_url = _base_url(raw_base_url, raw_allowed_origin)

        self._api_key = (
            api_key if api_key is not None else os.getenv("GLORIFIER_VLLM_API_KEY", "")
        ).strip()
        self._model = (
            model if model is not None else os.getenv("GLORIFIER_VLLM_MODEL", "")
        ).strip()
        if not 0 < timeout_seconds <= 30:
            raise ValueError("timeout_seconds must be greater than 0 and at most 30")
        self._timeout = timeout_seconds
        self._fetch_fn = fetch_fn

    def is_configured(self) -> bool:
        return bool(self._base_url and self._api_key and self._model)

    @property
    def _models_url(self) -> str:
        return f"{self._base_url}/models"

    @property
    def _completions_url(self) -> str:
        return f"{self._base_url}/chat/completions"

    def _request_body(self, prompt: str) -> str:
        return json.dumps(
            {
                "model": self._model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": self.max_output_tokens,
                "stream": False,
            },
            separators=(",", ":"),
        )

    def _validate_inference(self, prompt: str, timeout_seconds: float) -> None:
        if not self.is_configured():
            raise RuntimeError("vLLM is not configured")
        if (
            not isinstance(prompt, str)
            or not prompt.strip()
            or len(prompt) > self.max_prompt_chars
        ):
            raise ValueError("Prompt is empty or exceeds the supported limit")
        if not 0 < timeout_seconds <= 30:
            raise ValueError("timeout_seconds must be greater than 0 and at most 30")

    @staticmethod
    def _decode_json(raw: str | bytes) -> dict:
        try:
            decoded = raw.decode("utf-8") if isinstance(raw, bytes) else raw
            payload = json.loads(decoded)
        except (TypeError, UnicodeDecodeError, json.JSONDecodeError):
            raise RuntimeError("vLLM returned an invalid JSON response") from None
        if not isinstance(payload, dict):
            raise TypeError("vLLM returned an invalid JSON response")
        return payload

    def _request_headers(self, *, include_content_type: bool = False) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Accept": "application/json",
        }
        if include_content_type:
            headers["Content-Type"] = "application/json"
        return headers

    @staticmethod
    def _extract_text(payload: dict) -> str:
        try:
            text = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise RuntimeError("vLLM returned an invalid chat-completions response") from None
        if not isinstance(text, str) or not text.strip() or len(text) > VllmAdapter.max_output_chars:
            raise RuntimeError("vLLM returned an empty or oversized response")
        return text.strip()

    @staticmethod
    def _model_is_available(payload: dict, model: str) -> bool:
        models = payload.get("data")
        return isinstance(models, list) and any(
            isinstance(item, dict) and item.get("id") == model for item in models
        )

    def _open_request(self, url: str, *, method: str, body: bytes | None, timeout: float):
        request = urllib.request.Request(
            url,
            data=body,
            method=method,
            headers=self._request_headers(include_content_type=body is not None),
        )
        opener = urllib.request.build_opener(_NoRedirectHandler())
        return opener.open(request, timeout=timeout)

    def check_readiness(self) -> None:
        """Verify the configured model is listed without submitting a prompt."""
        if not self.is_configured():
            raise RuntimeError("vLLM is not configured")
        try:
            with self._open_request(
                self._models_url,
                method="GET",
                body=None,
                timeout=min(self._timeout, 5.0),
            ) as response:
                if response.status != 200:
                    raise RuntimeError("vLLM readiness endpoint returned an unexpected status")
                raw = response.read(self.max_model_response_bytes + 1)
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"vLLM readiness probe failed with HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise RuntimeError("vLLM readiness endpoint is unavailable") from None
        if len(raw) > self.max_model_response_bytes:
            raise RuntimeError("vLLM model catalogue exceeded the response size limit")
        payload = self._decode_json(raw)
        if not self._model_is_available(payload, self._model):
            raise RuntimeError("Configured vLLM model is not present in the model catalogue")

    def _resolve_fetch(self):
        if self._fetch_fn is not None:
            return self._fetch_fn
        try:
            from workers import fetch
        except ImportError:
            raise RuntimeError("Cloudflare Fetch transport is unavailable") from None
        return fetch

    async def _read_bounded_stream(
        self,
        response,
        *,
        deadline: float,
        max_bytes: int,
    ) -> bytes:
        """Consume a Fetch ReadableStream incrementally under one absolute deadline."""
        stream = getattr(response, "body", None)
        get_reader = getattr(stream, "getReader", None)
        if not callable(get_reader):
            raise RuntimeError("vLLM response body is not a readable stream")

        reader = get_reader()
        collected = bytearray()
        try:
            while True:
                remaining = deadline - asyncio.get_running_loop().time()
                if remaining <= 0:
                    raise TimeoutError
                item = await asyncio.wait_for(reader.read(), timeout=remaining)
                if bool(item.done):
                    break
                chunk = item.value
                converter = getattr(chunk, "to_py", None)
                if callable(converter):
                    chunk = converter()
                try:
                    part = bytes(chunk)
                except (TypeError, ValueError):
                    raise RuntimeError("vLLM returned an invalid response stream chunk") from None
                if len(collected) + len(part) > max_bytes:
                    raise RuntimeError("vLLM response exceeded the response size limit")
                collected.extend(part)
            return bytes(collected)
        except BaseException:
            # Cancel upstream work on timeout, oversized bodies, or task cancellation.
            try:
                cancel = getattr(reader, "cancel", None)
                if callable(cancel):
                    await cancel()
            except BaseException:
                pass
            raise
        finally:
            try:
                release_lock = getattr(reader, "releaseLock", None)
                if callable(release_lock):
                    release_lock()
            except Exception:  # noqa: BLE001 - preserve the primary response outcome
                pass

    async def _fetch_json(
        self,
        url: str,
        *,
        method: str,
        body: str | None,
        timeout_seconds: float,
        max_bytes: int,
    ) -> dict:
        """Fetch with an absolute timeout, manual redirects, and a bounded response."""
        deadline = asyncio.get_running_loop().time() + min(timeout_seconds, self._timeout)
        headers = self._request_headers(include_content_type=body is not None)
        options = {"method": method, "headers": headers, "redirect": "manual"}
        if body is not None:
            options["body"] = body
        fetch_fn = self._resolve_fetch()
        try:
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                raise TimeoutError
            response = await asyncio.wait_for(fetch_fn(url, **options), timeout=remaining)
            if int(response.status) != 200:
                raise RuntimeError(f"vLLM request failed with HTTP {int(response.status)}")
            response_headers = getattr(response, "headers", None)
            length = response_headers.get("content-length") if response_headers is not None else None
            if length:
                try:
                    if int(length) > max_bytes:
                        raise RuntimeError("vLLM response exceeded the response size limit")
                except ValueError:
                    raise RuntimeError("vLLM returned an invalid content length") from None
            raw = await self._read_bounded_stream(
                response,
                deadline=deadline,
                max_bytes=max_bytes,
            )
        except TimeoutError:
            raise RuntimeError("vLLM request exceeded its timeout") from None
        except RuntimeError:
            raise
        except Exception:  # noqa: BLE001 - provider details may contain secrets
            raise RuntimeError("vLLM endpoint is unavailable") from None
        return self._decode_json(raw)

    async def acheck_readiness(self) -> None:
        """Verify model availability over request-scoped Cloudflare Fetch."""
        if not self.is_configured():
            raise RuntimeError("vLLM is not configured")
        payload = await self._fetch_json(
            self._models_url,
            method="GET",
            body=None,
            timeout_seconds=min(self._timeout, 5.0),
            max_bytes=self.max_model_response_bytes,
        )
        if not self._model_is_available(payload, self._model):
            raise RuntimeError("Configured vLLM model is not present in the model catalogue")

    async def ainfer(
        self,
        prompt: str,
        *,
        timeout_seconds: float = 30.0,
    ) -> InferenceResult:
        """Run one bounded, non-streaming chat-completions request."""
        self._validate_inference(prompt, timeout_seconds)
        payload = await self._fetch_json(
            self._completions_url,
            method="POST",
            body=self._request_body(prompt),
            timeout_seconds=min(timeout_seconds, self._timeout),
            max_bytes=self.max_response_bytes,
        )
        return InferenceResult(provider=self.name, text=self._extract_text(payload))

    def infer(self, prompt: str, *, timeout_seconds: float = 30.0) -> InferenceResult:
        """Run bounded inference in a local Python runtime."""
        self._validate_inference(prompt, timeout_seconds)
        body = self._request_body(prompt).encode("utf-8")
        try:
            with self._open_request(
                self._completions_url,
                method="POST",
                body=body,
                timeout=min(timeout_seconds, self._timeout),
            ) as response:
                if response.status != 200:
                    raise RuntimeError("vLLM returned an unexpected status")
                raw = response.read(self.max_response_bytes + 1)
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"vLLM request failed with HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise RuntimeError("vLLM endpoint is unavailable") from None
        if len(raw) > self.max_response_bytes:
            raise RuntimeError("vLLM response exceeded the response size limit")
        return InferenceResult(provider=self.name, text=self._extract_text(self._decode_json(raw)))
