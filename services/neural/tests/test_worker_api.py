"""Cloudflare Worker request-scoped API tests."""
import secrets
import uuid
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import app
from app.orchestrator import Orchestrator


def test_cloudflare_environment_reads_attribute_style_bindings():
    from starlette.requests import Request

    from app.api import _request_environment_value

    token = secrets.token_urlsafe(32)
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [],
            "query_string": b"",
            "env": SimpleNamespace(GLORIFIER_API_TOKEN=token),
        }
    )

    assert _request_environment_value(request, "GLORIFIER_API_TOKEN") == token



class _WorkerEnvironmentASGI:
    def __init__(self, app, env):
        self.app = app
        self.env = env

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            scope = dict(scope)
            scope["env"] = self.env
        await self.app(scope, receive, send)


def test_worker_task_endpoint_uses_rate_limit_binding_and_hashed_credential():
    import hashlib
    import hmac

    from fastapi.testclient import TestClient

    class RateLimitBinding:
        def __init__(self):
            self.keys = []

        async def limit(self, options):
            self.keys.append(options["key"])
            return {"success": True}

    token = secrets.token_urlsafe(32)
    limiter = RateLimitBinding()
    worker_env = {
        "GLORIFIER_API_TOKEN": token,
        "GLORIFIER_RATE_LIMITER": limiter,
    }
    worker_client = TestClient(_WorkerEnvironmentASGI(app, worker_env))

    client_ip = "198.51.100.22"
    response = worker_client.post(
        "/v1/tasks",
        headers={
            "Authorization": f"Bearer {token}",
            "CF-Connecting-IP": client_ip,
        },
        json={"task": "worker request", "require_approval": False},
    )

    assert response.status_code == 200
    expected_key = hmac.new(
        token.encode("utf-8"),
        f"glorifier-rate-limit-v1:worker:{client_ip}".encode(),
        hashlib.sha256,
    ).hexdigest()
    assert limiter.keys == [expected_key]
    assert token not in limiter.keys[0]


def test_worker_rate_limit_isolated_by_client_ip_for_a_shared_token():
    class RateLimitBinding:
        def __init__(self):
            self.keys = []

        async def limit(self, options):
            self.keys.append(options["key"])
            return {"success": True}

    token = secrets.token_urlsafe(32)
    limiter = RateLimitBinding()
    worker_client = TestClient(
        _WorkerEnvironmentASGI(
            app,
            {"GLORIFIER_API_TOKEN": token, "GLORIFIER_RATE_LIMITER": limiter},
        )
    )
    for client_ip in ("198.51.100.23", "198.51.100.24"):
        response = worker_client.post(
            "/v1/tasks",
            headers={
                "Authorization": f"Bearer {token}",
                "CF-Connecting-IP": client_ip,
            },
            json={"task": "worker request", "require_approval": True},
        )
        assert response.status_code == 200

    assert len(limiter.keys) == 2
    assert limiter.keys[0] != limiter.keys[1]
    assert token not in "".join(limiter.keys)


def test_worker_task_endpoint_fails_closed_when_rate_limit_binding_is_missing():
    from fastapi.testclient import TestClient

    token = secrets.token_urlsafe(32)
    worker_client = TestClient(
        _WorkerEnvironmentASGI(app, {"GLORIFIER_API_TOKEN": token})
    )

    response = worker_client.post(
        "/v1/tasks",
        headers={
            "Authorization": f"Bearer {token}",
            "CF-Connecting-IP": "198.51.100.25",
        },
        json={"task": "worker request", "require_approval": False},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Task rate limiting is unavailable"


def test_worker_task_endpoint_rejects_rate_limited_credentials():
    from fastapi.testclient import TestClient

    class DenyBinding:
        async def limit(self, options):
            return {"success": False}

    token = secrets.token_urlsafe(32)
    worker_client = TestClient(
        _WorkerEnvironmentASGI(
            app,
            {
                "GLORIFIER_API_TOKEN": token,
                "GLORIFIER_RATE_LIMITER": DenyBinding(),
            },
        )
    )

    response = worker_client.post(
        "/v1/tasks",
        headers={"Authorization": f"Bearer {token}"},
        json={"task": "worker request", "require_approval": False},
    )

    assert response.status_code == 429, response.text
    assert response.headers["retry-after"] == "60"


def test_worker_task_endpoint_persists_minimal_neon_task_run_metadata(monkeypatch):
    from fastapi.testclient import TestClient
    from starlette.types import ASGIApp, Receive, Scope, Send

    from app.api import app
    captured = {}
    worker_token = secrets.token_urlsafe(32)

    class AllowRateLimitBinding:
        async def limit(self, _options):
            return SimpleNamespace(success=True)

    class FakeTaskRunRepository:
        def record_worker(self, **values):
            captured.update(values)

    class WorkerEnvironment:
        def __init__(self, inner: ASGIApp):
            self.inner = inner

        async def __call__(self, scope: Scope, receive: Receive, send: Send):
            if scope["type"] == "http":
                scope = dict(scope)
                scope["env"] = SimpleNamespace(
                    GLORIFIER_API_TOKEN=worker_token,
                    GLORIFIER_RATE_LIMITER=AllowRateLimitBinding(),
                )
            await self.inner(scope, receive, send)

    monkeypatch.setattr("app.api.orchestrator", Orchestrator())
    monkeypatch.setattr(
        "app.api.TaskRunRepository.from_environment",
        lambda _env: FakeTaskRunRepository(),
    )
    monkeypatch.setattr(
        "app.api.SupabaseRestAuditSink.from_environment",
        lambda *_args: None,
    )

    response = TestClient(WorkerEnvironment(app)).post(
        "/v1/tasks",
        headers={
            "Authorization": f"Bearer {worker_token}",
            "CF-Connecting-IP": "198.51.100.26",
        },
        json={"task": "safe metadata test", "require_approval": False},
    )

    assert response.status_code == 200
    assert captured["action_class"] == "read_only"
    assert captured["status"] == "NOT VERIFIED"
    assert captured["evidence"] == ["inference:disabled", "execution:none"]
    assert str(uuid.UUID(captured["request_id"])) == captured["request_id"]
    assert "task" not in captured
    assert "prompt" not in captured


class _AllowReadinessRateLimitBinding:
    async def limit(self, _options):
        return {"success": True}


def test_worker_readiness_uses_cached_read_only_probes(monkeypatch):
    token = secrets.token_urlsafe(32)
    calls = {"provider": 0, "database": 0}

    class CountingOrchestrator:
        async def acheck_readiness(self):
            calls["provider"] += 1
            return "VERIFIED", "provider read-only probe passed"

    class CountingNeonProbe:
        async def check_worker(self):
            calls["database"] += 1

    monkeypatch.setattr("app.api.WORKER_READINESS_CACHE", {})
    monkeypatch.setattr("app.api._request_orchestrator", lambda _request: CountingOrchestrator())
    monkeypatch.setattr("app.api.NeonConnectivityProbe.from_environment", lambda _env: CountingNeonProbe())
    monkeypatch.setattr("app.api.SupabaseRestAuditSink.from_environment", lambda *_args: None)
    monkeypatch.setattr("app.api.TaskRunRepository.from_environment", lambda *_args: None)
    env = {
        "GLORIFIER_API_TOKEN": token,
        "GLORIFIER_RATE_LIMITER": _AllowReadinessRateLimitBinding(),
        "GLORIFIER_READINESS_LIMITER": _AllowReadinessRateLimitBinding(),
    }
    with TestClient(_WorkerEnvironmentASGI(app, env)) as client:
        response = client.get("/ready", headers={"CF-Connecting-IP": "198.51.100.10"})
        cached = client.get("/ready", headers={"CF-Connecting-IP": "198.51.100.10"})

    assert response.status_code == 200
    assert response.json()["checks"]["providers"] == "VERIFIED"
    assert response.json()["checks"]["database"] == "VERIFIED"
    assert response.json()["checks"]["authentication"] == "VERIFIED"
    assert response.json()["checks"]["rate_limit"] == "VERIFIED"
    assert response.json()["execution"]["inference_performed"] is False
    assert cached.status_code == 200
    assert calls == {"provider": 1, "database": 1}


def test_worker_readiness_fails_closed_without_api_token():
    env = {
        "GLORIFIER_RATE_LIMITER": _AllowReadinessRateLimitBinding(),
        "GLORIFIER_READINESS_LIMITER": _AllowReadinessRateLimitBinding(),
    }
    response = TestClient(_WorkerEnvironmentASGI(app, env)).get(
        "/ready", headers={"CF-Connecting-IP": "198.51.100.11"}
    )
    assert response.status_code == 503
    assert response.json()["checks"]["authentication"] == "DEGRADED"


def test_worker_readiness_fails_closed_without_task_rate_limit():
    env = {
        "GLORIFIER_API_TOKEN": secrets.token_urlsafe(32),
        "GLORIFIER_READINESS_LIMITER": _AllowReadinessRateLimitBinding(),
    }
    response = TestClient(_WorkerEnvironmentASGI(app, env)).get(
        "/ready", headers={"CF-Connecting-IP": "198.51.100.12"}
    )
    assert response.status_code == 503
    assert response.json()["checks"]["rate_limit"] == "DEGRADED"


def test_worker_readiness_is_rate_limited_before_upstream_probes():
    from fastapi.testclient import TestClient

    class DenyReadinessLimiter:
        def __init__(self):
            self.calls = 0

        async def limit(self, _options):
            self.calls += 1
            return {"success": False}

    limiter = DenyReadinessLimiter()
    ready_token = secrets.token_urlsafe(32)
    worker_client = TestClient(
        _WorkerEnvironmentASGI(
            app,
            {
                "GLORIFIER_API_TOKEN": ready_token,
                "GLORIFIER_RATE_LIMITER": type(
                    "TaskLimiter", (), {"limit": staticmethod(lambda _options: {"success": True})}
                )(),
                "GLORIFIER_READINESS_LIMITER": limiter,
            },
        )
    )
    response = worker_client.get(
        "/ready", headers={"CF-Connecting-IP": "198.51.100.50"}
    )

    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"
    assert limiter.calls == 1


def test_worker_readiness_requires_trusted_cloudflare_client_ip():
    from fastapi.testclient import TestClient

    ready_token = secrets.token_urlsafe(32)

    class AllowReadinessLimiter:
        async def limit(self, _options):
            return {"success": True}

    worker_client = TestClient(
        _WorkerEnvironmentASGI(
            app,
            {
                "GLORIFIER_API_TOKEN": ready_token,
                "GLORIFIER_RATE_LIMITER": object(),
                "GLORIFIER_READINESS_LIMITER": AllowReadinessLimiter(),
            },
        )
    )
    response = worker_client.get("/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["rate_limit"] == "DEGRADED"


def test_worker_readiness_hides_rate_limit_binding_error_details():
    class BrokenReadinessRateLimitBinding:
        async def limit(self, _options):
            raise RuntimeError("private-binding-credential-detail")

    token = secrets.token_urlsafe(32)
    env = {
        "GLORIFIER_API_TOKEN": token,
        "GLORIFIER_RATE_LIMITER": _AllowReadinessRateLimitBinding(),
        "GLORIFIER_READINESS_LIMITER": BrokenReadinessRateLimitBinding(),
    }
    response = TestClient(_WorkerEnvironmentASGI(app, env)).get(
        "/ready", headers={"CF-Connecting-IP": "198.51.100.20"}
    )

    assert response.status_code == 503
    assert response.json()["checks"]["rate_limit"] == "DEGRADED"
    assert response.json()["checks"]["authentication"] == "VERIFIED"
    assert "private-binding-credential-detail" not in response.text
    assert "unavailable" in response.json()["message"].lower()


def test_worker_readiness_reports_degraded_optional_persistence_truthfully(monkeypatch):
    class VerifiedProvider:
        async def acheck_readiness(self):
            return "VERIFIED", "provider read-only probe passed"

    token = secrets.token_urlsafe(32)
    monkeypatch.setattr("app.api.WORKER_READINESS_CACHE", {})
    monkeypatch.setattr("app.api._request_orchestrator", lambda _request: VerifiedProvider())
    monkeypatch.setattr("app.api.NeonConnectivityProbe.from_environment", lambda _env: None)
    monkeypatch.setattr(
        "app.api.SupabaseRestAuditSink.from_environment",
        lambda *_args: (_ for _ in ()).throw(ValueError("invalid persistence configuration")),
    )
    monkeypatch.setattr("app.api.TaskRunRepository.from_environment", lambda *_args: None)
    env = {
        "GLORIFIER_API_TOKEN": token,
        "GLORIFIER_RATE_LIMITER": _AllowReadinessRateLimitBinding(),
        "GLORIFIER_READINESS_LIMITER": _AllowReadinessRateLimitBinding(),
    }
    response = TestClient(_WorkerEnvironmentASGI(app, env)).get(
        "/ready", headers={"CF-Connecting-IP": "198.51.100.21"}
    )

    body = response.json()
    assert response.status_code == 503
    assert body["status"] == "NOT READY"
    assert body["checks"]["audit"] == "DEGRADED"
    assert "passed read-only/configuration checks" not in body["message"]
    assert "persistence" in body["message"].lower()



def test_worker_readiness_preserves_provider_failure_diagnostic_when_other_checks_degrade(monkeypatch):
    class FailedProvider:
        async def acheck_readiness(self):
            return "DEGRADED", "Provider readiness probe failed (RuntimeError)."

    token = secrets.token_urlsafe(32)
    monkeypatch.setattr("app.api.WORKER_READINESS_CACHE", {})
    monkeypatch.setattr("app.api._request_orchestrator", lambda _request: FailedProvider())
    monkeypatch.setattr("app.api.NeonConnectivityProbe.from_environment", lambda _env: None)
    monkeypatch.setattr(
        "app.api.SupabaseRestAuditSink.from_environment",
        lambda *_args: (_ for _ in ()).throw(ValueError("invalid persistence configuration")),
    )
    monkeypatch.setattr("app.api.TaskRunRepository.from_environment", lambda *_args: None)
    env = {
        "GLORIFIER_API_TOKEN": token,
        "GLORIFIER_RATE_LIMITER": _AllowReadinessRateLimitBinding(),
        "GLORIFIER_READINESS_LIMITER": _AllowReadinessRateLimitBinding(),
    }
    response = TestClient(_WorkerEnvironmentASGI(app, env)).get(
        "/ready", headers={"CF-Connecting-IP": "198.51.100.22"}
    )

    body = response.json()
    assert response.status_code == 503
    assert body["checks"]["providers"] == "DEGRADED"
    assert body["checks"]["audit"] == "DEGRADED"
    assert "Provider readiness probe failed (RuntimeError)." in body["message"]
    assert "audit persistence" in body["message"].lower()
