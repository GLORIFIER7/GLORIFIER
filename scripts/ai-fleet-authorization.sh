#!/usr/bin/env bash
set -euo pipefail

glorifier_ai_maintenance_authorized() {
  local event_name="${1:-}"
  local schedule_authorization="${2:-}"

  case "$event_name" in
    workflow_dispatch|schedule)
      [[ "$schedule_authorization" == "true" ]]
      ;;
    *)
      return 1
      ;;
  esac
}
