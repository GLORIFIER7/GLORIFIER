"""Regression tests for the Neural Cloudflare deployment workflow."""

import json
from pathlib import Path
import re

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_PATH = REPOSITORY_ROOT / ".github" / "workflows" / "neural-cloudflare-worker.yml"


def test_cloudflare_production_deployment_is_restricted_to_main():
    workflow_path = WORKFLOW_PATH
    workflow = workflow_path.read_text(encoding="utf-8")

    deploy_job = re.search(
        r"(?ms)^  deploy:\n(.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)",
        workflow,
    )
    assert deploy_job is not None, "Cloudflare production deploy job must exist"

    condition = re.search(r"(?m)^    if:\s*(.+)$", deploy_job.group(1))
    assert condition is not None, "Cloudflare production deploy job must have an explicit guard"
    expression = condition.group(1)

    assert "github.event_name == 'workflow_dispatch'" in expression
    assert "inputs.deploy == true" in expression
    assert "github.ref == 'refs/heads/main'" in expression, (
        "Production deployment must be restricted to the protected main branch"
    )


def test_cloudflare_validation_smoke_tests_pyodide_with_asyncpg_without_ml_drivers():
    workflow_path = WORKFLOW_PATH
    workflow = workflow_path.read_text(encoding="utf-8")
    repository_root = SERVICE_ROOT
    cloudflare_project = (repository_root / "cloudflare" / "pyproject.toml").read_text(encoding="utf-8")
    package_project = (repository_root / "cloudflare" / "neural_app" / "pyproject.toml").read_text(encoding="utf-8")
    preparation_script = (repository_root / "cloudflare" / "prepare_worker.py").read_text(encoding="utf-8")

    assert 'glorifier-neural-app = { path = "neural_app", editable = false }' in cloudflare_project
    assert 'include = ["app*"]' in package_project
    assert '"asyncpg==0.31.0"' in cloudflare_project
    assert 'WORKER_APP = WORKER_ROOT / "neural_app" / "app"' in preparation_script

    required_runtime_checks = (
        "Resolve Cloudflare-only dependency lock",
        "run: uv lock",
        "Upload validated Cloudflare dependency lock",
        "cloudflare-neural-uv-lock",
        "uv sync --locked --group dev --no-install-project",
        "Prepare Neural application source as local Worker dependency",
        "python prepare_worker.py",
        "uv run --locked pywrangler dev --ip 127.0.0.1 --port 8787",
        "test -f python_modules/app/api.py",
        "Verify Cloudflare Python Worker runtime startup including asyncpg",
        "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_NEON_READONLY",
        'importlib.util.find_spec("psycopg") is None',
        'importlib.util.find_spec("pg8000") is not None',
        'importlib.util.find_spec("asyncpg") is not None',
        'importlib.util.find_spec("torch") is None',
        "http://127.0.0.1:8787/health",
        "bash ./worker-build.sh --prepare-only",
        "npx wrangler deploy --dry-run",
        "bash ./worker-build.sh deploy",
    )
    for check in required_runtime_checks:
        assert check in workflow, f"Cloudflare validation is missing runtime check: {check}"

    # Dependabot may update the immutable action commit; pinning is the invariant.
    for artifact_action in ("upload-artifact", "download-artifact"):
        action_pin = re.search(
            rf"(?m)^\s+uses:\s+actions/{re.escape(artifact_action)}@[0-9a-f]{{40}}(?:\s+#.*)?$",
            workflow,
        )
        assert action_pin is not None, (
            f"Cloudflare workflow must pin actions/{artifact_action} to an immutable SHA"
        )

    assert "contents: write" not in workflow
    assert "git push origin" not in workflow
    assert "Verify committed Cloudflare dependency lock" not in workflow


def test_cloudflare_build_script_removes_host_venvs_before_wrangler_upload():
    script_path = (
        SERVICE_ROOT
        / "cloudflare"
        / "worker-build.sh"
    )
    script = script_path.read_text(encoding="utf-8")

    assert "python prepare_worker.py" in script
    assert "uv run --locked pywrangler sync" in script
    assert "rm -rf -- .venv .venv-workers" in script
    assert 'exec npx wrangler "$mode"' in script
    assert "preview|deploy|--prepare-only" in script
    assert "--prepare-only" in script


def test_cloudflare_worker_preview_urls_are_explicitly_disabled():
    config_path = (
        SERVICE_ROOT
        / "cloudflare"
        / "wrangler.jsonc"
    )
    config = config_path.read_text(encoding="utf-8")

    assert re.search(r'"preview_urls"\s*:\s*false', config), (
        "Production Worker preview URLs must be explicitly disabled"
    )



def test_cloudflare_worker_uses_native_rate_limit_binding():
    config_path = (
        SERVICE_ROOT
        / "cloudflare"
        / "wrangler.jsonc"
    )
    config = config_path.read_text(encoding="utf-8")
    api_path = config_path.parents[1] / "app" / "api.py"
    api_source = api_path.read_text(encoding="utf-8")

    assert '"name": "GLORIFIER_RATE_LIMITER"' in config
    assert '"namespace_id": "47041104"' in config
    assert '"name": "GLORIFIER_READINESS_LIMITER"' in config
    assert '"namespace_id": "47041105"' in config
    assert '"limit": 10' in config
    assert '"limit": 60' in config
    assert '"period": 60' in config
    assert "GLORIFIER_RATE_LIMITER" in api_source
    assert "GLORIFIER_READINESS_LIMITER" in api_source
    assert "await rate_limit_binding.limit" in api_source


def test_cloudflare_worker_binds_existing_readonly_neon_hyperdrive():
    config_path = (
        SERVICE_ROOT
        / "cloudflare"
        / "wrangler.jsonc"
    )
    config = config_path.read_text(encoding="utf-8")

    assert '"binding": "NEON_READONLY"' in config
    assert '"id": "eff847b6c3c64488a989f1fa67d966a0"' in config
    assert '"GLORIFIER_NEON_CONNECTIVITY_ENABLED": "true"' in config


def test_cloudflare_workflow_preflights_api_and_internal_service_secrets_and_smokes_safe_mode_truthfully():
    workflow_path = WORKFLOW_PATH
    workflow = workflow_path.read_text(encoding="utf-8")

    assert "Verify required Neural API and internal service tokens are provisioned before publishing" in workflow
    assert "/workers/scripts/glorifier-neural/secrets" in workflow
    assert 'required_secrets = {"GLORIFIER_API_TOKEN", "GLORIFIER_INTERNAL_SERVICE_TOKEN"}' in workflow
    assert "missing_secrets = sorted(required_secrets.difference(names))" in workflow
    assert "Required Neural API and internal service token secrets are present; their values were not read." in workflow

    assert "  smoke:" in workflow
    assert "needs: [validate, deploy]" in workflow
    assert "/health" in workflow
    assert "/ready" in workflow
    assert "Verify live readiness or explicitly configured provider-disabled safe mode" in workflow
    assert "cloudflare/deployment_smoke.py" in workflow
    assert "--health-file /tmp/neural-health.json" in workflow
    assert "--readiness-file /tmp/neural-ready.json" in workflow
    assert "--readiness-status" in workflow


def test_cloudflare_worker_excludes_duplicate_entry_point_metadata():
    config_path = (
        SERVICE_ROOT
        / "cloudflare"
        / "wrangler.jsonc"
    )
    config = json.loads(config_path.read_text(encoding="utf-8"))
    excluded = config.get("python_modules", {}).get("exclude", [])

    assert "**/*.dist-info/*.txt" in excluded, (
        "Wrangler must not add duplicate optional Python distribution text metadata"
    )
    assert "**/*.dist-info/METADATA" not in excluded, (
        "Keep package METADATA available for runtime version and package inspection"
    )


def test_cloudflare_production_smoke_only_runs_after_authorized_manual_deployment():
    workflow_path = WORKFLOW_PATH
    workflow = workflow_path.read_text(encoding="utf-8")
    smoke_job = re.search(
        r"(?ms)^  smoke:\n(.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)",
        workflow,
    )
    assert smoke_job is not None, "Cloudflare production smoke job must exist"
    smoke = smoke_job.group(1)

    assert "needs: [validate, deploy]" in smoke
    assert "timeout-minutes: 20" in smoke, (
        "Live health and readiness probes must retain their bounded smoke-test timeout"
    )
    condition_header = "    if: >-" + chr(10)
    condition_start = smoke.find(condition_header)
    assert condition_start >= 0, "Production smoke must have an explicit job condition"
    condition_lines = []
    for line in smoke[condition_start + len(condition_header):].splitlines():
        indentation = len(line) - len(line.lstrip(" "))
        if indentation < 6:
            break
        condition_lines.append(line.strip())
    expression = " ".join(condition_lines)
    assert expression == (
        "github.event_name == 'workflow_dispatch' && "
        "github.ref == 'refs/heads/main' && "
        "inputs.deploy == true && "
        "needs.validate.result == 'success' && "
        "needs.deploy.result == 'success'"
    ), "Production smoke must be restricted to the exact owner-authorized deploy event"
    assert "Wait for Cloudflare Workers Builds production deployment" not in smoke
    assert "Workers Builds: glorifier-neural" not in smoke
    assert "check-runs" not in smoke
    assert "checks: read" not in workflow, (
        "The workflow must not request check-run permissions when it no longer polls check runs"
    )


def test_cloudflare_worker_enables_owner_authorized_openai_inference():
    config_path = (
        SERVICE_ROOT
        / "cloudflare"
        / "wrangler.jsonc"
    )
    config = json.loads(config_path.read_text(encoding="utf-8"))
    variables = config.get("vars", {})

    assert variables.get("GLORIFIER_PROVIDER") == "openai"
    assert variables.get("GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS") == "true"
    assert variables.get("GLORIFIER_ENABLE_INFERENCE", "false").casefold() == "true"
