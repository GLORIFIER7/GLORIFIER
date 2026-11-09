import dataclasses
import json

import pytest

from app.audit import AuditEvent, AuditSink, SupabaseRestAuditSink


def test_audit_event_contains_only_minimal_operational_fields():
    event = AuditEvent(
        request_id="req-123",
        event_type="task_received",
        status="NOT VERIFIED",
        action_class="read_only",
        evidence=("execution:none",),
    )

    assert event.request_id == "req-123"
    assert event.evidence == ("execution:none",)
    assert "task" not in {field.name for field in dataclasses.fields(event)}
    assert "authorization" not in {field.name for field in dataclasses.fields(event)}
    assert "details" not in {field.name for field in dataclasses.fields(event)}



def test_audit_event_preserves_legacy_positional_evidence_argument():
    event = AuditEvent(
        "req-123",
        "task_received",
        "NOT VERIFIED",
        "read_only",
        "nvidia_nim",
        ("execution:none",),
    )

    assert event.provider == "nvidia_nim"
    assert event.evidence == ("execution:none",)
    assert event.correlation_id is None


def test_audit_event_is_immutable():
    event = AuditEvent(
        request_id="req-123",
        event_type="task_received",
        status="NOT VERIFIED",
        action_class="read_only",
    )

    with pytest.raises(dataclasses.FrozenInstanceError):
        event.status = "VERIFIED"


def test_persistence_boundary_is_not_implicitly_implemented():
    sink = AuditSink()
    event = AuditEvent(
        request_id="req-123",
        event_type="task_received",
        status="NOT VERIFIED",
        action_class="read_only",
    )

    with pytest.raises(NotImplementedError):
        sink.write(event)


def test_supabase_sink_is_disabled_unless_explicitly_enabled(monkeypatch):
    monkeypatch.delenv("GLORIFIER_AUDIT_ENABLED", raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")
    assert SupabaseRestAuditSink.from_environment() is None


def test_enabled_supabase_sink_requires_credentials(monkeypatch):
    monkeypatch.setenv("GLORIFIER_AUDIT_ENABLED", "true")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(ValueError, match="credentials are missing"):
        SupabaseRestAuditSink.from_environment()


def test_supabase_sink_requires_https():
    with pytest.raises(ValueError, match="HTTPS"):
        SupabaseRestAuditSink("http://example.supabase.co", "test-key")


def test_supabase_sink_posts_only_sanitized_allowlisted_fields(monkeypatch):
    captured = {}

    class FakeResponse:
        status = 201

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["headers"] = dict(request.header_items())
        captured["body"] = json.loads(request.data)
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("app.audit.urllib.request.urlopen", fake_urlopen)
    sink = SupabaseRestAuditSink("https://example.supabase.co", "test-service-role-key")
    sink.write(
        AuditEvent(
            request_id="req-123",
            event_type="task_received",
            status="NOT VERIFIED",
            action_class="read_only",
            provider=None,
            correlation_id="correlation-123",
            evidence=("execution:none",),
        )
    )

    assert captured["url"] == "https://example.supabase.co/rest/v1/audit_events"
    assert captured["timeout"] == 2.0
    assert captured["body"] == {
        "request_id": "req-123",
        "event_type": "task_received",
        "status": "NOT VERIFIED",
        "action_class": "read_only",
        "provider": None,
        "evidence": ["execution:none"],
        "details": {"correlation_id": "correlation-123"},
    }
    assert "test-service-role-key" in captured["headers"]["Authorization"]
    assert captured["headers"]["Content-profile"] == "glorifier"


@pytest.mark.parametrize(
    "event, error_message",
    [
        (
            AuditEvent(
                request_id="req-123",
                event_type="task_received",
                status="NOT VERIFIED",
                action_class="read_only",
                correlation_id="x" * 129,
            ),
            "Invalid audit correlation_id",
        ),
        (
            AuditEvent(
                request_id="req-123",
                event_type="task_received",
                status="NOT VERIFIED",
                action_class="read_only",
                evidence=("x" * 161,),
            ),
            "Invalid audit evidence",
        ),
    ],
)
def test_supabase_sink_rejects_oversized_values_before_network(
    monkeypatch, event, error_message
):
    sink = SupabaseRestAuditSink("https://example.supabase.co", "test-key")
    monkeypatch.setattr(
        "app.audit.urllib.request.urlopen",
        lambda *args, **kwargs: pytest.fail("network must not be called"),
    )
    with pytest.raises(ValueError, match=error_message):
        sink.write(event)


@pytest.mark.parametrize(
    "url",
    [
        "https://example.supabase.co/rest/v1",
        "https://user:password@example.supabase.co",
        "https://example.supabase.co?redirect=unsafe",
        "https://example.supabase.co#fragment",
    ],
)
def test_supabase_sink_rejects_non_origin_urls(url):
    with pytest.raises(ValueError, match="HTTPS origin"):
        SupabaseRestAuditSink(url, "test-key")


def test_supabase_http_error_does_not_expose_server_body_or_secret(monkeypatch):
    import urllib.error

    def fail_with_private_response(request, timeout):
        raise urllib.error.HTTPError(
            request.full_url,
            403,
            "Forbidden",
            {},
            __import__("io").BytesIO(b"private database details"),
        )

    monkeypatch.setattr("app.audit.urllib.request.urlopen", fail_with_private_response)
    sink = SupabaseRestAuditSink("https://example.supabase.co", "test-service-role-key")
    event = AuditEvent(
        request_id="req-123",
        event_type="task_received",
        status="NOT VERIFIED",
        action_class="read_only",
    )

    with pytest.raises(RuntimeError, match="HTTP 403") as error:
        sink.write(event)
    assert "private database details" not in str(error.value)
    assert "test-service-role-key" not in str(error.value)


def test_supabase_sink_reads_worker_bindings_and_uses_fetch_for_async_audit():
    import asyncio
    captured = {}

    class FakeResponse:
        status = 201

    async def fake_fetch(url, **options):
        captured["url"] = url
        captured["options"] = options
        return FakeResponse()

    worker_env = {
        "GLORIFIER_AUDIT_ENABLED": "true",
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "worker-only-service-key",
    }
    sink = SupabaseRestAuditSink.from_environment(
        worker_env,
        fetch_fn=fake_fetch,
    )

    asyncio.run(
        sink.awrite(
            AuditEvent(
                request_id="req-worker",
                event_type="task_received",
                status="NOT VERIFIED",
                action_class="read_only",
            )
        )
    )

    assert captured["url"] == "https://example.supabase.co/rest/v1/audit_events"
    assert captured["options"]["method"] == "POST"
    assert captured["options"]["redirect"] == "manual"
    assert captured["options"]["headers"]["Authorization"] == "Bearer worker-only-service-key"
    payload = json.loads(captured["options"]["body"])
    assert payload["request_id"] == "req-worker"
    assert "task" not in payload
