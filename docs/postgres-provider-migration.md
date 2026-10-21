# PostgreSQL Provider Migration Runbook

## Purpose and current state

GLORIFIER connects through the standard Node.js `pg` driver and the `DATABASE_URL` environment variable. This makes the connection layer compatible with PostgreSQL providers, but it does **not** migrate data or make a destination production-ready.

The currently recorded database provider is Neon. Supabase is a candidate destination, not a confirmed or provisioned replacement. The runtime has reported PostgreSQL health/readiness failures during a Neon quota issue; the exact quota category must be confirmed in the provider dashboard before choosing a destination. A free-tier database may have comparable storage, compute, or egress limits.

## Guardrails

- Do not put database URLs, passwords, access tokens, or connection strings in source control, issues, logs, or chat.
- Do not delete, reset, or modify the source database as part of preparation.
- Do not change production `DATABASE_URL` until the destination has been populated and independently verified.
- Do not treat a successful connection test as proof that application data or the economic ledger is complete.
- Keep the source available for rollback until the destination is reconciled and stable.
- Do not increase paid usage or accept a charge without explicit owner approval.

## Migration procedure

1. **Diagnose the source quota.** In the Neon dashboard, record the exact quota/limit name, current usage, reset date, and any provider error code. Save a redacted evidence note; do not share credentials.
2. **Check destination eligibility.** In Supabase, confirm the organization/project plan, region, database status, and relevant storage/compute/egress limits. Do not assume a free plan resolves the source constraint.
3. **Inventory the schema.** Identify all application tables, extensions, sequences, indexes, constraints, triggers, roles, grants, scheduled jobs, and migration history. Check the repository's database migration scripts and runtime initialization code.
4. **Create a destination project only with owner approval.** Use a strong unique database password and keep the connection details in the destination hosting provider's secret/environment settings.
5. **Export and import without deleting the source.** Use a supported PostgreSQL dump/restore method with appropriate privileges. Treat credentials and dump files as secrets. Preserve encoding, extensions, ownership/grants, and sequence values.
6. **Verify structural completeness.** Compare schemas, table counts, migration versions, indexes, constraints, and required extensions. Investigate every difference.
7. **Reconcile critical data.** Compare counts and deterministic checksums or key aggregates for all critical tables. Specifically reconcile payment intents, settlement evidence, revenue ledger events, idempotency records, and audit/provenance data. Verify foreign keys and sequence values.
8. **Test the destination separately.** Run application migrations only against the destination, connection/TLS checks, read-only smoke tests, and the repository's relevant CI/tests. Never point production at an unverified destination.
9. **Prepare rollback.** Document the original and destination configuration identifiers (not secret values), tested restore procedure, cutover owner, and exact rollback trigger.
10. **Cut over only after explicit approval.** Update the production secret through the hosting dashboard, restart/redeploy through the normal controlled process, then verify readiness and critical application flows. Confirm the app is reading/writing the intended database.
11. **Observe and reconcile.** Monitor errors and database usage; reconcile ledger writes again. Keep the source untouched until the agreed rollback window has passed and the owner authorizes retirement.

## Acceptance checklist

- [ ] Exact source quota blocker confirmed.
- [ ] Destination plan/limits and project status checked.
- [ ] Schema and migration versions match.
- [ ] Critical table counts and economic ledger reconciled.
- [ ] TLS and least-privilege access verified.
- [ ] Application and CI smoke tests pass against destination.
- [ ] Production cutover and rollback steps reviewed.
- [ ] Owner explicitly authorizes cutover.
- [ ] Post-cutover readiness and data reconciliation pass.

## Status

This runbook prepares a controlled migration only. It does not claim that a Supabase project exists, data has been copied, production configuration has changed, or production is healthy.
