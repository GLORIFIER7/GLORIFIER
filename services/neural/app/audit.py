from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlparse


AuditEventType = Literal[
    "task_received",
    "policy_denied",
    "approval_required",
    "inference_started",
    "inference_completed",
    "inference_failed",
    "task_not_executed",
]
AuditStatus = Literal[
    "FULLY VERIFIED",
    "VERIFIED",
    "PARTIALLY VERIFIED",
    "NOT VERIFIED",
    "DEGRADED",
    "NOT OBSERVABLE",
]


@dataclass(frozen=True)
class AuditEvent:
    """Minimal audit record; deliberately excludes prompts, tokens, and raw provider errors."""

    request_id: str
    event_type: AuditEventType
    status: AuditStatus
    action_class: str
    provider: str | None = None
    evidence: tuple[str, ...] = ()
    correlation_id: str | None = None


class AuditSink:
    """Persistence boundary. Implementations must be explicitly injected; no implicit writes."""

    def write(self, event: AuditEvent) -> None:
        """Persist one sanitized event or raise an exception if persistence fails."""
        raise NotImplementedError


class SupabaseRestAuditSink(AuditSink):
    """Opt-in PostgREST writer for the `glorifier.audit_events` table.

    This class is never enabled automatically. Keep the service-role key server-side,
    expose the `glorifier` schema in Supabase API settings, and apply the reviewed
    migration before enabling writes. Network errors intentionally propagate to callers.
    """

    def __init__(
        self,
        url: str,
        service_role_key: str,
        *,
        timeout_seconds: float = 2.0,
        fetch_fn=None,
    ):
        parsed = urlparse(url)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in ("", "/")
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Supabase URL must be a plain HTTPS origin without path or credentials")
        if not service_role_key.strip():
            raise ValueError("Supabase service-role key is required")
        if not 0 < timeout_seconds <= 5:
            raise ValueError("timeout_seconds must be greater than 0 and at most 5")
        self._rest_url = url.rstrip("/") + "/rest/v1/audit_events"
        self._key = service_role_key
        self._timeout = timeout_seconds
        self._fetch_fn = fetch_fn

    @classmethod
    def from_environment(
        cls,
        environment=None,
        *,
        fetch_fn=None,
    ) -> SupabaseRestAuditSink | None:
        """Return a sink only when explicitly enabled and fully configured."""
        def value(name: str) -> str:
            if environment is None:
                return os.getenv(name, "")
            if isinstance(environment, Mapping):
                raw = environment.get(name, "")
            else:
                raw = getattr(environment, name, "")
            return str(raw) if raw is not None else ""

        if value("GLORIFIER_AUDIT_ENABLED").strip().casefold() != "true":
            return None
        url = value("SUPABASE_URL")
        key = value("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise ValueError("Audit is enabled but Supabase credentials are missing")
        return cls(url, key, fetch_fn=fetch_fn)

    @staticmethod
    def _payload(event: AuditEvent) -> dict[str, object]:
        if not event.request_id or len(event.request_id) > 128:
            raise ValueError("Invalid audit request_id")
        if not event.action_class or len(event.action_class) > 64:
            raise ValueError("Invalid audit action_class")
        if event.provider is not None and len(event.provider) > 64:
            raise ValueError("Invalid audit provider")
        if event.correlation_id is not None and (
            not event.correlation_id or len(event.correlation_id) > 128
        ):
            raise ValueError("Invalid audit correlation_id")
        if len(event.evidence) > 20 or any(not item or len(item) > 160 for item in event.evidence):
            raise ValueError("Invalid audit evidence")
        return {
            "request_id": event.request_id,
            "event_type": event.event_type,
            "status": event.status,
            "action_class": event.action_class,
            "provider": event.provider,
            "evidence": list(event.evidence),
            "details": (
                {"correlation_id": event.correlation_id}
                if event.correlation_id is not None
                else {}
            ),
        }

    async def awrite(self, event: AuditEvent) -> None:
        """Persist one sanitized event with Cloudflare request-context Fetch."""
        fetch_fn = self._fetch_fn
        if fetch_fn is None:
            try:
                from workers import fetch as fetch_fn
            except ImportError:
                raise RuntimeError("Cloudflare Fetch transport is unavailable") from None

        body = json.dumps(self._payload(event), separators=(",", ":"))
        headers = {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
            "Content-Profile": "glorifier",
            "Prefer": "return=minimal",
        }
        try:
            response = await asyncio.wait_for(
                fetch_fn(
                    self._rest_url,
                    method="POST",
                    body=body,
                    headers=headers,
                    redirect="manual",
                ),
                timeout=self._timeout,
            )
        except TimeoutError:
            raise RuntimeError("Audit persistence unavailable") from None
        except Exception:  # noqa: BLE001 - do not leak request or credential details
            raise RuntimeError("Audit persistence unavailable") from None
        if int(response.status) not in (200, 201, 204):
            raise RuntimeError(f"Audit persistence failed with HTTP {int(response.status)}")

    def write(self, event: AuditEvent) -> None:
        body = json.dumps(self._payload(event), separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            self._rest_url,
            data=body,
            method="POST",
            headers={
                "apikey": self._key,
                "Authorization": f"Bearer {self._key}",
                "Content-Type": "application/json",
                "Content-Profile": "glorifier",
                "Prefer": "return=minimal",
            },
        )
        # Do not log request headers, payloads, or raw server error bodies.
        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:
                if response.status not in (200, 201, 204):
                    raise RuntimeError("Audit persistence returned an unexpected status")
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"Audit persistence failed with HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError):
            raise RuntimeError("Audit persistence unavailable") from None
