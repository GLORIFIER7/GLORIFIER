#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/ai-fleet-paid-inference-authorization.sh"

assert_authorization() {
  local event_name="$1"
  local allow_paid_inference="$2"
  local expected="$3"
  local actual=false

  if glorifier_ai_fleet_paid_inference_authorized "$event_name" "$allow_paid_inference"; then
    actual=true
  fi

  if [[ "$actual" != "$expected" ]]; then
    printf 'Expected event=%s allow_paid_inference=%s to return %s, got %s\n' \
      "$event_name" "$allow_paid_inference" "$expected" "$actual" >&2
    exit 1
  fi
}

assert_authorization schedule true false
assert_authorization schedule false false
assert_authorization workflow_dispatch false false
assert_authorization workflow_dispatch true true
assert_authorization push true false
assert_authorization workflow_dispatch TRUE false

echo "AI fleet paid-inference authorization regression tests passed."
