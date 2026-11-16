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


def test_restricted_review_events_and_blocking_ai_policy_are_absent():
    event_config = WORKFLOW.split("\npermissions:", 1)[0]
    assert "pull_request:" in event_config
    assert "types: [opened, reopened, synchronize, ready_for_review]" in event_config
    assert "pull_request_review:" not in event_config
    assert "pull_request_review_comment:" not in event_config
    assert "review-scope:" not in WORKFLOW
    assert "ai-review-policy:" not in WORKFLOW
    assert "Wait for both AI reviewers and enforce their findings" not in WORKFLOW


def test_neural_validation_remains_a_read_only_python_matrix():
    test_job = _job_section("test")
    assert "contents: read" in test_job
    assert "pull-requests:" not in test_job
    assert 'python-version: ["3.11", "3.12"]' in test_job
    assert "ruff check ." in test_job
    assert "pytest" in test_job
    assert "uvx --from pip-audit==2.9.0 pip-audit -r /tmp/requirements.txt" in test_job


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

