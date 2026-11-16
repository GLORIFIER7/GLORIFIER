import re
from pathlib import Path

import pytest


SERVICE_ROOT = Path(__file__).resolve().parents[1]
IS_MONOREPO = SERVICE_ROOT.parent.name == "services" and SERVICE_ROOT.name == "neural"
REPOSITORY_ROOT = SERVICE_ROOT.parents[1] if IS_MONOREPO else SERVICE_ROOT
WORKFLOW = (
    REPOSITORY_ROOT
    / ".github"
    / "workflows"
    / ("neural-ci.yml" if IS_MONOREPO else "ai-review-policy-trusted.yml")
).read_text(encoding="utf-8")


@pytest.mark.skipif(
    IS_MONOREPO,
    reason="standalone trusted-policy contract is not used by the monorepo",
)
def test_trusted_policy_runs_only_from_default_branch_events():
    assert "schedule:" in WORKFLOW
    assert "push:" in WORKFLOW
    assert "branches: [main]" in WORKFLOW
    assert "pull_request:" not in WORKFLOW
    assert "pull_request_target:" not in WORKFLOW


@pytest.mark.skipif(
    IS_MONOREPO,
    reason="standalone trusted-policy contract is not used by the monorepo",
)
def test_trusted_policy_has_exact_least_privilege_permissions():
    top_level = re.search(
        r"(?ms)^permissions:\n((?:^  [a-z-]+: [a-z]+\n)+)",
        WORKFLOW,
    )
    job_level = re.search(
        r"(?ms)^    permissions:\n((?:^      [a-z-]+: [a-z]+\n)+)",
        WORKFLOW,
    )
    assert top_level
    assert job_level
    assert re.findall(r"(?m)^  ([a-z-]+): ([a-z]+)$", top_level.group(1)) == [
        ("contents", "read")
    ]
    assert re.findall(r"(?m)^      ([a-z-]+): ([a-z]+)$", job_level.group(1)) == [
        ("contents", "read"),
        ("pull-requests", "read"),
        ("statuses", "write"),
    ]
    assert not re.search(r"\$\{\{\s*secrets\s*(?:\.|\[)", WORKFLOW, re.IGNORECASE)


@pytest.mark.skipif(
    IS_MONOREPO,
    reason="standalone trusted-policy contract is not used by the monorepo",
)
def test_trusted_policy_does_not_checkout_or_execute_pull_request_code():
    assert "persist-credentials: false" in WORKFLOW
    assert "github.event.pull_request.head.sha" not in WORKFLOW
    assert "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1" in WORKFLOW
    assert "python -m app.ai_review_status" in WORKFLOW


@pytest.mark.skipif(
    IS_MONOREPO,
    reason="standalone trusted-policy contract is not used by the monorepo",
)
def test_trusted_policy_sweeps_do_not_overlap():
    assert "group: trusted-ai-review-status-" in WORKFLOW
    assert "cancel-in-progress: false" in WORKFLOW


@pytest.mark.skipif(
    IS_MONOREPO,
    reason="standalone trusted-policy contract is not used by the monorepo",
)
def test_trusted_policy_rechecks_after_ci_completion():
    assert 'workflows: ["CI"]' in WORKFLOW
    assert "workflow_run:" in WORKFLOW
    assert "types: [completed]" in WORKFLOW


@pytest.mark.skipif(
    IS_MONOREPO,
    reason="standalone trusted-policy contract is not used by the monorepo",
)
def test_trusted_policy_workflow_run_is_limited_to_default_branch_ci():
    workflow_run = WORKFLOW.partition("  workflow_run:")[2].partition(
        "permissions:"
    )[0]
    assert "branches: [main]" in workflow_run



@pytest.mark.skipif(not IS_MONOREPO, reason="monorepo-specific policy contract")
def test_monorepo_neural_ci_does_not_run_policy_on_restricted_review_events():
    assert "pull_request:" in WORKFLOW
    assert "pull_request_review:" not in WORKFLOW
    assert "pull_request_review_comment:" not in WORKFLOW
    assert "  ai-review-policy:" not in WORKFLOW
    top_level_permissions = re.search(
        r"(?ms)^permissions:\n((?:^  [a-z-]+: [a-z]+\n)+)",
        WORKFLOW,
    )
    test_job_permissions = re.search(
        r"(?ms)^    permissions:\n((?:^      [a-z-]+: [a-z]+\n)+)",
        WORKFLOW,
    )
    assert top_level_permissions is not None
    assert test_job_permissions is not None
    assert top_level_permissions.group(1).strip() == "contents: read"
    assert test_job_permissions.group(1).strip() == "contents: read"
    assert "pull-requests: write" not in WORKFLOW
    assert "persist-credentials: false" in WORKFLOW
    assert "gh pr merge" not in WORKFLOW
    assert "--auto" not in WORKFLOW



@pytest.mark.skipif(not IS_MONOREPO, reason="monorepo trusted-status publisher contract")
def test_monorepo_has_a_separate_trusted_scheduled_status_publisher():
    workflow = (
        REPOSITORY_ROOT / ".github" / "workflows" / "neural-ai-review-status.yml"
    ).read_text(encoding="utf-8")

    triggers = workflow.partition("permissions:")[0]
    assert "schedule:" in triggers
    assert 'cron: "*/15 * * * *"' in triggers
    assert 'workflows: ["NEURAL Service CI"]' in triggers
    assert "workflow_run:" in triggers
    assert "types: [completed]" in triggers
    assert "branches: [main]" in triggers
    assert "pull_request:" not in triggers
    assert "pull_request_target:" not in triggers

    assert "ref: main" in workflow
    assert "path: trusted-main" in workflow
    assert "persist-credentials: false" in workflow
    assert "working-directory: trusted-main/services/neural" in workflow
    assert "python -m app.ai_review_status" in workflow
    assert "timeout-minutes: 10" in workflow
    assert "gh pr merge" not in workflow
    assert "--auto" not in workflow


@pytest.mark.skipif(not IS_MONOREPO, reason="monorepo trusted-status publisher contract")
def test_monorepo_trusted_status_publisher_uses_least_privilege_permissions():
    workflow = (
        REPOSITORY_ROOT / ".github" / "workflows" / "neural-ai-review-status.yml"
    ).read_text(encoding="utf-8")

    lines = workflow.splitlines()
    top_level_permissions = lines.index("permissions:")
    job_permissions = lines.index("    permissions:")
    assert lines[top_level_permissions + 1] == "  contents: read"
    assert lines[job_permissions + 1 : job_permissions + 4] == [
        "      contents: read",
        "      pull-requests: read",
        "      statuses: write",
    ]
    assert "${{ secrets." not in workflow

@pytest.mark.skipif(not IS_MONOREPO, reason="monorepo AI-review documentation contract")
def test_monorepo_ai_review_documentation_matches_advisory_only_workflows():
    documentation = (
        SERVICE_ROOT / "docs" / "AI_REVIEW_POLICY.md"
    ).read_text(encoding="utf-8")

    assert "advisory only" in documentation.lower()
    assert "not a required merge status" in documentation.lower()
    assert "The blocking AI-review job is removed" in documentation
    assert "ID 24038955" in documentation
    assert "2026-11-16" in documentation
    assert "bypass actors" in documentation.lower()
    assert "always-bypass actors can bypass the ruleset" in documentation.lower()
    assert "administrator follow-up" in documentation.lower()
    assert "no `codeowners` file" in documentation.lower()
    assert "effective code-owner approval coverage is **not verified**" in documentation.lower()
    assert "old AI Review Policy job remains a defense-in-depth check" not in documentation

@pytest.mark.skipif(not IS_MONOREPO, reason="monorepo current production configuration contract")
def test_monorepo_runbook_records_current_default_deny_and_observability_state():
    runbook = (
        SERVICE_ROOT / "docs" / "PRODUCTION_READINESS.md"
    ).read_text(encoding="utf-8")

    assert "Current production configuration observation — 2026-11-16" in runbook
    assert "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS=false" in runbook
    assert "GLORIFIER_ENABLE_INFERENCE=false" in runbook
    assert "GLORIFIER_PAID_INFERENCE_AUTHORIZED=false" in runbook
    assert "observability.redact_query_string=false" in runbook
    assert "PR #894" in runbook
    assert "source-only and has not been deployed" in runbook
    assert "no secret values were read" in runbook


@pytest.mark.skipif(not IS_MONOREPO, reason="monorepo PostgreSQL image digest maintenance contract")
def test_monorepo_runbook_documents_postgres_image_digest_refresh():
    runbook = (
        SERVICE_ROOT / "docs" / "PRODUCTION_READINESS.md"
    ).read_text(encoding="utf-8")

    assert "CI dependency maintenance" in runbook
    assert "neural-database-integration.yml" in runbook
    assert "test_migration_contracts.py" in runbook
    assert "63e83b5a3dc36a917dccb76fe1bd2ac51f1ec9c1deb47ff20d4f04233bf6eae9" in runbook


@pytest.mark.skipif(not IS_MONOREPO, reason="monorepo production release runbook contract")
def test_monorepo_release_runbook_matches_advisory_ai_review_policy():
    runbook = (
        SERVICE_ROOT / "docs" / "PRODUCTION_READINESS.md"
    ).read_text(encoding="utf-8")
    release_procedure = runbook.partition("## Release procedure")[2].partition(
        "\n## "
    )[0]

    assert release_procedure
    assert "AI Review Policy" in release_procedure
    assert "advisory only" in release_procedure.lower()
    assert "not a required merge status" in release_procedure.lower()
    assert "ID 24038955" in release_procedure
    assert "code-owner review" in release_procedure.lower()
    assert "no `codeowners` file was found" in release_procedure.lower()
    assert "code-owner coverage is not verified" in release_procedure.lower()
    assert "review-thread resolution" in release_procedure.lower()
    assert "exact AI Review Policy status check" not in release_procedure
    assert "PR-controlled workflow-definition trust limitation" not in release_procedure


