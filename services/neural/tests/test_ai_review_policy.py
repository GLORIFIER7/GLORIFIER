from app.ai_review_policy import evaluate_reviews


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
            ]
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
