"""Shared synchronous PostgreSQL helpers for Cloudflare Python Workers."""
from __future__ import annotations

import ssl
from urllib.parse import urlparse


def connect_worker_database(pg8000, database_url: str, hyperdrive, timeout: float):
    """Open a pg8000 connection via Hyperdrive or a dedicated Worker DSN."""
    if hyperdrive is not None:
        return pg8000.connect(
            user=str(hyperdrive.user),
            password=str(hyperdrive.password),
            host=str(hyperdrive.host),
            port=int(hyperdrive.port),
            database=str(hyperdrive.database),
            ssl_context=False,
            timeout=timeout,
        )
    parsed = urlparse(database_url)
    return pg8000.connect(
        user=parsed.username,
        password=parsed.password,
        host=parsed.hostname,
        port=parsed.port or 5432,
        database=parsed.path.lstrip("/"),
        ssl_context=ssl.create_default_context(),
        timeout=timeout,
    )


def close_worker_database(cursor, connection) -> bool:
    """Close both Worker database handles and report cleanup failures."""
    failed = False
    if cursor is not None:
        try:
            cursor.close()
        except Exception:  # noqa: BLE001 - preserve the primary database result
            failed = True
    if connection is not None:
        try:
            connection.close()
        except Exception:  # noqa: BLE001 - preserve the primary database result
            failed = True
    return failed
