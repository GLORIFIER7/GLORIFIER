# GEAS Architecture Scan Operations and Evidence Policy

## Purpose

Keep the Enterprise Architecture Scientist read-only, reproducible, and economical to operate. This document describes scanner behavior and the controls required before any historical-data maintenance.

## Scan execution modes

- The dedicated application GEAS scanner daemon is the intended persistent scanner owner when enabled. `GEAS_ARCHITECTURE_SCAN_ENABLED=false` disables that daemon.
- The GitHub Actions artifact-only scan is a separate execution path. It runs on the six-hour schedule `17 */6 * * *` and also on the workflow's configured pull-request/manual triggers. It sets `GEAS_SCAN_PERSIST=false`, uploads the JSON scan artifact, does not load previous PostgreSQL source observations, does not write scan/evidence/source-observation rows, and does not acquire the PostgreSQL lease.
- Persistence-disabled execution has a strict single-process precondition: one active scanner process at a time. The workflow concurrency group `geas-architecture-scan` with `cancel-in-progress: false` serializes GitHub Actions invocations only and does not coordinate with the application daemon. Keep the application daemon disabled during the artifact-only workflow unless a shared cross-process lock is independently established; otherwise duplicate public-source fetches can overlap and the single-process precondition is not met.
- Because the artifact-only path has no prior source observations, it cannot reuse ETag or Last-Modified validators across CI runs and performs full source fetches for active sources. Conditional requests are available only when a persistent scanner has an admissible prior observation with the exact configured URL and a current timestamp.
- Do not enable `GEAS_SCAN_PERSIST=true` in GitHub Actions merely to reuse the database cache; that would write to the configured database. A non-production file/artifact cache is a separate future design and is not implemented.
- The general GLORIFIER daemon must not run the architecture scanner on its five-minute orchestration cadence.
- `GEAS_ARCHITECTURE_SCAN_INTERVAL_HOURS` controls the dedicated daemon schedule; default is one hour, values are bounded to at least one hour, and non-finite values fall back to one hour.
- With persistence enabled, a PostgreSQL lease is the cross-instance overlap guard; a lease conflict fails visibly rather than starting a second scan. When persistence is disabled, that database lease is bypassed and no cross-process coordination is provided.

## Source cache correctness

- A cached observation is reusable only when the configured source URL exactly matches the URL recorded with the observation.
- A URL change invalidates the cached observation immediately.
- Conditional requests send ETag/Last-Modified validators only from an admissible cached observation with the exact configured URL; a 304 response may reuse evidence only when the final URL and observation timeline remain valid.
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
