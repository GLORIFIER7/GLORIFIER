"""Opt-in Neon PostgreSQL connectivity checks for local and Cloudflare runtimes."""
from __future__ import annotations

import logging
import os
from collections.abc import Mapping
from urllib.parse import urlparse

_LOGGER = logging.getLogger(__name__)
WORKER_CONNECT_TIMEOUT_SECONDS = 15


def neon_connection_options(timeout_seconds: int = 3) -> dict[str, int | str]:
    """Return mandatory TLS server-authentication options for psycopg."""
    if (
        isinstance(timeout_seconds, bool)
        or not isinstance(timeout_seconds, int)
        or not 0 < timeout_seconds <= 5
    ):
        raise ValueError("Neon connection timeout must be between 1 and 5 seconds")
    return {
        "connect_timeout": timeout_seconds,
        "sslmode": "verify-full",
        "sslrootcert": "system",
        "channel_binding": "require",
    }


def _environment_value(environment, name: str, default: str = "") -> str:
    if environment is None:
        return os.getenv(name, default)
    if isinstance(environment, Mapping):
        value = environment.get(name, default)
    else:
        value = getattr(environment, name, default)
    return default if value is None else str(value)


async def _connect_worker_database(asyncpg, database_url, hyperdrive, timeout):
    """Open a bounded asyncpg connection through Hyperdrive or a verified TLS DSN."""
    if hyperdrive is not None:
        return await asyncpg.connect(
            user=str(hyperdrive.user),
            password=str(hyperdrive.password),
            host=str(hyperdrive.host),
            port=int(hyperdrive.port),
            database=str(hyperdrive.database),
            ssl=False,
            timeout=timeout,
            command_timeout=timeout,
        )

    if not database_url:
        raise RuntimeError("Neon database URL is required for a direct Worker connection")
    parsed = urlparse(database_url)
    import ssl

    return await asyncpg.connect(
        user=parsed.username,
        password=parsed.password,
        host=parsed.hostname,
        port=parsed.port or 5432,
        database=parsed.path.lstrip("/"),
        ssl=ssl.create_default_context(),
        timeout=timeout,
        command_timeout=timeout,
    )


async def _close_worker_database(connection, timeout) -> bool:
    """Close the async database connection and report sanitized cleanup failures."""
    if connection is None:
        return False
    try:
        await connection.close(timeout=timeout)
    except Exception as exc:  # noqa: BLE001  # never expose database or credential details
        _LOGGER.warning(
            "Neon Worker connectivity probe cleanup failed (%s)", type(exc).__name__
        )
        return True
    return False


class NeonConnectivityProbe:
    """Run a bounded SELECT 1 probe using psycopg locally or asyncpg on Workers."""

    def __init__(
        self,
        database_url: str | None,
        *,
        hyperdrive=None,
        timeout_seconds: int = 3,
    ) -> None:
        neon_connection_options(timeout_seconds)
        if database_url:
            try:
                parsed = urlparse(database_url)
                parsed_port = parsed.port
            except (TypeError, ValueError):
                raise ValueError("Neon database URL or timeout is invalid") from None
            if (
                parsed.scheme not in ("postgres", "postgresql")
                or not parsed.hostname
                or parsed.username is None
                or parsed.password is None
                or (parsed_port is not None and not 1 <= parsed_port <= 65535)
            ):
                raise ValueError("Neon database URL or timeout is invalid")
        elif hyperdrive is None:
            raise ValueError("Neon database URL or Hyperdrive binding is required")
        self._database_url = database_url
        self._hyperdrive = hyperdrive
        self._timeout = timeout_seconds

    @classmethod
    def from_environment(cls, environment=None) -> NeonConnectivityProbe | None:
        """Return a probe only when connectivity or task-run persistence is explicitly enabled."""
        connectivity_enabled = (
            _environment_value(environment, "GLORIFIER_NEON_CONNECTIVITY_ENABLED")
            .strip()
            .casefold() == "true"
        )
        task_runs_enabled = (
            _environment_value(environment, "GLORIFIER_NEON_TASK_RUNS_ENABLED")
            .strip()
            .casefold() == "true"
        )
        if not connectivity_enabled and not task_runs_enabled:
            return None
        database_url = _environment_value(environment, "NEON_DATABASE_URL").strip()
        if isinstance(environment, Mapping):
            hyperdrive = environment.get("NEON_READONLY") or environment.get("NEON_WRITE")
        elif environment is not None:
            hyperdrive = getattr(environment, "NEON_READONLY", None) or getattr(
                environment, "NEON_WRITE", None
            )
        else:
            hyperdrive = None
        if not database_url and hyperdrive is None:
            raise ValueError("Neon connectivity is enabled but its URL is missing and no Hyperdrive binding is configured")
        return cls(database_url or None, hyperdrive=hyperdrive)

    def check(self) -> None:
        """Verify connection with psycopg and TLS verification outside Workers."""
        try:
            import psycopg
        except ImportError:
            raise RuntimeError("Neon connectivity driver is not installed") from None

        try:
            with psycopg.connect(
                self._database_url,
                **neon_connection_options(self._timeout),
            ) as connection, connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                row = cursor.fetchone()
                if row != (1,):
                    raise RuntimeError("Neon connectivity probe returned an unexpected result")
        except RuntimeError:
            raise
        except Exception:  # noqa: BLE001  # do not leak DSN, server errors, or query context
            raise RuntimeError("Neon connectivity probe failed") from None

    async def check_worker(self) -> None:
        """Verify a read-only Neon connection through Cloudflare Hyperdrive.

        Hyperdrive terminates upstream TLS, so its Worker driver connection uses
        ssl=False. Direct Worker DSNs still use a verifying SSL context.
        """
        try:
            import asyncpg
        except ImportError:
            _LOGGER.error("Neon Worker connectivity driver is not installed")
            raise RuntimeError("Neon connectivity driver is not installed") from None

        timeout = (
            WORKER_CONNECT_TIMEOUT_SECONDS
            if self._hyperdrive is not None
            else self._timeout
        )
        connection = None
        row = None
        query_completed = operation_failed = False
        stage = "connect"
        try:
            connection = await _connect_worker_database(
                asyncpg, self._database_url, self._hyperdrive, timeout
            )
            stage = "query"
            row = await connection.fetchval("SELECT 1")
            query_completed = True
        except Exception as exc:  # noqa: BLE001  # never expose DSN or database details
            operation_failed = True
            _LOGGER.warning(
                "Neon Worker connectivity probe failed at stage=%s (%s)",
                stage,
                type(exc).__name__,
            )
        finally:
            cleanup_failed = await _close_worker_database(connection, timeout)

        if query_completed and row != 1:
            raise RuntimeError("Neon connectivity probe returned an unexpected result")
        if operation_failed or cleanup_failed:
            raise RuntimeError("Neon connectivity probe failed") from None
