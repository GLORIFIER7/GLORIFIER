# NVIDIA NIM + Brev evaluation for GLORIFIER

## Goal

Use the existing hosted NVIDIA NIM API for low-cost CI failure diagnosis first. Evaluate NVIDIA Brev as optional GPU compute only after checking available credits and storage costs. This plan does not provision a GPU, create a Brev instance, or change production deployment.

## NVIDIA NIM CI triage

Workflow: [NVIDIA CI Failure Triage](../.github/workflows/nvidia-ci-triage.yml)

- Automatically analyzes failed `GLORIFIER CI` runs on `main`, and can be manually dispatched for a failed main-branch run ID.
- Reads a bounded tail of failed-step logs, redacts common API-key formats, and sends the sanitized log excerpt to NVIDIA NIM.
- Publishes a clearly labeled, unverified AI diagnosis as a job summary and short-lived artifact.
- Has read-only repository permissions. It does not edit source, create PRs, merge, or deploy.
- Uses `NVIDIA_API_KEY` from GitHub Actions secrets and optionally `NVIDIA_MODEL`. The default model is `nvidia/nemotron-3.5-super-vl-120b-a12b`.
- If the key is absent or the model request fails, the workflow fails with a bounded diagnostic and does not print the provider response body.

### Enable NIM triage

1. Open repository Settings → Secrets and variables → Actions.
2. Add `NVIDIA_API_KEY` only if you have an active NVIDIA API key. Never commit it or paste it into issues/chat.
3. Optionally add `NVIDIA_MODEL` if you want to override the default model.
4. Open Actions → NVIDIA CI Failure Triage → Run workflow.
5. For manual testing, enter the ID of a failed `GLORIFIER CI` run from the `main` branch.
6. Review the job summary; treat the AI diagnosis as a hypothesis until a human confirms it and CI passes.

Logs are sent to NVIDIA's inference API after basic redaction. Do not use this workflow for logs containing highly sensitive customer data or secrets. Redaction is defense-in-depth, not a guarantee that every secret format will be detected.

## Brev evaluation — no-cost-first gate

**Do not create or start a Brev instance as part of this evaluation.** The current CI build is CPU-based Node.js/TypeScript work; no evidence currently shows it needs GPU compute. Brev is more appropriate for GPU-dependent workloads, such as running a self-hosted NVIDIA NIM container or benchmarking a GPU model.

Before any provisioning:

1. Open the Brev console and inspect Billing/Usage, available credits, storage charges, and auto-recharge settings.
2. Review the Launchables you already own; prefer an existing environment over creating a new one.
3. Identify the exact workload that requires a GPU and compare it against the existing hosted NIM API.
4. Estimate total runtime and persistent-storage cost. Stopping an instance stops compute charges but may leave storage charges; deleting it ends charges but deletes its instance data.
5. Require explicit owner approval before creating or starting an instance, adding a Brev API key to GitHub, enabling auto-recharge, or running a GPU job.

If a later approved CI workflow provisions Brev resources, it must use a narrowly scoped secret, a fixed instance configuration, a strict timeout, and an unconditional cleanup step (for example, `if: always()`). It must never create resources from untrusted pull-request code.

## Verification status

- Repository change: proposed on a review branch; not yet merged.
- Live NVIDIA triage: not verified until a run succeeds using the repository secret.
- Brev: evaluation only; no instance was created and no billing action was taken.
