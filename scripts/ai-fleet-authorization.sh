#!/usr/bin/env bash
set -euo pipefail

glorifier_ai_maintenance_authorized() {
  local event_name="${1:-}"
  local manual_inference_authorization="${2:-}"

  case "$event_name" in
    workflow_dispatch)
      [[ "$manual_inference_authorization" == "true" ]]
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
