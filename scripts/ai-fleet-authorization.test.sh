#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/ai-fleet-authorization.sh"

assert_authorization() {
  local event_name="$1"
  local input_authorization="$2"
  local schedule_authorization="$3"
  local expected="$4"
  local actual=false

  if glorifier_ai_maintenance_authorized "$event_name" "$input_authorization" "$schedule_authorization"; then
    actual=true
  fi

  if [[ "$actual" != "$expected" ]]; then
    echo "Expected $event_name input=$input_authorization schedule=$schedule_authorization to be $expected, got $actual" >&2
    exit 1
  fi
}

assert_authorization workflow_dispatch true false true
assert_authorization workflow_dispatch false true false
assert_authorization workflow_dispatch "" true false
assert_authorization schedule "" true true
assert_authorization schedule true false false
assert_authorization pull_request true true false
assert_authorization workflow_dispatch TRUE true false

echo "AI maintenance authorization policy tests passed."
