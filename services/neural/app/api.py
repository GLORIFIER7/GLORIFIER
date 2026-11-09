import asyncio
import hashlib
import hmac
import ipaddress
import secrets
import uuid
from collections.abc import Mapping

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, Response

from app.audit import AuditEvent, SupabaseRestAuditSink
from app.api_support import (
    _readiness_response,
    _request_correlation_id,
    _request_environment_value,
    _request_worker_binding,
    _security_response_headers,
)
from app.database.neon import NeonConnectivityProbe
from app.database.task_runs import TaskRunRepository
from app.neural.torch_status import pytorch_status
from app.runtime import build_orchestrator_from_environment
from app.request_limits import RequestBodyLimitMiddleware
from app.rate_limit import FixedWindowRateLimiter
from app.schemas import HealthResponse, TaskRequest, TaskResponse

NOT_VERIFIED = "NOT VERIFIED"

app = FastAPI(
    title="GLORIFIER Neural Orchestration",
    version="0.2.0",
    description="Governed, provider-neutral AI orchestration API.",
)
orchestrator = build_orchestrator_from_environment()
MAX_REQUEST_BODY_BYTES = 65_536
TASK_RATE_LIMITER = FixedWindowRateLimiter(max_requests=60, window_seconds=60)
WORKER_DATABASE_LOCK = asyncio.Lock()
WORKER_READINESS_CACHE_TTL_SECONDS = 30.0
WORKER_READINESS_CACHE: dict[tuple[str, ...], tuple[float, str, str, str]] = {}
WORKER_READINESS_CACHE_LOCK = asyncio.Lock()
app.add_middleware(RequestBodyLimitMiddleware, max_body_bytes=MAX_REQUEST_BODY_BYTES)


@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    """Propagate a bounded correlation ID into logs and back to the caller."""
    request_id = str(uuid.uuid4())
    correlation_id = _request_correlation_id(request)
    request.state.request_id = request_id
    request.state.correlation_id = correlation_id
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared_length = int(content_length)
        except ValueError:
            response = JSONResponse(
                status_code=400,
                content={"detail": "Invalid Content-Length header"},
            )
        else:
            if declared_length < 0:
                response = JSONResponse(
                    status_code=400,
                    content={"detail": "Invalid Content-Length header"},
                )
            elif declared_length > MAX_REQUEST_BODY_BYTES:
                response = JSONResponse(
                    status_code=413,
                    content={"detail": "Request body exceeds the 65536-byte limit"},
                )
            else:
                response = await call_next(request)
    else:
        response = await call_next(request)
    response.headers.update(_security_response_headers(request))
    return response


def _request_orchestrator(request: Request):
    """Use the process runtime locally and rebuild from request bindings on Workers."""
    worker_env = request.scope.get("env")
    if worker_env is None:
        return orchestrator
    return build_orchestrator_from_environment(worker_env)


async def _enforce_task_rate_limit(request: Request, api_token: str) -> None:
    """Apply Cloudflare's credential-keyed limit; fail closed on errors.

    Raises:
        HTTPException: 429 when the task limit is exceeded; 503 when the
            Cloudflare rate-limit binding is missing, invalid, or unavailable.
    """
    credential_key = hmac.new(
        api_token.encode(), b"glorifier-rate-limit-v1", hashlib.sha256
    ).hexdigest()
    worker_env = request.scope.get("env")
    if worker_env is None:
        allowed, retry_after = TASK_RATE_LIMITER.allow(credential_key)
    else:
        rate_limit_binding = _request_worker_binding(request, "GLORIFIER_RATE_LIMITER")
        limiter = (
            getattr(rate_limit_binding, "limit", None)
            if rate_limit_binding is not None
            else None
        )
        if not callable(limiter):
            raise HTTPException(
                status_code=503,
                detail="Task rate limiting is unavailable",
            )
        try:
            result = await rate_limit_binding.limit({"key": credential_key})
            success = (
                result.get("success")
                if isinstance(result, Mapping)
                else getattr(result, "success", None)
            )
        except Exception:  # noqa: BLE001 - fail closed without exposing binding details
            raise HTTPException(
                status_code=503,
                detail="Task rate limiting is unavailable",
            ) from None
        if not isinstance(success, bool):
            raise HTTPException(
                status_code=503,
                detail="Task rate limiting is unavailable",
            )
        allowed = success
        retry_after = 60

    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Task rate limit exceeded; retry after the current minute window",
            headers={"Retry-After": str(retry_after)},
        )


async def _write_audit_event(sink, event: AuditEvent, *, worker_request: bool) -> None:
    """Persist audit events through Fetch on Workers and urllib in local deployments."""
    if worker_request:
        await sink.awrite(event)
    else:
        await asyncio.to_thread(sink.write, event)


async def _enforce_readiness_rate_limit(request: Request) -> None:
    """Bound public Worker readiness probes before contacting external services.

    Raises:
        HTTPException: 429 when the readiness limit is exceeded; 503 when
            the Cloudflare rate-limit binding or client identity is unavailable.
    """
    if request.scope.get("env") is None:
        return
    binding = _request_worker_binding(request, "GLORIFIER_READINESS_LIMITER")
    limiter = getattr(binding, "limit", None) if binding is not None else None
    if not callable(limiter):
        raise HTTPException(
            status_code=503,
            detail="Required Cloudflare readiness rate-limit binding is missing or invalid",
        )
    raw_client_ip = request.headers.get("cf-connecting-ip", "").strip()
    try:
        client_ip = str(ipaddress.ip_address(raw_client_ip))
    except ValueError:
        raise HTTPException(status_code=503, detail="Readiness client identity is unavailable") from None
    try:
        result = await binding.limit({"key": f"ready:{client_ip}"})
    except Exception:  # noqa: BLE001 - fail closed without exposing binding details
        raise HTTPException(
            status_code=503,
            detail="Cloudflare readiness rate limiting is temporarily unavailable",
        ) from None
    try:
        success = result.get("success") if isinstance(result, Mapping) else getattr(result, "success", None)
    except Exception:  # noqa: BLE001 - do not trust a malformed binding result
        raise HTTPException(
            status_code=503,
            detail="Cloudflare readiness rate limiting returned an invalid result",
        ) from None
    if not isinstance(success, bool):
        raise HTTPException(
            status_code=503,
            detail="Cloudflare readiness rate-limit binding returned an invalid result",
        )
    if not success:
        raise HTTPException(
            status_code=429,
            detail="Readiness probe rate limit exceeded; retry after the current minute window",
            headers={"Retry-After": "60"},
        )


def _worker_readiness_cache_key(request: Request) -> tuple[str, ...]:
    """Key cached probes by non-secret configuration, never by credential contents."""
    names = (
        "GLORIFIER_ENABLE_INFERENCE",
        "GLORIFIER_PROVIDER",
        "NVIDIA_NIM_MODEL",
        "NVIDIA_DYNAMO_MODEL",
        "NVIDIA_DYNAMO_BASE_URL",
        "NVIDIA_DYNAMO_ALLOWED_ORIGIN",
        "OPENAI_MODEL",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS",
        "GLORIFIER_NEON_CONNECTIVITY_ENABLED",
    )
    values = tuple(_request_environment_value(request, name) or "" for name in names)
    return (
        *values,
        "nvidia-key-present" if _request_environment_value(request, "NVIDIA_NIM_API_KEY") else "nvidia-key-absent",
        "dynamo-key-present" if _request_environment_value(request, "NVIDIA_DYNAMO_API_KEY") else "dynamo-key-absent",
        "openai-key-present" if _request_environment_value(request, "OPENAI_API_KEY") else "openai-key-absent",
        "neon-readonly-bound" if _request_worker_binding(request, "NEON_READONLY") is not None else "neon-readonly-unbound",
    )


async def _cached_worker_readiness(request: Request, worker_env) -> tuple[str, str, str]:
    """Coalesce public upstream/database probes and cache results briefly."""
    cache_key = _worker_readiness_cache_key(request)
    loop = asyncio.get_running_loop()
    async with WORKER_READINESS_CACHE_LOCK:
        cached = WORKER_READINESS_CACHE.get(cache_key)
        if cached is not None and loop.time() - cached[0] < WORKER_READINESS_CACHE_TTL_SECONDS:
            return cached[1], cached[2], cached[3]
        try:
            provider_status, provider_message = await _request_orchestrator(request).acheck_readiness()
        except Exception as exc:  # noqa: BLE001 - readiness never exposes provider secrets
            provider_status = "DEGRADED"
            provider_message = f"Provider readiness probe failed ({type(exc).__name__})."
        database_status = "NOT CONFIGURED (OPTIONAL)"
        try:
            probe = NeonConnectivityProbe.from_environment(worker_env)
            if probe is not None:
                # Async Hyperdrive sockets are non-blocking; keep this read-only
                # readiness probe independent from the task-run writer lock.
                await probe.check_worker()
                database_status = "VERIFIED"
        except Exception:  # noqa: BLE001 - do not leak connection details
            database_status = "DEGRADED"
        WORKER_READINESS_CACHE[cache_key] = (
            loop.time(), provider_status, provider_message, database_status
        )
        return provider_status, provider_message, database_status


@app.exception_handler(Exception)
async def unhandled_exception_response(request: Request, _exc: Exception) -> JSONResponse:
    """Keep unhandled 500 responses generic while retaining request tracing headers."""
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
        headers=_security_response_headers(request),
    )


@app.get("/health", response_model=HealthResponse, tags=["operations"])
def health() -> HealthResponse:
    """Report process health separately from unverified provider and database health."""
    pytorch_installed = pytorch_status()["installed"]
    return HealthResponse(
        status="PARTIALLY VERIFIED",
        service="glorifier-neural",
        checks={
            "process": "VERIFIED",
            "providers": NOT_VERIFIED,
            "database": NOT_VERIFIED,
            "pytorch": "VERIFIED" if pytorch_installed else NOT_VERIFIED,
        },
    )


async def _worker_readiness_gate(request: Request):
    """Require API authentication configuration and both Cloudflare limiters."""
    authentication = (
        "VERIFIED"
        if _request_environment_value(request, "GLORIFIER_API_TOKEN")
        else "DEGRADED"
    )
    task_binding = _request_worker_binding(request, "GLORIFIER_RATE_LIMITER")
    readiness_binding = _request_worker_binding(request, "GLORIFIER_READINESS_LIMITER")
    task_limiter = task_binding is not None and callable(getattr(task_binding, "limit", None))
    readiness_limiter = (
        readiness_binding is not None
        and callable(getattr(readiness_binding, "limit", None))
    )
    try:
        await _enforce_readiness_rate_limit(request)
    except HTTPException as exc:
        rate_limit = (
            "VERIFIED"
            if exc.status_code == 429 and task_limiter
            else "DEGRADED"
        )
        response = _readiness_response(
            providers="NOT CHECKED",
            database="NOT CHECKED",
            authentication=authentication,
            rate_limit=rate_limit,
            audit="NOT CHECKED",
            task_runs="NOT CHECKED",
            message=exc.detail,
            status_code=exc.status_code,
        )
        if exc.headers:
            response.headers.update(exc.headers)
        return authentication, rate_limit, response
    rate_limit = (
        "VERIFIED" if task_limiter and readiness_limiter else "DEGRADED"
    )
    return authentication, rate_limit, None


def _optional_readiness_persistence(worker_env, worker_request: bool) -> tuple[str, str]:
    """Report optional persistence configuration without claiming its writes work."""
    audit = "NOT CONFIGURED (OPTIONAL)"
    task_runs = "NOT CONFIGURED (OPTIONAL)"
    try:
        sink = (
            SupabaseRestAuditSink.from_environment(worker_env)
            if worker_request
            else SupabaseRestAuditSink.from_environment()
        )
        if sink is not None:
            audit = "CONFIGURED (WRITE NOT VERIFIED)"
    except Exception:  # noqa: BLE001 - never expose persistence configuration
        audit = "DEGRADED"
    try:
        repository = (
            TaskRunRepository.from_environment(worker_env)
            if worker_request
            else TaskRunRepository.from_environment()
        )
        if repository is not None:
            task_runs = "CONFIGURED (WRITE NOT VERIFIED)"
    except Exception:  # noqa: BLE001 - never expose persistence configuration
        task_runs = "DEGRADED"
    return audit, task_runs


async def _local_readiness_checks() -> tuple[str, str, str]:
    """Run local provider readiness and optional local Neon connectivity."""
    providers, message = await asyncio.to_thread(orchestrator.check_readiness)
    database = "NOT CONFIGURED (OPTIONAL)"
    try:
        probe = NeonConnectivityProbe.from_environment()
        if probe is not None:
            await asyncio.to_thread(probe.check)
            database = "VERIFIED"
    except Exception:  # noqa: BLE001 - readiness must not leak connection details
        database = "DEGRADED"
    return providers, message, database


@app.get("/ready", tags=["operations"])
async def readiness(request: Request) -> JSONResponse:
    """Report cached, rate-limited provider and optional database readiness."""
    worker_env = request.scope.get("env")
    worker_request = worker_env is not None
    authentication = "NOT REQUIRED (LOCAL)"
    rate_limit = "NOT REQUIRED (LOCAL)"
    if worker_request:
        authentication, rate_limit, blocked = await _worker_readiness_gate(request)
        if blocked is not None:
            return blocked
        providers, message, database = await _cached_worker_readiness(
            request, worker_env
        )
    else:
        providers, message, database = await _local_readiness_checks()
    audit, task_runs = _optional_readiness_persistence(worker_env, worker_request)
    degraded_checks = [
        name
        for name, status in (
            ("provider", providers),
            ("database", database),
            ("authentication", authentication),
            ("rate limiting", rate_limit),
            ("audit persistence", audit),
            ("task-run persistence", task_runs),
        )
        if status == "DEGRADED"
    ]
    if providers == "VERIFIED" and database == "DEGRADED":
        message = (
            "The explicitly enabled database connectivity probe failed; "
            "provider availability is verified."
        )
        other_degraded_checks = [
            name for name in degraded_checks if name != "database"
        ]
        if other_degraded_checks:
            message += (
                " Readiness is also blocked because these checks are degraded: "
                f"{', '.join(other_degraded_checks)}."
            )
    elif degraded_checks:
        message = (
            f"{message} Readiness is blocked because these checks are degraded: "
            f"{', '.join(degraded_checks)}."
        )
    elif providers == "VERIFIED":
        message = (
            "Provider and required Worker controls passed read-only/configuration checks; "
            "no inference was performed and optional persistence writes were not tested."
        )
    return _readiness_response(
        providers=providers,
        database=database,
        authentication=authentication,
        rate_limit=rate_limit,
        audit=audit,
        task_runs=task_runs,
        message=message,
    )


def _load_task_persistence(worker_env, worker_request: bool):
    """Resolve opt-in audit and metadata repositories for this execution.

    Raises:
        HTTPException: 503 when configured persistence cannot be initialized.
    """
    try:
        audit_sink = (
            SupabaseRestAuditSink.from_environment(worker_env)
            if worker_request
            else SupabaseRestAuditSink.from_environment()
        )
        repository = (
            TaskRunRepository.from_environment(worker_env)
            if worker_request
            else TaskRunRepository.from_environment()
        )
    except ValueError:
        raise HTTPException(
            status_code=503, detail="Configured persistence is unavailable"
        ) from None
    return audit_sink, repository


async def _write_initial_task_audit(
    audit_sink,
    request_id: str,
    correlation_id: str,
    task_request: TaskRequest,
    worker_request: bool,
) -> None:
    """Fail closed before processing when the required initial audit write fails.

    Raises:
        HTTPException: 503 when required initial audit persistence fails.
    """
    if audit_sink is None:
        return
    try:
        await _write_audit_event(
            audit_sink,
            AuditEvent(
                request_id=request_id,
                correlation_id=correlation_id,
                event_type="task_received",
                status=NOT_VERIFIED,
                action_class=task_request.action_class,
                evidence=("execution:not-started",),
            ),
            worker_request=worker_request,
        )
    except Exception:  # noqa: BLE001 - do not start tasks without their required initial audit
        raise HTTPException(
            status_code=503, detail="Audit persistence unavailable; task not executed"
        ) from None


async def _execute_governed_task(
    request: Request, task_request: TaskRequest, worker_request: bool
) -> TaskResponse:
    """Execute through the request-scoped Worker runtime or the local process runtime."""
    if worker_request:
        return await _request_orchestrator(request).arun(task_request)
    return await asyncio.to_thread(orchestrator.run, task_request)


def _mark_persistence_degraded(
    result: TaskResponse, evidence_code: str, description: str
) -> None:
    """Preserve completed output while making post-execution persistence failure visible."""
    if result.status == "VERIFIED":
        result.status = "PARTIALLY VERIFIED"
    result.evidence = [*result.evidence[:19], evidence_code]
    result.message = (
        f"{result.message} {description} degraded after processing; "
        "the task outcome is returned to avoid an unsafe automatic retry."
    )


async def _persist_task_run(
    repository,
    result: TaskResponse,
    request_id: str,
    task_request: TaskRequest,
    request: Request,
    worker_request: bool,
) -> TaskResponse:
    """Persist optional task lifecycle metadata without converting completed work to 503."""
    if repository is None:
        return result
    try:
        if worker_request:
            async with WORKER_DATABASE_LOCK:
                repository.record_worker(
                    request_id=request_id,
                    action_class=task_request.action_class,
                    status=result.status,
                    provider=result.provider,
                    evidence=result.evidence[:20],
                    hyperdrive=_request_worker_binding(request, "NEON_WRITE"),
                )
        else:
            await asyncio.to_thread(
                repository.record,
                request_id=request_id,
                action_class=task_request.action_class,
                status=result.status,
                provider=result.provider,
                evidence=result.evidence[:20],
            )
    except Exception:  # noqa: BLE001 - task has already completed; do not invite retries
        _mark_persistence_degraded(
            result, "persistence:task_runs:degraded", "Task-run persistence"
        )
    return result


async def _persist_final_audit(
    audit_sink: SupabaseRestAuditSink | None,
    result: TaskResponse,
    request_id: str,
    correlation_id: str,
    task_request: TaskRequest,
    worker_request: bool,
) -> TaskResponse:
    """Persist the final bounded audit event and retain completed results on failure."""
    if audit_sink is None:
        return result
    try:
        await _write_audit_event(
            audit_sink,
            AuditEvent(
                request_id=request_id,
                correlation_id=correlation_id,
                event_type=_audit_event_type(result),
                status=result.status,
                action_class=task_request.action_class,
                provider=result.provider,
                evidence=tuple(result.evidence[:20]),
            ),
            worker_request=worker_request,
        )
    except Exception:  # noqa: BLE001 - task has already completed; do not invite retries
        _mark_persistence_degraded(
            result, "persistence:audit:degraded", "Final audit persistence"
        )
    return result


async def _process_authenticated_task(
    task_request: TaskRequest,
    request: Request,
    authorization: str | None,
    *,
    persist: bool,
) -> TaskResponse:
    """Authenticate and process one task; persistence is explicit at each entrypoint."""
    api_token = _request_environment_value(request, "GLORIFIER_API_TOKEN")
    if not api_token:
        raise HTTPException(
            status_code=503,
            detail="API token is not configured; execution endpoint is disabled",
        )

    # The dedicated internal credential is additive: existing API clients keep
    # using GLORIFIER_API_TOKEN, while GLORIFIER's Worker authenticates with its
    # separately managed service token. Byte comparison rejects malformed
    # non-ASCII header values without raising TypeError.
    internal_service_token = _request_environment_value(
        request, "GLORIFIER_INTERNAL_SERVICE_TOKEN"
    )
    supplied_authorization = (authorization or "").encode()
    authenticated_token = None
    for candidate in (api_token, internal_service_token):
        if candidate and hmac.compare_digest(
            supplied_authorization, f"Bearer {candidate}".encode()
        ):
            authenticated_token = candidate
            break
    if authenticated_token is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    worker_env = request.scope.get("env")
    worker_request = worker_env is not None
    await _enforce_task_rate_limit(request, authenticated_token)
    request_id = request.state.request_id
    correlation_id = request.state.correlation_id

    audit_sink = repository = None
    if persist:
        audit_sink, repository = _load_task_persistence(worker_env, worker_request)
        await _write_initial_task_audit(
            audit_sink, request_id, correlation_id, task_request, worker_request
        )

    result = await _execute_governed_task(request, task_request, worker_request)
    if persist:
        result = await _persist_task_run(
            repository, result, request_id, task_request, request, worker_request
        )
        result = await _persist_final_audit(
            audit_sink, result, request_id, correlation_id, task_request, worker_request
        )
    return result


@app.post("/v1/tasks", response_model=TaskResponse, tags=["orchestration"])
async def run_task(
    task_request: TaskRequest,
    request: Request,
    authorization: str | None = Header(default=None),
) -> TaskResponse:
    """Process a governed task only after authentication, rate and audit checks."""
    return await _process_authenticated_task(
        task_request, request, authorization, persist=True
    )


@app.post("/__internal/verify-task", include_in_schema=False)
async def verify_internal_task(request: Request) -> JSONResponse:
    """Verify the Worker-held task credential through one fixed, no-inference task."""
    if request.scope.get("env") is None:
        raise HTTPException(status_code=404, detail="Not Found")

    expected_client_id = _request_environment_value(
        request, "GLORIFIER_INTERNAL_SERVICE_CLIENT_ID"
    )
    expected_client_secret = _request_environment_value(
        request, "GLORIFIER_INTERNAL_SERVICE_CLIENT_SECRET"
    )
    provided_client_id = request.headers.get("cf-access-client-id", "")
    provided_client_secret = request.headers.get("cf-access-client-secret", "")
    if not expected_client_id or not expected_client_secret:
        raise HTTPException(
            status_code=503, detail="Internal service verification is not configured"
        )
    if (
        not secrets.compare_digest(
            provided_client_id.encode("utf-8"), expected_client_id.encode("utf-8")
        )
        or not secrets.compare_digest(
            provided_client_secret.encode("utf-8"), expected_client_secret.encode("utf-8")
        )
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")

    if await request.body():
        raise HTTPException(status_code=400, detail="Request body is not accepted")

    api_token = _request_environment_value(request, "GLORIFIER_API_TOKEN")
    if not api_token:
        raise HTTPException(
            status_code=503, detail="Task authentication is not configured"
        )

    task_id = request.state.request_id
    correlation_id = request.state.correlation_id
    probe = TaskRequest(
        task="GLORIFIER-NEURAL authenticated task-path verification",
        purpose="connectivity_verification",
        require_approval=True,
        action_class="read_only",
    )
    result = await _process_authenticated_task(
        probe, request, f"Bearer {api_token}", persist=False
    )
    return JSONResponse(
        status_code=200,
        content={
            "task_id": task_id,
            "request_id": task_id,
            "correlation_id": correlation_id,
            "authentication": {
                "service_identity": "VERIFIED",
                "neural_task_token": "VERIFIED",
            },
            "response": result.model_dump(),
            "execution_evidence": [
                "auth:service-identity-verified",
                "auth:task-secret-verified",
                "policy:approval-required",
                "inference:not-performed",
                "persistence:not-written",
            ],
        },
    )


def _audit_event_type(result: TaskResponse) -> str:
    """Map bounded orchestration evidence to a sanitized audit event category."""
    if "policy:deny" in result.evidence:
        return "policy_denied"
    if "policy:approval-required" in result.evidence:
        return "approval_required"
    if "execution:failed" in result.evidence:
        return "inference_failed"
    if "execution:inference" in result.evidence:
        return "inference_completed"
    return "task_not_executed"
