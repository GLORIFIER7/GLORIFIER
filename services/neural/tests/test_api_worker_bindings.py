"""Cloudflare Worker API binding and authentication tests."""
import asyncio
import secrets
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from app.api import _request_environment_value, app, verify_internal_task
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
        headers={
            "Authorization": f"Bearer {worker_token}",
            "CF-Connecting-IP": "198.51.100.27",
        },
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


def test_internal_task_verification_uses_worker_secret_and_never_runs_inference(monkeypatch):
    """A narrowly scoped internal probe exercises task auth without persisting or inferring."""
    worker_token = secrets.token_urlsafe(32)
    internal_task_token = secrets.token_urlsafe(32)
    client_id = "service-client-id"
    client_secret = secrets.token_urlsafe(32)

    class AllowRateLimitBinding:
        async def limit(self, _options):
            return SimpleNamespace(success=True)

    class CloudflareEnvironment:
        async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
            if scope["type"] == "http":
                scope["env"] = SimpleNamespace(
                    GLORIFIER_API_TOKEN=worker_token,
                    GLORIFIER_INTERNAL_SERVICE_TOKEN=internal_task_token,
                    GLORIFIER_INTERNAL_SERVICE_CLIENT_ID=client_id,
                    GLORIFIER_INTERNAL_SERVICE_CLIENT_SECRET=client_secret,
                    GLORIFIER_RATE_LIMITER=AllowRateLimitBinding(),
                )
            await app(scope, receive, send)

    monkeypatch.delenv("GLORIFIER_AUDIT_ENABLED", raising=False)
    from app.api import _process_authenticated_task

    authenticated_credentials = []

    async def record_internal_credential(task_request, request, authorization, *, persist):
        authenticated_credentials.append(authorization)
        return await _process_authenticated_task(
            task_request, request, authorization, persist=persist
        )

    monkeypatch.setattr(
        "app.api._process_authenticated_task", record_internal_credential
    )

    def _must_not_persist(*_args):
        raise AssertionError("diagnostic must not write persistence")

    monkeypatch.setattr("app.api._load_task_persistence", _must_not_persist)

    correlation_id = "8f2c4a1e-7b6d-4a90-9c31-1d2e3f4a5b6c"
    response = TestClient(CloudflareEnvironment()).post(
        "/__internal/verify-task",
        headers={
            "CF-Access-Client-Id": client_id,
            "CF-Access-Client-Secret": client_secret,
            "CF-Connecting-IP": "198.51.100.14",
            "X-Correlation-ID": correlation_id,
        },
    )

    assert response.status_code == 200
    assert authenticated_credentials == [f"Bearer {internal_task_token}"]
    body = response.json()
    assert body["task_id"] == response.headers["x-request-id"]
    assert body["request_id"] == response.headers["x-request-id"]
    assert body["correlation_id"] == correlation_id
    assert response.headers["x-correlation-id"] == correlation_id
    assert body["response"]["status"] == "NOT VERIFIED"
    assert body["response"]["evidence"] == ["policy:approval-required"]
    assert body["execution_evidence"] == [
        "auth:service-identity-verified",
        "auth:task-secret-verified",
        "policy:approval-required",
        "inference:not-performed",
        "persistence:not-written",
    ]


def test_internal_task_verification_rejects_missing_or_invalid_service_identity():
    token = secrets.token_urlsafe(32)

    class AllowRateLimitBinding:
        async def limit(self, _options):
            return SimpleNamespace(success=True)

    class CloudflareEnvironment:
        async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
            if scope["type"] == "http":
                scope["env"] = SimpleNamespace(
                    GLORIFIER_API_TOKEN=token,
                    GLORIFIER_INTERNAL_SERVICE_CLIENT_ID="expected-id",
                    GLORIFIER_INTERNAL_SERVICE_CLIENT_SECRET="expected-secret",
                    GLORIFIER_RATE_LIMITER=AllowRateLimitBinding(),
                )
            await app(scope, receive, send)

    missing = TestClient(CloudflareEnvironment()).post("/__internal/verify-task")
    invalid = TestClient(CloudflareEnvironment()).post(
        "/__internal/verify-task",
        headers={
            "CF-Access-Client-Id": "expected-id",
            "CF-Access-Client-Secret": "wrong-secret",
        },
    )

    assert missing.status_code == 401
    assert invalid.status_code == 401


def test_internal_task_verification_rejects_missing_internal_task_token():
    client_id = "service-client-id"
    client_secret = secrets.token_urlsafe(32)

    class CloudflareEnvironment:
        async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
            if scope["type"] == "http":
                scope["env"] = SimpleNamespace(
                    GLORIFIER_API_TOKEN=secrets.token_urlsafe(32),
                    GLORIFIER_INTERNAL_SERVICE_CLIENT_ID=client_id,
                    GLORIFIER_INTERNAL_SERVICE_CLIENT_SECRET=client_secret,
                )
            await app(scope, receive, send)

    response = TestClient(CloudflareEnvironment()).post(
        "/__internal/verify-task",
        headers={
            "CF-Access-Client-Id": client_id,
            "CF-Access-Client-Secret": client_secret,
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Internal task credential is not configured"


def test_internal_task_verification_fails_closed_without_worker_bindings():
    response = TestClient(app).post("/__internal/verify-task")
    assert response.status_code == 404



def test_internal_task_verification_rejects_non_ascii_access_identity_headers():
    client_id = "expected-id"
    client_secret = secrets.token_urlsafe(32)
    worker_token = secrets.token_urlsafe(32)

    invalid_headers = (
        [
            (b"cf-access-client-id", b"unexpected-\xe9"),
            (b"cf-access-client-secret", client_secret.encode("utf-8")),
        ],
        [
            (b"cf-access-client-id", client_id.encode("utf-8")),
            (b"cf-access-client-secret", b"unexpected-\xe9"),
        ],
    )
    for headers in invalid_headers:
        request = Request(
            {
                "type": "http",
                "method": "POST",
                "scheme": "https",
                "path": "/__internal/verify-task",
                "raw_path": b"/__internal/verify-task",
                "query_string": b"",
                "headers": headers,
                "server": ("glorifier-neural.example", 443),
                "client": ("127.0.0.1", 12345),
                "env": {
                    "GLORIFIER_API_TOKEN": worker_token,
                    "GLORIFIER_INTERNAL_SERVICE_CLIENT_ID": client_id,
                    "GLORIFIER_INTERNAL_SERVICE_CLIENT_SECRET": client_secret,
                },
            }
        )
        with pytest.raises(HTTPException) as raised:
            asyncio.run(verify_internal_task(request))
        assert raised.value.status_code == 401
