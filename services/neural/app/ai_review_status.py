"""Publish trusted AI-review policy statuses for open pull requests.

This module runs only from the repository's default branch. It reads pull
request metadata and review evidence through GitHub's API; it never checks out
or executes pull-request-controlled code. Commit statuses are SHA-scoped, so
all open PRs sharing a head SHA are evaluated conservatively as one group.
"""

from __future__ import annotations

import os
import re
from datetime import UTC, datetime
from urllib.parse import quote

GITHUB_API_ROOT = "https://api.github.com"
REPO_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
HEAD_SHA_PATTERN = re.compile(r"^[0-9a-fA-F]{40}$")
STATUS_CONTEXT = "AI Review Policy (diagnostic)"
DEFAULT_REVIEW_TIMEOUT_SECONDS = 900
VALID_STATES = {"pending", "success", "failure", "error"}


def derive_status(
    failures: list[str],
    head_age_seconds: float,
    timeout_seconds: int = DEFAULT_REVIEW_TIMEOUT_SECONDS,
) -> tuple[str, str]:
    """Map review evidence to a GitHub commit status, failing closed."""
    from .ai_review_policy import MISSING_REVIEW_PREFIX

    blockers = [
        failure for failure in failures
        if not failure.startswith(MISSING_REVIEW_PREFIX)
    ]
    if blockers:
        return "failure", "A current-head AI review blocker or invalid review state exists."
    if failures:
        if head_age_seconds >= timeout_seconds:
            return "failure", "Timed out waiting for both current-head AI reviews."
        return "pending", "Waiting for both current-head AI reviews (15-minute deadline)."
    return "success", "Both configured AI reviewers passed current-head policy checks."


def parse_commit_timestamp(value: str) -> datetime:
    """Parse GitHub's ISO-8601 commit timestamp and require timezone awareness."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("GitHub commit timestamp is missing.")
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError("GitHub commit timestamp is malformed; expected valid ISO 8601.") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("GitHub commit timestamp must include a timezone.")
    return parsed.astimezone(UTC)


def _request_json(url: str, token: str, payload: dict | None = None) -> object:
    from .ai_review_policy import _request_json as request_json

    return request_json(url, token, payload)


def _fetch_policy_evidence(repo: str, number: int, token: str, head_sha: str) -> list[str]:
    from .ai_review_policy import (
        _fetch_review_threads,
        _fetch_reviews,
        evaluate_reviews,
    )

    reviews = _fetch_reviews(repo, number, token)
    threads = _fetch_review_threads(repo, number, token)
    return evaluate_reviews(reviews, threads, head_sha)


def _commit_age_seconds(repo: str, token: str, head_sha: str) -> float:
    payload = _request_json(
        f"{GITHUB_API_ROOT}/repos/{repo}/commits/{head_sha}", token
    )
    if not isinstance(payload, dict):
        raise TypeError("GitHub returned an invalid commit response.")
    commit = payload.get("commit")
    if not isinstance(commit, dict):
        raise TypeError("GitHub returned an invalid commit object.")
    committer = commit.get("committer")
    author = commit.get("author")
    if not isinstance(committer, dict) or not isinstance(author, dict):
        raise TypeError("GitHub returned malformed commit identity data.")
    timestamp = committer.get("date") or author.get("date")
    if not timestamp:
        raise ValueError("GitHub commit is missing both committer.date and author.date.")
    committed_at = parse_commit_timestamp(timestamp)
    age_seconds = (datetime.now(UTC) - committed_at).total_seconds()
    if age_seconds < 0:
        raise ValueError("GitHub commit timestamp is in the future.")
    return age_seconds


def _publish_status(
    repo: str,
    token: str,
    head_sha: str,
    state: str,
    description: str,
    target_url: str | None,
) -> None:
    if state not in VALID_STATES:
        raise ValueError(f"Unsupported GitHub commit status: {state}")
    payload = {
        "state": state,
        "context": STATUS_CONTEXT,
        "description": description[:140],
    }
    if target_url:
        payload["target_url"] = target_url
    _request_json(
        f"{GITHUB_API_ROOT}/repos/{repo}/statuses/{head_sha}", token, payload
    )


def _append_summary(lines: list[str]) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as summary:
            summary.write("## Trusted AI Review Status\n\n")
            summary.write("\n".join(f"- {line}" for line in lines))
            summary.write("\n")


def _aggregate_group_state(states: list[str]) -> tuple[str, str]:
    """A SHA passes only when every PR sharing it independently passes."""
    if not states:
        return "error", "No PR review evidence was available for this commit."
    if any(state == "error" for state in states):
        return "error", "At least one PR sharing this commit has unverifiable review evidence."
    if any(state == "failure" for state in states):
        return "failure", "At least one PR sharing this commit has a review blocker."
    if any(state == "pending" for state in states):
        return "pending", "At least one PR sharing this commit is awaiting AI reviews."
    if all(state == "success" for state in states):
        return "success", "Every PR sharing this commit passed current-head AI review policy."
    return "error", "The grouped PR review states were not recognized."


def sweep_open_pull_requests(repo: str, token: str) -> dict[str, int]:
    """Evaluate open PRs and publish one conservative status per unique head SHA."""
    if not REPO_PATTERN.fullmatch(repo or ""):
        raise ValueError("A valid GITHUB_REPOSITORY slug is required.")
    if not token:
        raise ValueError("A scoped GH_TOKEN is required.")

    repository = _request_json(f"{GITHUB_API_ROOT}/repos/{repo}", token)
    if not isinstance(repository, dict) or not repository.get("default_branch"):
        raise TypeError("GitHub did not return the repository default branch.")
    default_branch = str(repository["default_branch"])

    pulls: list[dict] = []
    malformed_pull_items = 0
    page = 1
    while True:
        pulls_url = (
            f"{GITHUB_API_ROOT}/repos/{repo}/pulls?state=open"
            f"&base={quote(default_branch)}&per_page=100&page={page}"
        )
        payload = _request_json(pulls_url, token)
        if not isinstance(payload, list):
            raise TypeError("GitHub returned an invalid open pull-request response.")
        malformed_count = sum(not isinstance(item, dict) for item in payload)
        malformed_pull_items += malformed_count
        pulls.extend(item for item in payload if isinstance(item, dict))
        if len(payload) < 100:
            break
        page += 1

    counts = {
        "success": 0,
        "pending": 0,
        "failure": 0,
        "error": malformed_pull_items,
        "skipped": 0,
    }
    summary: list[str] = []
    if malformed_pull_items:
        summary.append(
            f"GitHub returned {malformed_pull_items} malformed pull-request list item(s); "
            "valid pull requests were still processed."
        )
    grouped_pulls: dict[str, list[dict]] = {}

    for pull in pulls:
        number = pull.get("number")
        base = pull.get("base")
        head = pull.get("head")
        base_ref = base.get("ref") if isinstance(base, dict) else None
        if isinstance(base_ref, str) and base_ref and base_ref != default_branch:
            counts["skipped"] += 1
            continue
        if not isinstance(head, dict):
            counts["error"] += 1
            summary.append("An open PR response had malformed head metadata with no SHA.")
            continue
        head_sha = str(head.get("sha") or "")
        if not HEAD_SHA_PATTERN.fullmatch(head_sha):
            counts["error"] += 1
            summary.append("An open PR response had an invalid head SHA.")
            continue
        metadata_error = None
        if not isinstance(number, int) or isinstance(number, bool):
            metadata_error = "The PR number was malformed; its review evidence cannot be resolved."
        elif not isinstance(base, dict) or not isinstance(base_ref, str) or not base_ref:
            metadata_error = "The PR base ref was missing or malformed; its target branch cannot be verified."
        grouped_entry = {
            "number": number if isinstance(number, int) and not isinstance(number, bool) else None,
            "html_url": pull.get("html_url"),
        }
        if metadata_error:
            grouped_entry["_metadata_error"] = metadata_error
        else:
            grouped_entry["number"] = number
        grouped_pulls.setdefault(head_sha, []).append(grouped_entry)

    for head_sha, shared_pulls in grouped_pulls.items():
        group_states: list[str] = []
        for pull in shared_pulls:
            number = pull.get("number")
            if pull.get("_metadata_error"):
                state = "error"
                description = str(pull["_metadata_error"])
            else:
                try:
                    failures = _fetch_policy_evidence(repo, number, token, head_sha)
                    age_seconds = _commit_age_seconds(repo, token, head_sha)
                    state, description = derive_status(failures, age_seconds)
                    if state not in VALID_STATES:
                        raise ValueError("The review evaluator returned an unsupported status.")
                except Exception as exc:  # noqa: BLE001 - isolate malformed per-PR evidence
                    state = "error"
                    description = (
                        f"Review evidence could not be verified ({type(exc).__name__})."
                    )
            group_states.append(state)
            if number is None:
                summary.append(f"PR metadata for head {head_sha[:12]}: {state} — {description}")
            else:
                summary.append(f"PR #{number}: {state} — {description}")

        status, group_description = _aggregate_group_state(group_states)
        target_url = next(
            (
                url
                for pull in shared_pulls
                if isinstance((url := pull.get("html_url")), str)
                and url.startswith(f"https://github.com/{repo}/pull/")
            ),
            None,
        )
        if target_url is None:
            first_number = next(
                (
                    number
                    for pull in shared_pulls
                    if isinstance((number := pull.get("number")), int)
                    and not isinstance(number, bool)
                    and number > 0
                ),
                None,
            )
            if first_number is not None:
                target_url = f"https://github.com/{repo}/pull/{first_number}"
        if len(shared_pulls) > 1:
            group_description = (
                f"{len(shared_pulls)} PRs share this head SHA; {group_description}"
            )

        try:
            _publish_status(
                repo,
                token,
                head_sha,
                status,
                group_description,
                target_url,
            )
        except Exception as exc:  # noqa: BLE001 - isolate per-head publication failures
            counts["error"] += 1
            summary.append(
                f"Head {head_sha[:12]}: status publication failed ({type(exc).__name__})."
            )
            continue

        counts[status] = counts.get(status, 0) + 1
        summary.append(
            f"Head {head_sha[:12]} shared by {len(shared_pulls)} PR(s): {status}."
        )

    _append_summary(summary or ["No open pull requests target the default branch."])
    for line in summary:
        print(line)
    totals = ", ".join(
        f"{key}={value}" for key, value in counts.items()
    )
    print(f"Trusted AI review status sweep: {totals}")
    return counts


def main() -> int:
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    token = os.environ.get("GH_TOKEN", "")
    try:
        counts = sweep_open_pull_requests(repo, token)
    except Exception as exc:  # noqa: BLE001 - make the CLI fail closed on all unexpected errors
        message = (
            f"Trusted AI review status sweep failed closed ({type(exc).__name__})."
        )
        print(f"::error::{message}")
        _append_summary([message])
        return 1
    return 1 if counts.get("error", 0) else 0


if __name__ == "__main__":
    raise SystemExit(main())
