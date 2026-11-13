#!/usr/bin/env bash
set -euo pipefail

glorifier_ai_maintenance_authorized() {
  local event_name="${1:-}"
  local manual_inference_authorization="${2:-}"
  local actor_id="${3:-}"
  local run_attempt="${4:-}"

  case "$event_name" in
    workflow_dispatch)
      # GLORIFIER7 owner account only, explicit opt-in, and first attempt only.
      [[ "$manual_inference_authorization" == "true" \
        && "$actor_id" == "32674233" \
        && "$run_attempt" == "1" ]]
      ;;
    schedule)
      # Scheduled maintenance must never call an external model provider.
      return 1
      ;;
    *)
      return 1
      ;;
  esac
}

glorifier_gemini_free_tier_authorized() {
  local event_name="${1:-}"
  local free_tier_confirmed="${2:-}"
  local actor_id="${3:-}"
  local run_attempt="${4:-}"
  local git_ref="${5:-}"
  local manual_consent="${6:-}"

  # This route is limited to the repository default branch and the owner-confirmed
  # Gemini free tier. It never enables paid fallback or another provider.
  [[ "$free_tier_confirmed" == "true" && "$git_ref" == "refs/heads/main" ]] || return 1

  case "$event_name" in
    schedule)
      return 0
      ;;
    workflow_dispatch)
      [[ "$manual_consent" == "true" \
        && "$actor_id" == "32674233" \
        && "$run_attempt" == "1" ]]
      ;;
    *)
      return 1
      ;;
  esac
}
