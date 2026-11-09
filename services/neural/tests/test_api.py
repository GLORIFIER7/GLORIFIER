import asyncio
import uuid

import pytest
from fastapi import HTTPException, Request
from fastapi.testclient import TestClient

from app.api import _persist_task_run, _process_authenticated_task, app, run_task
from app.orchestrator import Orchestrator
from app.schemas import TaskRequest, TaskResponse


client = TestClient(app)


@pytest.fixture
def isolated_readiness(monkeypatch):
    """Keep basic readiness API tests independent of deployment environment secrets."""
    monkeypatch.setattr("app.api.orchestrator", Orchestrator())
    monkeypatch.setattr(
        "app.api.NeonConnectivityProbe.from_environment",
        classmethod(lambda _cls: None),
    )


def test_health_does_not_overclaim_dependencies():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["checks"]["process"] == "VERIFIED"
    assert body["checks"]["providers"] == "NOT VERIFIED"
    assert body["checks"]["database"] == "NOT VERIFIED"


def test_readiness_fails_closed_while_integrations_are_missing(isolated_readiness):
    response = client.get("/ready")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "NOT READY"
    assert body["checks"]["providers"] == "NOT VERIFIED"
    assert body["checks"]["database"] == "NOT CONFIGURED (OPTIONAL)"


def test_security_headers_are_present():
    response = client.get("/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["cache-control"] == "no-store"


def test_task_endpoint_disabled_without_token(monkeypatch):
    monkeypatch.delenv("GLORIFIER_API_TOKEN", raising=False)
    monkeypatch.setenv("GLORIFIER_REQUIRE_API_TOKEN", "false")
    response = client.post("/v1/tasks", json={"task": "test"})
    assert response.status_code == 503


def test_task_endpoint_rejects_invalid_token(monkeypatch):
    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    response = client.post(
        "/v1/tasks",
        headers={"Authorization": "Bearer wrong-secret"},
        json={"task": "test", "require_approval": False},
    )
    assert response.status_code == 401


def test_task_endpoint_rejects_internal_service_token_and_keeps_primary_token_valid(monkeypatch):
    monkeypatch.setenv("GLORIFIER_API_TOKEN", "existing-primary-token")
    monkeypatch.setenv("GLORIFIER_INTERNAL_SERVICE_TOKEN", "separate-internal-service-token")
    internal = client.post(
        "/v1/tasks",
        headers={"Authorization": "Bearer separate-internal-service-token"},
        json={"task": "internal connectivity diagnostic", "require_approval": True, "action_class": "read_only"},
    )
    assert internal.status_code == 401

    # The public endpoint continues to accept only the public API credential.
    primary = client.post(
        "/v1/tasks",
        headers={"Authorization": "Bearer existing-primary-token"},
        json={"task": "primary credential compatibility check", "require_approval": True, "action_class": "read_only"},
    )
    assert primary.status_code == 200
    assert primary.json()["evidence"] == ["policy:approval-required"]


def test_worker_scope_internal_service_token_cannot_authenticate_public_tasks(monkeypatch):
    monkeypatch.delenv("GLORIFIER_API_TOKEN", raising=False)
    monkeypatch.delenv("GLORIFIER_INTERNAL_SERVICE_TOKEN", raising=False)
    worker_env = {
        "GLORIFIER_API_TOKEN": "worker-primary-token",
        "GLORIFIER_INTERNAL_SERVICE_TOKEN": "worker-internal-service-token",
    }
    authenticated_credentials = []

    async def stop_after_authentication(request, credential):
        authenticated_credentials.append(credential)
        raise HTTPException(status_code=429, detail="authentication-passed")

    monkeypatch.setattr("app.api._enforce_task_rate_limit", stop_after_authentication)
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "scheme": "https",
            "path": "/v1/tasks",
            "raw_path": b"/v1/tasks",
            "query_string": b"",
            "headers": [],
            "server": ("glorifier-neural.example", 443),
            "client": ("127.0.0.1", 12345),
            "env": worker_env,
        }
    )
    task = TaskRequest(
        task="Worker binding authentication check",
        require_approval=True,
        action_class="read_only",
    )

    with pytest.raises(HTTPException) as rejected:
        asyncio.run(
            run_task(
                task,
                request,
                authorization="Bearer worker-internal-service-token",
            )
        )
    assert rejected.value.status_code == 401
    assert authenticated_credentials == []

    with pytest.raises(HTTPException) as accepted:
        asyncio.run(
            run_task(
                task,
                request,
                authorization="Bearer worker-primary-token",
            )
        )
    assert accepted.value.status_code == 429
    assert accepted.value.detail == "authentication-passed"
    assert authenticated_credentials == ["worker-primary-token"]


def test_task_endpoint_rejects_incorrect_internal_service_token(monkeypatch):
    monkeypatch.setenv("GLORIFIER_API_TOKEN", "existing-primary-token")
    monkeypatch.setenv("GLORIFIER_INTERNAL_SERVICE_TOKEN", "separate-internal-service-token")
    response = client.post(
        "/v1/tasks",
        headers={"Authorization": "Bearer incorrect-internal-token"},
        json={"task": "internal connectivity diagnostic", "require_approval": True, "action_class": "read_only"},
    )
    assert response.status_code == 401


def test_task_endpoint_never_claims_inference_without_provider(monkeypatch):
    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    response = client.post(
        "/v1/tasks",
        headers={"Authorization": "Bearer test-secret"},
        json={"task": "test", "require_approval": False},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "NOT VERIFIED"
    assert body["evidence"] == ["inference:disabled", "execution:none"]


def test_missing_token_cannot_be_bypassed_by_environment_flag(monkeypatch):
    monkeypatch.delenv("GLORIFIER_API_TOKEN", raising=False)
    monkeypatch.setenv("GLORIFIER_REQUIRE_API_TOKEN", "false")
    response = client.post("/v1/tasks", json={"task": "test"})
    assert response.status_code == 503


def test_action_class_input_is_bounded(monkeypatch):
    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    response = client.post(
        "/v1/tasks",
        headers={"Authorization": "Bearer test-secret"},
        json={"task": "test", "action_class": "x" * 65},
    )
    assert response.status_code == 422

def test_task_input_bounds_are_enforced(monkeypatch):
    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    headers = {"Authorization": "Bearer test-secret"}

    empty_task = client.post(
        "/v1/tasks",
        headers=headers,
        json={"task": ""},
    )
    oversized_task = client.post(
        "/v1/tasks",
        headers=headers,
        json={"task": "x" * 20_001},
    )
    oversized_purpose = client.post(
        "/v1/tasks",
        headers=headers,
        json={"task": "test", "purpose": "x" * 101},
    )

    assert empty_task.status_code == 422
    assert oversized_task.status_code == 422
    assert oversized_purpose.status_code == 422


def test_response_has_separate_unique_request_and_correlation_ids():
    first = client.get("/health")
    second = client.get("/health")

    first_request_id = first.headers["x-request-id"]
    second_request_id = second.headers["x-request-id"]
    first_correlation_id = first.headers["x-correlation-id"]
    second_correlation_id = second.headers["x-correlation-id"]

    assert str(uuid.UUID(first_request_id)) == first_request_id
    assert str(uuid.UUID(second_request_id)) == second_request_id
    assert str(uuid.UUID(first_correlation_id)) == first_correlation_id
    assert str(uuid.UUID(second_correlation_id)) == second_correlation_id
    assert first_request_id != second_request_id
    assert first_correlation_id != second_correlation_id
    assert first_request_id != first_correlation_id
    assert second_request_id != second_correlation_id


def test_reused_correlation_id_never_reuses_server_request_id():
    correlation_id = str(uuid.uuid4())
    first = client.get("/health", headers={"X-Correlation-ID": correlation_id})
    second = client.get("/health", headers={"X-Correlation-ID": correlation_id})

    assert first.headers["x-correlation-id"] == correlation_id
    assert second.headers["x-correlation-id"] == correlation_id
    first_request_id = first.headers["x-request-id"]
    second_request_id = second.headers["x-request-id"]
    assert str(uuid.UUID(first_request_id)) == first_request_id
    assert str(uuid.UUID(second_request_id)) == second_request_id
    assert first_request_id != second_request_id
    assert first_request_id != correlation_id
    assert second_request_id != correlation_id


@pytest.mark.parametrize(
    "correlation_id",
    [str(uuid.uuid4()), str(uuid.uuid4()).upper()],
)
def test_incoming_correlation_id_is_preserved_and_echoed(correlation_id):
    response = client.get("/health", headers={"X-Correlation-ID": correlation_id})

    assert response.status_code == 200
    assert response.headers["x-correlation-id"] == correlation_id
    request_id = response.headers["x-request-id"]
    assert str(uuid.UUID(request_id)) == request_id
    assert request_id != correlation_id


@pytest.mark.parametrize(
    "correlation_id",
    [
        "00000000-0000-0000-0000-000000000000",
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-8000-000000000001",
    ],
)
def test_canonical_uuid_correlation_id_is_preserved_and_echoed(correlation_id):
    response = client.get("/health", headers={"X-Correlation-ID": correlation_id})

    assert response.status_code == 200
    assert response.headers["x-correlation-id"] == correlation_id
    request_id = response.headers["x-request-id"]
    assert str(uuid.UUID(request_id)) == request_id
    assert request_id != correlation_id


def test_invalid_correlation_id_is_replaced_with_a_uuid():
    response = client.get("/health", headers={"X-Correlation-ID": "trace-" + ("x" * 200)})

    assert response.status_code == 200
    request_id = response.headers["x-request-id"]
    correlation_id = response.headers["x-correlation-id"]
    assert str(uuid.UUID(request_id)) == request_id
    assert str(uuid.UUID(correlation_id)) == correlation_id
    assert request_id != correlation_id
    assert correlation_id != "trace-" + ("x" * 200)


def test_sensitive_action_is_denied_at_api_boundary(monkeypatch):
    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    response = client.post(
        "/v1/tasks",
        headers={"Authorization": "Bearer test-secret"},
        json={"task": "transfer funds", "action_class": "financial", "require_approval": False},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "DEGRADED"
    assert body["evidence"] == ["policy:deny"]
    assert "blocked by default" in body["message"]


def test_task_endpoint_rejects_missing_authorization(monkeypatch):
    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    response = client.post("/v1/tasks", json={"task": "test"})
    assert response.status_code == 401


def test_task_endpoint_rejects_unknown_fields(monkeypatch):
    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    response = client.post(
        "/v1/tasks",
        headers={"Authorization": "Bearer test-secret"},
        json={"task": "test", "unexpected_admin_override": True},
    )
    assert response.status_code == 422


def test_task_endpoint_rejects_blank_task(monkeypatch):
    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    response = client.post(
        "/v1/tasks",
        headers={"Authorization": "Bearer test-secret"},
        json={"task": "   "},
    )
    assert response.status_code == 422


def test_readiness_response_has_security_headers(isolated_readiness):
    response = client.get("/ready")
    assert response.status_code == 503
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"


def test_readiness_does_not_claim_database_or_provider_health(isolated_readiness):
    response = client.get("/ready")
    body = response.json()
    assert body["status"] == "NOT READY"
    assert set(body["checks"]) == {
        "providers", "database", "authentication", "rate_limit", "audit", "task_runs"
    }
    assert body["checks"]["providers"] == "NOT VERIFIED"
    assert body["checks"]["database"] == "NOT CONFIGURED (OPTIONAL)"
    assert body["checks"]["authentication"] == "NOT REQUIRED (LOCAL)"
    assert body["checks"]["rate_limit"] == "NOT REQUIRED (LOCAL)"
    assert body["checks"]["audit"] == "NOT CONFIGURED (OPTIONAL)"
    assert body["checks"]["task_runs"] == "NOT CONFIGURED (OPTIONAL)"
    assert "optional unless" in body["requirements"]["database"]
    assert body["execution"]["inference_performed"] is False

def test_declared_oversized_request_body_is_rejected():
    response = client.get("/health", headers={"Content-Length": "65537"})
    assert response.status_code == 413
    assert response.json()["detail"] == "Request body exceeds the 65536-byte limit"
    assert response.headers["x-content-type-options"] == "nosniff"
    request_id = response.headers["x-request-id"]
    correlation_id = response.headers["x-correlation-id"]
    assert str(uuid.UUID(request_id)) == request_id
    assert str(uuid.UUID(correlation_id)) == correlation_id
    assert request_id != correlation_id

def test_malformed_content_length_is_rejected():
    response = client.get("/health", headers={"Content-Length": "invalid"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid Content-Length header"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_negative_content_length_is_rejected():
    response = client.get("/health", headers={"Content-Length": "-1"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid Content-Length header"


def test_opt_in_audit_records_request_and_correlation_ids_separately(monkeypatch):
    from app.audit import AuditEvent

    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    correlation_id = str(uuid.uuid4()).upper()
    events = []

    class FakeSink:
        def write(self, event: AuditEvent):
            events.append(event)

    monkeypatch.setattr("app.api.SupabaseRestAuditSink.from_environment", lambda: FakeSink())
    response = client.post(
        "/v1/tasks",
        headers={
            "Authorization": "Bearer test-secret",
            "X-Correlation-ID": correlation_id,
        },
        json={"task": "private task text", "require_approval": False},
    )

    assert response.status_code == 200
    assert len(events) == 2
    assert events[0].event_type == "task_received"
    assert events[1].event_type == "task_not_executed"
    request_id = response.headers["x-request-id"]
    assert request_id != response.headers["x-correlation-id"]
    assert events[0].request_id == request_id
    assert events[1].request_id == request_id
    assert events[0].correlation_id == correlation_id
    assert events[1].correlation_id == correlation_id
    assert all(not hasattr(event, "task") for event in events)
    assert all("private task text" not in repr(event) for event in events)


def test_audit_write_failure_prevents_task_execution(monkeypatch):
    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    called = {"run": False}

    class BrokenSink:
        def write(self, event):
            raise RuntimeError("private credentials must not leak")

    def forbidden_run(task_request):
        called["run"] = True
        raise AssertionError("task execution must not start if initial audit write fails")

    monkeypatch.setattr("app.api.SupabaseRestAuditSink.from_environment", lambda: BrokenSink())
    monkeypatch.setattr("app.api.orchestrator.run", forbidden_run)
    response = client.post(
        "/v1/tasks",
        headers={"Authorization": "Bearer test-secret"},
        json={"task": "test", "require_approval": False},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Audit persistence unavailable; task not executed"
    assert "private credentials" not in response.text
    assert called["run"] is False



def test_task_endpoint_rate_limits_authenticated_requests(monkeypatch):
    from app.rate_limit import FixedWindowRateLimiter

    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    monkeypatch.setattr("app.api.TASK_RATE_LIMITER", FixedWindowRateLimiter(max_requests=1))
    headers = {"Authorization": "Bearer test-secret"}
    first = client.post("/v1/tasks", headers=headers, json={"task": "first"})
    second = client.post("/v1/tasks", headers=headers, json={"task": "second"})

    assert first.status_code == 200
    assert second.status_code == 429
    assert int(second.headers["retry-after"]) >= 1


def test_task_rate_limit_does_not_apply_before_authentication(monkeypatch):
    from app.rate_limit import FixedWindowRateLimiter

    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    monkeypatch.setattr("app.api.TASK_RATE_LIMITER", FixedWindowRateLimiter(max_requests=1))
    first = client.post("/v1/tasks", headers={"Authorization": "Bearer wrong"}, json={"task": "first"})
    second = client.post("/v1/tasks", headers={"Authorization": "Bearer wrong"}, json={"task": "second"})

    assert first.status_code == 401
    assert second.status_code == 401


def test_final_audit_write_failure_returns_outcome_without_inviting_retry(monkeypatch):
    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    writes = {"count": 0}

    class FinalWriteFails:
        def write(self, event):
            writes["count"] += 1
            if writes["count"] == 2:
                raise RuntimeError("secret-key-and-private-payload")

    monkeypatch.setattr(
        "app.api.SupabaseRestAuditSink.from_environment",
        lambda: FinalWriteFails(),
    )
    response = client.post(
        "/v1/tasks",
        headers={"Authorization": "Bearer test-secret"},
        json={"task": "safe test task", "require_approval": False},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "NOT VERIFIED"
    assert "persistence:audit:degraded" in response.json()["evidence"]
    assert "returned to avoid an unsafe automatic retry" in response.json()["message"]
    assert "secret-key-and-private-payload" not in response.text
    assert writes["count"] == 2


def test_task_run_write_failure_returns_completed_outcome_without_retry(monkeypatch):
    monkeypatch.setenv("GLORIFIER_API_TOKEN", "task-run-write-token")
    monkeypatch.delenv("GLORIFIER_AUDIT_ENABLED", raising=False)
    calls = {"task": 0, "write": 0}

    class BrokenTaskRunRepository:
        def record(self, **_values):
            calls["write"] += 1
            raise RuntimeError("private database detail")

    def completed_task(_task_request):
        calls["task"] += 1
        from app.schemas import TaskResponse

        return TaskResponse(
            status="VERIFIED",
            result="completed result",
            evidence=["execution:inference"],
            message="Task processing completed.",
        )

    monkeypatch.setattr(
        "app.api.TaskRunRepository.from_environment",
        lambda *_args: BrokenTaskRunRepository(),
    )
    monkeypatch.setattr("app.api.SupabaseRestAuditSink.from_environment", lambda *_args: None)
    monkeypatch.setattr("app.api.orchestrator.run", completed_task)

    response = client.post(
        "/v1/tasks",
        headers={"Authorization": "Bearer task-run-write-token"},
        json={"task": "safe read-only task", "require_approval": False},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "PARTIALLY VERIFIED"
    assert response.json()["result"] == "completed result"
    assert "persistence:task_runs:degraded" in response.json()["evidence"]
    assert "returned to avoid an unsafe automatic retry" in response.json()["message"]
    assert "private database detail" not in response.text
    assert calls == {"task": 1, "write": 1}



def test_unexpected_initial_audit_failure_fails_closed_without_leaking(monkeypatch):
    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    called = {"run": False}

    class BrokenSink:
        def write(self, event):
            raise OSError("internal network path and credential details")

    def forbidden_run(task_request):
        called["run"] = True
        raise AssertionError("task processing must not start after audit failure")

    monkeypatch.setattr("app.api.SupabaseRestAuditSink.from_environment", lambda: BrokenSink())
    monkeypatch.setattr("app.api.orchestrator.run", forbidden_run)
    response = client.post(
        "/v1/tasks",
        headers={"Authorization": "Bearer test-secret"},
        json={"task": "test", "require_approval": False},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Audit persistence unavailable; task not executed"
    assert "internal network path" not in response.text
    assert called["run"] is False



def test_unhandled_server_error_keeps_request_and_correlation_headers(monkeypatch):
    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    correlation_id = str(uuid.uuid4())

    def fail_task(task_request):
        raise RuntimeError("private provider detail must not leak")

    monkeypatch.setattr("app.api.orchestrator.run", fail_task)
    safe_client = TestClient(app, raise_server_exceptions=False)
    response = safe_client.post(
        "/v1/tasks",
        headers={
            "Authorization": "Bearer test-secret",
            "X-Correlation-ID": correlation_id,
        },
        json={"task": "safe test", "require_approval": False},
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal Server Error"}
    assert response.headers["x-correlation-id"] == correlation_id
    request_id = response.headers["x-request-id"]
    assert str(uuid.UUID(request_id)) == request_id
    assert request_id != correlation_id
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"
    assert "private provider detail" not in response.text


def test_correlation_id_trims_surrounding_whitespace():
    correlation_id = str(uuid.uuid4())
    response = client.get(
        "/health",
        headers={"X-Correlation-ID": f"  {correlation_id}  "},
    )

    assert response.status_code == 200
    assert response.headers["x-correlation-id"] == correlation_id


def test_noncanonical_uuid_correlation_id_is_replaced():
    correlation_id = str(uuid.uuid4())
    noncanonical_id = correlation_id.replace("-", "")
    response = client.get(
        "/health",
        headers={"X-Correlation-ID": noncanonical_id},
    )

    assert response.status_code == 200
    returned_id = response.headers["x-correlation-id"]
    assert str(uuid.UUID(returned_id)) == returned_id
    assert returned_id != noncanonical_id


def test_provider_failure_is_recorded_as_inference_failed(monkeypatch):
    from app.audit import AuditEvent
    from app.schemas import TaskResponse

    monkeypatch.setenv("GLORIFIER_API_TOKEN", "test-secret")
    events = []

    class FakeSink:
        def write(self, event: AuditEvent):
            events.append(event)

    def failed_run(task_request):
        return TaskResponse(
            status="DEGRADED",
            provider="nvidia_nim",
            message="Provider inference failed (RuntimeError); no result was accepted.",
            evidence=["provider:nvidia_nim:error", "execution:failed"],
        )

    monkeypatch.setattr("app.api.SupabaseRestAuditSink.from_environment", lambda: FakeSink())
    monkeypatch.setattr("app.api.orchestrator.run", failed_run)
    response = client.post(
        "/v1/tasks",
        headers={"Authorization": "Bearer test-secret"},
        json={"task": "safe test", "require_approval": False},
    )

    assert response.status_code == 200
    assert len(events) == 2
    assert events[0].event_type == "task_received"
    assert events[1].event_type == "inference_failed"
    assert events[1].status == "DEGRADED"
    assert events[1].evidence == ("provider:nvidia_nim:error", "execution:failed")


@pytest.mark.parametrize(
    ("catalogue_data", "expected_status", "expected_provider_status", "expected_readiness_status"),
    [
        (
            [{"id": "nvidia/nemotron-3.5-super-vl-120b-a12b"}],
            200,
            "VERIFIED",
            "READY",
        ),
        (
            [{"id": "another/model"}],
            503,
            "DEGRADED",
            "NOT READY",
        ),
    ],
)
def test_readiness_checks_configured_nvidia_model_without_inference(
    monkeypatch,
    catalogue_data,
    expected_status,
    expected_provider_status,
    expected_readiness_status,
):
    import json

    from app.runtime import build_orchestrator_from_environment

    monkeypatch.setenv("GLORIFIER_ENABLE_INFERENCE", "true")
    monkeypatch.setenv("GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS", "true")
    monkeypatch.setenv("GLORIFIER_PROVIDER", "nvidia_nim")
    monkeypatch.setenv("NVIDIA_NIM_API_KEY", "readiness-test-secret")
    monkeypatch.setenv("NVIDIA_NIM_MODEL", "nvidia/nemotron-3.5-super-vl-120b-a12b")
    monkeypatch.setattr("app.api.orchestrator", build_orchestrator_from_environment())
    monkeypatch.setattr("app.api.NeonConnectivityProbe.from_environment", lambda: None)

    from types import SimpleNamespace

    class FakeSocket:
        def __init__(self):
            self.timeouts = []

        def settimeout(self, timeout):
            self.timeouts.append(timeout)

    class FakeResponse:
        status = 200

        def __init__(self):
            self.body = json.dumps({"data": catalogue_data}).encode()
            self.socket = FakeSocket()
            self.fp = SimpleNamespace(raw=SimpleNamespace(_sock=self.socket))

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read1(self, limit):
            chunk = self.body[:limit]
            self.body = self.body[len(chunk):]
            return chunk

    def fake_urlopen(request, *, timeout):
        assert request.full_url == "https://integrate.api.nvidia.com/v1/models"
        assert request.get_method() == "GET"
        assert request.data is None, "readiness must not submit a prompt or trigger inference"
        assert request.get_header("Authorization") == "Bearer readiness-test-secret"
        assert timeout <= 5
        return FakeResponse()

    monkeypatch.setattr("app.providers._open_nvidia_request", fake_urlopen)

    response = client.get("/ready")

    assert response.status_code == expected_status
    body = response.json()
    assert body["status"] == expected_readiness_status
    assert body["checks"]["providers"] == expected_provider_status
    assert body["checks"]["database"] == "NOT CONFIGURED (OPTIONAL)"
    assert body["execution"]["inference_performed"] is False
    assert "readiness-test-secret" not in response.text



def test_task_run_persistence_value_error_keeps_specific_invalid_record_evidence():
    class InvalidTaskRunRepository:
        def record(self, **_values):
            raise ValueError("schema validation failed")

    task_request = TaskRequest(task="safe persistence diagnostic")
    result = TaskResponse(
        status="VERIFIED",
        provider=None,
        message="The task completed.",
        evidence=["execution:none"],
    )
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/v1/tasks",
            "headers": [],
            "query_string": b"",
        }
    )

    persisted = asyncio.run(
        _persist_task_run(
            InvalidTaskRunRepository(),
            result,
            "request-id",
            task_request,
            request,
            worker_request=False,
        )
    )

    assert persisted.status == "PARTIALLY VERIFIED"
    assert persisted.evidence[-1] == "persistence:task_runs:invalid-record"


def test_internal_service_credential_must_differ_from_public_api_token(monkeypatch):
    from starlette.requests import Request

    token = "same-public-and-internal-token"
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "scheme": "https",
            "path": "/__internal/verify-task",
            "raw_path": b"/__internal/verify-task",
            "query_string": b"",
            "headers": [],
            "server": ("glorifier-neural.example", 443),
            "client": ("127.0.0.1", 12345),
            "env": {
                "GLORIFIER_API_TOKEN": token,
                "GLORIFIER_INTERNAL_SERVICE_TOKEN": token,
            },
        }
    )
    task = TaskRequest(
        task="internal credential separation check",
        require_approval=True,
        action_class="read_only",
    )

    with pytest.raises(HTTPException) as rejected:
        asyncio.run(
            _process_authenticated_task(
                task,
                request,
                f"Bearer {token}",
                persist=False,
                allow_internal_token=True,
            )
        )

    assert rejected.value.status_code == 503
    assert "must be distinct" in rejected.value.detail
