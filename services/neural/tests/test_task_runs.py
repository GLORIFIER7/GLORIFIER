from datetime import UTC, datetime, timedelta
import secrets
from uuid import uuid4

import pytest

from app.database.task_runs import RETENTION_DAYS, TaskRunRepository


def test_task_run_repository_is_disabled_by_default(monkeypatch):
    monkeypatch.delenv("GLORIFIER_NEON_TASK_RUNS_ENABLED", raising=False)
    monkeypatch.delenv("NEON_DATABASE_URL", raising=False)
    assert TaskRunRepository.from_environment() is None


def test_task_run_repository_requires_url_when_explicitly_enabled(monkeypatch):
    monkeypatch.setenv("GLORIFIER_NEON_TASK_RUNS_ENABLED", "true")
    monkeypatch.delenv("NEON_DATABASE_URL", raising=False)
    with pytest.raises(ValueError, match="URL is missing"):
        TaskRunRepository.from_environment()


def test_valid_metadata_is_bounded_and_retained_for_30_days():
    now = datetime(2026, 1, 1, tzinfo=UTC)
    values = TaskRunRepository.validate_record(
        request_id=str(uuid4()), action_class="summarize", status="NOT VERIFIED",
        provider="nvidia_nim", evidence=["inference:disabled", "execution:none"], now=now,
    )
    assert values[5] == now
    assert values[6] == now + timedelta(days=RETENTION_DAYS)
    assert values[4] == ["inference:disabled", "execution:none"]


@pytest.mark.parametrize("action_class", ["", "Summarize", "customer prompt", "x" * 81, "hello\nworld"])
def test_rejects_unsafe_action_class(action_class):
    with pytest.raises(ValueError, match="action_class"):
        TaskRunRepository.validate_record(
            request_id=str(uuid4()), action_class=action_class, status="VERIFIED"
        )


def test_rejects_unknown_status():
    with pytest.raises(ValueError, match="status"):
        TaskRunRepository.validate_record(
            request_id=str(uuid4()), action_class="summarize", status="success"
        )


def test_rejects_free_text_in_evidence():
    with pytest.raises(ValueError, match="evidence"):
        TaskRunRepository.validate_record(
            request_id=str(uuid4()), action_class="summarize", status="VERIFIED",
            evidence=["customer email is example@example.com"],
        )


def test_rejects_oversized_evidence_list():
    with pytest.raises(ValueError, match="20 evidence codes"):
        TaskRunRepository.validate_record(
            request_id=str(uuid4()), action_class="summarize", status="VERIFIED",
            evidence=[f"event:{index}" for index in range(21)],
        )


def test_rejects_naive_timestamp():
    with pytest.raises(ValueError, match="timezone-aware"):
        TaskRunRepository.validate_record(
            request_id=str(uuid4()), action_class="summarize", status="VERIFIED",
            now=datetime(2026, 1, 1),
        )



def test_delete_expired_uses_bounded_expiry_only_batch(monkeypatch):
    import sys
    from types import SimpleNamespace

    class Cursor:
        def __init__(self):
            self.query = ""
            self.params = None

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, query, params):
            self.query = query
            self.params = params

        def fetchall(self):
            return [(uuid4(),), (uuid4(),)]

    class Connection:
        def __init__(self):
            self.cursor_instance = Cursor()

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return self.cursor_instance

    connection = Connection()
    monkeypatch.setitem(
        sys.modules,
        "psycopg",
        SimpleNamespace(connect=lambda *_args, **_kwargs: connection),
    )
    now = datetime(2026, 2, 1, tzinfo=UTC)
    repository = TaskRunRepository("postgresql://test.invalid/db")

    assert repository.delete_expired(batch_size=50, now=now) == 2
    assert connection.cursor_instance.params == (now, 50)
    assert "expires_at <= %s" in connection.cursor_instance.query
    assert "LIMIT %s" in connection.cursor_instance.query
    assert "FOR UPDATE SKIP LOCKED" in connection.cursor_instance.query


@pytest.mark.parametrize("batch_size", [0, -1, 1001, True, 1.5])
def test_delete_expired_rejects_unsafe_batch_size(batch_size):
    repository = TaskRunRepository("postgresql://test.invalid/db")
    with pytest.raises(ValueError, match="batch_size"):
        repository.delete_expired(batch_size=batch_size)


def test_delete_expired_rejects_naive_timestamp():
    repository = TaskRunRepository("postgresql://test.invalid/db")
    with pytest.raises(ValueError, match="timezone-aware"):
        repository.delete_expired(now=datetime(2026, 1, 1))

def test_task_run_repository_uses_authenticated_tls_for_writes_and_cleanup(monkeypatch):
    import sys
    from types import SimpleNamespace

    calls = []

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, query, params):
            calls[-1]["query"] = query
            calls[-1]["params"] = params

        def fetchall(self):
            return []

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return Cursor()

    def connect(dsn, **kwargs):
        calls.append({"dsn": dsn, "kwargs": kwargs})
        return Connection()

    monkeypatch.setitem(sys.modules, "psycopg", SimpleNamespace(connect=connect))
    database_url = "postgresql://neural_writer:secret@example.neon.tech/glorifier"
    repository = TaskRunRepository(database_url)

    repository.record(
        request_id=str(uuid4()),
        action_class="read_only",
        status="NOT VERIFIED",
        evidence=["execution:none"],
    )
    repository.delete_expired(batch_size=5)

    assert len(calls) == 2
    for call in calls:
        assert call["dsn"] == database_url
        assert call["kwargs"] == {
            "connect_timeout": 3,
            "sslmode": "verify-full",
            "sslrootcert": "system",
            "channel_binding": "require",
        }
    assert "INSERT INTO glorifier.task_runs" in calls[0]["query"]
    assert "DELETE FROM glorifier.task_runs" in calls[1]["query"]

@pytest.mark.parametrize("connect_timeout", [0, -1, 6, True, False, 1.5, "3", None])
def test_task_run_repository_rejects_invalid_neon_timeouts(connect_timeout):
    with pytest.raises(ValueError, match="Neon connection timeout"):
        TaskRunRepository(
            "postgresql://test.invalid/db",
            connect_timeout=connect_timeout,
        )



def test_task_run_repository_reads_request_scoped_worker_environment():
    env = {
        "GLORIFIER_NEON_TASK_RUNS_ENABLED": "true",
        "NEON_DATABASE_URL": "postgresql://neon_user:neon_pass@example.neon.tech/neural",
    }

    repository = TaskRunRepository.from_environment(env)

    assert repository is not None
    assert repository._database_url == env["NEON_DATABASE_URL"]


def test_worker_task_run_write_is_committed_and_verified_by_readback(monkeypatch):
    import sys
    from types import SimpleNamespace

    request_id = str(uuid4())
    calls = []
    inserted_id = None

    class Cursor:
        def execute(self, query, params):
            nonlocal inserted_id
            calls.append((query, params))
            if query.lstrip().startswith("INSERT"):
                inserted_id = params[0]

        def fetchone(self):
            return (inserted_id,)

        def close(self):
            return None

    class Connection:
        def __init__(self):
            self.cursor_instance = Cursor()
            self.committed = False
            self.closed = False

        def cursor(self):
            return self.cursor_instance

        def commit(self):
            self.committed = True

        def close(self):
            self.closed = True

    connection = Connection()
    def connect(**kwargs):
        calls.append(("connect", kwargs))
        return connection

    monkeypatch.setitem(sys.modules, "pg8000", SimpleNamespace(connect=connect))
    repository = TaskRunRepository(
        "postgresql://neon_user:neon_pass@example.neon.tech/neural"
    )

    repository.record_worker(
        request_id=request_id,
        action_class="read_only",
        status="NOT VERIFIED",
        evidence=["execution:none"],
    )

    assert connection.committed is True
    assert connection.closed is True
    assert calls[1][0].lstrip().startswith("INSERT INTO glorifier.task_runs")
    assert calls[2][0].lstrip().startswith("SELECT request_id FROM glorifier.task_runs")
    assert "execution:none" in calls[1][1][4]


def test_worker_task_run_write_fails_closed_on_missing_readback(monkeypatch):
    import sys
    from types import SimpleNamespace

    class Cursor:
        def execute(self, _query, _params):
            return None

        def fetchone(self):
            return None

        def close(self):
            return None

    class Connection:
        def cursor(self):
            return Cursor()

        def commit(self):
            return None

        def close(self):
            return None

    monkeypatch.setitem(
        sys.modules,
        "pg8000",
        SimpleNamespace(connect=lambda **_kwargs: Connection()),
    )
    repository = TaskRunRepository(
        "postgresql://neon_user:neon_pass@example.neon.tech/neural"
    )

    with pytest.raises(RuntimeError, match="readback did not match"):
        repository.record_worker(
            request_id=str(uuid4()),
            action_class="read_only",
            status="NOT VERIFIED",
            evidence=["execution:none"],
        )


def test_worker_task_run_repository_supports_neon_write_hyperdrive(monkeypatch):
    import sys
    from types import SimpleNamespace

    calls = []
    request_id = str(uuid4())

    class Cursor:
        def execute(self, query, params):
            calls.append((query, params))

        def fetchone(self):
            return (request_id,)

        def close(self):
            return None

    class Connection:
        def cursor(self):
            return Cursor()

        def commit(self):
            calls.append(("commit", None))

        def close(self):
            return None

    def connect(**kwargs):
        calls.append(("connect", kwargs))
        return Connection()

    monkeypatch.setitem(sys.modules, "pg8000", SimpleNamespace(connect=connect))
    hyperdrive = SimpleNamespace(
        user="neon_writer",
        password=secrets.token_urlsafe(32),
        host="hyperdrive.internal",
        port="5432",
        database="glorifier",
    )
    repository = TaskRunRepository.from_environment(
        {
            "GLORIFIER_NEON_TASK_RUNS_ENABLED": "true",
            "NEON_WRITE": hyperdrive,
        }
    )

    repository.record_worker(
        request_id=request_id,
        action_class="read_only",
        status="NOT VERIFIED",
        evidence=["execution:none"],
    )

    connection_args = calls[0][1]
    assert connection_args["host"] == "hyperdrive.internal"
    assert connection_args["user"] == "neon_writer"
    assert connection_args["ssl_context"] is False
    assert connection_args["timeout"] == 15
    assert calls[3][0].lstrip().startswith("SELECT request_id FROM glorifier.task_runs")

def test_worker_task_run_readback_mismatch_is_reported_without_masking(monkeypatch):
    import sys
    from types import SimpleNamespace

    request_id = str(uuid4())
    other_request_id = str(uuid4())

    class Cursor:
        def execute(self, _query, _params):
            return None

        def fetchone(self):
            return (other_request_id,)

        def close(self):
            return None

    class Connection:
        def cursor(self):
            return Cursor()

        def commit(self):
            return None

        def close(self):
            return None

    monkeypatch.setitem(
        sys.modules,
        "pg8000",
        SimpleNamespace(connect=lambda **_kwargs: Connection()),
    )
    repository = TaskRunRepository.from_environment(
        {
            "GLORIFIER_NEON_TASK_RUNS_ENABLED": "true",
            "NEON_WRITE": SimpleNamespace(
                user="neon_writer",
                password=secrets.token_urlsafe(32),
                host="hyperdrive.internal",
                port="5432",
                database="glorifier",
            ),
        }
    )

    with pytest.raises(RuntimeError, match="readback did not match"):
        repository.record_worker(
            request_id=request_id,
            action_class="read_only",
            status="NOT VERIFIED",
            evidence=["execution:none"],
        )
