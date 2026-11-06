# Database migration and persistence release gates

This checklist is a safety gate, not evidence that any database is connected or ready. The Neon task-run migration and Supabase audit migration are proposals until each is explicitly tested and applied by an authorized operator.

## Current default posture

- Neon task-run persistence is disabled unless `GLORIFIER_NEON_TASK_RUNS_ENABLED=true`.
- The optional Neon connectivity probe is disabled unless `GLORIFIER_NEON_CONNECTIVITY_ENABLED=true`; its `SELECT 1` proves connectivity only, not schema or write readiness.
- Supabase audit persistence is disabled unless `GLORIFIER_AUDIT_ENABLED=true` and its server-side credentials are configured.
- Do not enable both data paths in production as a substitute for a defined source-of-truth and reconciliation policy.
- No migration, write, delete, or cleanup job should run automatically as part of startup or readiness checks.

## Required gates before a staging database test

1. **Review the exact target**: verify project, branch, database, schema, migration filename, and current schema version. Never paste connection strings or credentials into issues, pull requests, logs, or chat.
2. **Use a disposable database first**: create an isolated PostgreSQL instance with no customer data. Do not use production credentials for migration tests.
3. **Record a baseline**: capture the current schema and migration checksum; confirm the target has no conflicting objects.
4. **Apply one migration explicitly**: run the reviewed SQL manually in the disposable database. Do not treat a successful CI run as evidence that SQL was applied.
5. **Verify schema constraints**: test valid rows and reject invalid statuses, invalid identifiers, malformed metadata, oversized evidence arrays, and expiry windows beyond the declared retention policy.
6. **Verify access controls**: use separate least-privilege roles. The runtime role should have only the required table privileges; cleanup should not be granted broad schema or database ownership.
7. **Test failure behavior**: simulate unavailable database, rejected insert, timeout, and rollback. Confirm the API fails closed where required and does not leak secrets or customer payloads into errors.
8. **Test cleanup on disposable records only**: confirm deletion selects only expired rows, respects the batch limit, and does not delete unexpired records. Never run cleanup against production during validation.
9. **Verify recovery**: document backup/restore or rollback steps and confirm they work before staging customer traffic.
10. **Capture evidence**: store sanitized test output, migration checksum, test date, target environment label, and reviewer. Never store credentials or raw customer content.

## Additional gates before production

- A named owner approves the exact migration and target environment.
- Staging tests pass against the same PostgreSQL major version and relevant extensions as production.
- Retention duration, deletion authorization, and audit requirements are approved; code defaults are not policy approval.
- The Supabase audit sink and Neon task-run store have explicit responsibilities, failure semantics, and reconciliation rules. No implicit dual-write consistency is assumed.
- Backups, restore test, monitoring, alerting, and an incident/rollback plan are verified.
- Secrets are stored in the deployment secret manager and rotated if exposed.
- External inference remains separately gated by explicit provider configuration and data-egress consent.
- The release record states which claims are **VERIFIED**, **PARTIALLY VERIFIED**, **NOT VERIFIED**, **DEGRADED**, or **NOT OBSERVABLE**, with links to evidence.

## Prohibited shortcuts

- Do not apply migrations to production because CI passed.
- Do not enable persistence merely to make `/ready` return healthy.
- Do not enable automated cleanup without an approved retention policy, tested query, and monitored job.
- Do not assume that a connectivity probe proves read/write permissions, schema correctness, durability, or recovery.
- Do not claim live database persistence until a controlled write/read verification has succeeded in the named environment.
