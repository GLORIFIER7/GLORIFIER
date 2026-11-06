#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/ai-fleet-authorization.sh"

assert_authorization() {
  local event_name="$1"
  local schedule_authorization="$2"
  local expected="$3"
  local actual=false

  if glorifier_ai_maintenance_authorized "$event_name" "$schedule_authorization"; then
    actual=true
  fi

  if [[ "$actual" != "$expected" ]]; then
    echo "Expected $event_name schedule=$schedule_authorization to be $expected, got $actual" >&2
    exit 1
  fi
}

assert_authorization workflow_dispatch true true
assert_authorization workflow_dispatch false false
assert_authorization schedule true true
assert_authorization schedule false false
assert_authorization pull_request true false
assert_authorization push true false
assert_authorization repository_dispatch true false

echo "AI maintenance authorization policy tests passed."
