import pytest

import app.ai_review_policy as policy
from app.ai_review_policy import (
    _fetch_review_threads,
    _fetch_reviews,
    evaluate_reviews,
)


HEAD_SHA = "a" * 40


def review(
    user,
    state="COMMENTED",
    commit_id=HEAD_SHA,
    submitted_at="2026-11-05T10:00:00Z",
    body="",
):
    return {
        "user": {"login": user},
        "state": state,
        "commit_id": commit_id,
        "submitted_at": submitted_at,
        "body": body,
    }


def thread(
    user,
    body,
    commit_id=HEAD_SHA,
    resolved=False,
    outdated=False,
):
    return {
        "isResolved": resolved,
        "isOutdated": outdated,
        "comments": {
            "nodes": [
                {
                    "author": {"login": user},
                    "body": body,
                    "commit": {"oid": commit_id},
                }
            ],
            "pageInfo": {"hasNextPage": False},
        },
    }


def complete_reviews():
    return [
        review("amazon-q-developer[bot]"),
        review("codeant-ai[bot]", submitted_at="2026-11-05T10:01:00Z"),
    ]


def test_two_configured_ai_reviewers_on_current_head_satisfy_policy():
    assert evaluate_reviews(complete_reviews(), [], HEAD_SHA) == []


def test_human_review_does_not_substitute_for_missing_ai_reviewer():
    reviews = [
        review("amazon-q-developer[bot]"),
        review("human-reviewer", state="APPROVED"),
    ]

    failures = evaluate_reviews(reviews, [], HEAD_SHA)

    assert any("codeant-ai[bot]" in failure for failure in failures)


def test_stale_ai_review_does_not_satisfy_current_head():
    reviews = [
        review("amazon-q-developer[bot]", commit_id="b" * 40),
        review("codeant-ai[bot]"),
    ]

    failures = evaluate_reviews(reviews, [], HEAD_SHA)

    assert any("amazon-q-developer[bot]" in failure for failure in failures)


def test_ai_changes_requested_blocks_merge():
    reviews = [
        review("amazon-q-developer[bot]", state="CHANGES_REQUESTED"),
        review("codeant-ai[bot]"),
    ]

    failures = evaluate_reviews(reviews, [], HEAD_SHA)

    assert any("CHANGES_REQUESTED" in failure for failure in failures)


def test_unresolved_ai_blocker_on_current_head_blocks_merge():
    threads = [
        thread("amazon-q-developer", ":stop_sign: Security issue"),
    ]

    failures = evaluate_reviews(complete_reviews(), threads, HEAD_SHA)

    assert any("unresolved blocking finding" in failure for failure in failures)


def test_resolved_ai_blocker_does_not_block_merge():
    threads = [
        thread("amazon-q-developer[bot]", ":stop_sign: Resolved issue", resolved=True),
    ]

    assert evaluate_reviews(complete_reviews(), threads, HEAD_SHA) == []


def test_outdated_ai_blocker_does_not_block_new_head():
    threads = [
        thread(
            "amazon-q-developer[bot]",
            ":stop_sign: Old issue",
            commit_id=HEAD_SHA,
            outdated=True,
        ),
    ]

    assert evaluate_reviews(complete_reviews(), threads, HEAD_SHA) == []


def test_ambiguous_critical_words_do_not_create_false_blockers():
    threads = [
        thread(
            "amazon-q-developer[bot]",
            "This is not a high severity issue; a critical path is unaffected.",
        ),
    ]

    assert evaluate_reviews(complete_reviews(), threads, HEAD_SHA) == []


def test_human_blocker_comment_does_not_count_as_ai_finding():
    threads = [
        thread("human-reviewer", ":stop_sign: advisory only"),
    ]

    assert evaluate_reviews(complete_reviews(), threads, HEAD_SHA) == []


def test_invalid_head_sha_fails_closed():
    failures = evaluate_reviews(complete_reviews(), [], "not-a-sha")

    assert failures == ["The pull request head SHA is missing or invalid."]


def test_codeant_actor_alias_is_recognized_in_review_threads():
    threads = [
        thread("codeant-ai", ":stop_sign: Security issue"),
    ]

    failures = evaluate_reviews(complete_reviews(), threads, HEAD_SHA)

    assert any("codeant-ai[bot]" in failure for failure in failures)


@pytest.mark.parametrize(
    "field,value",
    [
        ("isResolved", None),
        ("isResolved", "false"),
        ("isOutdated", None),
        ("isOutdated", 0),
    ],
)
def test_incomplete_thread_state_fails_closed(field, value):
    malformed = thread("amazon-q-developer[bot]", ":stop_sign: hidden blocker")
    malformed[field] = value

    with pytest.raises(TypeError):
        evaluate_reviews(complete_reviews(), [malformed], HEAD_SHA)


def test_missing_thread_state_cannot_turn_a_blocker_into_success():
    malformed = thread("amazon-q-developer[bot]", ":stop_sign: hidden blocker")
    del malformed["isResolved"]

    with pytest.raises(TypeError):
        evaluate_reviews(complete_reviews(), [malformed], HEAD_SHA)


def test_malformed_comment_author_or_commit_fails_closed():
    malformed = thread("amazon-q-developer[bot]", ":stop_sign: hidden blocker")
    malformed["comments"]["nodes"][0]["author"] = None

    with pytest.raises(TypeError):
        evaluate_reviews(complete_reviews(), [malformed], HEAD_SHA)


def test_fetch_reviews_rejects_non_dictionary_entries(monkeypatch):
    monkeypatch.setattr(
        policy,
        "_request_json",
        lambda *args: [complete_reviews()[0], None, complete_reviews()[1]],
    )

    with pytest.raises(TypeError, match="malformed pull request review"):
        _fetch_reviews("example/repo", 7, "token")


def test_fetch_reviews_rejects_incomplete_submitted_reviews(monkeypatch):
    malformed = review("amazon-q-developer[bot]")
    del malformed["commit_id"]
    monkeypatch.setattr(policy, "_request_json", lambda *args: [malformed])

    with pytest.raises(TypeError, match="incomplete submitted review"):
        _fetch_reviews("example/repo", 7, "token")


def test_fetch_review_threads_rejects_missing_resolution_boolean(monkeypatch):
    malformed = thread("amazon-q-developer[bot]", ":stop_sign: blocker")
    malformed["isResolved"] = None
    response = {
        "data": {
            "repository": {
                "pullRequest": {
                    "reviewThreads": {
                        "nodes": [malformed],
                        "pageInfo": {"hasNextPage": False, "endCursor": None},
                    }
                }
            }
        }
    }
    monkeypatch.setattr(policy, "_request_json", lambda *args: response)

    with pytest.raises(TypeError, match="resolution state"):
        _fetch_review_threads("example/repo", 7, "token")


def test_conflicting_reviews_with_identical_latest_timestamps_fail_closed():
    timestamp = "2026-11-05T10:00:00Z"
    reviews = [
        review(
            "amazon-q-developer[bot]",
            state="APPROVED",
            submitted_at=timestamp,
        ),
        review(
            "amazon-q-developer[bot]",
            state="CHANGES_REQUESTED",
            submitted_at=timestamp,
        ),
        review("codeant-ai[bot]"),
    ]

    failures = evaluate_reviews(reviews, [], HEAD_SHA)

    assert any(
        "conflicting review states at the latest current-head timestamp" in failure
        for failure in failures
    )


def test_malformed_review_timestamp_cannot_supersede_valid_blocker():
    reviews = [
        review(
            "amazon-q-developer[bot]",
            state="CHANGES_REQUESTED",
            submitted_at="2026-11-05T10:00:00Z",
        ),
        review(
            "amazon-q-developer[bot]",
            state="COMMENTED",
            submitted_at="9999",
        ),
        review("codeant-ai[bot]"),
    ]

    with pytest.raises(TypeError, match="submission timestamp"):
        evaluate_reviews(reviews, [], HEAD_SHA)


def test_latest_review_is_selected_by_absolute_time_not_lexicographic_string():
    reviews = [
        review(
            "amazon-q-developer[bot]",
            state="CHANGES_REQUESTED",
            submitted_at="2026-11-05T12:00:00+02:00",
        ),
        review(
            "amazon-q-developer[bot]",
            state="APPROVED",
            submitted_at="2026-11-05T10:01:00Z",
        ),
        review("codeant-ai[bot]"),
    ]

    assert evaluate_reviews(reviews, [], HEAD_SHA) == []


@pytest.mark.parametrize(
    "timestamp",
    [
        "not-a-date",
        "2026-11-05T10:00:00",
        "9999",
    ],
)
def test_malformed_or_timezone_free_review_timestamp_fails_closed(timestamp):
    malformed = review("amazon-q-developer[bot]", submitted_at=timestamp)

    with pytest.raises(TypeError, match="timestamp"):
        evaluate_reviews([malformed, review("codeant-ai[bot]")], [], HEAD_SHA)
