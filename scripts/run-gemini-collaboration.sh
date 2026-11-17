#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
: "${GEMINI_MODEL:?GEMINI_MODEL is required}"
: "${GEMINI_PROMPT:?GEMINI_PROMPT is required}"

GEMINI_OUTPUT="${GEMINI_OUTPUT:-$RUNNER_TEMP/gemini-output.json}"
GEMINI_ERROR="$(mktemp "$RUNNER_TEMP/gemini-error.XXXXXX")"
trap 'rm -f "$GEMINI_ERROR"' EXIT

if gemini --skip-trust --model "$GEMINI_MODEL" --approval-mode auto_edit --prompt "$GEMINI_PROMPT" --output-format json > "$GEMINI_OUTPUT" 2> "$GEMINI_ERROR"; then
  python - "$GEMINI_OUTPUT" "$GITHUB_OUTPUT" <<'PY'
import json
import secrets
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)
response = payload.get("response")
if not isinstance(response, str) or not response.strip():
    raise SystemExit("Gemini CLI returned an empty response.")
delimiter = "GEMINI_" + secrets.token_hex(16)
while delimiter in response:
    delimiter = "GEMINI_" + secrets.token_hex(16)
with open(sys.argv[2], "a", encoding="utf-8") as handle:
    handle.write(f"summary<<{delimiter}\\n")
    handle.write(response)
    handle.write(f"\\n{delimiter}\\n")
PY
  exit 0
else
  cli_status=$?
  if grep -Eiq '"code"[[:space:]]*:[[:space:]]*503|"status"[[:space:]]*:[[:space:]]*503|status:[[:space:]]*503|"status"[[:space:]]*:[[:space:]]*"UNAVAILABLE"' "$GEMINI_ERROR"; then
    printf 'provider_unavailable=true\\n' >> "$GITHUB_OUTPUT"
    echo "::warning::Gemini API returned HTTP 503 (temporarily overloaded or unavailable) after the CLI exhausted its retries. No fallback provider or paid tier was used; no patch will be published."
    exit 0
  fi

  cat "$GEMINI_ERROR" >&2
  exit "$cli_status"
fi
