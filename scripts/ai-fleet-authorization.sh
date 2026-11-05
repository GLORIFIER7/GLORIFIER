#!/usr/bin/env bash
set -euo pipefail

glorifier_ai_maintenance_authorized() {
  local event_name="${1:-}"
  local input_authorization="${2:-}"
  local schedule_authorization="${3:-}"

  if [[ "$event_name" == "workflow_dispatch" && "$input_authorization" == "true" ]]; then
    return 0
  fi

  if [[ "$event_name" == "schedule" && "$schedule_authorization" == "true" ]]; then
    return 0
  fi

  return 1
}
