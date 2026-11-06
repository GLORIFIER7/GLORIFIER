"""Shared HTTP request and readiness response utilities."""
from __future__ import annotations

import os
import re
import uuid
from collections.abc import Mapping

from fastapi import Request
from fastapi.responses import JSONResponse

_CORRELATION_ID_PATTERN = re.compile(
    r"^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"
)


def _request_correlation_id(request: Request) -> str:
    """Preserve only a canonical UUID-shaped correlation value; otherwise generate one."""
    candidate = request.headers.get("x-correlation-id", "").strip()
    if _CORRELATION_ID_PATTERN.fullmatch(candidate):
        return candidate
    return str(uuid.uuid4())

def _request_environment_value(request: Request, name: str) -> str | None:
    """Read a Cloudflare Worker binding or, outside Workers, the local process env.

    A present Worker environment is authoritative: a missing binding must fail
    closed rather than fall back to an unrelated process-level credential.
    Avoid copying request-scoped bindings into os.environ because that global
    mutation is unsafe across concurrent requests.
    """
    worker_env = request.scope.get("env")
    if worker_env is not None:
        if isinstance(worker_env, Mapping):
            value = worker_env.get(name)
        else:
            value = getattr(worker_env, name, None)
        return str(value) if value is not None else None
    return os.getenv(name)


def _request_worker_binding(request: Request, name: str):
    """Return the raw request-scoped Worker binding without string coercion."""
    worker_env = request.scope.get("env")
    if worker_env is None:
        return None
    if isinstance(worker_env, Mapping):
        return worker_env.get(name)
    return getattr(worker_env, name, None)

def _security_response_headers(request: Request) -> dict[str, str]:
    """Build the bounded tracing and security headers for every response path."""
    request_id = getattr(request.state, "request_id", None)
    if not request_id:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

    correlation_id = getattr(request.state, "correlation_id", None)
    if not correlation_id:
        correlation_id = _request_correlation_id(request)
        request.state.correlation_id = correlation_id

    return {
        "X-Request-ID": request_id,
        "X-Correlation-ID": correlation_id,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
    }

def _readiness_body(
    providers: str,
    database: str,
    authentication: str,
    rate_limit: str,
    audit: str,
    task_runs: str,
    ready: bool,
    message: str,
) -> dict:
    """Build one sanitized readiness document for every runtime path."""
    return {
        "status": "READY" if ready else "NOT READY",
        "checks": {
            "providers": providers,
            "database": database,
            "authentication": authentication,
            "rate_limit": rate_limit,
            "audit": audit,
            "task_runs": task_runs,
        },
        "requirements": {
            "authentication": "required for Worker task execution",
            "rate_limit": "required for Worker task execution and readiness probes",
            "database": "optional unless connectivity or task-run persistence is enabled",
            "audit": "optional unless explicitly enabled",
            "task_runs": "optional unless explicitly enabled",
        },
        "execution": {"inference_performed": False},
        "message": message,
    }


def _readiness_response(
    *,
    providers: str,
    database: str,
    authentication: str,
    rate_limit: str,
    audit: str,
    task_runs: str,
    message: str,
    status_code: int | None = None,
) -> JSONResponse:
    """Return a readiness status without upgrading optional configuration to proof."""
    ready = (
        providers == "VERIFIED"
        and database != "DEGRADED"
        and authentication != "DEGRADED"
        and rate_limit != "DEGRADED"
        and audit != "DEGRADED"
        and task_runs != "DEGRADED"
    )
    response_status = status_code or (200 if ready else 503)
    return JSONResponse(
        status_code=response_status,
        content=_readiness_body(
            providers, database, authentication, rate_limit,
            audit, task_runs, ready and status_code is None, message,
        ),
    )
