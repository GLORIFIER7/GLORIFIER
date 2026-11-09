"""Fail-closed AI-only pull request review policy for GLORIFIER-NEURAL."""

from __future__ import annotations

import json
import os
import re
import time
from datetime import UTC, datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

GITHUB_API_ROOT = "https://api.github.com"
AI_REVIEWERS = (
    "amazon-q-developer[bot]",
    "codeant-ai[bot]",
)
AI_REVIEWER_ALIASES = {
    "amazon-q-developer": "amazon-q-developer[bot]",
    "codeant-ai": "codeant-ai[bot]",
}
ALLOWED_REVIEW_STATES = {"APPROVED", "COMMENTED"}
# Only the explicit bot-emitted blocker annotation is treated as a blocker.
# General words such as "critical" or "high severity" are too ambiguous.
BLOCKER_PATTERN = re.compile(r"(?im)^\s*:stop_sign:\s+")
REPO_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
MISSING_REVIEW_PREFIX = "Missing a formal AI review from "

REVIEW_THREADS_QUERY = """
query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        nodes {
          isResolved
          isOutdated
          comments(first: 100) {
            nodes {
              body
              commit { oid }
              author { login }
            }
            pageInfo { hasNextPage }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}
"""


def _normalize_login(value: object) -> str:
    login = str(value or "").casefold()
    return AI_REVIEWER_ALIASES.get(login, login)


def _login(item: dict) -> str:
    user = item.get("user")
    return _normalize_login(user.get("login")) if isinstance(user, dict) else ""


def _has_blocker(text: object) -> bool:
    return bool(BLOCKER_PATTERN.search(str(text or "")))


def _parse_review_timestamp(value: object) -> datetime:
    """Parse a GitHub review timestamp as an absolute timezone-aware instant."""
    if not isinstance(value, str) or not value.strip():
        raise TypeError("GitHub returned a review without a valid submission timestamp.")
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise TypeError("GitHub returned a malformed review submission timestamp.") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise TypeError("GitHub review submission timestamp must include a timezone.")
    return parsed.astimezone(UTC)


def _validate_review_record(item: object) -> None:
    """Reject incomplete REST review records instead of silently ignoring them."""
    if not isinstance(item, dict):
        raise TypeError("GitHub returned a malformed pull request review.")
    user = item.get("user")
    if not isinstance(user, dict) or not isinstance(user.get("login"), str) or not user["login"]:
        raise TypeError("GitHub returned a review without a valid author login.")
    state = item.get("state")
    if not isinstance(state, str) or not state:
        raise TypeError("GitHub returned a review without a valid state.")
    commit_id = item.get("commit_id")
    if commit_id is not None and (
        not isinstance(commit_id, str)
        or not re.fullmatch(r"[0-9a-fA-F]{40,64}", commit_id)
    ):
        raise TypeError("GitHub returned a review with an invalid commit SHA.")
    submitted_at = item.get("submitted_at")
    if submitted_at is not None:
        _parse_review_timestamp(submitted_at)
    if state.upper() != "PENDING" and (
        commit_id is None or submitted_at is None
    ):
        raise TypeError("GitHub returned an incomplete submitted review.")
    body = item.get("body")
    if body is not None and not isinstance(body, str):
        raise TypeError("GitHub returned a review with a malformed body.")


def _validate_review_thread(thread: object) -> None:
    """Require complete GraphQL thread/comment fields before blocker evaluation."""
    if not isinstance(thread, dict):
        raise TypeError("GitHub GraphQL returned a malformed review thread.")
    if not isinstance(thread.get("isResolved"), bool):
        raise TypeError("GitHub GraphQL omitted the review-thread resolution state.")
    if not isinstance(thread.get("isOutdated"), bool):
        raise TypeError("GitHub GraphQL omitted the review-thread outdated state.")
    comments = thread.get("comments")
    if not isinstance(comments, dict):
        raise TypeError("GitHub GraphQL returned malformed thread comments.")
    nodes = comments.get("nodes")
    page_info = comments.get("pageInfo")
    if not isinstance(nodes, list) or not isinstance(page_info, dict):
        raise TypeError("GitHub GraphQL returned malformed thread-comment pagination.")
    if not isinstance(page_info.get("hasNextPage"), bool):
        raise TypeError("GitHub GraphQL omitted thread-comment pagination state.")
    if page_info["hasNextPage"]:
        raise RuntimeError(
            "A review thread has more than 100 comments; policy cannot verify it safely."
        )
    for comment in nodes:
        if not isinstance(comment, dict):
            raise TypeError("GitHub GraphQL returned a malformed review comment.")
        author = comment.get("author")
        if not isinstance(author, dict) or not isinstance(author.get("login"), str) or not author["login"]:
            raise TypeError("GitHub GraphQL returned a review comment without an author.")
        body = comment.get("body")
        if not isinstance(body, str):
            raise TypeError("GitHub GraphQL returned a review comment without a valid body.")
        commit = comment.get("commit")
        if not isinstance(commit, dict) or not isinstance(commit.get("oid"), str):
            raise TypeError("GitHub GraphQL returned a review comment without a commit SHA.")
        if not re.fullmatch(r"[0-9a-fA-F]{40,64}", commit["oid"]):
            raise TypeError("GitHub GraphQL returned a review comment with an invalid commit SHA.")


def evaluate_reviews(
    reviews: list[dict],
    threads: list[dict],
    head_sha: str,
) -> list[str]:
    """Return policy failures; only current-head AI reviews count."""
    if not re.fullmatch(r"[0-9a-fA-F]{40,64}", head_sha or ""):
        return ["The pull request head SHA is missing or invalid."]
    if not isinstance(reviews, list) or not isinstance(threads, list):
        raise TypeError("GitHub review evidence must be provided as lists.")
    for item in reviews:
        _validate_review_record(item)
    for thread in threads:
        _validate_review_thread(thread)

    failures: list[str] = []
    for reviewer in AI_REVIEWERS:
        current_reviews = [
            item
            for item in reviews
            if _login(item) == reviewer
            and item.get("commit_id") == head_sha
            and item.get("submitted_at")
        ]
        if not current_reviews:
            failures.append(
                f"{MISSING_REVIEW_PREFIX}{reviewer} on the current head commit."
            )
            continue

        latest_timestamp = max(
            _parse_review_timestamp(item["submitted_at"])
            for item in current_reviews
        )
        latest_reviews = [
            item
            for item in current_reviews
            if _parse_review_timestamp(item["submitted_at"]) == latest_timestamp
        ]
        latest_states = {
            str(item.get("state", "")).upper() for item in latest_reviews
        }
        if len(latest_states) != 1:
            failures.append(
                f"{reviewer} has conflicting review states at the latest "
                "current-head timestamp."
            )
            continue

        state = next(iter(latest_states))
        if state == "CHANGES_REQUESTED":
            failures.append(
                f"{reviewer} submitted CHANGES_REQUESTED on the current head."
            )
        elif state not in ALLOWED_REVIEW_STATES:
            failures.append(
                f"{reviewer}'s latest current-head review is not active "
                f"(state: {state or 'unknown'})."
            )
        elif any(_has_blocker(item.get("body")) for item in latest_reviews):
            failures.append(
                f"{reviewer} reported an explicit blocker in its current-head review."
            )

    for thread in threads:
        if thread.get("isResolved") is not False:
            continue
        if thread.get("isOutdated") is True:
            continue

        comments = thread.get("comments", {}).get("nodes", [])
        for comment in comments:
            author = comment.get("author") or {}
            commit = comment.get("commit") or {}
            login = _normalize_login(author.get("login"))
            if login not in AI_REVIEWERS:
                continue
            if commit.get("oid") != head_sha:
                continue
            if _has_blocker(comment.get("body")):
                failures.append(
                    f"{login} has an unresolved blocking finding on the current head."
                )

    return failures


def _request_json(url: str, token: str, payload: dict | None = None) -> object:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        url,
        data=body,
        method="POST" if body is not None else "GET",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
    )
    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        code = getattr(exc, "code", None)
        detail = f"HTTP {code}" if code else type(exc).__name__
        raise RuntimeError(f"GitHub API request failed ({detail}).") from None


def _fetch_reviews(repo: str, pull_number: int, token: str) -> list[dict]:
    result: list[dict] = []
    page = 1
    while True:
        url = (
            f"{GITHUB_API_ROOT}/repos/{repo}/pulls/{pull_number}/reviews"
            f"?per_page=100&page={page}"
        )
        payload = _request_json(url, token)
        if not isinstance(payload, list):
            raise TypeError("GitHub API returned an invalid pull request reviews response.")
        for item in payload:
            _validate_review_record(item)
        result.extend(payload)
        if len(payload) < 100:
            return result
        page += 1


def _fetch_review_threads(repo: str, pull_number: int, token: str) -> list[dict]:
    owner, name = repo.split("/", maxsplit=1)
    result: list[dict] = []
    cursor = None
    while True:
        payload = _request_json(
            f"{GITHUB_API_ROOT}/graphql",
            token,
            {
                "query": REVIEW_THREADS_QUERY,
                "variables": {
                    "owner": owner,
                    "name": name,
                    "number": pull_number,
                    "cursor": cursor,
                },
            },
        )
        if not isinstance(payload, dict):
            raise TypeError("GitHub GraphQL returned an invalid review-thread response.")
        if payload.get("errors"):
            raise RuntimeError("GitHub GraphQL could not read review threads.")
        data = payload.get("data")
        if not isinstance(data, dict):
            raise TypeError("GitHub GraphQL omitted review-thread data.")
        repository = data.get("repository")
        if not isinstance(repository, dict):
            raise TypeError("GitHub GraphQL omitted the repository.")
        pull_request = repository.get("pullRequest")
        if not isinstance(pull_request, dict):
            raise TypeError("GitHub GraphQL omitted the pull request.")
        connection = pull_request.get("reviewThreads")
        if not isinstance(connection, dict):
            raise TypeError("GitHub GraphQL omitted the review-thread connection.")
        nodes = connection.get("nodes")
        page_info = connection.get("pageInfo")
        if not isinstance(nodes, list) or not isinstance(page_info, dict):
            raise TypeError("GitHub GraphQL returned malformed review-thread data.")
        if not isinstance(page_info.get("hasNextPage"), bool):
            raise TypeError("GitHub GraphQL omitted review-thread pagination state.")

        for thread in nodes:
            _validate_review_thread(thread)
            result.append(thread)

        if page_info["hasNextPage"] is not True:
            return result
        cursor = page_info.get("endCursor")
        if not isinstance(cursor, str) or not cursor:
            raise RuntimeError("GitHub GraphQL omitted the next review-thread cursor.")


def _write_summary(lines: list[str]) -> None:
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as summary:
            summary.write("## AI Review Policy\n\n")
            summary.write("\n".join(f"- {line}" for line in lines))
            summary.write("\n")


def _read_int(name: str, default: int, minimum: int = 0) -> int:
    try:
        return max(minimum, int(os.environ.get(name, str(default))))
    except ValueError:
        return default


def main() -> int:
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    token = os.environ.get("GH_TOKEN", "")
    pull_number = _read_int("PR_NUMBER", 0, 1)
    wait_seconds = _read_int("AI_REVIEW_WAIT_SECONDS", 900)
    poll_interval = _read_int("AI_REVIEW_POLL_INTERVAL_SECONDS", 30, 5)
    head_sha = os.environ.get("PR_HEAD_SHA", "")

    if not REPO_PATTERN.fullmatch(repo) or pull_number < 1 or not token:
        message = "Required repository, pull request number, or read-only GitHub token is missing."
        print(f"::error::{message}")
        _write_summary([message])
        return 1
    if not re.fullmatch(r"[0-9a-fA-F]{40,64}", head_sha):
        message = "The pull request head SHA is missing or invalid."
        print(f"::error::{message}")
        _write_summary([message])
        return 1

    deadline = time.monotonic() + wait_seconds
    while True:
        try:
            reviews = _fetch_reviews(repo, pull_number, token)
            threads = _fetch_review_threads(repo, pull_number, token)
        except (RuntimeError, TypeError) as exc:
            message = str(exc)
            print(f"::error::{message}")
            _write_summary([message])
            return 1

        failures = evaluate_reviews(reviews, threads, head_sha)
        blockers = [
            failure
            for failure in failures
            if not failure.startswith(MISSING_REVIEW_PREFIX)
        ]
        if blockers:
            for failure in blockers:
                print(f"::error::{failure}")
            _write_summary(blockers)
            return 1

        if not failures:
            message = (
                "Policy passed: Amazon Q Developer and CodeAnt AI each submitted a formal "
                "review for the current head commit, and no unresolved AI blocker remains."
            )
            print(message)
            _write_summary([message])
            return 0

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            for failure in failures:
                print(f"::error::{failure}")
            _write_summary(failures)
            return 1

        print(f"Waiting for current-head AI reviews: {'; '.join(failures)}")
        time.sleep(min(poll_interval, remaining))


if __name__ == "__main__":
    raise SystemExit(main())
