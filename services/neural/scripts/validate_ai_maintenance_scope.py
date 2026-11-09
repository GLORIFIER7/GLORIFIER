"""Fail-closed path policy for autonomous NEURAL maintenance changes."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path, PurePosixPath


ALLOWED_ROOTS = ("app", "tests")


def _git_bytes(repository: Path, *arguments: str) -> bytes:
    try:
        return subprocess.check_output(
            ["git", *arguments],
            cwd=repository,
            stderr=subprocess.STDOUT,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        detail = getattr(exc, "output", b"")
        message = os.fsdecode(detail).strip()
        raise RuntimeError(message or "Unable to inspect repository changes.") from None


def changed_paths(repository: Path) -> set[str]:
    """Return tracked and untracked changed paths without rename collapsing."""
    tracked = _git_bytes(
        repository,
        "diff",
        "--name-only",
        "--no-renames",
        "-z",
        "HEAD",
    )
    staged = _git_bytes(
        repository,
        "diff",
        "--cached",
        "--name-only",
        "--no-renames",
        "-z",
        "HEAD",
    )
    untracked = _git_bytes(
        repository,
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
    )
    return {
        os.fsdecode(item)
        for item in (tracked + staged + untracked).split(b"\0")
        if item
    }


def _gitlink_paths(repository: Path) -> list[str]:
    """Return indexed nested-repository entries, including alternate-index entries."""
    raw_entries = _git_bytes(repository, "ls-files", "--stage", "-z")
    gitlinks: list[str] = []
    for entry in raw_entries.split(b"\0"):
        if not entry:
            continue
        try:
            metadata, raw_path = entry.split(b"\t", 1)
            mode, _object_id, _stage = metadata.split()
        except ValueError:
            raise RuntimeError("Git returned a malformed index entry.") from None
        path = os.fsdecode(raw_path)
        relative = PurePosixPath(path)
        if mode == b"160000" and any(
            len(relative.parts) > 1 and relative.parts[0] == directory
            for directory in ALLOWED_ROOTS
        ):
            gitlinks.append(path)
    return gitlinks


def _nested_git_metadata(repository: Path) -> list[str]:
    """Find nested .git files/directories without following symlinked directories."""
    found: list[str] = []
    for allowed_root in ALLOWED_ROOTS:
        base = repository / allowed_root
        if not base.is_dir():
            continue
        for current, directories, files in os.walk(base, followlinks=False):
            if ".git" in directories or ".git" in files:
                path = Path(current, ".git").relative_to(repository).as_posix()
                found.append(path)
            directories[:] = [
                name
                for name in directories
                if not (Path(current) / name).is_symlink()
            ]
    return sorted(found)


def validate(repository: Path) -> list[str]:
    """Reject changes outside app/ and tests/, including symlinks and Gitlinks."""
    try:
        root = Path(
            os.fsdecode(
                _git_bytes(repository, "rev-parse", "--show-toplevel").strip()
            )
        ).resolve(strict=True)
        paths = changed_paths(root)
        gitlinks = _gitlink_paths(root)
        nested_git_metadata = _nested_git_metadata(root)
    except (OSError, RuntimeError) as exc:
        raise RuntimeError(f"Scope validation could not run: {exc}") from None

    rejected: list[str] = []
    for path in gitlinks:
        rejected.append(
            f"Rejected Gitlink (nested repository) in AI maintenance changes: {path}"
        )
    for path in nested_git_metadata:
        rejected.append(f"Rejected nested Git metadata: {path}")

    for raw_path in sorted(paths):
        relative = PurePosixPath(raw_path)
        allowed = any(
            len(relative.parts) > 1 and relative.parts[0] == directory
            for directory in ALLOWED_ROOTS
        )
        if relative.is_absolute() or ":" in raw_path or ".." in relative.parts or not allowed:
            rejected.append(f"Rejected AI change outside app/ and tests/: {raw_path}")
            continue

        candidate = root.joinpath(*relative.parts)
        if candidate.is_symlink():
            rejected.append(f"Rejected symlink change: {raw_path}")

    return rejected


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate autonomous NEURAL maintenance file scope."
    )
    parser.add_argument(
        "--repo",
        type=Path,
        default=Path.cwd(),
        help="Repository path to inspect (defaults to the current directory).",
    )
    arguments = parser.parse_args()

    try:
        rejected = validate(arguments.repo)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    if rejected:
        for message in rejected:
            print(message, file=sys.stderr)
        return 1

    print("AI maintenance scope is limited to app/ and tests/.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
