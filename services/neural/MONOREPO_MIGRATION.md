# NEURAL monorepo mirror provenance

- Mirror repository: `GLORIFIER7/GLORIFIER`
- Mirror path: `services/neural/`
- Upstream source repository: `GLORIFIER7/GLORIFIER-NEURAL`
- Upstream ref: `fix/neural-post-merge-hardening-2026-11-09` (PR #83; open)
- Upstream source commit: `af828f6a5548cca55690d6181a5497db55d90da2`
- Source commit timestamp (UTC): `2026-11-09T13:46:20Z`
- Synchronization target: PR #83 current source head; not yet merged to either repository's `main`
- Previous upstream sync: PR #82 merged to NEURAL `main` at `3887e0b17504581a519335a9368f718e46be56c9`

The standalone NEURAL repository remains the authoritative source for shared NEURAL service code. This directory is a content mirror and does not preserve the standalone repository's commit graph. The mirror should be re-synchronized to the standalone `main` commit after PR #83 is approved and merged; this PR snapshot must not be represented as an upstream-main sync before that happens.

Repository-specific GitHub Actions workflows remain in the GLORIFIER root and are intentionally excluded from the mirror. Tests that assert standalone-only workflow contracts are adapted to the actual GLORIFIER root workflows. Monorepo-only extensions remain in place: in particular, the governed vLLM adapter and its registration are GLORIFIER-specific and are not removed by the NEURAL source synchronizer.

Synchronization changes are submitted as reviewed pull requests. No automatic merge, branch-protection bypass, or production deployment is permitted.


PR #83 source-to-mirror verification: at upstream head `af828f6a5548cca55690d6181a5497db55d90da2`, all six changed NEURAL source/test files are blob-identical in this mirror PR:
- `app/api.py` → `services/neural/app/api.py`
- `app/database/neon.py` → `services/neural/app/database/neon.py`
- `app/providers/http.py` → `services/neural/app/providers/http.py`
- `tests/test_api.py` → `services/neural/tests/test_api.py`
- `tests/test_neon.py` → `services/neural/tests/test_neon.py`
- `tests/test_provider_http.py` → `services/neural/tests/test_provider_http.py`

The monorepo retains a local extension in `tests/test_migration_contracts.py` that documents the fixed 720-hour retention boundary across daylight-saving transitions; this extension preserves the upstream migration assertions.


The consolidated source PR also includes the standalone NEURAL Cloudflare Worker preflight for both `GLORIFIER_API_TOKEN` and `GLORIFIER_INTERNAL_SERVICE_TOKEN`. The monorepo counterpart is the root `.github/workflows/neural-cloudflare-worker.yml`, which is checked by the embedded service workflow test; repository-root workflow files remain repository-specific rather than being copied into `services/neural`.


## Recursive repository-tree reconciliation (2026-11-09)

The audit compared the recursive Git blob trees at GLORIFIER main `c9d5404732f347b8ae1a43081fd7ed3ccecbbaef` and NEURAL main `3887e0b17504581a519335a9368f718e46be56c9`, mapping each NEURAL path to the same path under `services/neural/`:

- NEURAL standalone tree: 96 files.
- GLORIFIER `services/neural/` mirror tree: 89 files.
- Same-path, byte-identical blobs: 74.
- Same-path files intentionally adapted for monorepo use: 12.
- Standalone-only paths not copied into the service subdirectory: 10.
- GLORIFIER-only additions inside the service subdirectory: 3.

The 12 intentional same-path adaptations are:
- `app/runtime.py` and `tests/test_provider_runtime_selection.py`: preserve the GLORIFIER-only governed vLLM adapter and its tests.
- `docs/AI_REVIEW_POLICY.md`: documents the monorepo's root-level trusted status publisher.
- `scripts/validate_ai_maintenance_scope.py`: retains the executable Python shebang used by the monorepo copy.
- `tests/test_ai_maintenance_scope.py`, `tests/test_ai_review_status.py`, `tests/test_ci_workflow_security.py`, `tests/test_cloudflare_workflow.py`, `tests/test_octopus_deploy_workflow.py`, `tests/test_octopus_task_output.py`, and `tests/test_trusted_ai_review_workflow.py`: adapt workflow paths and assertions to the monorepo's root-level workflows rather than copying standalone workflow definitions into the service directory.
- `tests/test_migration_contracts.py`: adds the GLORIFIER-specific exact 720-hour retention assertion across daylight-saving transitions.

The 10 standalone-only paths are `.github/dependabot.yml`, the eight standalone workflow files under `.github/workflows/` (`ai-maintenance.yml`, `ai-review-policy-trusted.yml`, `ci.yml`, `cloudflare-neural-worker.yml`, `codeql.yml`, `database-integration.yml`, `octopus-deploy.yml`, and `trusted-ai-review-policy.yml`), and `LICENSE`. These files are not duplicated under `services/neural/`: repository-level automation remains at the GLORIFIER root, and the standalone LICENSE blob is identical to the GLORIFIER repository-root LICENSE blob.

The three GLORIFIER-only additions are `MONOREPO_MIGRATION.md`, `app/providers/vllm.py`, and `tests/test_vllm_provider.py`.

This is a classified mirror, not a blind directory copy. The 12 adaptations, 10 exclusions, and 3 monorepo additions are intentional boundaries; shared files without a documented repository-specific reason must remain blob-identical.