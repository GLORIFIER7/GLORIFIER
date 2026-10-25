"""Small, language-neutral HTTP client for GLORIFIER's explicit Neural routes.

Uses only Python's standard library. No provider credentials, wallet operations, or
implicit endpoint discovery are performed. See docs/architecture/language-neutral-interoperability.md.
"""
from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


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
        if not isinstance(task, dict):
            raise TypeError("task must be a JSON object")
        return self._request("POST", "/api/neural/v1/tasks", task)

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        headers = {"Accept": "application/json"}
        body = None
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        if payload is not None:
            headers["Content-Type"] = "application/json; charset=utf-8"
            body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        request = Request(self._origin + path, data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=self._timeout) as response:
                raw = response.read()
                status = response.status
        except HTTPError as exc:
            raw = exc.read()
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

        if not 200 <= status < 300:
            raise GlorifierAPIError(f"GLORIFIER API returned HTTP {status}", status=status)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise GlorifierAPIError("GLORIFIER API returned invalid JSON", status=status) from exc
        if not isinstance(data, dict):
            raise GlorifierAPIError("GLORIFIER API response must be a JSON object", status=status)
        return data
