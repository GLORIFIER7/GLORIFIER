# GEAS Architecture Scan Operations and Evidence Policy

## Purpose

Keep the Enterprise Architecture Scientist read-only, reproducible, and economical to operate. This document describes scanner behavior and the controls required before any historical-data maintenance.

## Scan scheduling

- The dedicated GEAS scanner daemon is the sole scheduled owner of architecture scans.
- The general GLORIFIER daemon must not run the architecture scanner on its five-minute orchestration cadence.
- `GEAS_ARCHITECTURE_SCAN_ENABLED=false` disables the dedicated scanner.
- `GEAS_ARCHITECTURE_SCAN_INTERVAL_HOURS` controls the dedicated schedule; default is one hour, values are bounded to at least one hour, and non-finite values fall back to one hour.
- With persistence enabled, a PostgreSQL lease is the cross-instance overlap guard; a lease conflict fails visibly rather than starting a second scan. `GEAS_SCAN_PERSIST=false` bypasses that database lease, so operators must ensure only one scanner process is active in that mode.

## Source cache correctness

- A cached observation is reusable only when the configured source URL exactly matches the URL recorded with the observation.
- A URL change invalidates the cached observation immediately.
- Failed source observations become eligible for refresh after one hour. The dedicated scanner runs hourly by default, while successful observations remain cached until their source cadence expires. Scheduling and source availability still mean this is not a guaranteed one-hour retry SLA.
- Source fetches remain HTTPS-only and same-host across redirects. Do not weaken redirect protections to accommodate a stale registry URL.
- Source reachability and keyword matches are not claim verification. Missing or inaccessible evidence remains UNKNOWN / NOT OBSERVABLE.

## Provenance and policy versioning

- Scan results record the repository revision from `GITHUB_SHA`; if it is unavailable, the result remains `unknown` and must not be described as reproducible.
- The source policy version must match `docs/architecture/geas-authoritative-source-registry.json`.
- The source registry and evidence policy are separate concepts; any future divergence must use separate explicitly named version fields.

## Scan history and storage

Routine scans write/update current source observations and persist scan/evidence records when persistence is enabled. Historical scan records are audit evidence. **This refinement does not automatically delete or rewrite historical scan history.** Before enabling retention or purging historical rows, a human owner must approve the retention period, archive destination, restore test, audit requirements, and rollback plan.

Recommended staged policy for a later, separately reviewed change:

1. Measure table size, daily row growth, and how many scans materially change source hashes/findings.
2. Add change-based full snapshots plus a compact run ledger with timestamps, revision, source hashes, and finding deltas.
3. Archive records older than the approved retention period to a verified durable destination.
4. Verify archive row counts and checksums and perform a restore test.
5. Only then consider deletion of archived rows, with explicit approval and a dry-run report.

No retention period or destructive SQL is enabled by this refinement.

## Acceptance criteria

- Unit tests cover URL-change invalidation, bounded retries for failed sources, and source-policy version consistency.
- GEAS registry/cadence validators confirm active scanner IDs, authority, domain, canonical URL, claim allow-lists, and review cadence match the authoritative registry; duplicate URLs are intentional and documented.
- Runtime verification records the deployed revision, scan cadence, lease outcomes, source freshness, and database growth.
- No production database rows, credentials, deployments, payments, blockchain state, or other irreversible resources are changed automatically.
