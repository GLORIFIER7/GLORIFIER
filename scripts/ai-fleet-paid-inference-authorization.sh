#!/usr/bin/env bash
set -euo pipefail

glorifier_ai_fleet_paid_inference_authorized() {
  local event_name="${1:-}"
  local allow_paid_inference="${2:-}"

  [[ "$event_name" == "workflow_dispatch" && "$allow_paid_inference" == "true" ]]
}
