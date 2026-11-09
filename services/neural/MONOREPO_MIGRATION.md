# NEURAL monorepo mirror provenance

- Mirror repository: `GLORIFIER7/GLORIFIER`
- Mirror path: `services/neural/`
- Upstream source repository: `GLORIFIER7/GLORIFIER-NEURAL`
- Upstream ref: `fix/neural-auth-sync-regressions-2026-11-09` (PR #82; not merged)
- Upstream source commit: `62f3623bbdfd621f6e0d6c7eccb99d1cebe48444`
- Source commit timestamp (UTC): `2026-11-09T11:06:42Z`
- Synchronization target: PR #82 current head; exact-head checks and review pending; not merged to either repository's `main`

The standalone NEURAL repository remains the authoritative source for shared NEURAL service code. This directory is a content mirror and does not preserve the standalone repository's commit graph. The mirror should be re-synchronized to the standalone `main` commit after PR #82 is approved and merged; this PR snapshot must not be represented as an upstream-main sync before that happens.

Repository-specific GitHub Actions workflows remain in the GLORIFIER root and are intentionally excluded from the mirror. Tests that assert standalone-only workflow contracts are adapted to the actual GLORIFIER root workflows. Monorepo-only extensions remain in place: in particular, the governed vLLM adapter and its registration are GLORIFIER-specific and are not removed by the NEURAL source synchronizer.

Synchronization changes are submitted as reviewed pull requests. No automatic merge, branch-protection bypass, or production deployment is permitted.
