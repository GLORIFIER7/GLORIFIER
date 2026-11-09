import pytest

import app.ai_review_status as publisher
from app.ai_review_status import derive_status, parse_commit_timestamp


def test_missing_reviews_remain_pending_before_the_review_deadline():
    failures = [
        "Missing a formal AI review from amazon-q-developer[bot] on the current head commit.",
        "Missing a formal AI review from codeant-ai[bot] on the current head commit.",
    ]

    assert derive_status(failures, 899) == (
        "pending",
        "Waiting for both current-head AI reviews (15-minute deadline).",
    )


def test_missing_reviews_fail_closed_at_the_review_deadline():
    failures = ["Missing a formal AI review from codeant-ai[bot] on the current head commit."]

    assert derive_status(failures, 900)[0] == "failure"


def test_explicit_blocker_fails_immediately_even_before_deadline():
    failures = ["amazon-q-developer[bot] reported an explicit blocker in its current-head review."]

    assert derive_status(failures, 1)[0] == "failure"


def test_both_current_head_reviews_without_blockers_succeed():
    assert derive_status([], 0) == (
        "success",
        "Both configured AI reviewers passed current-head policy checks.",
    )


def test_github_commit_timestamp_is_normalized_to_utc():
    parsed = parse_commit_timestamp("2026-11-05T10:00:00Z")

    assert parsed.isoformat() == "2026-11-05T10:00:00+00:00"


def test_timestamp_with_numeric_offset_is_preserved_and_normalized():
    parsed = parse_commit_timestamp("2026-11-05T12:00:00+02:00")

    assert parsed.isoformat() == "2026-11-05T10:00:00+00:00"


def test_timestamp_without_timezone_is_rejected():
    with pytest.raises(ValueError, match="timezone"):
        parse_commit_timestamp("2026-11-05T10:00:00")


def test_future_dated_commit_is_rejected(monkeypatch):
    monkeypatch.setattr(
        publisher,
        "_request_json",
        lambda *args: {
            "commit": {
                "committer": {"date": "2099-01-01T00:00:00Z"},
                "author": {"date": "2099-01-01T00:00:00Z"},
            }
        },
    )

    with pytest.raises(ValueError, match="future"):
        publisher._commit_age_seconds("example/repo", "token", "a" * 40)


def _two_open_pull_requests():
    return [
        {
            "number": 1,
            "base": {"ref": "main"},
            "head": {"sha": "a" * 40},
            "html_url": "https://github.com/example/repo/pull/1",
        },
        {
            "number": 2,
            "base": {"ref": "main"},
            "head": {"sha": "b" * 40},
            "html_url": "https://github.com/example/repo/pull/2",
        },
    ]


def _stub_sweep_inputs(monkeypatch):
    def request_json(url, token, payload=None):
        if url == "https://api.github.com/repos/example/repo":
            return {"default_branch": "main"}
        if "/pulls?" in url:
            return _two_open_pull_requests()
        raise AssertionError(f"Unexpected API request: {url}")

    monkeypatch.setattr(publisher, "_request_json", request_json)
    monkeypatch.setattr(publisher, "_fetch_policy_evidence", lambda *args: [])
    monkeypatch.setattr(publisher, "_commit_age_seconds", lambda *args: 1)
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)


def test_status_publish_failure_for_one_head_does_not_abort_other_heads(monkeypatch):
    _stub_sweep_inputs(monkeypatch)
    published = []

    def publish(repo, token, sha, state, description, target_url):
        published.append((sha, state))
        if sha == "a" * 40:
            raise RuntimeError("temporary status write failure")

    monkeypatch.setattr(publisher, "_publish_status", publish)

    counts = publisher.sweep_open_pull_requests("example/repo", "token")

    assert counts["error"] == 1
    assert counts["success"] == 1
    assert ("b" * 40, "success") in published


def test_malformed_review_evidence_becomes_error_and_sweep_continues(monkeypatch):
    _stub_sweep_inputs(monkeypatch)

    def evidence(repo, number, token, sha):
        if number == 1:
            raise AttributeError("malformed nested GraphQL response")
        return []

    published = []
    monkeypatch.setattr(publisher, "_fetch_policy_evidence", evidence)
    monkeypatch.setattr(
        publisher,
        "_publish_status",
        lambda repo, token, sha, state, description, target_url: published.append(
            (sha, state)
        ),
    )

    counts = publisher.sweep_open_pull_requests("example/repo", "token")

    assert counts["error"] == 1
    assert counts["success"] == 1
    assert ("a" * 40, "error") in published
    assert ("b" * 40, "success") in published


def test_prs_sharing_a_head_sha_publish_one_conservative_status(monkeypatch):
    _stub_sweep_inputs(monkeypatch)
    pulls = _two_open_pull_requests()
    pulls[1]["head"]["sha"] = "a" * 40

    def request_json(url, token, payload=None):
        if url == "https://api.github.com/repos/example/repo":
            return {"default_branch": "main"}
        if "/pulls?" in url:
            return pulls
        raise AssertionError(f"Unexpected API request: {url}")

    monkeypatch.setattr(publisher, "_request_json", request_json)
    monkeypatch.setattr(
        publisher,
        "_fetch_policy_evidence",
        lambda repo, number, token, sha: (
            []
            if number == 1
            else [
                "Missing a formal AI review from codeant-ai[bot] on the current head commit."
            ]
        ),
    )
    monkeypatch.setattr(publisher, "_commit_age_seconds", lambda *args: 900)
    published = []
    monkeypatch.setattr(
        publisher,
        "_publish_status",
        lambda repo, token, sha, state, description, target_url: published.append(
            (sha, state, description)
        ),
    )

    counts = publisher.sweep_open_pull_requests("example/repo", "token")

    assert counts["failure"] == 1
    assert counts["success"] == 0
    assert len(published) == 1
    assert published[0][0:2] == ("a" * 40, "failure")


def test_unsupported_derived_state_fails_closed_without_aborting_sweep(monkeypatch):
    _stub_sweep_inputs(monkeypatch)
    calls = []
    monkeypatch.setattr(
        publisher, "derive_status", lambda failures, age: ("warning", "unexpected state")
    )
    monkeypatch.setattr(
        publisher,
        "_publish_status",
        lambda repo, token, sha, state, description, target_url: calls.append(
            (sha, state)
        ),
    )

    counts = publisher.sweep_open_pull_requests("example/repo", "token")

    assert counts["error"] == 2
    assert ("a" * 40, "error") in calls
    assert ("b" * 40, "error") in calls


def test_repository_and_token_validation_have_distinct_errors():
    with pytest.raises(ValueError, match="GITHUB_REPOSITORY"):
        publisher.sweep_open_pull_requests("invalid repo", "token")
    with pytest.raises(ValueError, match="GH_TOKEN"):
        publisher.sweep_open_pull_requests("example/repo", "")


def test_main_fails_when_any_status_cannot_be_published(monkeypatch):
    monkeypatch.setenv("GITHUB_REPOSITORY", "example/repo")
    monkeypatch.setenv("GH_TOKEN", "token")
    monkeypatch.setattr(
        publisher,
        "sweep_open_pull_requests",
        lambda repo, token: {
            "success": 0,
            "pending": 0,
            "failure": 0,
            "error": 1,
            "skipped": 0,
        },
    )

    assert publisher.main() == 1


def test_malformed_pull_metadata_is_counted_and_other_prs_are_still_checked(monkeypatch):
    _stub_sweep_inputs(monkeypatch)
    malformed_and_valid = [
        {
            "number": 1,
            "base": [],
            "head": {"sha": "a" * 40},
            "html_url": "https://github.com/example/repo/pull/1",
        },
        _two_open_pull_requests()[1],
    ]

    def request_json(url, token, payload=None):
        if url == "https://api.github.com/repos/example/repo":
            return {"default_branch": "main"}
        if "/pulls?" in url:
            return malformed_and_valid
        raise AssertionError(f"Unexpected API request: {url}")

    published = []
    monkeypatch.setattr(publisher, "_request_json", request_json)
    monkeypatch.setattr(
        publisher,
        "_publish_status",
        lambda repo, token, sha, state, description, target_url: published.append(
            (sha, state)
        ),
    )

    counts = publisher.sweep_open_pull_requests("example/repo", "token")

    assert counts["error"] == 1
    assert counts["success"] == 1
    assert published == [("a" * 40, "error"), ("b" * 40, "success")]


def test_grouped_evidence_error_takes_precedence_over_known_blocker():
    state, description = publisher._aggregate_group_state(["failure", "error"])

    assert state == "error"
    assert "unverifiable" in description


def test_grouped_blocker_still_fails_when_no_evidence_errors_exist():
    state, _ = publisher._aggregate_group_state(["success", "failure"])

    assert state == "failure"


def test_missing_base_ref_for_known_sha_publishes_error(monkeypatch):
    _stub_sweep_inputs(monkeypatch)
    pulls = [
        {
            "number": 7,
            "base": {},
            "head": {"sha": "c" * 40},
            "html_url": "https://github.com/example/repo/pull/7",
        }
    ]

    def request_json(url, token, payload=None):
        if url == "https://api.github.com/repos/example/repo":
            return {"default_branch": "main"}
        if "/pulls?" in url:
            return pulls
        raise AssertionError(f"Unexpected API request: {url}")

    published = []
    monkeypatch.setattr(publisher, "_request_json", request_json)
    monkeypatch.setattr(
        publisher,
        "_publish_status",
        lambda repo, token, sha, state, description, target_url: published.append(
            (sha, state, description)
        ),
    )

    counts = publisher.sweep_open_pull_requests("example/repo", "token")

    assert counts["error"] == 1
    assert published[0][0:2] == ("c" * 40, "error")


def test_malformed_pull_list_item_does_not_abort_valid_pull_requests(monkeypatch):
    _stub_sweep_inputs(monkeypatch)
    valid_pull = {
        "number": 9,
        "base": {"ref": "main"},
        "head": {"sha": "d" * 40},
        "html_url": "https://github.com/example/repo/pull/9",
    }

    def request_json(url, token, payload=None):
        if url == "https://api.github.com/repos/example/repo":
            return {"default_branch": "main"}
        if "/pulls?" in url:
            return [None, valid_pull]
        raise AssertionError(f"Unexpected API request: {url}")

    published = []
    monkeypatch.setattr(publisher, "_request_json", request_json)
    monkeypatch.setattr(
        publisher,
        "_publish_status",
        lambda repo, token, sha, state, description, target_url: published.append(
            (sha, state)
        ),
    )

    counts = publisher.sweep_open_pull_requests("example/repo", "token")

    assert counts["error"] == 1
    assert counts["success"] == 1
    assert published == [("d" * 40, "success")]


def test_missing_pr_number_and_url_never_publish_a_pull_none_target(monkeypatch):
    _stub_sweep_inputs(monkeypatch)
    pulls = [
        {
            "number": None,
            "base": {"ref": "main"},
            "head": {"sha": "c" * 40},
            "html_url": None,
        }
    ]

    def request_json(url, token, payload=None):
        if url == "https://api.github.com/repos/example/repo":
            return {"default_branch": "main"}
        if "/pulls?" in url:
            return pulls
        raise AssertionError(f"Unexpected API request: {url}")

    published = []
    monkeypatch.setattr(publisher, "_request_json", request_json)
    monkeypatch.setattr(
        publisher,
        "_publish_status",
        lambda repo, token, sha, state, description, target_url: published.append(target_url),
    )

    counts = publisher.sweep_open_pull_requests("example/repo", "token")

    assert counts["error"] == 1
    assert published == [None]


def test_publish_status_omits_target_url_when_no_safe_pr_link_exists(monkeypatch):
    payloads = []
    monkeypatch.setattr(
        publisher,
        "_request_json",
        lambda url, token, payload=None: payloads.append(payload),
    )

    publisher._publish_status("example/repo", "token", "a" * 40, "error", "metadata error", None)

    assert len(payloads) == 1
    assert "target_url" not in payloads[0]


def test_trusted_status_schedule_leaves_headroom_for_the_ten_minute_job():
    from pathlib import Path

    workflow = (
        Path(__file__).resolve().parents[1]
        / ".github"
        / "workflows"
        / "ai-review-policy-trusted.yml"
    ).read_text(encoding="utf-8")

    assert 'cron: "*/15 * * * *"' in workflow
    assert "timeout-minutes: 10" in workflow


def test_malformed_commit_timestamp_has_a_descriptive_iso8601_error():
    with pytest.raises(ValueError, match="valid ISO 8601"):
        parse_commit_timestamp("not-a-date")


def test_missing_committer_and_author_dates_have_an_attributable_error(monkeypatch):
    monkeypatch.setattr(
        publisher,
        "_request_json",
        lambda *args: {
            "commit": {
                "committer": {},
                "author": {},
            }
        },
    )

    with pytest.raises(ValueError, match="committer.date and author.date"):
        publisher._commit_age_seconds("example/repo", "token", "a" * 40)
