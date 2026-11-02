# Issue #432 remediation plan

## Scope
Close the remaining Cloudflare identity/Neural configuration and Supabase/Neon parity verification gaps without production risk.

## Owner approvals required
- [ ] Confirm canonical domain, organization email, and public URL values.
- [ ] Approve Neural staging HTTPS origin and exact allowed-host list.
- [ ] Approve storage of the Neural runtime token in the secret manager.
- [ ] Approve any Neon access restoration, schema comparison, or reconciliation activity after quota reset.

## Read-only verification
1. Probe `/api/health`, `/api/runtime-verification?probeAi=false`, and `/api/reports/summary`.
2. Record HTTP status, response shape, timestamp, and target environment.
3. Verify `/api/identity` only after owner-approved canonical values are configured.
4. Verify `/api/neural/health` and `/api/neural/ready` only after the approved staging origin and token are configured.
5. After Neon quota restoration, inspect database names, schemas, row counts, constraints, and migration history using read-only queries.

## Parity gate
Do not declare parity until schema, constraints, row counts, ownership, reconciliation rules, rollback plan, and effective RLS behavior are documented and verified.

## Forbidden actions
No production deployment, secret mutation, paid upgrade, Neon compute/branch restore, RLS weakening, destructive write, data migration, or branch deletion without separate owner approval.

## Fresh production and database evidence — 2026-11-02

### Cloudflare production probes

Read-only GET probes against `https://glorifier.glorifier.workers.dev` returned:

- `/api/health`: HTTP 200, JSON content type.
- `/api/runtime-verification?probeAi=false`: HTTP 200, JSON content type. AI was explicitly not probed.
- `/api/reports/summary`: HTTP 200, JSON content type.
- `/api/identity`: HTTP 503.
- `/api/neural/health`: HTTP 503.
- `/api/neural/ready`: HTTP 503.

Cloudflare deployment metadata confirms 100% of production traffic is assigned to Worker version 874, whose `GLORIFIER_DATABASE_PROVIDER` binding is `supabase` and which has no `HYPERDRIVE` binding. Worker version 877 has a `neon` provider binding and `HYPERDRIVE`, but is preview-only; it is not the active production deployment. Do not describe this as a Neon production cutover.

### Neon and Supabase metadata

- Neon project `frosty-leaf-46030505` (`glorifier-ai`) reports PostgreSQL 18 and the Free plan.
- Neon usage period starts `2026-11-01T00:00:00Z`; the next `quota_reset_at` is `2026-12-01T00:00:00Z`.
- Neon default/main branch `br-raspy-pine-b5vgf50e` currently reports state `ready`, is primary/default, and has an approximate logical size of 662 MB. The previously archived secondary branches remain archived.
- The main branch's read-write endpoint is idle/suspended. No SQL was run and no compute was woken. Database connectivity, schema parity, row counts, and migration parity are therefore still NOT VERIFIED by this check.
- Supabase project `ymbhbxrobfpqlxhyulbt` reports `ACTIVE_HEALTHY`, PostgreSQL `17.11.0.003), and four recorded migrations through `20261030125059`.
- The Supabase security advisor currently reports zero lints. The performance advisor reports five informational unused-index candidates; do not drop indexes without workload evidence and a reviewed migration.
- All six operational tables returned by the Supabase table inventory report RLS enabled and zero rows. This is limited to those six tables, not proof that the whole project is empty.

### Remaining release blockers

1. Owner-confirmed canonical domain, organization email, and public URL are still required for identity readiness.
2. A real, owner-approved Neural staging HTTPS origin, exact allowed-host list, and runtime token are still required for Neural health/readiness verification.
3. Neon compute remains idle. A separate reviewed cost/recovery approval is required before waking compute or running live SQL.
4. Schema/data parity, RLS effectiveness, sync ownership, reconciliation policy, and rollback evidence remain required before any production database cutover.

No production deployment, traffic shift, secret mutation, database write, schema migration, data movement, paid upgrade, or compute wake occurred during these checks.

