# Data and Integrations

## Data-store responsibilities
Supabase is the intended destination for basic operational databases. Neon may remain temporarily or for explicitly assigned workloads. The coexistence of two databases does not imply replication or parity.

## Migration controls
1. Inventory tables, schemas, indexes, constraints, roles, scheduled jobs, and consumers.
2. Define the authoritative source for each dataset.
3. Back up and test restore procedures before migration.
4. Apply versioned, reviewed schema migrations.
5. Validate row counts, key constraints, sampled records, and application behavior.
6. Establish a documented cutover and rollback plan.
7. Reconcile post-cutover writes and monitor failures before retiring the old path.

## External integrations
For each provider, document purpose, owner, required permissions, secret location, quotas, timeout/retry policy, data handling, fallback behavior, and health probe. An integration is not VERIFIED merely because its environment variable exists.

## Privacy
Keep credentials, recovery phrases, signer secrets, and unnecessary personal data out of source control and documentation. Publish only the minimum operational evidence needed to support a claim.