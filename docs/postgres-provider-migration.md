# PostgreSQL provider authority and Cloudflare migration runbook

**Decision:** Neon PostgreSQL is the recommended canonical database for GLORIFIER.  
**Decision status:** approved as the repository target architecture; production Worker cutover is **NOT VERIFIED / NOT PERFORMED**.  
**Reviewed:** 2026-11-01  
**Budget constraint:** zero-cost / Free plan only unless the owner separately approves spending.

## Current production checkpoint — 2026-11-02T10:34:22Z

**Status: PARTIALLY VERIFIED — the production operational-reporting and runtime-verification paths use Neon Hyperdrive; system-wide database parity and application cutover are not complete.** This checkpoint supersedes older statements below wherever they conflict. Earlier dated sections are retained as historical audit records.

- Cloudflare Worker `glorifier` production deployment `3c5abfa9-91b3-4ee8-ade5-01b1305d4431` assigns 100% of traffic to version 880, `5a854d11-1f57-4401-80f9-fb39cf036cbf`. Its deployment annotation identifies build commit `46b6f28fc9044556adb2a92845fa6de8e9442a18`.
- The live Worker settings select `GLORIFIER_DATABASE_PROVIDER=neon` and bind `HYPERDRIVE` to configuration `eff847b6c3c64488a989f1fa67d966a0`.
- The production smoke workflow [run 41429845675](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41429845675), executed from current main commit `bd4b62cd15adbae3d5c8bd4ecac6183346745874`, probed the canonical production Worker URL. At 2026-11-02T10:34:22Z:
  - `GET /api/reports/summary`: HTTP 200; source `neon-hyperdrive`; exact counts: approvals 9, events 251,212, registry 30, analyses 266, evidence 1,099, reports 133 (total 252,749).
  - `GET /api/runtime-verification`: HTTP 200; Neon Hyperdrive count probe passed; `connectionRegistryRows=30`.
  - `GET /api/health`: HTTP 200 (Worker/assets liveness only).
  - Unauthenticated `GET /api/app-state`: HTTP 401 (`AUTHENTICATION_REQUIRED`), as expected.
  - `GET /api/identity`: HTTP 503 with an explicit `not-ready` contract because canonical domain ownership and organization email are not configured.
  - Runtime verification reports Neural as not configured; authentication and AI provider calls are not probed.
- The [production E2E workflow](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41429898333) also completed successfully. These workflow results verify only the named probes and E2E scope; they do not prove all application routes, all database objects, authentication flows, AI inference, or external-chain connectivity.
- Neon remains the declared operational source of truth. The six shared Supabase operational tables still have zero rows while Neon has the counts above. This is an intentional, documented data divergence, **not data parity**. No data copy, dual-write, overwrite, or migration was performed.
- The previously audited Worker database role is limited to the security-barrier aggregate reporting view and has no direct base-table SELECT grant. Continue to verify that grant boundary before changing the view or adding reporting columns.
- Preview configuration reuses the same Hyperdrive configuration ID as production. It is a read-only reporting connection, but it is **not a separate Neon staging database**. Do not describe preview execution as data-isolated staging or run write-capable preview code against it.
- Cloudflare observability showed active exception groups whose sampled 502 URLs used a generated preview hostname rather than the canonical production hostname. The sampled 503 requests were `/api/identity` on that preview hostname and match the documented not-ready identity contract. Keep the preview 502 issue open until its full traces and exact cause are established; do not disable issue detection or infer a production outage from preview-only samples.


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
- The draft implementation is now present in `src/lib/neon-worker.ts` and `src/worker.ts` on PR #597: a fixed six-table read-only query, bounded count parsing, per-request client cleanup, and explicit `GLORIFIER_DATABASE_PROVIDER` selection. Neon mode fails closed when `HYPERDRIVE` is absent and does not fall back to Supabase. The Cloudflare Worker workflow passed the adapter tests and Wrangler no-deploy dry run on commit `be467814d61bfddd3115f8451e26192005aae4f3`.
- A live read-only Hyperdrive integration test was completed on 2026-11-02 against Neon `main` through uploaded Worker version 877; this proves real Hyperdrive connectivity but is not an isolated non-production staging test. The adapter CI tests remain separate fake-client contract tests.
- Migrate one route group at a time. Compare live counts and deterministic per-table checksums before promoting the Neon-backed implementation.
- Only after all required Worker routes and checks pass should the Supabase service-role secret/URL be removed from Worker configuration. Retain the Supabase project read-only until owner-approved retirement.

The 2026-11-02 production smoke evidence supersedes that earlier description: the selected operational-reporting and runtime-verification routes now use Neon Hyperdrive. Other legacy routes and all general database write paths remain outside the verified scope.

## Remaining database migration gates

- [x] Owner selected Neon as the canonical operational database target. Per-route production write paths still require an inventory.
- [ ] Neon backup/snapshot and tested restore path recorded; no source data is deleted.
- [x] Dedicated least-privilege Neon Worker role and aggregate-view grant boundary were inspected in the prior read-only audit; re-check before granting additional access.
- [x] Cloudflare Hyperdrive is bound to the production Worker for the verified reporting route group.
- [ ] A separate non-production Neon database/Hyperdrive path is provisioned and verified. Current Wrangler previews reuse the production Hyperdrive ID and are not data-isolated staging.
- [x] Worker code uses Hyperdrive for `GET /api/reports/summary` and `GET /api/runtime-verification`; both passed live production probes.
- [ ] Exact row counts and deterministic, primary-key-ordered checksums match across every table selected for migration. The six shared Supabase operational tables currently have zero rows, so cross-database data parity is not established.
- [ ] Primary keys, foreign keys, sequences, indexes, constraints, and required extensions are reconciled across the complete migration scope.
- [x] Latest source CI, Linux checks, security checks, Cloudflare Worker validation, production smoke, and production E2E checks passed for their declared scopes.
- [ ] Authenticated API/RLS denial tests and isolated staging integration pass for the complete migrated route set.
- [x] Live production runtime verification reports Neon as the database source and the six-table exact-count probe passes.
- [ ] Rollback to the previous Worker version and known-good database path is documented and tested for the next migration scope.
- [ ] Owner separately approves any additional production binding/secret changes, route expansion, or deployment.

## Rollback and safety

- Keep Neon unchanged and available throughout the transition.
- Do not truncate, reset, drop, or overwrite either database during the verification phase.
- Do not expand the Neon cutover to additional production routes until isolated staging, the relevant data/checksum gates, and a rollback build have passed.
- Do not use Supabase and Neon as simultaneous authoritative write targets.
- Do not upgrade a plan, accept a charge, create paid infrastructure, or enable a paid add-on without explicit approval.
- Retain the previous Worker version and the Supabase project/configuration until the reporting-route observation window is complete and any broader retirement is separately reviewed and owner-approved.

## Historical audit snapshot — Hyperdrive and Neon role readiness (2026-11-01T15:30Z; superseded by the current checkpoint above)

Cloudflare's read-only Hyperdrive configuration list returned `total_count: 0` for the GLORIFIER account. There is currently no Hyperdrive resource to bind to the Worker.

A read-only Neon `pg_roles` catalog query returned these login roles:

| Role | Superuser | Create role | Create database | Bypass RLS |
|---|---:|---:|---:|---:|
| `cloud_admin` | yes | yes | yes | yes |
| `glorifier_owner` | no | yes | yes | yes |
| `neon_service` | no | yes | yes | yes |

No dedicated `glorifier_worker` login role was present. These existing administrative roles are not acceptable as the Worker credential. Do not put `glorifier_owner`, `cloud_admin`, or `neon_service` credentials into Hyperdrive.

For the initial reporting-only route, create a separate login role with no role/database creation, no superuser, no `BYPASSRLS`, and read-only `SELECT` access limited to the six approved operational tables. The credential must be generated and stored through a secure, owner-controlled channel; it must never appear in source, chat, issue text, or CI logs. Role creation and Hyperdrive provisioning remain separate owner-approved operational actions and were not performed in this audit.

## Historical candidate verification snapshot — 2026-11-02T05:29Z (superseded by the current checkpoint above)

### Cloudflare deployment state

- Production deployment `1a3c785a-2e10-4516-93ee-f72f50aa7b05` still routes **100%** of traffic to Worker version 874 (`0440ce7e-d1ec-4c0d-be05-13f811c1fbb5`). Its active binding metadata selects `supabase` and has no Hyperdrive binding.
- Uploaded Worker version 877 (`bbcd5da1-9cf1-4e97-897d-e873dfabe343`) is a **preview/upload only**, not a production deployment. Its binding metadata selects `neon` and binds Hyperdrive configuration `eff847b6c3c64488a989f1fa67d966a0` (`glorifier-neon-readonly`).
- A no-auth GET to version 877's Version URL returned `database.source = neon-hyperdrive`, an exact-count probe success, and `connectionRegistryRows = 30`.
- Its `/api/reports/summary` response returned exact Neon counts: approvals **9**, events **251,212**, registry **30**, analyses **266**, evidence **1,099**, reports **133**.
- This test used the Neon **main** branch (`br-raspy-pine-b5vgf50e`), not an isolated staging branch. Cloudflare reports Worker Version URLs enabled; the candidate URL was reachable without authentication. Do not treat this publicly reachable main-database preview as an isolated staging environment.
- The read-only request woke the Neon compute. It was explicitly suspended after the check and was subsequently observed in `idle` state. No SQL writes or schema changes were performed.

### Neon Worker role and transaction boundary

A read-only connection using `glorifier_worker_ro` confirmed the role is not superuser, cannot create roles or databases, has no public schema CREATE permission, and has no INSERT/UPDATE/DELETE/TRUNCATE permissions on public relations. Its only SELECT grant is on `public.glorifier_worker_operational_counts`, a security-barrier aggregate view; it has no direct base-table SELECT grants.

The direct session initially reported `transaction_read_only = off`. Draft PR #604 therefore wraps the aggregate query in `BEGIN READ ONLY`, commits only after validation, and rolls back after query/validation failures. It also surfaces both the query error and client-close error together as an `AggregateError`. Latest PR head at the time of this note: `ab44f1d1d90ac106eb7e0587d586b9c62e1a9f6d`. Cloudflare Worker validation run #1895 passed, including the Neon adapter tests and Wrangler dry-run; its production deployment job was skipped. PR #604 remains draft and unmerged.

### Production runtime checks

The production URL still reports `supabase-postgrest` as the database source, with all six queried operational counts equal to zero. `/api/identity` returns HTTP 503. `/api/neural/health` and `/api/neural/ready` also return HTTP 503 because the Neural origin is not configured. The production Worker health endpoint proves Worker/assets liveness only; authentication and AI were not probed.

## Current status

**PARTIALLY VERIFIED — PRODUCTION REPORTING CUTOVER VERIFIED; FULL DATABASE AND APPLICATION MIGRATION NOT VERIFIED.**

The active production Worker uses Neon Hyperdrive for the operational reporting and runtime-verification paths, as demonstrated by the 2026-11-02 production smoke evidence above. This is not proof that every legacy Express route, all 141 Neon public tables, or every data-writing path has migrated to Neon. The six corresponding Supabase operational tables remain empty, and index definitions differ between the databases. Neon remains the operational source of truth; Supabase is not a synchronized replica.

Remaining gates:
- Configure canonical domain identity and organization email only after the organization controls the domain and the email destination is verified.
- Deploy GLORIFIER-NEURAL to a reviewed HTTPS staging origin, configure exact host allowlisting and a runtime credential, then verify health/readiness, invalid-token rejection, and a harmless read-only task.
- Complete route-by-route backend/data-source inventory and authenticated API/RLS denial tests.
- Decide whether the empty Supabase operational tables remain dormant or are retired; any data movement or retirement needs a reviewed backup, checksum, cutover, and rollback plan.
- Verify the preview database policy. Current preview configuration reuses the production Hyperdrive ID and therefore is not a separate database-isolated staging environment.

No production configuration, secrets, database schema, data, traffic split, DNS, or deployment was changed by this documentation update. Preserve existing production traffic and data until each required gate passes and the owner separately approves the corresponding operational action.
