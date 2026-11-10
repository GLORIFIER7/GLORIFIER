#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/ai-fleet-authorization.sh"

assert_authorization() {
  local event_name="$1"
  local authorization="$2"
  local actor_id="$3"
  local run_attempt="$4"
  local expected="$5"
  local actual=false

  if glorifier_ai_maintenance_authorized "$event_name" "$authorization" "$actor_id" "$run_attempt"; then
    actual=true
  fi

  if [[ "$actual" != "$expected" ]]; then
    echo "Expected $event_name authorization=$authorization actor_id=$actor_id run_attempt=$run_attempt to be $expected, got $actual" >&2
    exit 1
  fi
}

# Only the repository owner can authorize the first attempt of a manual run.
assert_authorization workflow_dispatch true 32674233 1 true
assert_authorization workflow_dispatch false 32674233 1 false
assert_authorization workflow_dispatch true 12345678 1 false
assert_authorization workflow_dispatch true "" 1 false
assert_authorization workflow_dispatch true 32674233 2 false
assert_authorization workflow_dispatch true 32674233 "" false

# Scheduled and all other event types must never authorize provider inference.
assert_authorization schedule true 32674233 1 false
assert_authorization schedule false 32674233 1 false
assert_authorization pull_request true 32674233 1 false
assert_authorization push true 32674233 1 false
assert_authorization repository_dispatch true 32674233 1 false

echo "AI maintenance authorization policy tests passed."
