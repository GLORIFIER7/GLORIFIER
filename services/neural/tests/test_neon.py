import asyncio
import logging
import secrets
import ssl
import sys
import types

import pytest

from app.database.neon import NeonConnectivityProbe


def test_neon_probe_is_disabled_by_default(monkeypatch):
    monkeypatch.delenv("GLORIFIER_NEON_CONNECTIVITY_ENABLED", raising=False)
    monkeypatch.setenv("NEON_DATABASE_URL", "postgresql://user:pass@example.neon.tech/db")
    assert NeonConnectivityProbe.from_environment() is None


def test_enabled_neon_probe_requires_url(monkeypatch):
    monkeypatch.setenv("GLORIFIER_NEON_CONNECTIVITY_ENABLED", "true")
    monkeypatch.delenv("NEON_DATABASE_URL", raising=False)
    with pytest.raises(ValueError, match="URL is missing"):
        NeonConnectivityProbe.from_environment()


@pytest.mark.parametrize(
    "url",
    [
        "https://example.neon.tech/db",
        "postgresql://example.neon.tech/db",
    ],
)
def test_neon_probe_rejects_invalid_database_url(url):
    with pytest.raises(ValueError, match="URL or timeout is invalid"):
        NeonConnectivityProbe(url)


def test_neon_probe_uses_tls_bounded_connection_and_read_only_query(monkeypatch):
    calls = {}

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def execute(self, query):
            calls["query"] = query

        def fetchone(self):
            return (1,)

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def cursor(self):
            return Cursor()

    def connect(dsn, **kwargs):
        calls["dsn"] = dsn
        calls["kwargs"] = kwargs
        return Connection()

    monkeypatch.setitem(sys.modules, "psycopg", types.SimpleNamespace(connect=connect))
    NeonConnectivityProbe("postgresql://user:pass@example.neon.tech/db").check()

    assert calls["query"] == "SELECT 1"
    assert calls["kwargs"] == {
        "connect_timeout": 3,
        "sslmode": "verify-full",
        "sslrootcert": "system",
        "channel_binding": "require",
    }
    assert calls["dsn"] == "postgresql://user:pass@example.neon.tech/db"


def test_neon_probe_sanitizes_connection_errors(monkeypatch):
    def connect(*args, **kwargs):
        raise OSError("sensitive host and credential data")

    monkeypatch.setitem(sys.modules, "psycopg", types.SimpleNamespace(connect=connect))
    with pytest.raises(RuntimeError, match="Neon connectivity probe failed") as error:
        NeonConnectivityProbe("postgresql://user:pass@example.neon.tech/db").check()
    assert "sensitive host" not in str(error.value)

@pytest.mark.parametrize("timeout_seconds", [1, 3, 5])
def test_neon_connection_options_accepts_bounded_integer_timeouts(timeout_seconds):
    from app.database.neon import neon_connection_options

    assert neon_connection_options(timeout_seconds) == {
        "connect_timeout": timeout_seconds,
        "sslmode": "verify-full",
        "sslrootcert": "system",
        "channel_binding": "require",
    }


@pytest.mark.parametrize(
    "timeout_seconds",
    [0, -1, 6, True, False, 1.5, "3", None],
)
def test_neon_connection_options_rejects_invalid_timeouts(timeout_seconds):
    from app.database.neon import neon_connection_options

    with pytest.raises(ValueError, match="Neon connection timeout"):
        neon_connection_options(timeout_seconds)


@pytest.mark.parametrize("timeout_seconds", [0, 6, True, 1.5])
def test_neon_probe_rejects_invalid_timeout_types_and_ranges(timeout_seconds):
    with pytest.raises(ValueError, match="Neon connection timeout"):
        NeonConnectivityProbe(
            "postgresql://user:pass@example.neon.tech/db",
            timeout_seconds=timeout_seconds,
        )




def test_worker_neon_probe_uses_asyncpg_with_verified_tls(monkeypatch):
    calls = {}

    class Connection:
        async def fetchval(self, query):
            calls["query"] = query
            return 1

        async def close(self, **kwargs):
            calls["close_kwargs"] = kwargs
            calls["closed"] = True

    async def connect(**kwargs):
        calls["kwargs"] = kwargs
        return Connection()

    monkeypatch.setitem(sys.modules, "asyncpg", types.SimpleNamespace(connect=connect))
    probe = NeonConnectivityProbe(
        "postgresql://neon_user:neon_pass@example.neon.tech/neural"
    )

    asyncio.run(probe.check_worker())

    ssl_context = calls["kwargs"]["ssl"]
    assert isinstance(ssl_context, ssl.SSLContext)
    assert ssl_context.verify_mode == ssl.CERT_REQUIRED
    assert ssl_context.check_hostname is True
    assert calls["kwargs"]["host"] == "example.neon.tech"
    assert calls["kwargs"]["database"] == "neural"
    assert calls["kwargs"]["user"] == "neon_user"
    assert calls["kwargs"]["password"] == "neon_pass"
    assert calls["kwargs"]["timeout"] == 3
    assert calls["kwargs"]["command_timeout"] == 3
    assert calls["query"] == "SELECT 1"
    assert calls["closed"] is True
    assert calls["close_kwargs"] == {"timeout": 3}


def test_neon_probe_uses_cloudflare_readonly_hyperdrive_binding(monkeypatch):
    calls = {}

    class Connection:
        async def fetchval(self, query):
            calls["query"] = query
            return 1

        async def close(self, **kwargs):
            calls["close_kwargs"] = kwargs
            calls["closed"] = True

    async def connect(**kwargs):
        calls["kwargs"] = kwargs
        return Connection()

    monkeypatch.setitem(sys.modules, "asyncpg", types.SimpleNamespace(connect=connect))
    hyperdrive = types.SimpleNamespace(
        user="glorifier_worker_ro",
        password=secrets.token_urlsafe(32),
        host="hyperdrive.internal",
        port="5432",
        database="glorifier",
    )
    probe = NeonConnectivityProbe.from_environment(
        {
            "GLORIFIER_NEON_CONNECTIVITY_ENABLED": "true",
            "NEON_READONLY": hyperdrive,
        }
    )

    asyncio.run(probe.check_worker())

    assert calls["kwargs"]["host"] == "hyperdrive.internal"
    assert calls["kwargs"]["database"] == "glorifier"
    assert calls["kwargs"]["user"] == "glorifier_worker_ro"
    assert calls["kwargs"]["password"] == hyperdrive.password
    assert calls["kwargs"]["ssl"] is False
    assert calls["kwargs"]["timeout"] == 15
    assert calls["kwargs"]["command_timeout"] == 15
    assert calls["query"] == "SELECT 1"
    assert calls["closed"] is True
    assert calls["close_kwargs"] == {"timeout": 15}


def test_worker_neon_probe_sanitizes_async_driver_errors(monkeypatch, caplog):
    async def connect(**_kwargs):
        raise OSError("private database host and secret-value")

    monkeypatch.setitem(sys.modules, "asyncpg", types.SimpleNamespace(connect=connect))
    probe = NeonConnectivityProbe(
        "postgresql://neon_user:neon_pass@example.neon.tech/neural"
    )

    with (
        caplog.at_level(logging.WARNING, logger="app.database.neon"),
        pytest.raises(RuntimeError, match="Neon connectivity probe failed") as error,
    ):
        asyncio.run(probe.check_worker())

    assert "private database host" not in str(error.value)
    assert "secret-value" not in caplog.text
    assert "neon_pass" not in caplog.text
    assert "OSError" in caplog.text


def test_worker_probe_preserves_result_mismatch_when_cleanup_fails(monkeypatch):
    class Connection:
        async def fetchval(self, _query):
            return 0

        async def close(self, **_kwargs):
            raise RuntimeError("cleanup failure must not hide the probe result")

    async def connect(**_kwargs):
        return Connection()

    monkeypatch.setitem(sys.modules, "asyncpg", types.SimpleNamespace(connect=connect))
    probe = NeonConnectivityProbe.from_environment(
        {
            "GLORIFIER_NEON_CONNECTIVITY_ENABLED": "true",
            "NEON_READONLY": types.SimpleNamespace(
                user="glorifier_worker_ro",
                password=secrets.token_urlsafe(32),
                host="hyperdrive.internal",
                port="5432",
                database="glorifier",
            ),
        }
    )

    with pytest.raises(RuntimeError, match="unexpected result") as error:
        asyncio.run(probe.check_worker())

    assert "cleanup failure" not in str(error.value)


def test_worker_probe_fails_when_async_connection_cleanup_fails(monkeypatch):
    class Connection:
        async def fetchval(self, _query):
            return 1

        async def close(self, **_kwargs):
            raise RuntimeError("private cleanup detail")

    async def connect(**_kwargs):
        return Connection()

    monkeypatch.setitem(sys.modules, "asyncpg", types.SimpleNamespace(connect=connect))
    probe = NeonConnectivityProbe.from_environment(
        {
            "GLORIFIER_NEON_CONNECTIVITY_ENABLED": "true",
            "NEON_READONLY": types.SimpleNamespace(
                user="glorifier_worker_ro",
                password=secrets.token_urlsafe(32),
                host="hyperdrive.internal",
                port="5432",
                database="glorifier",
            ),
        }
    )

    with pytest.raises(RuntimeError, match="Neon connectivity probe failed") as error:
        asyncio.run(probe.check_worker())

    assert "private cleanup detail" not in str(error.value)
