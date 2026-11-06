"""Opt-in, metadata-only Neon task-run persistence.

This repository is wired into execution only when explicitly enabled. It is disabled
unless explicitly enabled, validates every persisted field, and never accepts task
prompts, outputs, request bodies, credentials, or arbitrary evidence payloads.
"""
from __future__ import annotations

import json
import os
import re
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from uuid import UUID

from app.database.neon import WORKER_CONNECT_TIMEOUT_SECONDS, neon_connection_options
from app.database.worker_connection import close_worker_database, connect_worker_database


RETENTION_DAYS = 30  # Proposed default; production collection still requires approval.


def _insert_worker_task_run(cursor, values) -> None:
    cursor.execute(
        """INSERT INTO glorifier.task_runs
           (request_id, action_class, status, provider, evidence, created_at, expires_at)
           VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s)""",
        (
            values[0], values[1], values[2], values[3],
            json.dumps(values[4]), values[5], values[6],
        ),
    )


def _worker_task_run_matches(cursor, request_id: str) -> bool:
    cursor.execute(
        "SELECT request_id FROM glorifier.task_runs WHERE request_id = %s",
        (request_id,),
    )
    row = cursor.fetchone()
    return row is not None and str(row[0]) == request_id


_ALLOWED_STATUSES = {
    "FULLY VERIFIED",
    "VERIFIED",
    "PARTIALLY VERIFIED",
    "NOT VERIFIED",
    "DEGRADED",
    "NOT OBSERVABLE",
}
_SAFE_CODE = re.compile(r"^[a-z][a-z0-9_.:-]{0,79}$")


class TaskRunRepository:
    """Store bounded task lifecycle metadata using parameterized SQL only."""

    def __init__(
        self,
        database_url: str | None,
        *,
        hyperdrive=None,
        connect_timeout: int = 3,
    ) -> None:
        neon_connection_options(connect_timeout)
        if (not database_url or not database_url.strip()) and hyperdrive is None:
            raise ValueError("database URL or Hyperdrive binding is required")
        self._database_url = database_url.strip() if database_url else None
        self._hyperdrive = hyperdrive
        self._connect_timeout = connect_timeout

    @classmethod
    def from_environment(cls, environment=None) -> TaskRunRepository | None:
        """Return a repository only after explicit opt-in and valid configuration."""
        def value(name: str) -> str:
            if environment is None:
                return os.getenv(name, "")
            if isinstance(environment, Mapping):
                raw = environment.get(name, "")
            else:
                raw = getattr(environment, name, "")
            return str(raw) if raw is not None else ""

        enabled = value("GLORIFIER_NEON_TASK_RUNS_ENABLED").strip().casefold() == "true"
        if not enabled:
            return None
        url = value("NEON_DATABASE_URL").strip()
        if isinstance(environment, Mapping):
            hyperdrive = environment.get("NEON_WRITE")
        else:
            hyperdrive = getattr(environment, "NEON_WRITE", None) if environment is not None else None
        if not url and hyperdrive is None:
            raise ValueError("Neon task-run persistence is enabled but its URL is missing and no writable Hyperdrive binding is configured")
        return cls(url or None, hyperdrive=hyperdrive)

    @staticmethod
    def validate_record(
        *, request_id: str, action_class: str, status: str,
        provider: str | None = None, evidence: list[str] | None = None,
        now: datetime | None = None,
    ) -> tuple[str, str, str, str | None, list[str], datetime, datetime]:
        """Validate metadata and calculate the proposed retention deadline."""
        try:
            normalized_request_id = str(UUID(request_id))
        except (ValueError, TypeError, AttributeError):
            raise ValueError("request_id must be a UUID") from None

        if not isinstance(action_class, str) or not _SAFE_CODE.fullmatch(action_class):
            raise ValueError("action_class must be a bounded lowercase code")
        if status not in _ALLOWED_STATUSES:
            raise ValueError("status is not an allowed lifecycle status")
        if provider is not None and (
            not isinstance(provider, str) or not _SAFE_CODE.fullmatch(provider)
        ):
            raise ValueError("provider must be a bounded lowercase code")

        if evidence is None:
            evidence = []
        if not isinstance(evidence, list) or len(evidence) > 20:
            raise ValueError("evidence must contain at most 20 evidence codes")
        if any(not isinstance(item, str) or not _SAFE_CODE.fullmatch(item) for item in evidence):
            raise ValueError("evidence may contain only bounded lowercase evidence codes")

        created_at = now or datetime.now(UTC)
        if created_at.tzinfo is None or created_at.utcoffset() is None:
            raise ValueError("now must be timezone-aware")
        created_at = created_at.astimezone(UTC)
        expires_at = created_at + timedelta(days=RETENTION_DAYS)
        return (
            normalized_request_id, action_class, status, provider,
            list(evidence), created_at, expires_at,
        )

    def record(
        self, *, request_id: str, action_class: str, status: str,
        provider: str | None = None, evidence: list[str] | None = None,
    ) -> None:
        """Persist only validated metadata; errors never expose connection details."""
        values = self.validate_record(
            request_id=request_id,
            action_class=action_class,
            status=status,
            provider=provider,
            evidence=evidence,
        )
        try:
            import psycopg
        except ImportError:
            raise RuntimeError("Neon task-run driver is not installed") from None

        try:
            with psycopg.connect(
                self._database_url,
                **neon_connection_options(self._connect_timeout),
            ) as connection, connection.cursor() as cursor:
                cursor.execute(
                    """INSERT INTO glorifier.task_runs
                       (request_id, action_class, status, provider, evidence, created_at, expires_at)
                       VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s)""",
                    (
                        values[0], values[1], values[2], values[3],
                        json.dumps(values[4]), values[5], values[6],
                    ),
                )
        except Exception:  # noqa: BLE001 - never leak DSN or database details
            raise RuntimeError("Neon task-run persistence failed") from None


    def record_worker(
        self,
        *,
        request_id: str,
        action_class: str,
        status: str,
        provider: str | None = None,
        evidence: list[str] | None = None,
        hyperdrive=None,
    ) -> None:
        """Persist and read back bounded lifecycle metadata on Cloudflare Workers."""
        values = self.validate_record(
            request_id=request_id,
            action_class=action_class,
            status=status,
            provider=provider,
            evidence=evidence,
        )
        try:
            import pg8000
        except ImportError:
            raise RuntimeError("Neon task-run driver is not installed") from None

        connection = cursor = None
        operation_failed = cleanup_failed = readback_mismatch = False
        try:
            active_hyperdrive = (
                hyperdrive if hyperdrive is not None else self._hyperdrive
            )
            timeout = (
                WORKER_CONNECT_TIMEOUT_SECONDS
                if active_hyperdrive is not None
                else self._connect_timeout
            )
            connection = connect_worker_database(
                pg8000,
                self._database_url,
                active_hyperdrive,
                timeout,
            )
            cursor = connection.cursor()
            _insert_worker_task_run(cursor, values)
            connection.commit()
            readback_mismatch = not _worker_task_run_matches(cursor, values[0])
        except Exception:  # noqa: BLE001 - never leak DSN or database details
            operation_failed = True
        finally:
            cleanup_failed = close_worker_database(cursor, connection)

        if readback_mismatch:
            raise RuntimeError("Task-run readback did not match the inserted record")
        if operation_failed or cleanup_failed:
            raise RuntimeError("Neon task-run persistence failed") from None

    def delete_expired(self, *, batch_size: int = 500, now: datetime | None = None) -> int:
        """Delete only expired task-run metadata in a bounded, explicit cleanup batch.

        This method is never scheduled or invoked automatically. Operators must call
        it deliberately after approving retention and verifying the target database.
        """
        if isinstance(batch_size, bool) or not isinstance(batch_size, int) or not 1 <= batch_size <= 1000:
            raise ValueError("batch_size must be an integer between 1 and 1000")
        cutoff = now or datetime.now(UTC)
        if cutoff.tzinfo is None or cutoff.utcoffset() is None:
            raise ValueError("now must be timezone-aware")
        cutoff = cutoff.astimezone(UTC)

        try:
            import psycopg
        except ImportError:
            raise RuntimeError("Neon task-run driver is not installed") from None

        try:
            with psycopg.connect(
                self._database_url,
                **neon_connection_options(self._connect_timeout),
            ) as connection, connection.cursor() as cursor:
                cursor.execute(
                    """WITH expired AS (
                           SELECT id
                           FROM glorifier.task_runs
                           WHERE expires_at <= %s
                           ORDER BY expires_at ASC
                           LIMIT %s
                           FOR UPDATE SKIP LOCKED
                       )
                       DELETE FROM glorifier.task_runs AS task_run
                       USING expired
                       WHERE task_run.id = expired.id
                       RETURNING task_run.id""",
                    (cutoff, batch_size),
                )
                return len(cursor.fetchall())
        except Exception:  # noqa: BLE001 - never leak DSN or database details
            raise RuntimeError("Neon task-run cleanup failed") from None
