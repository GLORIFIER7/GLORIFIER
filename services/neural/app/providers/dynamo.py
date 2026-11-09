"""Governed OpenAI-compatible adapter for an owner-operated NVIDIA Dynamo frontend.

The adapter does not install or provision Dynamo. It is inert until the owner supplies
an exact HTTPS origin, a model ID, a credential, and explicit external-egress approval
through the runtime factory.
"""
from __future__ import annotations

import http.client
import json
import os
import ssl
import time
from urllib.parse import urlsplit, urlunsplit

from app.providers.base import InferenceResult, ProviderAdapter
from app.providers.http import (
    ResponseBodyTooLargeError,
    await_with_deadline,
    create_abort_controller,
    read_bounded_response_text,
)


class _ConnectionOwnedHTTPResponse(http.client.HTTPResponse):
    """Keep the connection socket owned until the bounded response body is consumed."""

    def begin(self) -> None:
        super().begin()
        # HTTPConnection.getresponse() closes its socket immediately for a
        # Connection: close response. This adapter still needs the socket to
        # enforce the remaining deadline while reading the response body, and
        # _sync_json_request closes the connection in its finally block.
        self.will_close = False


class _DynamoHttpStatusError(RuntimeError):
    """Sanitized HTTP status failure from the configured Dynamo frontend."""


def _canonical_https_origin(value: str) -> str | None:
    """Return an exact HTTPS origin, rejecting credentials and non-origin components."""
    try:
        parsed = urlsplit(value.strip())
        # Accessing .port validates malformed port values.
        _ = parsed.port
    except (AttributeError, TypeError, ValueError):
        return None
    if (
        parsed.scheme.casefold() != "https"
        or not parsed.hostname
        or "*" in parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        return None
    return urlunsplit(("https", parsed.netloc.casefold(), "", "", ""))


def _validated_api_base(base_url: str, allowed_origin: str) -> str | None:
    """Accept only https://<allowlisted-origin>/v1; no wildcard or URL suffixes."""
    origin = _canonical_https_origin(allowed_origin)
    try:
        parsed = urlsplit(base_url.strip())
        _ = parsed.port
    except (AttributeError, TypeError, ValueError):
        return None
    if (
        origin is None
        or parsed.scheme.casefold() != "https"
        or not parsed.hostname
        or "*" in parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path.rstrip("/") != "/v1"
        or parsed.query
        or parsed.fragment
    ):
        return None
    request_origin = urlunsplit(("https", parsed.netloc.casefold(), "", "", ""))
    if request_origin != origin:
        return None
    return f"{origin}/v1"


def _open_sync_connection(url: str, *, timeout: float) -> http.client.HTTPSConnection:
    """Create a normal certificate-validating HTTPS connection to the pinned origin."""
    parsed = urlsplit(url)
    if parsed.scheme.casefold() != "https" or not parsed.hostname:
        raise OSError("NVIDIA Dynamo sync transport requires an HTTPS URL")
    return http.client.HTTPSConnection(
        parsed.hostname,
        parsed.port or 443,
        timeout=timeout,
        context=ssl.create_default_context(),
    )


def _set_sync_socket_timeout(connection_socket, *, deadline: float) -> None:
    """Apply the remaining absolute request budget to a retained public socket."""
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("NVIDIA Dynamo request exceeded its deadline")
    if connection_socket is None:
        raise OSError("NVIDIA Dynamo HTTPS connection has no active socket")
    connection_socket.settimeout(remaining)


def _read_sync_bounded_response(
    response,
    *,
    connection_socket,
    deadline: float,
    max_bytes: int,
) -> bytes:
    """Read a standard HTTPResponse in bounded chunks against one absolute deadline."""
    read_once = getattr(response, "read1", None)
    if not callable(read_once):
        raise OSError("NVIDIA Dynamo HTTP response does not support bounded reads")

    body = bytearray()
    while len(body) < max_bytes + 1:
        _set_sync_socket_timeout(connection_socket, deadline=deadline)
        chunk = read_once(min(8_192, max_bytes + 1 - len(body)))
        if not chunk:
            break
        body.extend(chunk)
    if time.monotonic() > deadline:
        raise TimeoutError("NVIDIA Dynamo response exceeded its deadline")
    return bytes(body)


class NvidiaDynamoAdapter(ProviderAdapter):
    """Bounded, non-streaming chat adapter for NVIDIA Dynamo's OpenAI API frontend."""

    name = "nvidia_dynamo"
    max_prompt_chars = 20_000
    max_output_chars = 20_000
    max_output_tokens = 1_024
    max_response_bytes = 1_000_000
    max_catalogue_bytes = 262_144

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        allowed_origin: str | None = None,
        *,
        timeout_seconds: float = 20.0,
        fetch_fn=None,
    ) -> None:
        self._fetch_fn = fetch_fn
        self._api_key = (
            api_key if api_key is not None else os.getenv("NVIDIA_DYNAMO_API_KEY", "")
        ).strip()
        self._model = (
            model if model is not None else os.getenv("NVIDIA_DYNAMO_MODEL", "")
        ).strip()
        raw_base_url = (
            base_url if base_url is not None else os.getenv("NVIDIA_DYNAMO_BASE_URL", "")
        )
        raw_allowed_origin = (
            allowed_origin
            if allowed_origin is not None
            else os.getenv("NVIDIA_DYNAMO_ALLOWED_ORIGIN", "")
        )
        self._base_url = _validated_api_base(raw_base_url, raw_allowed_origin)
        if not 0 < timeout_seconds <= 30:
            raise ValueError("timeout_seconds must be greater than 0 and at most 30")
        self._timeout = timeout_seconds

    def is_configured(self) -> bool:
        return bool(self._api_key and self._model and self._base_url)

    def _require_configured(self) -> None:
        if not self.is_configured():
            raise RuntimeError("NVIDIA Dynamo is not configured with an allowlisted HTTPS origin, model, and credential")

    def _url(self, path: str) -> str:
        self._require_configured()
        return f"{self._base_url}/{path.lstrip('/')}"

    def _request_headers(self, *, has_body: bool) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Accept": "application/json",
        }
        if has_body:
            headers["Content-Type"] = "application/json"
        return headers

    @staticmethod
    def _request_id(response) -> str | None:
        headers = getattr(response, "headers", None)
        getter = getattr(headers, "get", None)
        if not callable(getter):
            return None
        value = getter("x-request-id")
        return value.strip() if isinstance(value, str) and value.strip() else None

    @staticmethod
    def _decode_json(raw: str | bytes) -> dict:
        try:
            text = raw.decode("utf-8") if isinstance(raw, bytes) else raw
            payload = json.loads(text)
        except (TypeError, UnicodeDecodeError, json.JSONDecodeError):
            raise RuntimeError("NVIDIA Dynamo returned an invalid JSON response") from None
        if not isinstance(payload, dict):
            raise TypeError("NVIDIA Dynamo returned an invalid JSON object")
        return payload

    def _validate_prompt(self, prompt: str, timeout_seconds: float) -> None:
        self._require_configured()
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > self.max_prompt_chars:
            raise ValueError("Prompt is empty or exceeds the supported limit")
        if not 0 < timeout_seconds <= 30:
            raise ValueError("timeout_seconds must be greater than 0 and at most 30")

    def _validate_catalogue(self, payload: dict) -> None:
        models = payload.get("data")
        if not isinstance(models, list) or not any(
            isinstance(item, dict) and item.get("id") == self._model for item in models
        ):
            raise RuntimeError("Configured NVIDIA Dynamo model is not present in the available model catalogue")

    def _extract_completion(self, payload: dict) -> str:
        try:
            text = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise RuntimeError("NVIDIA Dynamo returned an invalid chat completion") from None
        if not isinstance(text, str) or not text.strip() or len(text) > self.max_output_chars:
            raise RuntimeError("NVIDIA Dynamo returned an empty or oversized response")
        return text

    def _sync_json_request(
        self,
        path: str,
        *,
        method: str,
        body: str | None,
        timeout_seconds: float,
        max_bytes: int,
        readiness: bool,
    ) -> tuple[dict, object]:
        self._require_configured()
        url = self._url(path)
        parsed = urlsplit(url)
        request_target = urlunsplit(("", "", parsed.path, parsed.query, ""))
        label = "readiness probe" if readiness else "request"
        deadline = time.monotonic() + min(timeout_seconds, self._timeout)
        connection = None
        try:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("NVIDIA Dynamo request exceeded its deadline")
            connection = _open_sync_connection(url, timeout=remaining)
            if isinstance(connection, http.client.HTTPConnection):
                connection.response_class = _ConnectionOwnedHTTPResponse
            connection.request(
                method,
                request_target,
                body=body.encode("utf-8") if body is not None else None,
                headers=self._request_headers(has_body=body is not None),
            )
            connection_socket = getattr(connection, "sock", None)
            _set_sync_socket_timeout(connection_socket, deadline=deadline)
            response = connection.getresponse()
            status = int(response.status)
            if status != 200:
                raise _DynamoHttpStatusError(
                    f"NVIDIA Dynamo {label} failed with HTTP {status}"
                )
            raw = _read_sync_bounded_response(
                response,
                connection_socket=connection_socket,
                deadline=deadline,
                max_bytes=max_bytes,
            )
            response_id = response.getheader("x-request-id")
        except _DynamoHttpStatusError:
            raise
        except (http.client.HTTPException, TimeoutError, OSError) as exc:
            error_kind = type(exc).__name__
            error_number = getattr(exc, "errno", None)
            suffix = f" (transport={error_kind}"
            if isinstance(error_number, int):
                suffix += f", errno={error_number}"
            suffix += ")"
            raise RuntimeError(
                f"NVIDIA Dynamo {label} is unavailable or exceeded its timeout{suffix}"
            ) from None
        finally:
            if connection is not None:
                connection.close()

        if len(raw) > max_bytes:
            raise RuntimeError("NVIDIA Dynamo response exceeded the response size limit")
        return self._decode_json(raw), response_id


    def check_readiness(self) -> None:
        """Check the selected model catalogue only; this does not run inference."""
        payload, _ = self._sync_json_request(
            "models",
            method="GET",
            body=None,
            timeout_seconds=min(self._timeout, 5.0),
            max_bytes=self.max_catalogue_bytes,
            readiness=True,
        )
        self._validate_catalogue(payload)

    async def _fetch_json(
        self,
        path: str,
        *,
        method: str,
        body: str | None,
        timeout_seconds: float,
        max_bytes: int,
        readiness: bool = False,
    ) -> tuple[dict, object]:
        self._require_configured()
        fetch_fn = self._fetch_fn
        if fetch_fn is None:
            try:
                from workers import fetch
            except ImportError:
                raise RuntimeError("Cloudflare Fetch transport is unavailable") from None
            fetch_fn = fetch

        deadline = time.monotonic() + min(timeout_seconds, self._timeout)
        controller = create_abort_controller()
        options = {
            "method": method,
            "headers": self._request_headers(has_body=body is not None),
            "redirect": "manual",
        }
        if body is not None:
            options["body"] = body
        if controller is not None:
            options["signal"] = controller.signal
        label = "readiness probe" if readiness else "request"
        try:
            response = await await_with_deadline(
                fetch_fn(self._url(path), **options),
                deadline=deadline,
                abort_controller=controller,
            )
            status = int(response.status)
            if status != 200:
                raise _DynamoHttpStatusError(f"NVIDIA Dynamo {label} failed with HTTP {status}")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("NVIDIA Dynamo response exceeded its deadline")
            raw = await read_bounded_response_text(
                response,
                max_bytes=max_bytes,
                timeout_seconds=remaining,
            )
        except ResponseBodyTooLargeError:
            raise RuntimeError("NVIDIA Dynamo response exceeded the response size limit") from None
        except TimeoutError:
            raise RuntimeError(f"NVIDIA Dynamo {label} exceeded its timeout") from None
        except _DynamoHttpStatusError:
            raise
        except Exception:  # noqa: BLE001 - upstream details can contain credentials or private URLs
            raise RuntimeError(f"NVIDIA Dynamo {label} is unavailable") from None

        if len(raw.encode("utf-8")) > max_bytes:
            raise RuntimeError("NVIDIA Dynamo response exceeded the response size limit")
        return self._decode_json(raw), response

    async def acheck_readiness(self) -> None:
        """Use a read-only models request for Cloudflare Worker readiness."""
        payload, _ = await self._fetch_json(
            "models",
            method="GET",
            body=None,
            timeout_seconds=min(self._timeout, 5.0),
            max_bytes=self.max_catalogue_bytes,
            readiness=True,
        )
        self._validate_catalogue(payload)

    async def ainfer(
        self,
        prompt: str,
        *,
        timeout_seconds: float = 30.0,
    ) -> InferenceResult:
        self._validate_prompt(prompt, timeout_seconds)
        body = json.dumps(
            {
                "model": self._model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": self.max_output_tokens,
                "stream": False,
            },
            separators=(",", ":"),
        )
        payload, response = await self._fetch_json(
            "chat/completions",
            method="POST",
            body=body,
            timeout_seconds=min(timeout_seconds, self._timeout),
            max_bytes=self.max_response_bytes,
        )
        return InferenceResult(
            provider=self.name,
            text=self._extract_completion(payload),
            request_id=self._request_id(response),
        )

    def infer(
        self,
        prompt: str,
        *,
        timeout_seconds: float = 30.0,
    ) -> InferenceResult:
        self._validate_prompt(prompt, timeout_seconds)
        body = json.dumps(
            {
                "model": self._model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": self.max_output_tokens,
                "stream": False,
            },
            separators=(",", ":"),
        )
        payload, request_id = self._sync_json_request(
            "chat/completions",
            method="POST",
            body=body,
            timeout_seconds=min(timeout_seconds, self._timeout),
            max_bytes=self.max_response_bytes,
            readiness=False,
        )
        return InferenceResult(
            provider=self.name,
            text=self._extract_completion(payload),
            request_id=request_id,
        )
