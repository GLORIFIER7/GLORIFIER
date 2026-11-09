# NEURAL monorepo mirror provenance

- Mirror repository: `GLORIFIER7/GLORIFIER`
- Mirror path: `services/neural/`
- Upstream source repository: `GLORIFIER7/GLORIFIER-NEURAL`
- Upstream ref: `fix/neural-auth-sync-regressions-2026-11-09` (PR #82; not merged)
- Upstream source commit: `927041967504719cb4dddd341426d4c918493ef8`
- Source commit timestamp (UTC): `2026-11-09T13:07:54Z`
- Synchronization target: PR #82 current head; exact-head checks and review pending; not merged to either repository's `main`

The standalone NEURAL repository remains the authoritative source for shared NEURAL service code. This directory is a content mirror and does not preserve the standalone repository's commit graph. The mirror should be re-synchronized to the standalone `main` commit after PR #82 is approved and merged; this PR snapshot must not be represented as an upstream-main sync before that happens.

Repository-specific GitHub Actions workflows remain in the GLORIFIER root and are intentionally excluded from the mirror. Tests that assert standalone-only workflow contracts are adapted to the actual GLORIFIER root workflows. Monorepo-only extensions remain in place: in particular, the governed vLLM adapter and its registration are GLORIFIER-specific and are not removed by the NEURAL source synchronizer.

Synchronization changes are submitted as reviewed pull requests. No automatic merge, branch-protection bypass, or production deployment is permitted.


Source-to-mirror reconciliation at the recorded source head: the changed NEURAL README, shared application modules, migration, production-readiness document, and shared regression tests are blob-identical. The monorepo retains a local extension in `tests/test_migration_contracts.py` that documents the fixed 720-hour retention boundary across daylight-saving transitions; this extension preserves the upstream migration assertions.


The consolidated source PR also includes the standalone NEURAL Cloudflare Worker preflight for both `GLORIFIER_API_TOKEN` and `GLORIFIER_INTERNAL_SERVICE_TOKEN`. The monorepo counterpart is the root `.github/workflows/neural-cloudflare-worker.yml`, which is checked by the embedded service workflow test; repository-root workflow files remain repository-specific rather than being copied into `services/neural`.
