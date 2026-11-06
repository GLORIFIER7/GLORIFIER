# Database role boundaries

## Purpose

GLORIFIER may use Supabase and Neon together, but they are separate systems with separate responsibilities. This design is **not** database replication and does not imply that either integration is live.

## Ownership

| System | Intended owner | Allowed data | Not responsible for |
| --- | --- | --- | --- |
| Supabase PostgreSQL | Operational audit sink | Minimal audit events, request correlation IDs, action classes, provider labels, status, non-sensitive evidence | Application source-of-truth records, prompt storage, model output archives, analytics warehouse |
| Neon PostgreSQL | Application data and analytics | Explicitly defined application records and derived analytics, once a domain schema is reviewed | Operational audit delivery or being a mirror of Supabase audit events |

The application must not silently write the same record to both databases. No cross-database transaction is assumed. Do not add dual writes until an explicit event-delivery, idempotency, retry, reconciliation, and repair design is reviewed and tested.

## Current implementation status

- Supabase: an opt-in REST audit writer and an initial migration exist. The migration has not been applied, and live persistence is **NOT VERIFIED**.
- Neon: application-data adapter, schema, and live connectivity are **NOT IMPLEMENTED / NOT VERIFIED**.
- Replication or reconciliation between the two systems: **NOT IMPLEMENTED**.
- Backups, restore tests, retention/deletion policy, production permissions, and operational alerts: **NOT VERIFIED**.

Do not interpret a configured URL or successful unit test as proof of live database connectivity.

## Required controls

1. Keep credentials in the deployment secret manager; never put connection strings or service-role keys in source, logs, issues, or chat.
2. Use separate credentials and least-privilege roles for each database. Supabase service-role credentials must remain server-side.
3. Keep database access disabled until the target environment, schema, grants, retention, and recovery procedure are reviewed.
4. Store no raw prompts, API tokens, authorization headers, or sensitive customer content in audit records.
5. Use bounded connection and request timeouts. Avoid retry loops that can create unbounded writes or duplicate business actions.
6. Make health/liveness distinct from readiness. Readiness may report an integration as verified only after an appropriate check has succeeded; configuration alone is insufficient.
7. Test schema changes against a disposable development/staging database before considering production.

## Safe implementation sequence

1. Define the first Neon application-data entity and its retention requirements before creating tables.
2. Add an optional Neon adapter behind an explicit environment flag, with unit tests using a fake connection and no network calls.
3. Add a staging-only connectivity test that never prints credentials or query data.
4. Apply migrations only to a confirmed development/staging target after backup/restore procedures are available.
5. Verify permissions, bounded failure behavior, backup restoration, and monitoring.
6. Consider production enablement only after explicit review and approval.

## Environment variable naming

Use distinct namespaces, for example `GLORIFIER_AUDIT_ENABLED` for the Supabase audit sink and a future `GLORIFIER_NEON_DATA_ENABLED` flag for the Neon application-data adapter. The latter flag must not be treated as implemented until adapter code and tests exist.

No migration, live connection, replication, production write, or deployment is performed by this document.
