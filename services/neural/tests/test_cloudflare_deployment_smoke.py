"""Tests for fail-closed Cloudflare deployment preflight and smoke checks."""

import importlib.util
from pathlib import Path

import pytest

_smoke_path = Path(__file__).resolve().parents[1] / "cloudflare" / "deployment_smoke.py"
_smoke_spec = importlib.util.spec_from_file_location("deployment_smoke", _smoke_path)
if _smoke_spec is None or _smoke_spec.loader is None:
    raise ImportError("Unable to load Cloudflare deployment smoke helper.")
_smoke_module = importlib.util.module_from_spec(_smoke_spec)
_smoke_spec.loader.exec_module(_smoke_module)

classify_readiness = _smoke_module.classify_readiness
require_worker_api_token_secret = _smoke_module.require_worker_api_token_secret
validate_health = _smoke_module.validate_health
run_smoke = _smoke_module.main


def test_deployment_smoke_accepts_fully_ready_worker():
    payload = {
        "status": "READY",
        "checks": {
            "providers": "VERIFIED",
            "database": "VERIFIED",
            "authentication": "VERIFIED",
            "rate_limit": "VERIFIED",
            "audit": "NOT CONFIGURED (OPTIONAL)",
            "task_runs": "NOT CONFIGURED (OPTIONAL)",
        },
        "execution": {"inference_performed": False},
    }

    assert classify_readiness(200, payload) == "READY"


def test_deployment_smoke_accepts_explicit_safe_mode_without_claiming_readiness():
    payload = {
        "status": "NOT READY",
        "checks": {
            "providers": "NOT VERIFIED",
            "database": "VERIFIED",
            "authentication": "VERIFIED",
            "rate_limit": "VERIFIED",
            "audit": "NOT CONFIGURED (OPTIONAL)",
            "task_runs": "NOT CONFIGURED (OPTIONAL)",
        },
        "execution": {"inference_performed": False},
        "message": "Provider readiness checks are disabled by configuration.",
    }

    assert classify_readiness(503, payload) == "SAFE_MODE_PROVIDER_READINESS_DISABLED"


@pytest.mark.parametrize(
    ("status_code", "payload"),
    [
        (
            503,
            {
                "status": "NOT READY",
                "checks": {
                    "providers": "NOT VERIFIED",
                    "database": "VERIFIED",
                    "authentication": "DEGRADED",
                    "rate_limit": "VERIFIED",
                    "audit": "NOT CONFIGURED (OPTIONAL)",
                    "task_runs": "NOT CONFIGURED (OPTIONAL)",
                },
                "execution": {"inference_performed": False},
                "message": "Provider inference is disabled by configuration.",
            },
        ),
        (
            503,
            {
                "status": "NOT READY",
                "checks": {
                    "providers": "DEGRADED",
                    "database": "VERIFIED",
                    "authentication": "VERIFIED",
                    "rate_limit": "VERIFIED",
                    "audit": "NOT CONFIGURED (OPTIONAL)",
                    "task_runs": "NOT CONFIGURED (OPTIONAL)",
                },
                "execution": {"inference_performed": False},
                "message": "Provider readiness probe failed (RuntimeError).",
            },
        ),
        (
            503,
            {
                "status": "NOT READY",
                "checks": {
                    "providers": "NOT VERIFIED",
                    "database": "DEGRADED",
                    "authentication": "VERIFIED",
                    "rate_limit": "VERIFIED",
                    "audit": "NOT CONFIGURED (OPTIONAL)",
                    "task_runs": "NOT CONFIGURED (OPTIONAL)",
                },
                "execution": {"inference_performed": False},
                "message": "Provider inference is disabled by configuration.",
            },
        ),
    ],
)
def test_deployment_smoke_rejects_degraded_controls(status_code, payload):
    with pytest.raises(ValueError):
        classify_readiness(status_code, payload)


def test_deployment_smoke_rejects_unexpected_readiness_status():
    with pytest.raises(ValueError):
        classify_readiness(
            401,
            {
                "status": "NOT READY",
                "checks": {},
                "execution": {"inference_performed": False},
                "message": "Unauthorized",
            },
        )


def test_deployment_smoke_requires_worker_api_token_secret():
    require_worker_api_token_secret(["GLORIFIER_API_TOKEN"])

    with pytest.raises(ValueError, match="GLORIFIER_API_TOKEN"):
        require_worker_api_token_secret([])


def test_deployment_smoke_validates_health_endpoint_without_overclaiming_dependencies():
    validate_health(
        {
            "service": "glorifier-neural",
            "checks": {
                "process": "VERIFIED",
                "providers": "NOT VERIFIED",
                "database": "NOT VERIFIED",
            },
        }
    )

    with pytest.raises(ValueError):
        validate_health(
            {
                "service": "glorifier-neural",
                "checks": {"process": "DEGRADED"},
            }
        )



def test_smoke_main_reports_non_object_endpoint_payload_without_traceback(
    monkeypatch, tmp_path, capsys
):
    import sys

    health_file = tmp_path / "health.json"
    readiness_file = tmp_path / "ready.json"
    health_file.write_text("[]", encoding="utf-8")
    readiness_file.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "deployment_smoke.py",
            "--health-file",
            str(health_file),
            "--readiness-file",
            str(readiness_file),
            "--readiness-status",
            "503",
        ],
    )

    assert run_smoke() == 1
    output = capsys.readouterr().out
    assert output.startswith("::error::")
    assert "JSON objects" in output
    assert "Traceback" not in output


def test_deployment_smoke_accepts_current_provider_readiness_disabled_safe_mode():
    payload = {
        "status": "NOT READY",
        "checks": {
            "providers": "NOT VERIFIED",
            "database": "VERIFIED",
            "authentication": "VERIFIED",
            "rate_limit": "VERIFIED",
            "audit": "NOT CONFIGURED (OPTIONAL)",
            "task_runs": "NOT CONFIGURED (OPTIONAL)",
        },
        "execution": {"inference_performed": False},
        "message": "Provider readiness checks are disabled by configuration.",
    }

    assert classify_readiness(503, payload) == "SAFE_MODE_PROVIDER_READINESS_DISABLED"
