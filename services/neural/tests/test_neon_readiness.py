from fastapi.testclient import TestClient

from app.api import app


client = TestClient(app)


def test_readiness_marks_invalid_opt_in_neon_configuration_degraded(monkeypatch):
    monkeypatch.setenv("GLORIFIER_NEON_CONNECTIVITY_ENABLED", "true")
    monkeypatch.delenv("NEON_DATABASE_URL", raising=False)
    response = client.get("/ready")
    assert response.status_code == 503
    assert response.json()["checks"]["database"] == "DEGRADED"
    assert "URL is missing" not in response.text


def test_worker_readiness_probe_does_not_block_task_run_database_lock(monkeypatch):
    import asyncio
    from types import SimpleNamespace

    from app import api
    from starlette.requests import Request

    class ForbiddenDatabaseLock:
        async def __aenter__(self):
            raise AssertionError("readiness must not acquire the task-run database lock")

        async def __aexit__(self, *_args):
            return False

    class FakeOrchestrator:
        async def acheck_readiness(self):
            return "NOT VERIFIED", "Provider inference is disabled by configuration."

    class FakeProbe:
        @classmethod
        def from_environment(cls, _environment):
            return cls()

        async def check_worker(self):
            return None

    environment = {
        "GLORIFIER_NEON_CONNECTIVITY_ENABLED": "true",
        "NEON_READONLY": SimpleNamespace(),
    }
    request = Request({
        "type": "http",
        "method": "GET",
        "path": "/ready",
        "headers": [],
        "query_string": b"",
        "env": environment,
    })
    monkeypatch.setattr(api, "WORKER_READINESS_CACHE", {})
    monkeypatch.setattr(api, "WORKER_READINESS_CACHE_LOCK", asyncio.Lock())
    monkeypatch.setattr(api, "WORKER_DATABASE_LOCK", ForbiddenDatabaseLock())
    monkeypatch.setattr(api, "_request_orchestrator", lambda _request: FakeOrchestrator())
    monkeypatch.setattr(api, "NeonConnectivityProbe", FakeProbe)

    result = asyncio.run(api._cached_worker_readiness(request, environment))

    assert result == (
        "NOT VERIFIED",
        "Provider inference is disabled by configuration.",
        "VERIFIED",
    )
