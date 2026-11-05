"""Small, language-neutral HTTP client for GLORIFIER's explicit Neural routes.

Uses only Python's standard library. No provider credentials, wallet operations, or
implicit endpoint discovery are performed. See docs/architecture/language-neutral-interoperability.md.
"""
from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


class _NoRedirectHandler(HTTPRedirectHandler):
    """Reject redirects so caller credentials cannot cross an origin boundary."""

    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


def urlopen(request: Request, *, timeout: float):
    """Open one request without following redirects."""
    return build_opener(_NoRedirectHandler()).open(request, timeout=timeout)


MAX_TASK_BODY_BYTES = 65_536
MAX_RESPONSE_BODY_BYTES = 1_048_576
MAX_TASK_CHARACTERS = 20_000
_ALLOWED_TASK_FIELDS = {"task", "purpose", "require_approval", "action_class"}


class GlorifierAPIError(RuntimeError):
    """HTTP or transport error returned by the GLORIFIER API."""

    def __init__(self, message: str, *, status: int | None = None, code: str | None = None):
        super().__init__(message)
        self.status = status
        self.code = code


class GlorifierNeuralClient:
    """Client for /api/neural/health, /ready, and /v1/tasks only."""

    def __init__(self, base_url: str, *, token: str | None = None, timeout: float = 8.0):
        from urllib.parse import urlsplit

        parsed = urlsplit(base_url.strip())
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError("base_url must be an HTTPS origin without credentials")
        if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
            raise ValueError("base_url must be an origin only (no path, query, or fragment)")
        if timeout <= 0 or timeout > 60:
            raise ValueError("timeout must be greater than 0 and at most 60 seconds")
        self._origin = f"https://{parsed.netloc}"
        self._token = token.strip() if token else None
        self._timeout = timeout

    def health(self) -> dict[str, Any]:
        return self._request("GET", "/api/neural/health")

    def ready(self) -> dict[str, Any]:
        return self._request("GET", "/api/neural/ready")

    def submit_task(self, task: dict[str, Any]) -> dict[str, Any]:
        if not self._token:
            raise ValueError("token is required to submit a task")
        self._validate_task(task)
        return self._request("POST", "/api/neural/v1/tasks", task)

    @staticmethod
    def _validate_task(task: dict[str, Any]) -> None:
        if not isinstance(task, dict):
            raise TypeError("task must be a JSON object")
        unknown_fields = [
            field for field in task
            if not isinstance(field, str) or field not in _ALLOWED_TASK_FIELDS
        ]
        if unknown_fields:
            formatted_fields = ", ".join(sorted((repr(field) for field in unknown_fields)))
            raise ValueError("task contains unsupported field(s): " + formatted_fields)

        prompt = task.get("task")
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("task must be a non-empty string")
        if len(prompt) > MAX_TASK_CHARACTERS:
            raise ValueError(f"task must not exceed {MAX_TASK_CHARACTERS} characters")

        if "purpose" in task:
            purpose = task["purpose"]
            if not isinstance(purpose, str) or not 1 <= len(purpose) <= 100:
                raise ValueError("purpose must contain between 1 and 100 characters")

        if "require_approval" in task and type(task["require_approval"]) is not bool:
            raise ValueError("require_approval must be a boolean")

        if "action_class" in task:
            action_class = task["action_class"]
            if not isinstance(action_class, str) or not 1 <= len(action_class) <= 64:
                raise ValueError("action_class must contain between 1 and 64 characters")

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        headers = {"Accept": "application/json"}
        body = None
        # Caller credentials are scoped to the authenticated task-submission
        # route only. Health and readiness are public probes and must not carry
        # a bearer token, even when the client is configured with one.
        if method == "POST" and path == "/api/neural/v1/tasks" and self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        if payload is not None:
            headers["Content-Type"] = "application/json; charset=utf-8"
            try:
                body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            except (TypeError, ValueError, UnicodeEncodeError) as exc:
                raise ValueError("payload must be valid UTF-8 JSON") from exc
            if len(body) > MAX_TASK_BODY_BYTES:
                raise ValueError(
                    f"task request body exceeds the {MAX_TASK_BODY_BYTES}-byte limit"
                )
        request = Request(self._origin + path, data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=self._timeout) as response:
                raw = response.read(MAX_RESPONSE_BODY_BYTES + 1)
                status = response.status
        except HTTPError as exc:
            raw = exc.read(MAX_RESPONSE_BODY_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BODY_BYTES:
                raise GlorifierAPIError(
                    "GLORIFIER API error response exceeds the 1 MiB limit",
                    status=exc.code,
                ) from exc
            try:
                data = json.loads(raw.decode("utf-8")) if raw else {}
            except (UnicodeDecodeError, json.JSONDecodeError):
                data = {}
            raise GlorifierAPIError(
                str(data.get("message") or data.get("error") or f"GLORIFIER API returned HTTP {exc.code}"),
                status=exc.code,
                code=data.get("code") if isinstance(data.get("code"), str) else None,
            ) from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise GlorifierAPIError("GLORIFIER API transport failed or timed out") from exc

        if len(raw) > MAX_RESPONSE_BODY_BYTES:
            raise GlorifierAPIError(
                "GLORIFIER API response exceeds the 1 MiB limit", status=status
            )
        if not 200 <= status < 300:
            raise GlorifierAPIError(f"GLORIFIER API returned HTTP {status}", status=status)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise GlorifierAPIError("GLORIFIER API returned invalid JSON", status=status) from exc
        if not isinstance(data, dict):
            raise GlorifierAPIError("GLORIFIER API response must be a JSON object", status=status)
        return data
