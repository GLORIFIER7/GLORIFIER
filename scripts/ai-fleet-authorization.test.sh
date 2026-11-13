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


assert_gemini_authorization() {
  local event_name="$1"
  local free_tier_confirmed="$2"
  local actor_id="$3"
  local run_attempt="$4"
  local git_ref="$5"
  local manual_consent="$6"
  local expected="$7"
  local actual=false

  if glorifier_gemini_free_tier_authorized "$event_name" "$free_tier_confirmed" "$actor_id" "$run_attempt" "$git_ref" "$manual_consent"; then
    actual=true
  fi
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected Gemini free-tier authorization event=$event_name confirmed=$free_tier_confirmed actor=$actor_id attempt=$run_attempt ref=$git_ref manual=$manual_consent to be $expected, got $actual" >&2
    exit 1
  fi
}

# Daily scheduled work is permitted only on main after explicit free-tier confirmation.
assert_gemini_authorization schedule true "" 1 refs/heads/main false true
assert_gemini_authorization schedule false "" 1 refs/heads/main false false
assert_gemini_authorization schedule true "" 1 refs/heads/feature false false

# Manual runs additionally require the owner, first attempt, main, and explicit opt-in.
assert_gemini_authorization workflow_dispatch true 32674233 1 refs/heads/main true true
assert_gemini_authorization workflow_dispatch true 32674233 1 refs/heads/main false false
assert_gemini_authorization workflow_dispatch true 12345678 1 refs/heads/main true false
assert_gemini_authorization workflow_dispatch true 32674233 2 refs/heads/main true false
assert_gemini_authorization workflow_dispatch true 32674233 1 refs/heads/feature true false
assert_gemini_authorization pull_request true 32674233 1 refs/heads/main true false

echo "AI maintenance authorization policy tests passed."
