"""Cloudflare Worker API binding and authentication tests."""
import secrets
from types import SimpleNamespace

from fastapi.testclient import TestClient
from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from app.api import _request_environment_value, app
from app.orchestrator import Orchestrator
from app.rate_limit import FixedWindowRateLimiter

def test_cloudflare_worker_secret_authenticates_task_endpoint(monkeypatch):
    """Cloudflare bindings are authoritative and never fall back to host env."""

    worker_token = secrets.token_urlsafe(32)
    process_token = secrets.token_urlsafe(32)

    class AllowRateLimitBinding:
        async def limit(self, _options):
            return SimpleNamespace(success=True)

    class CloudflareEnvironment:
        def __init__(self, inner: ASGIApp, token: str | None) -> None:
            self.inner = inner
            self.token = token

        async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
            if scope["type"] == "http":
                worker_env = SimpleNamespace(GLORIFIER_RATE_LIMITER=AllowRateLimitBinding())
                if self.token is not None:
                    worker_env.GLORIFIER_API_TOKEN = self.token
                scope["env"] = worker_env
            await self.inner(scope, receive, send)

    monkeypatch.setenv("GLORIFIER_API_TOKEN", process_token)
    monkeypatch.delenv("GLORIFIER_AUDIT_ENABLED", raising=False)
    monkeypatch.setattr("app.api.orchestrator", Orchestrator())
    monkeypatch.setattr("app.api.TASK_RATE_LIMITER", FixedWindowRateLimiter(max_requests=10))
    monkeypatch.setattr("app.api.SupabaseRestAuditSink.from_environment", lambda *_args: None)

    accepted = TestClient(CloudflareEnvironment(app, worker_token)).post(
        "/v1/tasks",
        headers={"Authorization": f"Bearer {worker_token}"},
        json={"task": "safe read-only task", "require_approval": False},
    )

    assert accepted.status_code == 200
    assert accepted.json()["status"] == "NOT VERIFIED"
    assert accepted.json()["evidence"] == ["inference:disabled", "execution:none"]

    # A different process-level token must not authenticate against the Worker binding.
    rejected_process_token = TestClient(CloudflareEnvironment(app, worker_token)).post(
        "/v1/tasks",
        headers={"Authorization": f"Bearer {process_token}"},
        json={"task": "safe read-only task", "require_approval": False},
    )
    assert rejected_process_token.status_code == 401

    # A present Worker env with a missing token must fail closed, not use os.environ.
    rejected_missing_binding = TestClient(CloudflareEnvironment(app, None)).post(
        "/v1/tasks",
        headers={"Authorization": f"Bearer {process_token}"},
        json={"task": "safe read-only task", "require_approval": False},
    )
    assert rejected_missing_binding.status_code == 503


def test_cloudflare_environment_reads_mapping_style_bindings():
    token = secrets.token_urlsafe(32)
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [],
            "query_string": b"",
            "env": {"GLORIFIER_API_TOKEN": token},
        }
    )

    assert _request_environment_value(request, "GLORIFIER_API_TOKEN") == token
