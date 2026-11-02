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