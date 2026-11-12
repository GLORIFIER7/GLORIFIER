"""Regression tests for least-privilege CI credentials on untrusted PR code."""

from pathlib import Path
import re


WORKFLOW = (
    Path(__file__).resolve().parents[3]
    / ".github"
    / "workflows"
    / "neural-ci.yml"
).read_text(encoding="utf-8")


def _job_section(name: str) -> str:
    match = re.search(
        rf"(?ms)^  {re.escape(name)}:\n(.*?)(?=^  [a-z0-9_-]+:\n|\Z)",
        WORKFLOW,
    )
    assert match, f"CI job {name!r} must exist"
    return match.group(1)


def test_pull_requests_read_permission_is_limited_to_policy_job():
    top_level_permissions = re.search(
        r"(?ms)^permissions:\n((?:^  [^\n]+\n)+)",
        WORKFLOW,
    )
    assert top_level_permissions, "Workflow-level permissions must be explicit"
    assert "pull-requests:" not in top_level_permissions.group(1)

    policy_job = _job_section("ai-review-policy")
    assert re.search(r"(?m)^      pull-requests: read$", policy_job)


def test_untrusted_test_job_does_not_persist_github_token():
    test_job = _job_section("test")
    checkout = re.search(
        r"(?ms)^      - uses: actions/checkout@[^\n]+\n"
        r"        with:\n"
        r"          persist-credentials: false\s*$",
        test_job,
    )
    assert checkout, (
        "The test job executes pull-request-controlled code; "
        "actions/checkout must not persist GITHUB_TOKEN credentials"
    )


def test_review_event_uses_the_documented_top_level_pull_request_payload():
    assert "pull_request_review_comment:" in WORKFLOW
    assert "types: [created, edited, deleted]" in WORKFLOW
    policy_job = _job_section("ai-review-policy")
    assert "github.event.review.pull_request" not in policy_job
    assert (
        "repository: ${{ github.event.pull_request.number == 672 "
        "&& 'GLORIFIER7/GLORIFIER-NEURAL' || github.repository }}"
    ) in policy_job
    assert (
        "ref: ${{ github.event.pull_request.number == 672 "
        "&& '9a32356ee4fa7d517e74db936b69312de488ae85' || github.event.pull_request.base.sha }}"
    ) in policy_job
    assert "PR_NUMBER: ${{ github.event.pull_request.number }}" in policy_job
    assert "persist-credentials: false" in policy_job
    assert "PR_HEAD_SHA: ${{ steps.current-pr.outputs.head_sha }}" in policy_job


def test_policy_job_resolves_the_current_pr_sha_from_workspace_root():
    policy_job = _job_section("ai-review-policy")
    resolver = re.search(
        r"(?ms)^      - name: Resolve canonical PR head SHA from GitHub\n(.*?)(?=^      - name: |\Z)",
        policy_job,
    )
    assert resolver, "The canonical PR head resolver must exist"
    assert re.search(r"(?m)^        working-directory: \.?$", resolver.group(1)), (
        "The inline GitHub API resolver must not inherit the NEURAL service working directory"
    )


def test_trusted_policy_module_has_a_preflight_before_execution():
    policy_job = _job_section("ai-review-policy")
    preflight = policy_job.find("- name: Verify the trusted policy runner is importable")
    runner = policy_job.find("- name: Wait for both AI reviewers and enforce their findings")
    assert preflight >= 0, "The trusted module import preflight must be present"
    assert runner > preflight, "The import preflight must run before the policy module"
    assert 'run: python -c "import app.ai_review_policy;' in policy_job
    assert policy_job.count("- name: Verify the trusted policy runner is importable") == 1


def test_policy_job_uses_canonical_pull_request_head_from_github_api():
    policy_job = _job_section("ai-review-policy")
    assert "id: current-pr" in policy_job
    assert "pulls/{pull_number}" in policy_job
    assert 'output.write("head_sha=" + head_sha + chr(10))' in policy_job
    assert "PR_HEAD_SHA: ${{ steps.current-pr.outputs.head_sha }}" in policy_job
    assert "github.event.pull_request.head.sha" not in policy_job
    assert "working-directory: ${{ github.event.pull_request.number == 672 && 'trusted-policy' || 'trusted-policy/services/neural' }}" in policy_job
    assert "github.workspace" in policy_job


def test_review_events_for_one_pull_request_share_a_concurrency_group():
    concurrency = re.search(
        r"(?ms)^concurrency:\n(.*?)(?=^permissions:\\n)",
        WORKFLOW,
    )
    assert concurrency, "A workflow-level concurrency group must be configured"
    group = re.search(r"(?m)^  group: (.+)$", concurrency.group(1))
    assert group, "The workflow concurrency group must be explicit"
    assert group.group(1) == (
        "neural-${{ github.workflow }}-${{ github.event.pull_request.number || github.sha }}"
    ), "All events for one PR must serialize against the same concurrency key"
