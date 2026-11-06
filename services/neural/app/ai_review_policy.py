"""Fail-closed AI-only pull request review policy for GLORIFIER-NEURAL."""

from __future__ import annotations

import json
import os
import re
import time
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


def evaluate_reviews(
    reviews: list[dict],
    threads: list[dict],
    head_sha: str,
) -> list[str]:
    """Return policy failures; only current-head AI reviews count."""
    if not re.fullmatch(r"[0-9a-fA-F]{40,64}", head_sha or ""):
        return ["The pull request head SHA is missing or invalid."]

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

        latest = max(
            current_reviews,
            key=lambda item: str(item.get("submitted_at", "")),
        )
        state = str(latest.get("state", "")).upper()
        if state == "CHANGES_REQUESTED":
            failures.append(
                f"{reviewer} submitted CHANGES_REQUESTED on the current head."
            )
        elif state not in ALLOWED_REVIEW_STATES:
            failures.append(
                f"{reviewer}'s latest current-head review is not active "
                f"(state: {state or 'unknown'})."
            )
        elif _has_blocker(latest.get("body")):
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
        result.extend(item for item in payload if isinstance(item, dict))
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
        data = payload.get("data") or {}
        repository = data.get("repository") or {}
        pull_request = repository.get("pullRequest") or {}
        connection = pull_request.get("reviewThreads") or {}
        nodes = connection.get("nodes")
        page_info = connection.get("pageInfo") or {}
        if not isinstance(nodes, list) or not isinstance(page_info, dict):
            raise TypeError("GitHub GraphQL returned malformed review-thread data.")

        for thread in nodes:
            if not isinstance(thread, dict):
                raise TypeError("GitHub GraphQL returned a malformed review thread.")
            comments = thread.get("comments") or {}
            comment_nodes = comments.get("nodes")
            comment_page = comments.get("pageInfo") or {}
            if not isinstance(comment_nodes, list) or not isinstance(comment_page, dict):
                raise TypeError("GitHub GraphQL returned malformed thread comments.")
            if comment_page.get("hasNextPage") is True:
                raise RuntimeError(
                    "A review thread has more than 100 comments; policy cannot verify it safely."
                )
            result.append(thread)

        if page_info.get("hasNextPage") is not True:
            return result
        cursor = page_info.get("endCursor")
        if not cursor:
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
