# PostgreSQL provider authority and Cloudflare migration runbook

**Decision:** Neon PostgreSQL is the recommended canonical database for GLORIFIER.  
**Decision status:** approved as the repository target architecture; production Worker cutover is **NOT VERIFIED / NOT PERFORMED**.  
**Reviewed:** 2026-11-01  
**Budget constraint:** zero-cost / Free plan only unless the owner separately approves spending.

## Why Neon is the better primary database

The current evidence favors retaining Neon rather than migrating the entire database to Supabase:

- Neon project: `frosty-leaf-46030505`, database `glorifier`, PostgreSQL 18, Free plan, default `main` branch ready.
- Neon reports 661,938,176 bytes of logical database size and 141 public base tables.
- Neon Free storage increased to 1 GB per project on 2026-10-02. The observed database size is below that allowance. The Free allowance remains subject to compute-hour and network-transfer limits.
- Supabase project: `ymbhbxrobfpqlxhyulbt`, PostgreSQL 17.11. Its Free plan currently provides 500 MB of database storage, so it cannot accommodate the full observed 662 MB Neon database without reducing the dataset or changing the plan.
- Cloudflare Workers officially supports Neon through Hyperdrive. Cloudflare recommends Hyperdrive for pooled database access from Workers; Hyperdrive is included in Workers plans.

Sources:
- [Neon Free plan limits and quotas](https://neon.com/docs/introduction/free-plan)
- [Neon 1 GB Free storage announcement (2026-10-02)](https://neon.com/blog/neon-free-plan-1-gb-per-project)
- [Supabase database size and billing limits](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Cloudflare Workers: Neon integration](https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/)

Supabase remains a viable managed backend product when its Auth, Storage, Realtime, and Data API capabilities are specifically required and the plan fits the data size. Those features do not outweigh the current data-preservation and zero-budget advantages of Neon for this GLORIFIER deployment.

## Fresh read-only evidence — 2026-11-01

### Six shared operational tables

| Table | Neon rows | Supabase rows |
|---|---:|---:|
| `connection_approvals` | 9 | 0 |
| `connection_events` | 251,212 | 0 |
| `connection_registry` | 30 | 0 |
| `intelligence_analyses` | 266 | 0 |
| `intelligence_evidence` | 1,099 | 0 |
| `intelligence_reports` | 133 | 0 |
| **Total** | **252,749** | **0** |

The six table definitions have matching column names, order, data types, nullability, and defaults in the two databases. Primary keys and the corresponding operational foreign-key relationships were observed in both.

**Index definitions differ.** Neon has `idx_connection_events_connection_time(connection_id, created_at DESC)`, `idx_connection_registry_provider(provider)`, and `idx_connection_registry_status(status)` that were not present in Supabase. Supabase has additional single-column indexes on approval/event connection IDs and analysis report IDs. Do not treat these two schemas as fully equivalent or drop/add indexes without workload and migration evidence.

Supabase has restrictive `glorifier_deny_client_roles` policies on all six operational tables for `anon` and `authenticated`, with `USING (false)` and `WITH CHECK (false)`. Its security advisor returned zero findings. The Cloudflare Worker currently uses Supabase PostgREST for reporting; the production Worker is therefore **not yet cut over to Neon**.

### Live Cloudflare checks

Fresh GET probes against `https://glorifier.glorifier.workers.dev` at approximately 2026-11-01T15:04Z returned:

| Endpoint | Result | Meaning |
|---|---|---|
| `/api/health` | HTTP 200 | Worker/assets liveness only |
| `/api/reports/summary` | HTTP 200 | Supabase PostgREST exact counts; six tables returned zero |
| `/api/runtime-verification?probeAi=false` | HTTP 200 | Worker/assets and Supabase exact-count probe passed; Neural not configured; authentication and AI not probed |
| `/api/identity` | HTTP 503 | Canonical domain / organization email identity is not configured |
| `/api/neural/health` | HTTP 503 | `NEURAL_ORIGIN_NOT_CONFIGURED` |

A successful Worker health response does not prove database authority, authentication readiness, Neural availability, provider inference, or full system readiness.

## Authority model

1. **Neon is the designated canonical PostgreSQL database for business and operational records.** It is the data-bearing database already recorded in the repository provider runbook and retains the larger dataset.
2. **Supabase is a legacy/compatibility data path, not an independently writable peer.** Its six empty tables must not be treated as a synchronized replica.
3. **No dual writes.** Until a reviewed Hyperdrive implementation is deployed and verified, keep existing routes unchanged and clearly report which provider each route reads or writes.
4. **No data deletion.** Preserve Neon as the source and retain the Supabase project until the owner authorizes its retirement after cutover verification.
5. **No automatic sync assumption.** PostgreSQL schemas do not replicate merely because both databases contain similarly named tables.

## Cloudflare Worker integration target

Use Cloudflare Hyperdrive to connect the Worker to Neon through a dedicated least-privilege PostgreSQL role.

- Provision Hyperdrive in the GLORIFIER Cloudflare account with the Neon `glorifier` database connection string. The connection string must be entered only into Cloudflare's secure configuration; never store it in source control, issue comments, build logs, or chat.
- Bind the Hyperdrive configuration to the Worker as `HYPERDRIVE`.
- Use a dedicated non-superuser database role for the Worker. Begin with `SELECT` only on the reporting tables. Do not grant schema ownership, superuser, `BYPASSRLS`, or broad database privileges.
- Use the standard `pg` driver through Hyperdrive, following the Cloudflare Worker runtime requirements. Keep connection creation request-safe and let Hyperdrive own pooling.
- Add Worker unit tests for successful SQL counts, missing binding, connection errors, query timeouts, malformed results, and exact response shape. Add a staging integration test against a non-production Neon branch.
- Migrate one route group at a time. Compare live counts and deterministic per-table checksums before promoting the Neon-backed implementation.
- Only after all required Worker routes and checks pass should the Supabase service-role secret/URL be removed from Worker configuration. Retain the Supabase project read-only until owner-approved retirement.

The existing Worker uses Supabase REST today. Merely adding a Hyperdrive binding or changing documentation does not change runtime database routing.

## Required cutover gates

- [ ] Owner confirms Neon as the canonical production database and the current write paths.
- [ ] Neon backup/snapshot and tested restore path recorded; no source data is deleted.
- [ ] Dedicated Neon Worker role created with least privilege; role grants inspected.
- [ ] Cloudflare Hyperdrive configured and bound to a non-production Worker first.
- [ ] Worker code uses Hyperdrive for the approved route group; no silent Supabase fallback.
- [ ] Exact row counts match for every migrated table.
- [ ] Deterministic, primary-key-ordered per-table checksums match; sensitive row values are not written to logs.
- [ ] Primary keys, foreign keys, sequences, indexes, constraints, and required extensions reconciled.
- [ ] Worker unit tests, source CI, Linux CI, security checks, and staging integration pass.
- [ ] Live Worker runtime verification reports Neon as the database source and exact-count probes pass.
- [ ] Rollback to the previous Worker version and known-good database path is documented and tested.
- [ ] Owner separately approves production binding/secret changes and deployment.

## Rollback and safety

- Keep Neon unchanged and available throughout the transition.
- Do not truncate, reset, drop, or overwrite either database during the verification phase.
- Do not update existing production routes to Neon until the staging integration is green and a rollback build exists.
- Do not use Supabase and Neon as simultaneous authoritative write targets.
- Do not upgrade a plan, accept a charge, create paid infrastructure, or enable a paid add-on without explicit approval.
- After cutover, retain the previous Worker version and Supabase configuration until the agreed observation window and owner-approved retirement.

## Current status

**PARTIALLY VERIFIED.** Neon is the recommended canonical database and its current data is reachable after the quota reset. Supabase's six table schemas largely match at the column/foreign-key level but are empty, and index definitions differ. The Worker still reports against Supabase. Hyperdrive configuration, Worker SQL implementation, dedicated role, live Neon Worker query, complete schema/index reconciliation, and production cutover have not been performed.

This runbook does not claim that the Worker is already connected to Neon or that the whole GLORIFIER system is fully verified.
