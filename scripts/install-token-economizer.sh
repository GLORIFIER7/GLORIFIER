#!/usr/bin/env bash
set -euo pipefail

# TokenEconomizer is installed for a person's local Codex sessions, not CI runners.
readonly UPSTREAM_URL="https://github.com/microsoft/TokenEconomizer.git"
readonly UPSTREAM_COMMIT="b57d03f81585a18b936a0eaecbd1eb51cdcecf71"
readonly DEFAULT_INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/glorifier/integrations"
readonly INSTALL_DIR="${TOKENECONOMIZER_INSTALL_DIR:-$DEFAULT_INSTALL_ROOT/TokenEconomizer}"
readonly PLUGIN_DIR="$INSTALL_DIR/plugin"

usage() {
  cat <<'USAGE'
Usage: bash scripts/install-token-economizer.sh [GLORIFIER_REPOSITORY_PATH]

Installs the pinned Microsoft TokenEconomizer Codex plugin for local developer
sessions. Defaults to the current Git repository.

Environment:
  TOKENECONOMIZER_INSTALL_DIR  Override the stable local checkout path.
  TE_PYTHON                   Python 3.10+ executable (defaults to python3).

The installer enables only model-free micro-skills, proposal-only tool pruning,
and disables the model-judged loop guard. It does not configure API keys,
GitHub Actions, deployment, or auto-merge.
USAGE
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi
if (( $# > 1 )); then
  usage >&2
  exit 2
fi

for required in git codex; do
  if ! command -v "$required" >/dev/null 2>&1; then
    echo "error: '$required' is required and must be on PATH." >&2
    exit 1
  fi
done

PYTHON_BIN="${TE_PYTHON:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "error: Python 3.10+ executable '$PYTHON_BIN' was not found." >&2
  exit 1
fi
if ! "$PYTHON_BIN" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'; then
  echo "error: TokenEconomizer requires Python 3.10 or newer." >&2
  exit 1
fi
export TE_PYTHON="$PYTHON_BIN"

REPOSITORY_PATH="${1:-$PWD}"
if ! REPOSITORY_ROOT="$(git -C "$REPOSITORY_PATH" rev-parse --show-toplevel 2>/dev/null)"; then
  echo "error: '$REPOSITORY_PATH' is not inside a Git working tree." >&2
  exit 1
fi

mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ -e "$INSTALL_DIR" ]]; then
  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    echo "error: install path exists but is not a Git checkout: $INSTALL_DIR" >&2
    exit 1
  fi
  CURRENT_REMOTE="$(git -C "$INSTALL_DIR" remote get-url origin)"
  if [[ "$CURRENT_REMOTE" != "$UPSTREAM_URL" ]]; then
    echo "error: existing checkout has an unexpected origin: $CURRENT_REMOTE" >&2
    exit 1
  fi
  if [[ -n "$(git -C "$INSTALL_DIR" status --porcelain)" ]]; then
    echo "error: existing TokenEconomizer checkout has local changes; inspect it before updating." >&2
    exit 1
  fi
else
  git clone --filter=blob:none --no-checkout "$UPSTREAM_URL" "$INSTALL_DIR"
fi

git -C "$INSTALL_DIR" fetch --depth 1 origin "$UPSTREAM_COMMIT"
git -C "$INSTALL_DIR" checkout --detach "$UPSTREAM_COMMIT"
ACTUAL_COMMIT="$(git -C "$INSTALL_DIR" rev-parse HEAD)"
if [[ "$ACTUAL_COMMIT" != "$UPSTREAM_COMMIT" ]]; then
  echo "error: upstream commit verification failed (expected $UPSTREAM_COMMIT, got $ACTUAL_COMMIT)." >&2
  exit 1
fi
if [[ ! -x "$PLUGIN_DIR/scripts/te" || ! -f "$PLUGIN_DIR/.codex-plugin/plugin.json" ]]; then
  echo "error: the pinned checkout is missing the expected Codex plugin files." >&2
  exit 1
fi

# Keep optimization local and free of extra model calls by default:
# envfacts is LLM-free, toolprune=propose requires a human to apply changes,
# and loopguard=off disables the judge/nudge side calls.
"$PLUGIN_DIR/scripts/te" --host codex --cwd "$REPOSITORY_ROOT" config set microskills=envfacts toolprune=propose loopguard=off

codex plugin marketplace add "$INSTALL_DIR"
codex plugin add tokeneconomizer@tokeneconomizer

echo
echo "TokenEconomizer checkout verified at: $INSTALL_DIR"
echo "Pinned upstream commit: $ACTUAL_COMMIT"
echo "Repository scope: $REPOSITORY_ROOT"
echo "Default policy: microskills=envfacts, toolprune=propose, loopguard=off"
echo "Next: start Codex in this repository, trust the project, approve the plugin hooks,"
echo "restart the Codex session, then run: \$tokeneconomizer:status"
