#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

mode="${1:-preview}"
case "$mode" in
  preview|deploy|--prepare-only) ;;
  *)
    echo "Usage: bash ./worker-build.sh [preview|deploy|--prepare-only]" >&2
    exit 64
    ;;
esac

# Stage the application package into the local Worker dependency before resolving it.
python prepare_worker.py

# Pywrangler vendors the production Pyodide packages into python_modules/.
# Its host virtual environments are build tools, not Worker runtime modules.
uv run --locked pywrangler sync

for expected in python_modules/app/api.py python_modules/app/database/neon.py; do
  if [[ ! -f "$expected" ]]; then
    echo "Missing vendored Worker application module: $expected" >&2
    exit 1
  fi
done

# Prevent Wrangler from bundling CPython and Pyodide build environments beside
# the intended python_modules/ package tree (which causes duplicate dist-info).
rm -rf -- .venv .venv-workers

if [[ -e .venv || -e .venv-workers ]]; then
  echo "Temporary Python environments remain inside the Worker bundle root." >&2
  exit 1
fi

if [[ "$mode" == "--prepare-only" ]]; then
  echo "Worker dependencies are vendored and build-only environments are removed."
  exit 0
fi

exec npx wrangler "$mode"
