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
